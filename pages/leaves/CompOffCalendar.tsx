import React, { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { CompOffLog } from '../../types';
import Button from '../../components/ui/Button';

interface CompOffCalendarProps {
    logs: CompOffLog[];
    isLoading?: boolean;
}

const CompOffCalendar: React.FC<CompOffCalendarProps> = ({ logs, isLoading = false }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const daysInMonth = useMemo(() => {
        return eachDayOfInterval({
            start: startOfMonth(currentDate),
            end: endOfMonth(currentDate)
        });
    }, [currentDate]);

    const getDayStatus = (date: Date) => {
        // Check if there is a comp off log for this date
        // Assuming dateEarned is YYYY-MM-DD string
        const hasCompOff = logs.some(log => {
            const logDate = new Date(log.dateEarned.replace(/-/g, '/'));
            return isSameDay(logDate, date);
        });

        if (hasCompOff) return 'earned';
        return 'neutral';
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'earned': return 'bg-blue-600 text-white border-blue-700 shadow-sm'; // Vibrant Blue for Comp Off
            default: return 'bg-gray-50 text-gray-400 border-gray-100'; // Neutral
        }
    };

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const startDay = getDay(startOfMonth(currentDate)); // 0-6

    return (
        <div className="md:bg-card md:p-3 md:rounded-xl md:shadow-card border-none bg-transparent p-3 rounded-xl shadow-none w-full md:w-full md:max-w-[320px]">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-primary-text">Comp Off Tracker</h3>
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
            <div className="mt-3 flex gap-3 text-xs text-muted justify-center">
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-600 border border-blue-700 rounded-sm"></div> Comp Off Earned</div>
            </div>
        </div>
    );
};

export default CompOffCalendar;
