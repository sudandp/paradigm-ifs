import React, { useState, useEffect, useMemo, useRef } from 'react';
import { startOfYear, endOfYear, format, getMonth, eachDayOfInterval, getDay, isSameDay, startOfMonth, endOfMonth } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';
import { useSettingsStore } from '../../store/settingsStore';
import type { AttendanceEvent, UserHoliday, LeaveRequest } from '../../types';
import { FIXED_HOLIDAYS } from '../../utils/constants';
import { Loader2, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import {
    Chart,
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
} from 'chart.js';

Chart.register(
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend
);

const YearlyAttendanceChart: React.FC = () => {
    const { user } = useAuthStore();
    const { recurringHolidays, attendance, fieldHolidays, officeHolidays } = useSettingsStore();
    const [events, setEvents] = useState<AttendanceEvent[]>([]);
    const [userHolidays, setUserHolidays] = useState<string[]>([]);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            setIsLoading(true);
            try {
                const start = startOfYear(new Date(currentYear, 0, 1)).toISOString();
                const end = endOfYear(new Date(currentYear, 0, 1)).toISOString();
                
                const [attendanceData, holData, leaveData] = await Promise.all([
                    api.getAttendanceEvents(user.id, start, end),
                    api.getUserHolidays(user.id),
                    api.getLeaveRequests({
                        userId: user.id,
                        status: 'approved',
                        startDate: start,
                        endDate: end
                    })
                ]);
                
                setEvents(attendanceData);
                setUserHolidays((holData as UserHoliday[]).map(h => h.holidayName));
                setLeaves(leaveData.data);
            } catch (error) {
                console.error("Failed to fetch yearly chart data", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [user, currentYear]);

    const stats = useMemo(() => {
        const monthlyWorked = Array(12).fill(0);
        const monthlyLeaves = Array(12).fill(0);
        const monthlyHolidays = Array(12).fill(0);
        const monthlySundays = Array(12).fill(0);

        const workedDaysSet = new Set<string>();
        events.forEach(e => {
            if (e.type.toLowerCase().includes('check-in')) {
                workedDaysSet.add(format(new Date(e.timestamp), 'yyyy-MM-dd'));
            }
        });

        // Map leaves to days
        const leaveDaysSet = new Set<string>();
        leaves.forEach(leave => {
            const start = new Date(leave.startDate);
            const end = new Date(leave.endDate);
            const daysInLeave = eachDayOfInterval({ start, end });
            daysInLeave.forEach(d => leaveDaysSet.add(format(d, 'yyyy-MM-dd')));
        });

        const activeRecurringRules = recurringHolidays.filter(rule => 
            (rule.type || 'office') === (user?.role === 'field_staff' ? 'field' : 'office')
        );

        const allowedFloating = (user?.role === 'field_staff'
            ? attendance?.field?.monthlyFloatingLeaves
            : attendance?.office?.monthlyFloatingLeaves) ?? 0;

        const configHolidays = user?.role === 'field_staff' ? fieldHolidays : officeHolidays;

        for (let m = 0; m < 12; m++) {
            const start = startOfMonth(new Date(currentYear, m, 1));
            const end = endOfMonth(new Date(currentYear, m, 1));
            const daysInMonth = eachDayOfInterval({ start, end });

            let floatingCount = 0;
            let monthWorkedCount = 0;
            let monthLeaveCount = 0;
            let monthHolidayCount = 0;
            let monthSundayCount = 0;

            daysInMonth.forEach(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                
                // 1. Worked (Highest priority)
                if (workedDaysSet.has(dateStr)) {
                    monthWorkedCount++;
                    return;
                }

                // 2. Approved Leaves
                if (leaveDaysSet.has(dateStr)) {
                    monthLeaveCount++;
                    return;
                }

                // 3. Holidays
                const isConfigured = configHolidays.some(h => isSameDay(new Date(h.date), day));
                const isFixed = FIXED_HOLIDAYS.some(h => h.date === format(day, 'MM-dd'));
                const matchingFixed = FIXED_HOLIDAYS.find(h => h.date === format(day, 'MM-dd'));
                const isUserSelected = matchingFixed ? userHolidays.includes(matchingFixed.name) : false;
                
                let isRecurring = false;
                if (floatingCount < allowedFloating) {
                    for (const rule of activeRecurringRules) {
                        if (format(day, 'EEEE').toLowerCase() === rule.day.toLowerCase()) {
                            const prevDaysInMonth = eachDayOfInterval({ start, end: day });
                            const occurrence = prevDaysInMonth.filter(d => format(d, 'EEEE').toLowerCase() === rule.day.toLowerCase()).length;
                            if (occurrence === rule.n) {
                                isRecurring = true;
                                break;
                            }
                        }
                    }
                }

                if (isConfigured || isFixed || isUserSelected || isRecurring) {
                    monthHolidayCount++;
                    if (isRecurring) floatingCount++;
                    return;
                }

                // 4. Week Offs (Sundays)
                if (getDay(day) === 0) {
                    monthSundayCount++;
                    return;
                }
            });

            monthlyWorked[m] = monthWorkedCount;
            monthlyLeaves[m] = monthLeaveCount;
            monthlyHolidays[m] = monthHolidayCount;
            monthlySundays[m] = monthSundayCount;
        }

        return { monthlyWorked, monthlyLeaves, monthlyHolidays, monthlySundays };
    }, [events, userHolidays, leaves, recurringHolidays, attendance, user, currentYear, fieldHolidays, officeHolidays]);



    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    useEffect(() => {
        if (chartRef.current && !isLoading) {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }

            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                chartInstance.current = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: months,
                        datasets: [
                            {
                                label: 'WORKED',
                                data: stats.monthlyWorked,
                                backgroundColor: '#6366f1', // Indigo 600
                                stack: 'payable',
                                borderRadius: 4,
                            },
                            {
                                label: 'LEAVES',
                                data: stats.monthlyLeaves,
                                backgroundColor: '#8b5cf6', // Violet 500
                                stack: 'payable',
                                borderRadius: 4,
                            },
                            {
                                label: 'HOLIDAYS',
                                data: stats.monthlyHolidays,
                                backgroundColor: '#10b981', // Emerald 500
                                stack: 'payable',
                                borderRadius: 4,
                            },
                            {
                                label: 'WEEK OFFS',
                                data: stats.monthlySundays,
                                backgroundColor: '#f59e0b', // Amber 500
                                stack: 'payable',
                                borderRadius: 4,
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                position: 'bottom',
                                labels: {
                                    boxWidth: 8,
                                    padding: 10,
                                    font: { size: 10, weight: 700 }
                                }
                            },
                            tooltip: {
                                backgroundColor: '#1e293b',
                                padding: 10,
                                cornerRadius: 8,
                                callbacks: {
                                    footer: (items) => {
                                        const total = items.reduce((sum, item) => sum + (item.raw as number), 0);
                                        return `Total Paydays: ${total} days`;
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                stacked: true,
                                beginAtZero: true,
                                max: 31,
                                ticks: { stepSize: 5, font: { size: 10 } },
                                grid: { color: 'rgba(0,0,0,0.05)' }
                            },
                            x: {
                                stacked: true,
                                grid: { display: false },
                                ticks: { font: { size: 10, weight: 500 }, color: '#64748b' }
                            }
                        }
                    }
                });
            }
        }

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [stats, isLoading]);

    const changeYear = (delta: number) => {
        setCurrentYear(prev => prev + delta);
    };

    const totalPayable = stats.monthlyWorked.reduce((a, b) => a + b, 0) + 
                       stats.monthlyLeaves.reduce((a, b) => a + b, 0) + 
                       stats.monthlyHolidays.reduce((a, b) => a + b, 0) + 
                       stats.monthlySundays.reduce((a, b) => a + b, 0);

    return (
        <div className="bg-card p-5 rounded-xl shadow-card border border-border w-full md:max-w-[350px] flex flex-col min-h-[460px]">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-50 rounded-lg">
                        <BarChart2 className="h-4 w-4 text-indigo-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-primary-text">Yearly Attendance</h3>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => changeYear(-1)} className="p-1 hover:bg-gray-100 rounded-md transition-colors">
                        <ChevronLeft className="h-4 w-4 text-muted" />
                    </button>
                    <span className="text-sm font-bold text-gray-700 min-w-[40px] text-center">{currentYear}</span>
                    <button onClick={() => changeYear(1)} className="p-1 hover:bg-gray-100 rounded-md transition-colors" disabled={currentYear >= new Date().getFullYear()}>
                        <ChevronRight className="h-4 w-4 text-muted" />
                    </button>
                </div>
            </div>

            <div className="flex-1 relative min-h-[250px]">
                {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                    </div>
                ) : null}
                <canvas ref={chartRef}></canvas>
            </div>
            
            <div className="mt-4 pt-3 border-t border-border/50 flex flex-col gap-1 text-[11px] text-muted">
                <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-gray-600">Total Paydays:</span>
                    <span className="font-bold text-indigo-600 text-sm">{totalPayable} days</span>
                </div>
                <div className="flex justify-between items-center opacity-80">
                    <span title="Worked + Leaves + Holidays + Week Offs">
                        (W: {stats.monthlyWorked.reduce((a, b) => a + b, 0)} + 
                         L: {stats.monthlyLeaves.reduce((a, b) => a + b, 0)} + 
                         H: {stats.monthlyHolidays.reduce((a, b) => a + b, 0)} + 
                         WO: {stats.monthlySundays.reduce((a, b) => a + b, 0)})
                    </span>
                    <span>Avg: {(totalPayable / (currentYear < new Date().getFullYear() ? 12 : new Date().getMonth() + 1)).toFixed(1)}/mo</span>
                </div>
            </div>
        </div>
    );
};

export default YearlyAttendanceChart;

