import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay, isAfter, startOfDay, differenceInMinutes } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';
import type { AttendanceEvent, AttendanceSettings } from '../../types';
import Button from '../../components/ui/Button';

const OTCalendar: React.FC = () => {
    const { user } = useAuthStore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<AttendanceEvent[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [threshold, setThreshold] = useState(8);

    useEffect(() => {
        const fetchEvents = async () => {
            if (!user) return;
            setIsLoading(true);
            try {
                // Fetch events
                const start = startOfMonth(currentDate).toISOString();
                const end = endOfMonth(currentDate).toISOString();
                const [data, settings] = await Promise.all([
                    api.getAttendanceEvents(user.id, start, end),
                    api.getAttendanceSettings()
                ]);
                setEvents(data);

                // Calculate threshold
                let staffCategory: keyof AttendanceSettings = 'field';
                const userRole = user.role.toLowerCase();
                if ([
                    'admin', 'hr', 'finance', 'developer', 'management', 'office_staff', 
                    'back_office_staff', 'bd', 'operation_manager', 'field_staff',
                    'finance_manager', 'hr_ops', 'business developer', 'unverified',
                    'operation manager', 'field staff', 'finance manager', 'hr ops'
                ].includes(userRole)) {
                    staffCategory = 'office';
                } else if (['site_manager', 'site_supervisor', 'site manager', 'site supervisor'].includes(userRole)) {
                    staffCategory = 'site';
                }

                const rules = settings[staffCategory];
                const shiftMax = rules?.dailyWorkingHours?.max || 8;
                setThreshold(shiftMax);
            } catch (error) {
                console.error("Failed to fetch attendance data", error);
            } finally {
                setIsLoading(false);
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

    /** Calculate hours-based OT (working > 8h in a day) */
    const getDailyOT = (date: Date) => {
        const dayEvents = events.filter(e => isSameDay(new Date(e.timestamp), date));

        if (dayEvents.length === 0) return { hoursOT: 0, hasOtPunch: false };

        const sortedEvents = [...dayEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        let totalMinutes = 0;
        let checkInTime: Date | null = null;
        let hasOtPunch = false;

        sortedEvents.forEach(event => {
            const eventTime = new Date(event.timestamp);
            if (event.type === 'check-in') {
                checkInTime = eventTime;
                if (event.isOt) hasOtPunch = true;
            } else if (event.type === 'check-out' && checkInTime) {
                totalMinutes += differenceInMinutes(eventTime, checkInTime);
                checkInTime = null;
            }
        });

        const otMinutes = Math.max(0, totalMinutes - (threshold * 60));
        
        return { 
            hoursOT: Math.floor(otMinutes / 60), 
            minutesOT: Math.round(otMinutes % 60), 
            hasOtPunch 
        };
    };

    const formatOT = (h: number, m: number) => {
        if (h === 0 && m === 0) return '';
        const mm = m.toString().padStart(2, '0');
        const hh = h.toString().padStart(2, '0');
        return `${hh}:${mm}`;
    };

    // Calculate monthly summary from events to ensure UI consistency
    const monthlySummary = useMemo(() => {
        let totalMins = 0;
        const processedDays = new Set<string>();

        events.forEach(event => {
            const dateStr = format(new Date(event.timestamp), 'yyyy-MM-dd');
            if (!processedDays.has(dateStr)) {
                const { hoursOT, minutesOT } = getDailyOT(new Date(event.timestamp));
                totalMins += (hoursOT * 60) + minutesOT;
                processedDays.add(dateStr);
            }
        });

        return {
            h: Math.floor(totalMins / 60),
            m: totalMins % 60,
            totalMins
        };
    }, [events, threshold]);

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const startDay = getDay(startOfMonth(currentDate));

    return (
        <div className="bg-card p-5 rounded-xl shadow-card border border-border w-full md:max-w-[350px] flex flex-col min-h-[460px]">
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <h3 className="text-sm font-semibold text-primary-text">OT Calendar</h3>
                <div className="flex items-center gap-1">
                    <Button variant="secondary" size="sm" className="btn-icon !p-1 h-6 w-6" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="h-3 w-3" /></Button>
                    <span className="font-medium min-w-[80px] text-center text-sm">{format(currentDate, 'MMMM yyyy')}</span>
                    <Button variant="secondary" size="sm" className="btn-icon !p-1 h-6 w-6" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="h-3 w-3" /></Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
            ) : (
                <div className="grid grid-cols-7 gap-1 flex-1">
                    {weekDays.map(d => (
                        <div key={d} className="text-center text-[10px] font-bold text-muted uppercase tracking-wider py-1">{d}</div>
                    ))}
                    {Array.from({ length: startDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="aspect-square" />
                    ))}
                    {daysInMonth.map(date => {
                        const { hoursOT, minutesOT, hasOtPunch } = getDailyOT(date);
                        const hasHoursOT = hoursOT + minutesOT > 0;
                        const hasAnyOT = hasHoursOT || hasOtPunch;

                        // Color: orange for OT punch cycles, blue for hours-based OT, both = orange
                        const bgClass = hasOtPunch 
                            ? 'bg-orange-600 text-white border-orange-700 shadow-sm'
                            : hasHoursOT 
                                ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                                : 'bg-gray-50 text-gray-400 border-gray-100';

                        return (
                            <div key={date.toISOString()} className={`aspect-square rounded border flex flex-col items-center justify-center transition-colors ${bgClass}`}>
                                <span className="text-xs font-bold">{format(date, 'd')}</span>
                                {hoursOT + minutesOT > 0 && (
                                    <span className="text-[10px] font-bold mt-1">
                                        {formatOT(hoursOT, minutesOT)}
                                    </span>
                                )}
                                {hasOtPunch && !hasHoursOT && <span className="text-[9px] font-bold">OT</span>}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Summary Information */}
            <div className="mb-4 p-3 bg-accent-light/30 rounded-lg border border-accent-light/50">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-primary-text">This Month's OT</span>
                    <span className="text-lg font-bold text-accent-dark">
                        {monthlySummary.h}h {monthlySummary.m}m
                    </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-muted">
                    <span>Pending in Bank</span>
                    <span className="font-medium">
                        {Math.floor((user?.otHoursBank || 0))}h {Math.round(((user?.otHoursBank || 0) % 1) * 60)}m / 8h
                    </span>
                </div>
                <div className="w-full bg-border/30 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div 
                        className="bg-accent-dark h-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, ((user?.otHoursBank || 0) / 8) * 100)}%` }}
                    ></div>
                </div>
                <p className="text-[10px] text-muted italic mt-2">Every 8h of OT earns you 1 Comp Off automatically.</p>
            </div>

            <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap gap-2 text-[11px] text-muted-foreground uppercase font-bold tracking-tight">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div> Overtime (&gt;{threshold}h)</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-orange-600 rounded-full flex-shrink-0"></div> OT Punch</div>
            </div>
        </div>
    );
};

export default OTCalendar;
