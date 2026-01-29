import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay, isAfter, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { api } from '../../services/api';
import type { AttendanceEvent } from '../../types';
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
        // Check for attendance (present)
        const hasCheckIn = events.some(e => isSameDay(new Date(e.timestamp), date) && (e.type.toLowerCase().includes('check') || e.type.toLowerCase().includes('in')));

        // Check for configured recurring holiday (Floating Holiday)
        const isRecurringHoliday = recurringHolidayDates.some(d => isSameDay(d, date));

        // Check for specific date holiday
        const isConfiguredHoliday = holidays.some(h => isSameDay(new Date(h.date), date));

        // Priority Logic:
        // 1. If it's a holiday (recurring or fixed) AND the user checked in -> Holiday Present
        if ((isRecurringHoliday || isConfiguredHoliday) && hasCheckIn) {
            return 'holiday-present';
        }

        // 2. If it's a holiday and NO check-in -> Holiday (or Floating Holiday)
        if (isRecurringHoliday) return 'floating-holiday';
        if (isConfiguredHoliday) return 'holiday';

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
            case 'absent': return 'bg-rose-500 text-white border-rose-600 shadow-sm'; // Vibrant Red/Pink
            case 'holiday': return 'bg-pink-500 text-white border-pink-600 shadow-sm'; // Pink
            case 'floating-holiday': return 'bg-amber-500 text-white border-amber-600 shadow-sm'; // Vibrant Amber
            case 'holiday-present': return 'bg-violet-600 text-white border-violet-700 shadow-sm'; // Vibrant Purple
            default: return 'bg-gray-50 text-gray-400 border-gray-100'; // Neutral
        }
    };

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const startDay = getDay(startOfMonth(currentDate)); // 0-6

    return (
        <div className="md:bg-card md:p-3 md:rounded-xl md:shadow-card border-none bg-transparent p-3 rounded-xl shadow-none w-full md:w-full md:max-w-[320px]">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-primary-text">Attendance Calendar</h3>
                <div className="flex items-center gap-1">
                    <Button variant="secondary" size="sm" className="btn-icon !p-1 h-6 w-6" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="h-3 w-3" /></Button>
                    <span className="font-medium min-w-[80px] text-center text-sm">{format(currentDate, 'MMMM yyyy')}</span>
                    <Button variant="secondary" size="sm" className="btn-icon !p-1 h-6 w-6" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="h-3 w-3" /></Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
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
            <div className="mt-3 flex gap-3 text-xs text-muted justify-center flex-wrap">
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 border border-emerald-600 rounded-sm"></div> Present</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-rose-500 border border-rose-600 rounded-sm"></div> Absent</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-pink-500 border border-pink-600 rounded-sm"></div> Holiday</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-500 border border-amber-600 rounded-sm"></div> Floating Holiday</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-violet-600 border border-violet-700 rounded-sm"></div> Holiday Present</div>
            </div>
        </div>
    );
};

export default AttendanceCalendar;
