import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// This component has been extended to support manual date entry for the attendance dashboard, enforce whole
// number increments on the chart axes, and unify the report generation/download flow into a single action.
import { api } from '../../services/api';
import html2pdf from 'html2pdf.js';
import { useAuthStore } from '../../store/authStore';
import { usePermissionsStore } from '../../store/permissionsStore';
import type {
    AttendanceEvent,
    DailyAttendanceRecord,
    DailyAttendanceStatus,
    User,
    LeaveRequest,
    Holiday,
    AttendanceSettings,
    OnboardingData,
    Organization,
    UserRole,
    CompOffLog
} from '../../types';
import {
    format,
    getDaysInMonth,
    addDays,
    startOfToday,
    endOfToday,
    startOfMonth,
    endOfMonth,
    startOfYear,
    endOfYear,
    subDays,
    eachDayOfInterval,
    differenceInHours,
    differenceInMinutes,
    isSaturday,
    isSunday,
    isWithinInterval,
    startOfDay,
    endOfDay
} from 'date-fns';
import { Loader2, Download, Users, UserCheck, UserX, Clock, BarChart3, TrendingUp, Calendar, FileDown } from 'lucide-react';
// Removed incorrect store imports
// Import reverse geocode utility to convert lat/lon into human addresses for logs
import { reverseGeocode } from '../../utils/locationUtils';
import { DateRangePicker, type Range, type RangeKeyDict } from 'react-date-range';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import DatePicker from '../../components/ui/DatePicker';
import Toast from '../../components/ui/Toast';
import Input from '../../components/ui/Input';
import StatCard from '../../components/ui/StatCard';
import Logo from '../../components/ui/Logo';
import { pdfLogoLocalPath } from '../../components/ui/logoData';
import { useSettingsStore } from '../../store/settingsStore';
import { useThemeStore } from '../../store/themeStore';
import {
    Chart,
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    DoughnutController,
    ArcElement,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';

// Register the necessary components for Chart.js to work in a tree-shaken environment
Chart.register(
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    DoughnutController,
    ArcElement,
    Tooltip,
    Legend,
    Filler
);


// --- Reusable Dashboard Components ---
const ChartContainer: React.FC<{ title: string, icon: React.ElementType, children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
    <div className="bg-card p-4 md:p-6 rounded-xl shadow-card col-span-1">
        <div className="flex items-center mb-4">
            <Icon className="h-5 w-5 mr-3 text-muted" />
            <h3 className="font-semibold text-primary-text">{title}</h3>
        </div>
        <div className="h-64 md:h-80 relative">{children}</div>
    </div>
);

const AttendanceTrendChart: React.FC<{ data: { labels: string[], present: number[], absent: number[] } }> = ({ data }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (chartRef.current) {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                chartInstance.current = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: data.labels,
                        datasets: [
                            {
                                label: 'Present',
                                data: data.present,
                                backgroundColor: '#005D22',
                                borderColor: '#004218',
                                borderWidth: 1,
                                borderRadius: 4,
                            },
                            {
                                label: 'Absent',
                                data: data.absent,
                                backgroundColor: '#EF4444',
                                borderColor: '#DC2626',
                                borderWidth: 1,
                                borderRadius: 4,
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' } },
                            x: {
                                grid: { display: false },
                                ticks: {
                                    maxRotation: 0,
                                    minRotation: 0,
                                    autoSkip: true,
                                    maxTicksLimit: 7,
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: true,
                                position: 'bottom',
                                align: 'center',
                                labels: {
                                    usePointStyle: true,
                                    pointStyle: 'rectRounded',
                                    boxWidth: 12,
                                    padding: 20,
                                    font: {
                                        family: "'Manrope', sans-serif",
                                        size: 12,
                                    }
                                }
                            },
                            tooltip: {
                                backgroundColor: '#0F172A',
                                titleFont: { family: "'Manrope', sans-serif" },
                                bodyFont: { family: "'Manrope', sans-serif" },
                                cornerRadius: 8,
                                padding: 10,
                                displayColors: true,
                                boxPadding: 4,
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
    }, [data]);

    return (
        <div className="h-full w-full flex flex-col">
            <div className="flex-grow relative">
                <canvas ref={chartRef}></canvas>
            </div>
        </div>
    );
};

const ProductivityChart: React.FC<{ data: { labels: string[], hours: number[] } }> = ({ data }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (chartRef.current) {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                const gradient = ctx.createLinearGradient(0, 0, 0, 200);
                gradient.addColorStop(0, 'rgba(0, 93, 34, 0.4)');
                gradient.addColorStop(1, 'rgba(0, 93, 34, 0)');
                chartInstance.current = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.labels,
                        datasets: [{
                            label: 'Average Hours Worked',
                            data: data.hours,
                            borderColor: '#005D22',
                            backgroundColor: gradient,
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: '#005D22',
                            pointRadius: 0,
                            pointHoverRadius: 5,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            // Use whole-number tick steps on the y-axis so average hours are easy to read.  If
                            // fractional hours are returned they will be rounded when rendered.
                            y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(128,128,128,0.1)' },
                                ticks: {
                                    stepSize: 1,
                                    precision: 0,
                                    callback: (value: any) => {
                                        const num = typeof value === 'string' ? parseFloat(value) : (value as number);
                                        return Math.round(num);
                                    },
                                },
                            },
                            x: {
                                grid: { display: false },
                                ticks: {
                                    maxRotation: 0,
                                    minRotation: 0,
                                    autoSkip: true,
                                    maxTicksLimit: 7,
                                },
                            },
                        },
                        plugins: {
                            legend: {
                                display: true,
                                position: 'bottom',
                                align: 'center',
                                labels: {
                                    usePointStyle: true,
                                    pointStyle: 'rectRounded',
                                    boxWidth: 12,
                                    padding: 20,
                                    font: {
                                        family: "'Manrope', sans-serif",
                                        size: 12,
                                    },
                                },
                            },
                            tooltip: {
                                backgroundColor: '#0F172A',
                                titleFont: { family: "'Manrope', sans-serif" },
                                bodyFont: { family: "'Manrope', sans-serif" },
                                cornerRadius: 8,
                                padding: 10,
                                displayColors: true,
                                boxPadding: 4,
                            },
                        },
                    }
                });
            }
        }
        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [data]);

    return (
        <div className="h-full w-full flex flex-col">
            <div className="flex-grow relative">
                <canvas ref={chartRef}></canvas>
            </div>
        </div>
    );
};


interface DashboardData {
    totalEmployees: number;
    presentToday: number;
    absentToday: number;
    onLeaveToday: number;
    attendanceTrend: { labels: string[]; present: number[]; absent: number[] };
    productivityTrend: { labels: string[]; hours: number[] };
}



// --- Report Modal Component ---
type ReportFormat = 'basicReport' | 'attendanceLog' | 'monthlyReport';
type BasicReportDataRow = {
    date: string;
    userName: string;
    status: string; // Allow string to support 'Holiday', 'Weekend' etc.
    checkIn: string | null;
    checkOut: string | null;
    duration: string | null;
};

type AttendanceLogDataRow = {
    userName: string;
    date: string;
    time: string;
    type: string;
    locationName?: string;
    latitude?: number;
    longitude?: number;
};


