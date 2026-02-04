import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay, isAfter, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { api } from '../../services/api';
import type { AttendanceEvent, UserHoliday } from '../../types';
import { FIXED_HOLIDAYS, HOLIDAY_SELECTION_POOL } from '../../utils/constants';
import Button from '../../components/ui/Button';

const AttendanceCalendar: React.FC = () => {
    const { user } = useAuthStore();
    const { officeHolidays, fieldHolidays, attendance, recurringHolidays } = useSettingsStore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<AttendanceEvent[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Determine which holidays to use based on user role
    const holidays = useMemo(() => {
        if (user?.role === 'field_staff') return fieldHolidays;
        return officeHolidays;
    }, [user, fieldHolidays, officeHolidays]);

    const recurringRules = useMemo(() => {
        const roleType = user?.role === 'field_staff' ? 'field' : 'office';
        return recurringHolidays.filter(rule => (rule.type || 'office') === roleType);
    }, [user, recurringHolidays]);

    // Debug logs
    useEffect(() => {
        console.log('Active Recurring Rules:', recurringRules);
    }, [recurringRules]);

    const recurringHolidayDates = useMemo(() => {
        const dates: Date[] = [];
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);
        const days = eachDayOfInterval({ start, end });

        // Get the allowed number of floating holidays per month from settings
        const allowedFloatingHolidays = (user?.role === 'field_staff'
            ? attendance?.field?.monthlyFloatingLeaves
            : attendance?.office?.monthlyFloatingLeaves) ?? 0;

        let foundHolidays = 0;

        recurringRules.forEach(rule => {
            // If we've already found enough holidays for this month, stop.
            // Note: This logic assumes we want to prioritize rules in the order they are defined.
            // If 'allowedFloatingHolidays' is 0, no recurring holidays will be shown.
            if (foundHolidays >= allowedFloatingHolidays) return;

            let count = 0;
            for (const day of days) {
                if (format(day, 'EEEE').toLowerCase() === rule.day.toLowerCase()) {
                    count++;
                    if (count === rule.n) {
                        dates.push(day);
                        foundHolidays++;
                        break; // Found the specific occurrence (e.g. 3rd Saturday)
                    }
                }
            }
        });
        return dates;
    }, [currentDate, recurringRules, attendance, user]);

    useEffect(() => {
        console.log("Calculated Recurring Holiday Dates:", recurringHolidayDates);
    }, [recurringHolidayDates]);

    useEffect(() => {
        const fetchEvents = async () => {
            if (!user) return;
            setIsLoading(true);
            try {
                const start = startOfMonth(currentDate).toISOString();
                const end = endOfMonth(currentDate).toISOString();
                const data = await api.getAttendanceEvents(user.id, start, end);
                setEvents(data);
            } catch (error) {
                console.error("Failed to fetch attendance events", error);
            } finally {
                setIsLoading(false);
            }
        };

        // Also refresh settings to ensure we have the latest holiday rules
        const fetchSettings = async () => {
            try {
                console.log("Fetching attendance settings...");
                const settings = await api.getAttendanceSettings();
                console.log("Fetched settings:", settings);
                useSettingsStore.getState().updateAttendanceSettings(settings);
            } catch (error) {
                console.error("Failed to fetch attendance settings", error);
            }
        };

        // Fetch recurring holidays from the database
        const fetchRecurringHolidays = async () => {
            try {
                console.log("Fetching recurring holidays...");
                const holidays = await api.getRecurringHolidays();
                console.log("Fetched recurring holidays:", holidays);
                // Update the store directly
                useSettingsStore.setState({ recurringHolidays: holidays });
            } catch (error) {
                console.error("Failed to fetch recurring holidays", error);
            }
        };

        fetchEvents();
        fetchSettings();
        fetchRecurringHolidays();
    }, [user, currentDate]);

    const daysInMonth = useMemo(() => {
        return eachDayOfInterval({
            start: startOfMonth(currentDate),
            end: endOfMonth(currentDate)
        });
    }, [currentDate]);

    const getDayStatus = (date: Date) => {
        const currentYear = date.getFullYear();
        
        // Check for attendance (present)
        const hasCheckIn = events.some(e => isSameDay(new Date(e.timestamp), date) && (e.type.toLowerCase().includes('check') || e.type.toLowerCase().includes('in')));

        // Check for configured recurring holiday (Floating Holiday)
        const isRecurringHoliday = recurringHolidayDates.some(d => isSameDay(d, date));

        // Check for specific date holiday from admin settings (Company Holiday)
        const isConfiguredHoliday = holidays.some(h => isSameDay(new Date(h.date), date));

        // Check for FIXED holidays (like Republic Day on 26th)
        const isFixedHoliday = FIXED_HOLIDAYS.some(fh => {
            const datePart = fh.date.startsWith('-') ? fh.date : `-${fh.date}`;
            const fixedDate = new Date(`${currentYear}${datePart}`.replace(/-/g, '/'));
            return isSameDay(fixedDate, date);
        });

        // Check for user-selected holidays from pool (like 15th - Sankranti)
        const isPoolHoliday = HOLIDAY_SELECTION_POOL.some(h => {
            const datePart = h.date.startsWith('-') ? h.date : `-${h.date}`;
            const poolDate = new Date(`${currentYear}${datePart}`.replace(/-/g, '/'));
            return isSameDay(poolDate, date);
        });

        // Combine all company holiday sources
        const isCompanyHoliday = isConfiguredHoliday || isFixedHoliday || isPoolHoliday;

        // Check if it's a Sunday (weekly off)
        const isSunday = getDay(date) === 0;

        // Priority Logic:
        // 1. If it's a holiday (recurring, fixed, or Sunday) AND the user checked in -> Holiday Present (comp-off earned)
        if ((isRecurringHoliday || isCompanyHoliday || isSunday) && hasCheckIn) {
            return 'holiday-present';
        }

        // 2. If it's a holiday and NO check-in -> Holiday (or Floating Holiday)
        if (isRecurringHoliday) return 'floating-holiday';
        if (isCompanyHoliday) return 'company-holiday'; // Company holidays in distinct color (Fixed, Pool, Admin)
        if (isSunday) return 'sunday'; // Sunday as weekly off

        // 3. If it's not a holiday but has check-in -> Present
        if (hasCheckIn) return 'present';

        // 4. Check for absent (past date, no check-in, not holiday)
        const isPast = isAfter(startOfDay(new Date()), startOfDay(date)); // date < today
        if (isPast) return 'absent';

        return 'neutral';
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'present': return 'bg-emerald-500 text-white border-emerald-600 shadow-sm'; // Vibrant Green
            case 'absent': return 'bg-red-500 text-white border-red-600 shadow-sm'; // Red for Absent
            case 'sunday': return 'bg-rose-300 text-gray-800 border-rose-400 shadow-sm'; // Rose Pink for Sunday
            case 'company-holiday': return 'bg-sky-400 text-white border-sky-500 shadow-sm'; // Sky Blue for Company Holiday
            case 'floating-holiday': return 'bg-amber-500 text-white border-amber-600 shadow-sm'; // Vibrant Amber
            case 'holiday-present': return 'bg-violet-600 text-white border-violet-700 shadow-sm'; // Vibrant Purple (Comp Off)
            default: return 'bg-gray-50 text-gray-400 border-gray-100'; // Neutral
        }
    };

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const startDay = getDay(startOfMonth(currentDate)); // 0-6

    return (
        <div className="bg-card p-4 rounded-xl shadow-card border border-border w-full md:max-w-[320px] flex flex-col min-h-[380px]">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h3 className="text-sm font-semibold text-primary-text">Attendance Calendar</h3>
                <div className="flex items-center gap-1">
                    <Button variant="secondary" size="sm" className="btn-icon !p-1 h-6 w-6" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="h-3 w-3" /></Button>
                    <span className="font-medium min-w-[80px] text-center text-sm">{format(currentDate, 'MMMM yyyy')}</span>
                    <Button variant="secondary" size="sm" className="btn-icon !p-1 h-6 w-6" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="h-3 w-3" /></Button>
                </div>
            </div>

            {isLoading ? (
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
            
            <div className="mt-auto pt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-[14px] text-muted border-t border-border/50">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm flex-shrink-0"></div> Present</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-red-500 rounded-sm flex-shrink-0"></div> Absent</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-rose-300 rounded-sm flex-shrink-0"></div> Week Off</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-sky-400 rounded-sm flex-shrink-0"></div> Holiday</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-amber-500 rounded-sm flex-shrink-0"></div> Floating</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-violet-600 rounded-sm flex-shrink-0"></div> Comp Off</div>
            </div>
        </div>
    );
};

export default AttendanceCalendar;
