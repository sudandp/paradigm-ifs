import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay, isAfter, startOfDay, differenceInMinutes } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';
import type { AttendanceEvent } from '../../types';
import Button from '../../components/ui/Button';

const OTCalendar: React.FC = () => {
    const { user } = useAuthStore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<AttendanceEvent[]>([]);
    const [isLoading, setIsLoading] = useState(false);

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

        fetchEvents();
    }, [user, currentDate]);

    const daysInMonth = useMemo(() => {
        return eachDayOfInterval({
            start: startOfMonth(currentDate),
            end: endOfMonth(currentDate)
        });
    }, [currentDate]);

    const getDailyOT = (date: Date) => {
        const dayEvents = events.filter(e => isSameDay(new Date(e.timestamp), date));

        if (dayEvents.length === 0) return 0;

        // Sort events by time
        const sortedEvents = [...dayEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        let totalMinutes = 0;
        let checkInTime: Date | null = null;

        sortedEvents.forEach(event => {
            const eventTime = new Date(event.timestamp);
            if (event.type === 'check-in') {
                checkInTime = eventTime;
            } else if (event.type === 'check-out' && checkInTime) {
                totalMinutes += differenceInMinutes(eventTime, checkInTime);
                checkInTime = null;
            }
        });

        // If still checked in (no check-out), ignore for now or calculate till now? 
        // Usually for past days we ignore incomplete pairs or assume end of day?
        // For simplicity, we only count completed pairs.

        const totalHours = totalMinutes / 60;
        const otHours = Math.max(0, totalHours - 8);

        return parseFloat(otHours.toFixed(1));
    };

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const startDay = getDay(startOfMonth(currentDate)); // 0-6

    return (
        <div className="md:bg-card md:p-3 md:rounded-xl md:shadow-card border-0 bg-transparent p-3 rounded-xl shadow-none w-full">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-primary-text">OT Calendar</h3>
                <div className="flex items-center gap-1">
                    <Button variant="secondary" size="sm" className="!p-1 h-6 w-6" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="h-3 w-3" /></Button>
                    <span className="font-medium min-w-[80px] text-center text-xs">{format(currentDate, 'MMMM yyyy')}</span>
                    <Button variant="secondary" size="sm" className="!p-1 h-6 w-6" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="h-3 w-3" /></Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
            ) : (
                <div className="grid grid-cols-7 gap-1">
                    {weekDays.map(d => (
                        <div key={d} className="text-center text-[10px] font-medium text-muted py-1">{d}</div>
                    ))}
                    {/* Empty cells for start of month */}
                    {Array.from({ length: startDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="aspect-square" />
                    ))}
                    {daysInMonth.map(date => {
                        const ot = getDailyOT(date);
                        const hasOT = ot > 0;

                        return (
                            <div key={date.toISOString()} className={`aspect-square rounded border flex flex-col items-center justify-center transition-colors ${hasOT ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                <span className="text-xs font-semibold">{format(date, 'd')}</span>
                                {hasOT && <span className="text-[8px] font-bold">+{ot}h</span>}
                            </div>
                        );
                    })}
                </div>
            )}
            <div className="mt-3 flex gap-3 text-[10px] text-muted justify-center flex-wrap">
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-600 border border-blue-700 rounded-sm"></div> Overtime (&gt;8h)</div>
            </div>
        </div>
    );
};

export default OTCalendar;