// Extend AttendanceEvent with a locationName field for human readable addresses
const AttendanceLogPdfComponent: React.FC<{ data: AttendanceLogDataRow[]; dateRange: Range }> = ({ data, dateRange }) => {
    return (
        <div className="p-8 font-sans text-sm text-black bg-white">
            <div className="flex justify-between items-center border-b pb-4 mb-6">
                <Logo className="h-10" localPath={pdfLogoLocalPath} />
                <div className="text-right">
                    <h1 className="text-xl font-bold">Attendance Log</h1>
                    <p className="text-gray-600">{format(dateRange.startDate!, 'dd MMM yyyy')} to {format(dateRange.endDate!, 'dd MMM yyyy')}</p>
                </div>
            </div>
            <table className="w-full mt-6 text-left border-collapse">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="p-2 border border-gray-300">User</th>
                        <th className="p-2 border border-gray-300">Date</th>
                        <th className="p-2 border border-gray-300">Time</th>
                        <th className="p-2 border border-gray-300">Event</th>
                        <th className="p-2 border border-gray-300">Location</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((event, index) => (
                        <tr key={`${event.userName}-${event.date}-${event.time}-${index}`} className="border-b">
                            <td className="p-2 border border-gray-300">{event.userName}</td>
                            <td className="p-2 border border-gray-300">{event.date}</td>
                            <td className="p-2 border border-gray-300">{event.time}</td>
                            <td className="p-2 border border-gray-300 capitalize">{event.type.replace('-', ' ')}</td>
                            <td className="p-2 border border-gray-300">{event.locationName || (event.latitude ? `${event.latitude?.toFixed(4)}, ${event.longitude?.toFixed(4)}` : 'N/A')}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

/**
 * UPDATED: BasicReportPdfLayout
 * - Same padding on all pages (no negative margin tricks)
 * - Removed negative marginTop on title to avoid clipping/overlap
 * - Keeps fixed minHeight so each page height is consistent
 */
const BasicReportPdfLayout: React.FC<{ data: BasicReportDataRow[]; dateRange: Range }> = ({ data, dateRange }) => {
    const rowsPerPage = 15;
    const pages: BasicReportDataRow[][] = [];
    for (let i = 0; i < data.length; i += rowsPerPage) {
        pages.push(data.slice(i, i + rowsPerPage));
    }

    if (pages.length === 0) return null;

    return (
        <div>
            {pages.map((pageData, pageIndex) => {
                const emptyRows = rowsPerPage - pageData.length;
                const isLastPage = pageIndex === pages.length - 1;

                return (
                    <div
                        key={pageIndex}
                        style={{
                            padding: pageIndex === 0 ? '40px' : '0px 40px 40px 40px',
                            paddingTop: pageIndex === 0 ? '40px' : '0px',
                            marginTop: pageIndex === 0 ? '0px' : '-40px',
                            fontFamily: '"Courier New", Courier, monospace',
                            fontSize: '14px', // Slightly larger for 1123px width
                            color: '#000',
                            backgroundColor: '#fff',
                            width: '1123px', // A4 Landscape width in px (96dpi)
                            height: '794px', // A4 Landscape height in px (96dpi)
                            boxSizing: 'border-box',
                            letterSpacing: '0.5px',
                            pageBreakAfter: isLastPage ? 'auto' : 'always',
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        {/* Header Table */}
                        <table
                            style={{
                                width: '100%',
                                borderBottom: '2px solid #000',
                                marginBottom: '16px',
                                paddingBottom: '8px',
                            }}
                        >
                            <tbody>
                                <tr>
                                    <td style={{ width: '50%', verticalAlign: 'top', textAlign: 'left' }}>
                                        <Logo className="h-14" localPath={pdfLogoLocalPath} />
                                    </td>
                                    <td style={{ width: '50%', verticalAlign: 'top', textAlign: 'right' }}>
                                        <div
                                            style={{
                                                fontSize: '18px',
                                                fontWeight: 'bold',
                                                marginBottom: '6px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '1px',
                                            }}
                                        >
                                            Basic Attendance Report
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#333', marginBottom: '4px' }}>
                                            {format(dateRange.startDate!, 'dd MMM yyyy')} -{' '}
                                            {format(dateRange.endDate!, 'dd MMM yyyy')}
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#666' }}>
                                            Generated: {format(new Date(), 'dd MMM yyyy HH:mm')}
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Data Table */}
                        <div style={{ flexGrow: 1 }}>
                            <table
                                style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    border: '1px solid #000',
                                    tableLayout: 'fixed',
                                }}
                            >
                                <thead style={{ display: 'table-header-group' }}>
                                    <tr style={{ backgroundColor: '#f2f2f2' }}>
                                        <th
                                            style={{
                                                border: '1px solid #000',
                                                padding: '10px 5px',
                                                textAlign: 'center',
                                                width: '28%',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                            }}
                                        >
                                            Employee Name
                                        </th>
                                        <th
                                            style={{
                                                border: '1px solid #000',
                                                padding: '10px 5px',
                                                textAlign: 'center',
                                                width: '14%',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                            }}
                                        >
                                            Date
                                        </th>
                                        <th
                                            style={{
                                                border: '1px solid #000',
                                                padding: '10px 5px',
                                                textAlign: 'center',
                                                width: '14%',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                            }}
                                        >
                                            Status
                                        </th>
                                        <th
                                            style={{
                                                border: '1px solid #000',
                                                padding: '10px 5px',
                                                textAlign: 'center',
                                                width: '12%',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                            }}
                                        >
                                            Check In
                                        </th>
                                        <th
                                            style={{
                                                border: '1px solid #000',
                                                padding: '10px 5px',
                                                textAlign: 'center',
                                                width: '12%',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                            }}
                                        >
                                            Check Out
                                        </th>
                                        <th
                                            style={{
                                                border: '1px solid #000',
                                                padding: '10px 5px',
                                                textAlign: 'center',
                                                width: '15%',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                            }}
                                        >
                                            Hours
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageData.map((row, index) => (
                                        <tr
                                            key={`${row.userName}-${row.date}-${index}`}
                                            style={{ backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa' }}
                                        >
                                            <td
                                                style={{
                                                    border: '1px solid #ccc',
                                                    padding: '8px 5px',
                                                    textAlign: 'center',
                                                    verticalAlign: 'middle',
                                                    wordWrap: 'break-word',
                                                    whiteSpace: 'normal',
                                                    lineHeight: '1.4',
                                                }}
                                            >
                                                {row.userName}
                                            </td>
                                            <td
                                                style={{
                                                    border: '1px solid #ccc',
                                                    padding: '8px 5px',
                                                    textAlign: 'center',
                                                    verticalAlign: 'middle',
                                                }}
                                            >
                                                {format(
                                                    new Date(String(row.date).replace(/-/g, '/')),
                                                    'dd MMM yyyy'
                                                )}
                                            </td>
                                            <td
                                                style={{
                                                    border: '1px solid #ccc',
                                                    padding: '8px 5px',
                                                    textAlign: 'center',
                                                    verticalAlign: 'middle',
                                                }}
                                            >
                                                {row.status}
                                            </td>
                                            <td
                                                style={{
                                                    border: '1px solid #ccc',
                                                    padding: '8px 5px',
                                                    textAlign: 'center',
                                                    verticalAlign: 'middle',
                                                }}
                                            >
                                                {row.checkIn || '-'}
                                            </td>
                                            <td
                                                style={{
                                                    border: '1px solid #ccc',
                                                    padding: '8px 5px',
                                                    textAlign: 'center',
                                                    verticalAlign: 'middle',
                                                }}
                                            >
                                                {row.checkOut || '-'}
                                            </td>
                                            <td
                                                style={{
                                                    border: '1px solid #ccc',
                                                    padding: '8px 5px',
                                                    textAlign: 'center',
                                                    verticalAlign: 'middle',
                                                }}
                                            >
                                                {row.duration || '-'}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Render Empty Rows to maintain table height */}
                                    {Array.from({ length: emptyRows }).map((_, index) => (
                                        <tr key={`empty-${index}`} style={{ backgroundColor: '#fff' }}>
                                            <td
                                                style={{
                                                    border: '1px solid #ccc',
                                                    padding: '8px 5px',
                                                    height: '33px',
                                                }}
                                            >
                                                &nbsp;
                                            </td>
                                            <td style={{ border: '1px solid #ccc', padding: '8px 5px' }}>&nbsp;</td>
                                            <td style={{ border: '1px solid #ccc', padding: '8px 5px' }}>&nbsp;</td>
                                            <td style={{ border: '1px solid #ccc', padding: '8px 5px' }}>&nbsp;</td>
                                            <td style={{ border: '1px solid #ccc', padding: '8px 5px' }}>&nbsp;</td>
                                            <td style={{ border: '1px solid #ccc', padding: '8px 5px' }}>&nbsp;</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div
                            style={{
                                marginTop: '10px',
                                borderTop: '1px solid #ccc',
                                paddingTop: '8px',
                                textAlign: 'center',
                                fontSize: '10px',
                                color: '#888',
                            }}
                        >
                            Paradigm Services - Confidential Report - Page {pageIndex + 1} of {pages.length}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// --- Monthly Report Types and Component ---
interface MonthlyReportRow {
    userName: string;
    /**
     * A list of status codes for each day in the selected range.  The order matches the
     * chronological order of days from startDate to endDate.  Status codes are one of:
     * 'P'  – Present (full day)
     * '1/2P' – Half Day present
     * 'A'  – Absent
     * 'WO' – Week Off (Sunday without work)
     * 'H'  – Holiday (official holiday without work)
     * 'WOP' – Weekend Present (work performed on a weekend)
     * 'HP' – Holiday Present (work performed on a holiday)
     * '-'  – Not Applicable / No Data
     */
    statuses: string[];
    presentDays: number;
    absentDays: number;
    halfDays: number;
    weekOffs: number;
    holidays: number;
    weekendPresents: number;
    holidayPresents: number;
    totalPayableDays: number;
}


const MonthlyReportPdfComponent: React.FC<{ data: MonthlyReportRow[]; dateRange: Range }> = ({ data, dateRange }) => {
    const days = eachDayOfInterval({ start: dateRange.startDate!, end: dateRange.endDate! });
    return (
        <div className="p-8 font-sans text-[9px] text-black bg-white">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
                <Logo className="h-8" localPath={pdfLogoLocalPath} />
                <div className="text-right">
                    <h1 className="text-lg font-bold">Monthly Attendance Report</h1>
                    <p className="text-gray-600">
                        {format(dateRange.startDate!, 'dd MMM yyyy')} to {format(dateRange.endDate!, 'dd MMM yyyy')}
                    </p>
                </div>
            </div>
            <table className="w-full border-collapse border border-gray-400 text-center">
                <thead>
                    <tr className="bg-gray-200 font-bold">
                        <td className="border p-1 border-gray-400 text-left">Employee Name</td>
                        {days.map((d, idx) => (
                            <td key={idx} className="border p-1 border-gray-400">
                                {format(d, 'd')}
                            </td>
                        ))}
                        <td className="border p-1 border-gray-400">P</td>
                        <td className="border p-1 border-gray-400">1/2P</td>
                        <td className="border p-1 border-gray-400">A</td>
                        <td className="border p-1 border-gray-400">WO</td>
                        <td className="border p-1 border-gray-400">H</td>
                        <td className="border p-1 border-gray-400">WOP</td>
                        <td className="border p-1 border-gray-400">HP</td>
                        <td className="border p-1 border-gray-400">Total</td>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, idx) => (
                        <tr key={idx}>
                            <td className="border p-1 border-gray-400 text-left">{row.userName}</td>
                            {row.statuses.map((st, i) => (
                                <td key={i} className="border p-1 border-gray-400">{st}</td>
                            ))}
                            <td className="border p-1 border-gray-400">{row.presentDays}</td>
                            <td className="border p-1 border-gray-400">{row.halfDays}</td>
                            <td className="border p-1 border-gray-400">{row.absentDays}</td>
                            <td className="border p-1 border-gray-400">{row.weekOffs}</td>
                            <td className="border p-1 border-gray-400">{row.holidays}</td>
                            <td className="border p-1 border-gray-400">{row.weekendPresents}</td>
                            <td className="border p-1 border-gray-400">{row.holidayPresents}</td>
                            <td className="border p-1 border-gray-400">{row.totalPayableDays}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const AttendanceDashboard: React.FC = () => {
    const isSmallScreen = useMediaQuery('(max-width: 639px)');
    const { user } = useAuthStore();
    const { permissions } = usePermissionsStore();
    const { recurringHolidays } = useSettingsStore();

    const [users, setUsers] = useState<User[]>([]);
    const [attendanceEvents, setAttendanceEvents] = useState<AttendanceEvent[]>([]);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [dateRange, setDateRange] = useState<Range>({
        startDate: startOfToday(),
        endDate: endOfToday(),
        key: 'selection'
    });

    const dateRangeArray = useMemo(() => [dateRange], [dateRange]);

    const [activeDateFilter, setActiveDateFilter] = useState('Today');
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const datePickerRef = useRef<HTMLDivElement>(null);

    const [selectedUser, setSelectedUser] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    const [selectedRecordType, setSelectedRecordType] = useState<string>('all');
    const [reportType, setReportType] = useState<'basic' | 'log' | 'monthly'>('basic');
    const [isDownloading, setIsDownloading] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [addressCache, setAddressCache] = useState<Record<string, string>>({});

    const pdfRef = useRef<HTMLDivElement>(null);

    const canDownloadReport = user && permissions[user.role]?.includes('download_attendance_report');
    const canViewAllAttendance = user && permissions[user.role]?.includes('view_all_attendance');
    const isEmployeeView = !canViewAllAttendance;

    // Employee View State
    const [employeeStats, setEmployeeStats] = useState({ present: 0, absent: 0, ot: 0, compOff: 0 });
    const [employeeLogs, setEmployeeLogs] = useState<any[]>([]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
                setIsDatePickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (canDownloadReport) {
            api.getUsers().then(setUsers);
        }
    }, [canDownloadReport]);

    // Fetch Employee Data
    useEffect(() => {
        const fetchEmployeeData = async () => {
            if (!isEmployeeView || !user || !dateRange.startDate || !dateRange.endDate) return;
            setIsLoading(true);
            try {
                // Fetch extra days before start date to handle weekend logic correctly across months
                const bufferStartDate = subDays(dateRange.startDate, 7);
                const startStr = bufferStartDate.toISOString();
                const endStr = dateRange.endDate.toISOString();

                const [events, compOffs] = await Promise.all([
                    api.getAttendanceEvents(user.id, startStr, endStr),
                    api.getCompOffLogs(user.id)
                ]);

                // Calculate Stats
                // Generate logs for extended period to ensure continuity for weekend rules
                const extendedDays = eachDayOfInterval({ start: bufferStartDate, end: dateRange.endDate });

                // 1. Generate Initial Logs (Extended)
                let logs = extendedDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayEvents = events.filter(e => format(new Date(e.timestamp), 'yyyy-MM-dd') === dateStr);

                    let status = 'Absent';
                    let checkIn = '-';
                    let checkOut = '-';
                    let dailyOT = 0;

                    // Check Holidays/Weekends
                    const dayName = format(day, 'EEEE');
                    const isWeekend = dayName === 'Sunday';
                    const isRecurringHoliday = recurringHolidays.some(rule => {
                        if (rule.day.toLowerCase() !== dayName.toLowerCase()) return false;
                        const occurrence = Math.ceil(day.getDate() / 7);
                        const userRole = user.role === 'field_officer' ? 'field' : 'office'; // Map role
                        return rule.n === occurrence && (rule.type || 'office') === userRole;
                    });

                    if (isRecurringHoliday) status = 'Holiday';
                    else if (isWeekend) status = 'Weekend';

                    if (dayEvents.length > 0) {
                        status = 'Present';

                        // Sort events
                        dayEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                        const checkInEvent = dayEvents.find(e => e.type === 'check-in');
                        // Use the last check-out of the day to capture full duration
                        const checkOutEvent = [...dayEvents].reverse().find(e => e.type === 'check-out');

                        if (checkInEvent) checkIn = format(new Date(checkInEvent.timestamp), 'hh:mm a');
                        if (checkOutEvent) {
                            checkOut = format(new Date(checkOutEvent.timestamp), 'hh:mm a');

                            // Calculate OT (if > 8 hours)
                            if (checkInEvent) {
                                const diff = differenceInMinutes(new Date(checkOutEvent.timestamp), new Date(checkInEvent.timestamp));
                                const hours = diff / 60;
                                if (hours > 8) {
                                    dailyOT = Math.round((hours - 8) * 10) / 10;
                                }
                            }
                        }
                    }

                    return {
                        rawDate: day,
                        date: format(day, 'dd MMM, yyyy'),
                        day: dayName,
                        checkIn,
                        checkOut,
                        status,
                        ot: dailyOT
                    };
                });

                // 2. Apply Weekend Rule: If 4+ absences in the preceding week, mark Sunday as Absent
                logs.forEach((log, index) => {
                    if (log.status === 'Weekend' && log.day === 'Sunday') {
                        let absentCount = 0;
                        // Look back up to 6 days
                        const lookBackLimit = Math.max(0, index - 6);
                        for (let i = index - 1; i >= lookBackLimit; i--) {
                            if (logs[i].status === 'Absent') {
                                absentCount++;
                            }
                        }
                        if (absentCount >= 4) {
                            log.status = 'Absent';
                        }
                    }
                });

                // 3. Filter logs for the actual requested range
                const displayLogs = logs.filter(l => l.rawDate >= dateRange.startDate!);

                // 4. Calculate Final Stats based on displayLogs
                const present = displayLogs.filter(l => l.status === 'Present').length;
                const absent = displayLogs.filter(l => l.status === 'Absent' && l.rawDate <= new Date()).length;
                const otHours = displayLogs.reduce((acc, l) => acc + l.ot, 0);

                // Comp Offs (Count earned in this period)
                const compOffCount = compOffs.filter(log => {
                    const d = new Date(log.dateEarned);
                    return d >= dateRange.startDate! && d <= dateRange.endDate! && log.status === 'earned';
                }).length;

                setEmployeeStats({ present, absent, ot: Math.round(otHours * 10) / 10, compOff: compOffCount });
                setEmployeeLogs(displayLogs.reverse()); // Newest first

            } catch (error) {
                console.error("Failed to fetch employee attendance", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchEmployeeData();
    }, [isEmployeeView, user, dateRange, recurringHolidays]);

    const fetchDashboardData = useCallback(async (startDate: Date, endDate: Date) => {
        setIsLoading(true);
        try {
            // Ensure we have users data
            let currentUsers = users;
            if (currentUsers.length === 0) {
                currentUsers = await api.getUsers();
                setUsers(currentUsers);
            }

            // Determine query range: Union of selected range and Today (to ensure "Today" stats are accurate)
            const today = new Date();
            const queryStart = startDate < today ? startDate : startOfToday();
            const queryEnd = endDate > today ? endDate : endOfToday();

            const [events, leaves] = await Promise.all([
                api.getAllAttendanceEvents(queryStart.toISOString(), queryEnd.toISOString()),
                api.getLeaveRequests({ startDate: queryStart.toISOString(), endDate: queryEnd.toISOString(), status: 'approved' })
            ]);

            setAttendanceEvents(events);
            setLeaves(leaves);

            // --- Calculate "Today" Stats ---
            const todayStr = format(today, 'yyyy-MM-dd');
            const todayEvents = events.filter(e => format(new Date(e.timestamp), 'yyyy-MM-dd') === todayStr);
            const presentToday = new Set(todayEvents.map(e => e.userId)).size;

            const todayLeaves = leaves.filter(l => {
                const start = new Date(l.startDate);
                const end = new Date(l.endDate);
                return today >= start && today <= end;
            });
            const onLeaveToday = new Set(todayLeaves.map(l => l.userId)).size;

            const totalEmployees = currentUsers.length;
            const absentToday = Math.max(0, totalEmployees - presentToday - onLeaveToday);


            // --- Calculate Trends (for the selected dateRange only) ---
            const days = eachDayOfInterval({ start: startDate, end: endDate });
            const labels = days.map(d => format(d, 'dd MMM'));
            const presentTrend: number[] = [];
            const absentTrend: number[] = [];
            const productivityData: number[] = [];

            days.forEach(day => {
                const dateStr = format(day, 'yyyy-MM-dd');

                // Present
                const dayEvents = events.filter(e => format(new Date(e.timestamp), 'yyyy-MM-dd') === dateStr);
                const uniqueUsersPresent = new Set(dayEvents.map(e => e.userId)).size;

                // On Leave
                const activeLeaves = leaves.filter(l => {
                    const start = new Date(l.startDate);
                    const end = new Date(l.endDate);
                    return day >= start && day <= end;
                });
                const usersOnLeave = new Set(activeLeaves.map(l => l.userId)).size;

                // Absent
                // Note: This simple calculation assumes all users are expected to work every day.
                // For more accuracy, we would check weekends/holidays, but for the trend chart, this is usually acceptable.
                const absent = Math.max(0, totalEmployees - uniqueUsersPresent - usersOnLeave);

                presentTrend.push(uniqueUsersPresent);
                absentTrend.push(absent);

                // Productivity (Avg Hours)
                let totalHours = 0;
                const userEvents: Record<string, AttendanceEvent[]> = {};
                dayEvents.forEach(e => {
                    if (!userEvents[e.userId]) userEvents[e.userId] = [];
                    userEvents[e.userId].push(e);
                });

                Object.values(userEvents).forEach(ue => {
                    ue.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                    const checkIn = ue.find(e => e.type === 'check-in');
                    // Use the last check-out of the day
                    const checkOut = [...ue].reverse().find(e => e.type === 'check-out');

                    if (checkIn && checkOut) {
                        const diff = differenceInMinutes(new Date(checkOut.timestamp), new Date(checkIn.timestamp));
                        totalHours += diff / 60;
                    } else if (checkIn) {
                        // If currently checked in (today), calculate hours until now? 
                        // Or just ignore incomplete sessions for productivity trend?
                        // Ignoring incomplete sessions is safer for historical data.
                    }
                });

                productivityData.push(uniqueUsersPresent > 0 ? parseFloat((totalHours / uniqueUsersPresent).toFixed(1)) : 0);
            });

            setDashboardData({
                totalEmployees,
                presentToday,
                absentToday,
                onLeaveToday,
                attendanceTrend: {
                    labels,
                    present: presentTrend,
                    absent: absentTrend
                },
                productivityTrend: {
                    labels,
                    hours: productivityData
                }
            });

        } catch (error) {
            console.error("Failed to load dashboard data", error);
        } finally {
            setIsLoading(false);
        }
    }, [users]);

    useEffect(() => {
        if (dateRange.startDate && dateRange.endDate) {
            fetchDashboardData(dateRange.startDate, dateRange.endDate);
        }
    }, [dateRange, fetchDashboardData]);

    // Geocoding Effect for Attendance Log
    useEffect(() => {
        if (reportType !== 'log' || !dateRange.startDate || !dateRange.endDate) return;

        // Normalize coordinates to 6 decimal places for consistent key generation
        const normalizeCoord = (n: number) => parseFloat(n.toFixed(6));

        const processGeocoding = async () => {
            const targetUsers = selectedUser === 'all' ? users : users.filter(u => u.id === selectedUser);
            const targetUserIds = new Set(targetUsers.map(u => u.id));

            const eventsToProcess = attendanceEvents.filter(e => {
                if (!targetUserIds.has(e.userId)) return false;
                if (new Date(e.timestamp) < dateRange.startDate!) return false;
                if (new Date(e.timestamp) > dateRange.endDate!) return false;
                if ((e as any).locationName) return false;
                if (!e.latitude || !e.longitude) return false;

                const key = `${normalizeCoord(e.latitude)},${normalizeCoord(e.longitude)}`;
                return !addressCache[key];
            });

            console.log('Geocoding: Events to process:', eventsToProcess.length);

            if (eventsToProcess.length === 0) return;

            const coords = eventsToProcess.map(e => ({ lat: e.latitude!, lon: e.longitude! }));
            console.log('Geocoding: Fetching addresses for', coords.length, 'unique coordinates');

            try {
                const resolvedAddresses = await api.batchResolveAddresses(coords);
                console.log('Geocoding: Resolved addresses:', Object.keys(resolvedAddresses).length);
                setAddressCache(prev => ({ ...prev, ...resolvedAddresses }));
            } catch (error) {
                console.error("Batch geocoding failed:", error);
            }
        };

        processGeocoding();
    }, [attendanceEvents, dateRange, selectedUser, reportType, users]);

    const handleSetDateFilter = (filter: string) => {
        setActiveDateFilter(filter);
        const today = new Date();
        let startDate = startOfToday();
        let endDate = endOfToday();

        if (filter === 'This Month') {
            startDate = startOfMonth(today);
            endDate = endOfMonth(today);
        } else if (filter === 'This Year') {
            startDate = startOfYear(today);
            endDate = endOfYear(today);
        } else if (filter === 'Last 7 Days') {
            startDate = subDays(today, 6);
        } else if (filter === 'Last 30 Days') {
            startDate = subDays(today, 29);
        }

        if (endDate > today) {
            endDate = today;
        }

        setDateRange({ startDate, endDate, key: 'selection' });
    };

    const handleCustomDateChange = (item: RangeKeyDict) => {
        setDateRange(item.selection);
        setActiveDateFilter('Custom');
        setIsDatePickerOpen(false);
    };

    const statDateLabel = useMemo(() => {
        const endDate = dateRange.endDate!;
        const today = new Date();
        if (format(endDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) return "Today";
        return `on ${format(endDate, 'MMM d')}`;
    }, [dateRange]);

    // --- Report Data Generation Logic ---

    // 1. Basic Report Data
    const basicReportData: BasicReportDataRow[] = useMemo(() => {
        if (!dateRange.startDate || !dateRange.endDate) return [];

        const data: BasicReportDataRow[] = [];
        const days = eachDayOfInterval({ start: dateRange.startDate, end: dateRange.endDate });

        // Filter users based on selection
        const targetUsers = selectedUser === 'all' ? users : users.filter(u => u.id === selectedUser);

        targetUsers.forEach(user => {
            days.forEach(day => {
                const dateStr = format(day, 'yyyy-MM-dd');

                // Find events for this user and day
                const dayEvents = attendanceEvents.filter(e =>
                    e.userId === user.id && format(new Date(e.timestamp), 'yyyy-MM-dd') === dateStr
                );

                // Check for approved leaves
                const hasApprovedLeave = leaves.some(l => 
                    l.userId === user.id && 
                    l.status === 'approved' &&
                    isWithinInterval(day, { 
                        start: startOfDay(new Date(l.startDate)), 
                        end: endOfDay(new Date(l.endDate)) 
                    })
                );

                // Determine Status (Simplified logic for Basic Report)
                let status = 'Absent';
                let checkIn = '';
                let checkOut = '';
                let duration = '';

                // Check for holidays/weekends first
                const dayName = format(day, 'EEEE');
                const isWeekend = dayName === 'Sunday';

                // Check for recurring holidays
                const isRecurringHoliday = recurringHolidays.some(rule => {
                    if (rule.day.toLowerCase() !== dayName.toLowerCase()) return false;
                    // Calculate occurrence (e.g., 2nd Saturday)
                    const dayDate = day.getDate();
                    const occurrence = Math.ceil(dayDate / 7);

                    // Check role type match
                    const userRole = user.role === 'field_officer' ? 'field' : 'office';
                    const ruleType = rule.type || 'office'; // Default to office if not specified

                    return rule.n === occurrence && ruleType === userRole;
                });

                if (isRecurringHoliday) {
                    status = 'Holiday';
                } else if (isWeekend) {
                    status = 'Weekend';
                }

                if (dayEvents.length > 0) {
                    // Sort events by time
                    const sortedEvents = [...dayEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                    const checkInEvent = sortedEvents.find(e => e.type === 'check-in');
                    // Use the last check-out of the day
                    const checkOutEvent = [...sortedEvents].reverse().find(e => e.type === 'check-out');

                    // FIX: If there are ANY events for the day, the user should be considered 'Present' 
                    // (even if check-in or check-out is missing).
                    status = 'Present';
                    
                    if (checkInEvent) {
                        checkIn = format(new Date(checkInEvent.timestamp), 'HH:mm');
                    }

                    if (checkOutEvent) {
                        checkOut = format(new Date(checkOutEvent.timestamp), 'HH:mm');
                    }

                    if (checkInEvent && checkOutEvent) {
                        const start = new Date(checkInEvent.timestamp);
                        const end = new Date(checkOutEvent.timestamp);
                        const diff = differenceInMinutes(end, start);
                        const hours = Math.floor(diff / 60);
                        const minutes = diff % 60;
                        duration = `${hours}h ${minutes}m`;
                    }
                } else if (hasApprovedLeave) {
                    status = 'On Leave';
                }

                data.push({
                    userName: user.name,
                    date: dateStr,
                    status,
                    checkIn,
                    checkOut,
                    duration
                });
            });
        });

        // Apply status filter
        let filteredData = selectedStatus === 'all'
            ? data
            : data.filter(row => row.status === selectedStatus);

        // Apply record type filter
        if (selectedRecordType !== 'all') {
            filteredData = filteredData.filter(row => {
                const hasCheckIn = row.checkIn && row.checkIn !== '-' && row.checkIn !== '';
                const hasCheckOut = row.checkOut && row.checkOut !== '-' && row.checkOut !== '';

                switch (selectedRecordType) {
                    case 'complete':
                        return hasCheckIn && hasCheckOut;
                    case 'missing_checkout':
                        return hasCheckIn && !hasCheckOut;
                    case 'missing_checkin':
                        return !hasCheckIn && hasCheckOut;
                    case 'incomplete':
                        return !hasCheckIn || !hasCheckOut;
                    default:
                        return true;
                }
            });
        }

        return filteredData;
    }, [users, attendanceEvents, dateRange, selectedUser, selectedStatus, selectedRecordType, recurringHolidays]);

    // 2. Attendance Log Data (Raw Events)
    const attendanceLogData: AttendanceLogDataRow[] = useMemo(() => {
        if (!dateRange.startDate || !dateRange.endDate) return [];

        // Normalize coordinates to 6 decimal places for consistent key generation
        const normalizeCoord = (n: number) => parseFloat(n.toFixed(6));

        const targetUsers = selectedUser === 'all' ? users : users.filter(u => u.id === selectedUser);
        const targetUserIds = new Set(targetUsers.map(u => u.id));

        return attendanceEvents
            .filter(e => targetUserIds.has(e.userId))
            .map(e => {
                const user = users.find(u => u.id === e.userId);
                const key = e.latitude && e.longitude
                    ? `${normalizeCoord(e.latitude)},${normalizeCoord(e.longitude)}`
                    : '';
                const address = addressCache[key];

                return {
                    userName: user?.name || 'Unknown',
                    date: format(new Date(e.timestamp), 'yyyy-MM-dd'),
                    time: format(new Date(e.timestamp), 'HH:mm:ss'),
                    type: e.type,
                    locationName: (e as any).locationName || address || (e.latitude ? `${e.latitude.toFixed(4)}, ${e.longitude.toFixed(4)}` : 'N/A'),
                    latitude: e.latitude,
                    longitude: e.longitude
                };
            })
            .sort((a, b) => {
                // Sort by date then time
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.time.localeCompare(b.time);
            });

    }, [users, attendanceEvents, dateRange, selectedUser, addressCache]);

    // 3. Monthly Report Data (Aggregated)
    const monthlyReportData: MonthlyReportRow[] = useMemo(() => {
        if (!dateRange.startDate || !dateRange.endDate) return [];

        const days = eachDayOfInterval({ start: dateRange.startDate, end: dateRange.endDate });
        const targetUsers = selectedUser === 'all' ? users : users.filter(u => u.id === selectedUser);

        return targetUsers.map(user => {
            const statuses: string[] = [];
            let presentDays = 0;
            let absentDays = 0;
            let halfDays = 0;
            let weekOffs = 0;
            let holidays = 0;
            let weekendPresents = 0;
            let holidayPresents = 0;

            days.forEach(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayEvents = attendanceEvents.filter(e =>
                    e.userId === user.id && format(new Date(e.timestamp), 'yyyy-MM-dd') === dateStr
                );

                const hasActivity = dayEvents.length > 0;

                // Determine day type (Weekend, Holiday, Regular)
                const dayName = format(day, 'EEEE');
                const isWeekend = dayName === 'Sunday';

                // Check recurring holiday
                const isRecurringHoliday = recurringHolidays.some(rule => {
                    if (rule.day.toLowerCase() !== dayName.toLowerCase()) return false;
                    const dayDate = day.getDate();
                    const occurrence = Math.ceil(dayDate / 7);
                    const userRole = user.role === 'field_officer' ? 'field' : 'office';
                    const ruleType = rule.type || 'office';
                    return rule.n === occurrence && ruleType === userRole;
                });

                // Find approved leaves for this user on this day
                const hasApprovedLeave = leaves.some(l => 
                    l.userId === user.id && 
                    l.status === 'approved' &&
                    isWithinInterval(day, { 
                        start: startOfDay(new Date(l.startDate)), 
                        end: endOfDay(new Date(l.endDate)) 
                    })
                );

                let status = '';

                if (hasActivity) {
                    // Worked
                    if (isRecurringHoliday) {
                        status = 'HP'; // Holiday Present
                        holidayPresents++;
                    } else if (isWeekend) {
                        status = 'WOP'; // Weekend Present
                        weekendPresents++;
                    } else {
                        // Placeholder logic: assume full day if present
                        status = 'P';
                        presentDays++;
                    }
                } else {
                    // Not Worked
                    if (hasApprovedLeave) {
                        status = 'L';
                        presentDays++; // Treat approved leave as present for payable days in this logic
                    } else if (isRecurringHoliday) {
                        status = 'H';
                        holidays++;
                    } else if (isWeekend) {
                        status = 'WO';
                        weekOffs++;
                    } else {
                        status = 'A';
                        absentDays++;
                    }
                }
                statuses.push(status);
            });

            // Payable days: P + WO + H + WOP + HP + 0.5 * halfDays
            const totalPayableDays = presentDays + weekOffs + holidays + weekendPresents + holidayPresents + (halfDays * 0.5);

            return {
                userName: user.name,
                statuses,
                presentDays,
                absentDays,
                halfDays,
                weekOffs,
                holidays,
                weekendPresents,
                holidayPresents,
                totalPayableDays
            };
        });

    }, [users, attendanceEvents, dateRange, selectedUser, recurringHolidays]);


    // Determine which PDF component to render
    const pdfContent = useMemo(() => {
        if (reportType === 'basic') {
            return <BasicReportPdfLayout data={basicReportData} dateRange={dateRange} />;
        } else if (reportType === 'log') {
            return <AttendanceLogPdfComponent data={attendanceLogData} dateRange={dateRange} />;
        } else if (reportType === 'monthly') {
            return <MonthlyReportPdfComponent data={monthlyReportData} dateRange={dateRange} />;
        }
        return null;
    }, [reportType, basicReportData, attendanceLogData, monthlyReportData, dateRange]);


    const handleDownloadCsv = () => {
        setIsDownloading(true);
        try {
            let csvContent = "data:text/csv;charset=utf-8,";
            let filename = `Attendance_Report_${format(new Date(), 'yyyy-MM-dd')}.csv`;

            if (reportType === 'basic') {
                // Header
                csvContent += "Employee Name,Date,Status,Check In,Check Out,Hours\n";
                // Data
                basicReportData.forEach(row => {
                    csvContent += `"${row.userName}","${row.date}","${row.status}","${row.checkIn}","${row.checkOut}","${row.duration}"\n`;
                });
            } else if (reportType === 'log') {
                // Header
                csvContent += "User,Date,Time,Event,Location,Latitude,Longitude\n";
                // Data
                attendanceLogData.forEach(row => {
                    csvContent += `"${row.userName}","${row.date}","${row.time}","${row.type}","${row.locationName || ''}","${row.latitude || ''}","${row.longitude || ''}"\n`;
                });
            } else if (reportType === 'monthly') {
                // Header
                const days = eachDayOfInterval({ start: dateRange.startDate!, end: dateRange.endDate! });
                const dayHeaders = days.map(d => format(d, 'dd MMM')).join(",");
                csvContent += `Employee Name,${dayHeaders},Present,Absent,Half Days,Week Offs,Holidays,Weekend Presents,Holiday Presents,Total Payable Days\n`;

                // Data
                monthlyReportData.forEach(row => {
                    const statuses = row.statuses.join(",");
                    csvContent += `"${row.userName}",${statuses},"${row.presentDays}","${row.absentDays}","${row.halfDays}","${row.weekOffs}","${row.holidays}","${row.weekendPresents}","${row.holidayPresents}","${row.totalPayableDays}"\n`;
                });
            }

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setToast({ message: 'CSV downloaded successfully.', type: 'success' });
        } catch (error) {
            console.error("CSV generation failed:", error);
            setToast({ message: 'Failed to generate CSV.', type: 'error' });
        } finally {
            setIsDownloading(false);
        }
    };

    if (isLoading && !dashboardData && !isEmployeeView) {
        return <div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>;
    }

    if (isEmployeeView) {
        return (
            <div className="p-4 space-y-6 pb-24 md:bg-transparent bg-[#041b0f]">
                <div className="flex flex-col gap-4">
                    <h2 className="text-2xl font-bold text-primary-text">My Attendance</h2>

                    {/* Date Filter */}
                    <div className="bg-card p-3 rounded-xl shadow-sm border border-border flex flex-wrap items-center gap-2">
                        {['Today', 'This Month', 'Last 30 Days'].map(filter => (
                            <Button
                                key={filter}
                                type="button"
                                variant={activeDateFilter === filter ? 'primary' : 'outline'}
                                onClick={() => handleSetDateFilter(filter)}
                                className={activeDateFilter === filter
                                    ? "text-white shadow-md border"
                                    : "bg-card text-primary-text border border-border hover:bg-accent-light"
                                }
                                style={activeDateFilter === filter ? { backgroundColor: '#006B3F', borderColor: '#005632' } : {}}
                            >
                                {filter}
                            </Button>
                        ))}
                        <div className="relative" ref={datePickerRef}>
                            <Button
                                type="button"
                                variant={activeDateFilter === 'Custom' ? 'primary' : 'outline'}
                                onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                                className={activeDateFilter === 'Custom'
                                    ? "text-white shadow-md border"
                                    : "bg-card text-primary-text border border-border hover:bg-accent-light"
                                }
                                style={activeDateFilter === 'Custom' ? { backgroundColor: '#006B3F', borderColor: '#005632' } : {}}
                            >
                                <Calendar className="mr-2 h-4 w-4" />
                                <span>
                                    {activeDateFilter === 'Custom'
                                        ? `${format(dateRange.startDate!, 'dd MMM')} - ${format(dateRange.endDate!, 'dd MMM')}`
                                        : 'Custom'}
                                </span>
                            </Button>
                            {isDatePickerOpen && (
                                <div className="absolute top-full right-0 mt-2 z-50 bg-white dark:bg-gray-950 border border-border rounded-lg shadow-xl w-[300px] sm:w-auto overflow-hidden">
                                    <div className="text-gray-900">
                                        <DateRangePicker
                                            onChange={handleCustomDateChange}
                                            months={1}
                                            ranges={dateRangeArray}
                                            direction="horizontal"
                                            maxDate={new Date()}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-card p-6 rounded-xl shadow-sm border border-border flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow">
                        <div className="p-4 bg-emerald-600 text-white rounded-full mb-3 shadow-lg shadow-emerald-200 dark:shadow-none">
                            <UserCheck className="h-8 w-8" />
                        </div>
                        <p className="text-sm text-muted font-medium mb-1">Present</p>
                        <p className="text-2xl font-bold text-primary-text">{employeeStats.present}</p>
                    </div>
                    <div className="bg-card p-6 rounded-xl shadow-sm border border-border flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow">
                        <div className="p-4 bg-rose-600 text-white rounded-full mb-3 shadow-lg shadow-rose-200 dark:shadow-none">
                            <UserX className="h-8 w-8" />
                        </div>
                        <p className="text-sm text-muted font-medium mb-1">Absent</p>
                        <p className="text-2xl font-bold text-primary-text">{employeeStats.absent}</p>
                    </div>
                    <div className="bg-card p-6 rounded-xl shadow-sm border border-border flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow">
                        <div className="p-4 bg-blue-600 text-white rounded-full mb-3 shadow-lg shadow-blue-200 dark:shadow-none">
                            <Clock className="h-8 w-8" />
                        </div>
                        <p className="text-sm text-muted font-medium mb-1">Overtime</p>
                        <p className="text-2xl font-bold text-primary-text">{employeeStats.ot}h</p>
                    </div>
                    <div className="bg-card p-6 rounded-xl shadow-sm border border-border flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow">
                        <div className="p-4 bg-purple-600 text-white rounded-full mb-3 shadow-lg shadow-purple-200 dark:shadow-none">
                            <TrendingUp className="h-8 w-8" />
                        </div>
                        <p className="text-sm text-muted font-medium mb-1">Comp Offs</p>
                        <p className="text-2xl font-bold text-primary-text">{employeeStats.compOff}</p>
                    </div>
                </div>

                {/* Logs List */}
                <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                    <div className="p-4 border-b border-border font-semibold text-primary-text">Attendance Logs</div>
                    <div className="divide-y divide-border">
                        {isLoading ? (
                            <div className="p-8 text-center text-muted"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
                        ) : employeeLogs.length === 0 ? (
                            <div className="p-8 text-center text-muted">No records found for this period.</div>
                        ) : (
                            employeeLogs.map((log, idx) => (
                                <div key={idx} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                                    <div>
                                        <p className="font-medium text-primary-text">{log.date}</p>
                                        <p className="text-xs text-muted">{log.day}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm
                                            ${log.status === 'Present' ? 'bg-emerald-500 text-white dark:bg-emerald-600' :
                                                log.status === 'Absent' ? 'bg-rose-500 text-white dark:bg-rose-600' :
                                                    log.status === 'Holiday' ? 'bg-amber-500 text-white dark:bg-amber-600' :
                                                        log.status === 'Weekend' ? 'bg-indigo-500 text-white dark:bg-indigo-600' :
                                                            'bg-gray-500 text-white dark:bg-gray-600'}`}>
                                            {log.status}
                                        </span>
                                        {(log.checkIn !== '-' || log.checkOut !== '-') && (
                                            <div className="text-xs text-muted font-medium">
                                                {log.checkIn} - {log.checkOut}
                                            </div>
                                        )}
                                        {log.ot > 0 && (
                                            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">+{log.ot}h OT</span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <h2 className="text-2xl font-bold text-primary-text">Attendance Dashboard</h2>
            </div>

            {/* Filters */}
            <div className="hidden md:flex bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-wrap items-end gap-4">
                {/* Date Filters Group */}
                <div className="flex flex-wrap items-center gap-2">
                    {['Today', 'Last 7 Days', 'This Month'].map(filter => (
                        <Button
                            key={filter}
                            type="button"
                            onClick={() => handleSetDateFilter(filter)}
                            className={activeDateFilter === filter
                                ? "text-white shadow-md border"
                                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                            }
                            style={activeDateFilter === filter ? { backgroundColor: '#006B3F', borderColor: '#005632' } : {}}
                        >
                            {filter}
                        </Button>
                    ))}
                    <div className="relative" ref={datePickerRef}>
                        <Button type="button" variant="outline" onClick={() => setIsDatePickerOpen(!isDatePickerOpen)} className="hover:bg-gray-100">
                            <Calendar className="mr-2 h-4 w-4" />
                            <span>
                                {activeDateFilter === 'Custom'
                                    ? `${format(dateRange.startDate!, 'dd MMM, yyyy')} - ${format(dateRange.endDate!, 'dd MMM, yyyy')}`
                                    : 'Custom Range'}
                            </span>
                        </Button>
                        {isDatePickerOpen && (
                            <div className="absolute top-full left-0 mt-2 z-10 bg-card border rounded-lg shadow-lg">
                                <div className="flex items-center gap-2 p-3">
                                    <input
                                        type="date"
                                        className="border rounded px-2 py-1 text-sm"
                                        value={format(dateRange.startDate!, 'yyyy-MM-dd')}
                                        max={format(new Date(), 'yyyy-MM-dd')}
                                        onChange={e => {
                                            const newStart = new Date(e.target.value);
                                            let endDate = dateRange.endDate!;
                                            if (newStart > endDate) {
                                                endDate = newStart;
                                            }
                                            setDateRange({ startDate: newStart, endDate, key: 'selection' });
                                            setActiveDateFilter('Custom');
                                        }}
                                    />
                                    <span className="text-sm">to</span>
                                    <input
                                        type="date"
                                        className="border rounded px-2 py-1 text-sm"
                                        value={format(dateRange.endDate!, 'yyyy-MM-dd')}
                                        max={format(new Date(), 'yyyy-MM-dd')}
                                        onChange={e => {
                                            const newEnd = new Date(e.target.value);
                                            let startDate = dateRange.startDate!;
                                            if (newEnd < startDate) {
                                                startDate = newEnd;
                                            }
                                            setDateRange({ startDate, endDate: newEnd, key: 'selection' });
                                            setActiveDateFilter('Custom');
                                        }}
                                    />
                                </div>
                                <DateRangePicker
                                    onChange={handleCustomDateChange}
                                    months={isSmallScreen ? 1 : 2}
                                    ranges={dateRangeArray}
                                    direction="horizontal"
                                    maxDate={new Date()}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Report Type & Employee Selectors Group */}
                <div className="flex flex-wrap items-center gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Report Type</label>
                        <select
                            className="border rounded-md px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none"
                            value={reportType}
                            onChange={(e) => setReportType(e.target.value as any)}
                        >
                            <option value="basic">Basic Report</option>
                            <option value="log">Attendance Log</option>
                            <option value="monthly">Monthly Report</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Employee</label>
                        <select
                            className="border rounded-md px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none max-w-[200px]"
                            value={selectedUser}
                            onChange={(e) => setSelectedUser(e.target.value)}
                        >
                            <option value="all">All Employees</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                        <select
                            className="border rounded-md px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none max-w-[200px]"
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                        >
                            <option value="all">All Status</option>
                            <option value="Present">Present</option>
                            <option value="Half Day">Half Day</option>
                            <option value="Absent">Absent</option>
                            <option value="On Leave (Full)">On Leave (Full)</option>
                            <option value="On Leave (Half)">On Leave (Half)</option>
                            <option value="Holiday">Holiday</option>
                            <option value="Weekend">Weekend</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Record Type</label>
                        <select
                            className="border rounded-md px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none max-w-[200px]"
                            value={selectedRecordType}
                            onChange={(e) => setSelectedRecordType(e.target.value)}
                        >
                            <option value="all">All Records</option>
                            <option value="complete">Complete (Check-in & Check-out)</option>
                            <option value="missing_checkout">Missing Check-out</option>
                            <option value="missing_checkin">Missing Check-in</option>
                            <option value="incomplete">Incomplete (Any Missing)</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Employees" value={dashboardData?.totalEmployees || 0} icon={Users} />
                <StatCard title={`Present ${statDateLabel}`} value={dashboardData?.presentToday || 0} icon={UserCheck} />
                <StatCard title={`Absent ${statDateLabel}`} value={dashboardData?.absentToday || 0} icon={UserX} />
                <StatCard title={`On Leave ${statDateLabel}`} value={dashboardData?.onLeaveToday || 0} icon={Clock} />
            </div>

            <div className="hidden md:grid grid-cols-1 md:grid-cols-2 gap-6">
                <ChartContainer title="Attendance Trend" icon={BarChart3}>
                    {dashboardData ? <AttendanceTrendChart data={dashboardData.attendanceTrend} /> : <Loader2 className="h-6 w-6 animate-spin text-muted mx-auto mt-20" />}
                </ChartContainer>
                <ChartContainer title="Productivity Trend (Avg. Hours)" icon={TrendingUp}>
                    {dashboardData ? <ProductivityChart data={dashboardData.productivityTrend} /> : <Loader2 className="h-6 w-6 animate-spin text-muted mx-auto mt-20" />}
                </ChartContainer>
            </div>

            {/* Off-screen PDF Container for generation */}
            <div style={{ position: 'fixed', top: '0', left: '0', width: '1123px', zIndex: -1000, opacity: 0, pointerEvents: 'none' }}>
                <div ref={pdfRef} className="w-full bg-white">
                    {pdfContent}
                </div>
            </div>

            {/* Visible Preview (Optional - for user to see what they are downloading) */}
            <div className="hidden md:block bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-auto max-h-[600px]">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold">Report Preview</h2>
                    {canDownloadReport && (
                        <Button
                            type="button"
                            onClick={handleDownloadCsv}
                            disabled={isDownloading}
                            style={{ backgroundColor: '#006B3F', color: '#FFFFFF', borderColor: '#005632' }}
                            className="border hover:opacity-90 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                        >
                            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                            {isDownloading ? 'Generating...' : 'Download CSV'}
                        </Button>
                    )}
                </div>
                <div className="border p-4 rounded bg-gray-50 flex justify-center min-h-[400px] relative">
                    {isLoading && (
                        <div className="absolute inset-0 z-10 bg-white/50 backdrop-blur-sm flex flex-col items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-accent mb-2" />
                            <p className="text-sm font-medium text-gray-600">Updating report data...</p>
                        </div>
                    )}
                    <div className="w-full max-w-full overflow-x-auto">
                        <div className="min-w-[1123px] transform scale-[0.6] sm:scale-[0.7] md:scale-[0.8] lg:scale-100 origin-top">
                           {pdfContent}
                        </div>
                    </div>
                </div>
            </div>

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onDismiss={() => setToast(null)}
                />
            )}
        </div>
    );
};

export default AttendanceDashboard;
