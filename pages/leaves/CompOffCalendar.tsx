import React, { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { CompOffLog, LeaveRequest, AttendanceEvent } from '../../types';
import { FIXED_HOLIDAYS, HOLIDAY_SELECTION_POOL } from '../../utils/constants';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { api } from '../../services/api';
import Button from '../../components/ui/Button';

interface CompOffCalendarProps {
    logs: CompOffLog[];
    leaveRequests?: LeaveRequest[];
    isLoading?: boolean;
}

const CompOffCalendar: React.FC<CompOffCalendarProps> = ({ logs, leaveRequests = [], isLoading = false }) => {
    const { user } = useAuthStore();
    const { officeHolidays, fieldHolidays, recurringHolidays } = useSettingsStore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<AttendanceEvent[]>([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);

    // Determine which holidays to use based on user role
    const holidays = useMemo(() => {
        if (user?.role === 'field_staff') return fieldHolidays;
        return officeHolidays;
    }, [user, fieldHolidays, officeHolidays]);

    // Fetch attendance events for the current month
    useEffect(() => {
        const fetchEvents = async () => {
            if (!user) return;
            setIsLoadingEvents(true);
            try {
                const start = startOfMonth(currentDate).toISOString();
                const end = endOfMonth(currentDate).toISOString();
                const data = await api.getAttendanceEvents(user.id, start, end);
                setEvents(data);
            } catch (error) {
                console.error("Failed to fetch attendance events for CompOffCalendar", error);
            } finally {
                setIsLoadingEvents(false);
            }
        };
        fetchEvents();
    }, [user, currentDate]);

    const daysInMonth = useMemo(() => {
        return eachDayOfInterval({
            start: startOfMonth(currentDate),
            end: endOfMonth(currentDate)
        });
    }, [currentDate]);

    const getDayStatus = (date: Date) => {
        const currentYear = date.getFullYear();

        // 1. Check for taken comp-offs from leave requests
        const isTaken = leaveRequests.some(request => {
            if (request.leaveType !== 'Comp Off' || request.status !== 'approved') return false;
            const start = new Date(request.startDate.replace(/-/g, '/'));
            const end = new Date(request.endDate.replace(/-/g, '/'));
            return date >= start && date <= end;
        });

        if (isTaken) return 'taken';

        // 2. Check for earned comp-offs from CompOffLog entries
        const hasCompOffLog = logs.some(log => {
            const logDate = new Date(log.dateEarned.replace(/-/g, '/'));
            return isSameDay(logDate, date);
        });

        if (hasCompOffLog) return 'earned';

        // 3. Check for earned comp-offs from attendance (worked on holiday/Sunday)
        const hasCheckIn = events.some(e => 
            isSameDay(new Date(e.timestamp), date) && 
            (e.type.toLowerCase().includes('check') || e.type.toLowerCase().includes('in'))
        );

        if (hasCheckIn) {
            // Check if it's a Sunday (weekly off)
            const isSunday = getDay(date) === 0;

            // Check for FIXED holidays
            const isFixedHoliday = FIXED_HOLIDAYS.some(fh => {
                const datePart = fh.date.startsWith('-') ? fh.date : `-${fh.date}`;
                const fixedDate = new Date(`${currentYear}${datePart}`.replace(/-/g, '/'));
                return isSameDay(fixedDate, date);
            });

            // Check for Pool holidays
            const isPoolHoliday = HOLIDAY_SELECTION_POOL.some(h => {
                const datePart = h.date.startsWith('-') ? h.date : `-${h.date}`;
                const poolDate = new Date(`${currentYear}${datePart}`.replace(/-/g, '/'));
                return isSameDay(poolDate, date);
            });

            // Check for configured holidays
            const isConfiguredHoliday = holidays.some(h => isSameDay(new Date(h.date), date));

            // If worked on any type of holiday/Sunday, it's earned comp-off
            if (isSunday || isFixedHoliday || isPoolHoliday || isConfiguredHoliday) {
                return 'earned';
            }
        }

        return 'neutral';
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'earned': return 'bg-emerald-500 text-white border-emerald-600 shadow-sm'; // Green for Earned
            case 'taken': return 'bg-red-500 text-white border-red-600 shadow-sm'; // Red for Taken
            default: return 'bg-gray-50 text-gray-400 border-gray-100'; // Neutral
        }
    };

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const startDay = getDay(startOfMonth(currentDate)); // 0-6

    const loading = isLoading || isLoadingEvents;

    return (
        <div className="bg-card p-4 rounded-xl shadow-card border border-border w-full md:max-w-[320px] flex flex-col min-h-[380px]">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h3 className="text-sm font-semibold text-primary-text">Comp Off Tracker</h3>
                <div className="flex items-center gap-1">
                    <Button variant="secondary" size="sm" className="btn-icon !p-1 h-6 w-6" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="h-3 w-3" /></Button>
                    <span className="font-medium min-w-[80px] text-center text-sm">{format(currentDate, 'MMMM yyyy')}</span>
                    <Button variant="secondary" size="sm" className="btn-icon !p-1 h-6 w-6" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="h-3 w-3" /></Button>
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
            ) : (
                <div className="grid grid-cols-7 gap-1">
                    {weekDays.map(d => (
                        <div key={d} className="text-center text-xs font-medium text-muted py-1">{d}</div>
                    ))}
                    {/* Empty cells for start of month */}
                    {Array.from({ length: startDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="aspect-square" />
                    ))}
                    {daysInMonth.map(date => {
                        const status = getDayStatus(date);
                        const colorClass = getStatusColor(status);
                        return (
                            <div key={date.toISOString()} className={`aspect-square rounded border flex flex-col items-center justify-center ${colorClass} transition-colors`}>
                                <span className="text-sm font-semibold">{format(date, 'd')}</span>
                            </div>
                        );
                    })}
                </div>
            )}
            
            <div className="mt-auto pt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[14px] text-muted border-t border-border/50">
                <div className="flex items-center gap-1.5 justify-center"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm flex-shrink-0"></div> Earned</div>
                <div className="flex items-center gap-1.5 justify-center"><div className="w-2.5 h-2.5 bg-red-500 rounded-sm flex-shrink-0"></div> Taken</div>
            </div>
        </div>
    );
};

export default CompOffCalendar;

