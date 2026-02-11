import React, { useState, useEffect, useCallback, useRef, useMemo, useId } from 'react';
import { isAdmin } from '../../utils/auth';

// This component has been extended to support manual date entry for the attendance dashboard, enforce whole
// number increments on the chart axes, and unify the report generation/download flow into a single action.
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
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
    CompOffLog,
    UserHoliday
} from '../../types';
import ManualAttendanceModal from '../../components/attendance/ManualAttendanceModal';
import AttendanceAuditReport from '../../components/attendance/AttendanceAuditReport';
import MonthlyHoursReport from '../../components/attendance/MonthlyHoursReport';
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
    isSameDay,
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
import { useLogoStore } from '../../store/logoStore';
import {
    exportAttendanceToExcel,
    exportGenericReportToExcel,
    MonthlyReportRow,
    GenericReportColumn
} from '../../utils/excelExport';
import { FIXED_HOLIDAYS } from '../../utils/constants';
import LoadingScreen from '../../components/ui/LoadingScreen';
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
const AttendanceLogPdfComponent: React.FC<{ data: AttendanceLogDataRow[]; dateRange: Range; generatedBy?: string }> = ({ data, dateRange, generatedBy }) => {
    return (
        <div className="p-8 font-sans text-sm text-black bg-white">
            <div className="flex justify-between items-center border-b pb-4 mb-6">
                <Logo className="h-10" localPath={pdfLogoLocalPath} />
                <div className="text-right">
                    <h1 className="text-xl font-bold">Attendance Log</h1>
                    <p className="text-gray-600">{format(dateRange.startDate!, 'dd MMM yyyy')} to {format(dateRange.endDate!, 'dd MMM yyyy')}</p>
                    <p className="text-xs text-gray-500 mt-1">Generated: {format(new Date(), 'dd MMM yyyy HH:mm')}</p>
                    {generatedBy && <p className="text-xs text-gray-500">Generated by: {generatedBy}</p>}
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
const BasicReportPdfLayout: React.FC<{ data: BasicReportDataRow[]; dateRange: Range; generatedBy?: string; isPreview?: boolean }> = ({ data, dateRange, generatedBy, isPreview = false }) => {
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
                            width: isPreview ? '100%' : '1123px', // A4 Landscape width in px (96dpi)
                            height: isPreview ? 'auto' : '794px', // A4 Landscape height in px (96dpi)
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
                                        {generatedBy && (
                                            <div style={{ fontSize: '10px', color: '#666' }}>
                                                Generated by: {generatedBy}
                                            </div>
                                        )}
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
                                            Punch In
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
                                            Punch Out
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



const MonthlyReportPdfComponent: React.FC<{ data: MonthlyReportRow[]; dateRange: Range; generatedBy?: string }> = ({ data, dateRange, generatedBy }) => {
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
                    <p className="text-[10px] text-gray-500 mt-1">Generated: {format(new Date(), 'dd MMM yyyy HH:mm')}</p>
                    {generatedBy && <p className="text-[10px] text-gray-500">Generated by: {generatedBy}</p>}
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
                        <td className="border p-1 border-gray-400">W/H</td>
                        <td className="border p-1 border-gray-400">A</td>
                        <td className="border p-1 border-gray-400">WO</td>
                        <td className="border p-1 border-gray-400">H</td>
                        <td className="border p-1 border-gray-400">WOP</td>
                        <td className="border p-1 border-gray-400">HP</td>
                        <td className="border p-1 border-gray-400 bg-green-50 text-green-800">S/L</td>
                        <td className="border p-1 border-gray-400 bg-blue-50 text-blue-800">E/L</td>
                        <td className="border p-1 border-gray-400 bg-yellow-50 text-yellow-800">F/H</td>
                        <td className="border p-1 border-gray-400 bg-purple-50 text-purple-800">C/O</td>
                        <td className="border p-1 border-gray-400 font-bold">Total</td>
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
                            <td className="border p-1 border-gray-400 font-medium text-blue-700">{row.workFromHomeDays}</td>
                            <td className="border p-1 border-gray-400">{row.absentDays}</td>
                            <td className="border p-1 border-gray-400">{row.weekOffs}</td>
                            <td className="border p-1 border-gray-400">{row.holidays}</td>
                            <td className="border p-1 border-gray-400">{row.weekendPresents}</td>
                            <td className="border p-1 border-gray-400">{row.holidayPresents}</td>
                            <td className="border p-1 border-gray-400 bg-green-50">{row.sickLeaves}</td>
                            <td className="border p-1 border-gray-400 bg-blue-50">{row.earnedLeaves}</td>
                            <td className="border p-1 border-gray-400 bg-yellow-50">{row.floatingHolidays}</td>
                            <td className="border p-1 border-gray-400 bg-purple-50">{row.compOffs}</td>
                            <td className="border p-1 border-gray-400 font-bold">{row.totalPayableDays}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="bg-gray-100 font-bold">
                        <td className="border p-1 border-gray-400 text-left" colSpan={days.length + 1}>Total</td>
                        <td className="border p-1 border-gray-400">{data.reduce((acc, row) => acc + row.presentDays, 0)}</td>
                        <td className="border p-1 border-gray-400">{data.reduce((acc, row) => acc + row.halfDays, 0)}</td>
                        <td className="border p-1 border-gray-400 text-blue-700">{data.reduce((acc, row) => acc + row.workFromHomeDays, 0)}</td>
                        <td className="border p-1 border-gray-400">{data.reduce((acc, row) => acc + row.absentDays, 0)}</td>
                        <td className="border p-1 border-gray-400">{data.reduce((acc, row) => acc + row.weekOffs, 0)}</td>
                        <td className="border p-1 border-gray-400">{data.reduce((acc, row) => acc + row.holidays, 0)}</td>
                        <td className="border p-1 border-gray-400">{data.reduce((acc, row) => acc + row.weekendPresents, 0)}</td>
                        <td className="border p-1 border-gray-400">{data.reduce((acc, row) => acc + row.holidayPresents, 0)}</td>
                        <td className="border p-1 border-gray-400 text-green-800">{data.reduce((acc, row) => acc + row.sickLeaves, 0)}</td>
                        <td className="border p-1 border-gray-400 text-blue-800">{data.reduce((acc, row) => acc + row.earnedLeaves, 0)}</td>
                        <td className="border p-1 border-gray-400 text-yellow-800">{data.reduce((acc, row) => acc + row.floatingHolidays, 0)}</td>
                        <td className="border p-1 border-gray-400 text-purple-800">{data.reduce((acc, row) => acc + row.compOffs, 0)}</td>
                        <td className="border p-1 border-gray-400 font-bold">{data.reduce((acc, row) => acc + row.totalPayableDays, 0)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};

const AttendanceDashboard: React.FC = () => {
    const isSmallScreen = useMediaQuery('(max-width: 639px)');
    const { user } = useAuthStore();
    const currentUserRole = user?.role;
    const { permissions } = usePermissionsStore();
    const { recurringHolidays, officeHolidays, fieldHolidays } = useSettingsStore();

    const [users, setUsers] = useState<User[]>([]);
    const usersRef = useRef<User[]>([]);
    useEffect(() => { usersRef.current = users; }, [users]);

    const [attendanceEvents, setAttendanceEvents] = useState<AttendanceEvent[]>([]);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [userHolidaysPool, setUserHolidaysPool] = useState<UserHoliday[]>([]);
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
    const [selectedRole, setSelectedRole] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    
    // Manual Entry State
    const [isManualEntryModalOpen, setIsManualEntryModalOpen] = useState(false);
    const [previewMode, setPreviewMode] = useState<'summary' | 'full'>('summary');
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [selectedRecordType, setSelectedRecordType] = useState<string>('all');
    const [reportType, setReportType] = useState<'basic' | 'log' | 'monthly' | 'audit' | 'workHours'>('basic');
    const [isDownloading, setIsDownloading] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const pdfRef = useRef<HTMLDivElement>(null);

    // --- Fetch Audit Logs ---
    const fetchAuditLogs = useCallback(async () => {
        try {
            const { data: logsData, error: logsError } = await supabase
                .from('attendance_audit_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (logsError) throw logsError;

            // Fetch users for mapping names
            const userIds = new Set<string>();
            logsData?.forEach((log: any) => {
                if (log.performed_by) userIds.add(log.performed_by);
                if (log.target_user_id) userIds.add(log.target_user_id);
            });

            if (userIds.size > 0) {
                 const { data: usersData } = await supabase
                    .from('users')
                    .select('id, name')
                    .in('id', Array.from(userIds));
                
                const userMap = new Map<string, string>();
                usersData?.forEach((u: any) => userMap.set(u.id, u.name));

                const formattedLogs = logsData.map((log: any) => ({
                    ...log,
                    performer_name: userMap.get(log.performed_by) || 'Unknown',
                    target_name: userMap.get(log.target_user_id) || 'Unknown'
                }));
                setAuditLogs(formattedLogs);
            } else {
                setAuditLogs(logsData || []);
            }
        } catch (error) {
            console.error("Error fetching audit logs", error);
        }
    }, []);

    useEffect(() => {
        if (reportType === 'audit') {
            fetchAuditLogs();
        }
    }, [reportType, fetchAuditLogs]);

    const canDownloadReport = user && (isAdmin(user.role) || permissions[user.role]?.includes('download_attendance_report'));
    const canViewAllAttendance = user && (isAdmin(user.role) || permissions[user.role]?.includes('view_all_attendance'));
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

                const [events, compOffs, userHolidays, userLeaves] = await Promise.all([
                    api.getAttendanceEvents(user.id, startStr, endStr),
                    api.getCompOffLogs(user.id),
                    api.getUserHolidays(user.id),
                    api.getLeaveRequests({ userId: user.id, startDate: startStr, endDate: endStr, status: 'approved' })
                ]);
                
                const leavesData = Array.isArray(userLeaves) ? userLeaves : (userLeaves as any).data || [];
                
                // POPULATE GLOBAL STATE FOR REPORT COMPONENT
                setUserHolidaysPool(userHolidays || []);

                // Calculate Stats
                // Generate logs for extended period to ensure continuity for weekend rules
                const extendedDays = eachDayOfInterval({ start: bufferStartDate, end: dateRange.endDate });

                // 1. Generate Initial Logs (Extended)
                let logs = extendedDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayEvents = events.filter(e => format(new Date(e.timestamp), 'yyyy-MM-dd') === dateStr);
                    
                    // Helper for robust holiday/leave date matching
                    const matchesDate = (targetDate: any, compareDay: Date) => {
                        if (!targetDate) return false;
                        try {
                            const compareStr = format(compareDay, 'yyyy-MM-dd');
                            const compareMMDD = format(compareDay, '-MM-dd'); // Matches pool format
                            
                            if (typeof targetDate === 'string') {
                                // 1. Try exact full date match (YYYY-MM-DD)
                                if (targetDate.includes(compareStr)) return true;

                                // 2. Try partial MM-DD match (Year agnostic for selected holidays)
                                // This handles cases where pool holidays are saved as "-01-15" or even "2026-01-15" vs "2025-01-15"
                                if (targetDate.includes(compareMMDD)) return true;
                                if (targetDate.endsWith(compareMMDD)) return true;

                                // 3. Handle specific pool format starting with '-'
                                if (targetDate.startsWith('-')) {
                                    return compareStr.endsWith(targetDate);
                                }
                                
                                // 4. Fallback: Clean string splitting
                                const cleanDate = targetDate.split(' ')[0].split('T')[0];
                                return cleanDate === compareStr;
                            }
                            
                            // 5. If it's a Date object
                            if (targetDate instanceof Date) {
                                return format(targetDate, 'yyyy-MM-dd') === compareStr;
                            }
                            
                            return false;
                        } catch (e) {
                            return false;
                        }
                    };

                    let status = 'A'; // Absent
                    let checkIn = '-';
                    let checkOut = '-';
                    let dailyOT = 0;

                    // Check Holidays/Weekends
                    const dayName = format(day, 'EEEE');
                    const isWeekend = dayName === 'Sunday';
                    const officeRoles = ['admin', 'super_admin', 'hr', 'finance'];
                    const isOfficeRole = officeRoles.includes(user.role?.toLowerCase() || '');

                    // 1. Recurring
                    const isRecurringHoliday = recurringHolidays.some(rule => {
                        if (rule.day.toLowerCase() !== dayName.toLowerCase()) return false;
                        const occurrence = Math.ceil(day.getDate() / 7);
                        const userRoleType = isOfficeRole ? 'office' : 'field'; 
                        return rule.n === occurrence && (rule.type || 'office') === userRoleType;
                    });

                    // 2. Fixed
                    const isFixedHoliday = FIXED_HOLIDAYS.some(fh => {
                        const [m, d] = fh.date.split('-').map(Number);
                        return day.getMonth() === (m - 1) && day.getDate() === d;
                    });

                    // 3. Pool (Selected)
                    const isPoolHoliday = userHolidays.some(uh => {
                        const hDate = uh.holidayDate || (uh as any).holiday_date;
                        return matchesDate(hDate, day);
                    });

                    const isHoliday = isRecurringHoliday || isFixedHoliday || isPoolHoliday;

                    // 4. Approved Leave
                    const approvedLeave = leavesData.find((l: any) => 
                        isWithinInterval(day, {
                            start: startOfDay(new Date(l.startDate)),
                            end: endOfDay(new Date(l.endDate))
                        })
                    );

                    const hasActivity = dayEvents.length > 0;

                    if (isHoliday) {
                        status = hasActivity ? 'HP' : 'H';
                    } else if (approvedLeave) {
                        const leaveType = approvedLeave.leaveType?.toLowerCase();
                        if (leaveType === 'sick') status = 'S/L';
                        else if (leaveType === 'comp off' || leaveType === 'compoff' || leaveType === 'c/o') status = 'C/O';
                        else if (leaveType === 'loss of pay' || leaveType === 'lop') status = 'A';
                        else status = 'E/L';
                    } else if (hasActivity) {
                        if (isWeekend) status = 'W/P';
                        else status = 'P';
                    } else if (isWeekend) {
                        status = 'W/O';
                    }

                    if (hasActivity) {
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
                    if (log.status === 'W/O' && log.day === 'Sunday') {
                        let absentCount = 0;
                        // Look back up to 6 days
                        const lookBackLimit = Math.max(0, index - 6);
                        for (let i = index - 1; i >= lookBackLimit; i--) {
                            if (logs[i].status === 'A') {
                                absentCount++;
                            }
                        }
                        if (absentCount >= 4) {
                            log.status = 'A';
                        }
                    }
                });

                // 3. Filter logs for the actual requested range
                const displayLogs = logs.filter(l => l.rawDate >= dateRange.startDate!);

                // 4. Calculate Final Stats based on displayLogs
                const present = displayLogs.filter(l => l.status === 'P' || l.status === 'W/H' || l.status === 'W/P' || l.status === 'H/P' || l.status === '0.5P').length;
                const absent = displayLogs.filter(l => l.status === 'A' && l.rawDate <= new Date()).length;
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
                // Minimum 10 second loading time
                await new Promise(resolve => setTimeout(resolve, 10000));
                setIsLoading(false);
            }
        };

        fetchEmployeeData();
    }, [isEmployeeView, user, dateRange, recurringHolidays]);

    const fetchDashboardData = useCallback(async (startDate: Date, endDate: Date) => {
        if (isEmployeeView) return;
        setIsLoading(true);
        try {
            // Ensure we have users data
            let currentUsers = usersRef.current;
            if (currentUsers.length === 0) {
                currentUsers = await api.getUsers();
                setUsers(currentUsers);
                // Update ref immediately for this execution context
                usersRef.current = currentUsers;
            }

            // Filter out management users from attendance tracking and reports
            const activeStaff = currentUsers.filter(u => u.role !== 'management');

            // Determine query range
            const today = new Date();
            const queryStart = startDate < today ? startDate : startOfToday();
            const queryEnd = endDate > today ? endDate : endOfToday();

            const [events, leavesResponse, holidaysResponse] = await Promise.all([
                api.getAllAttendanceEvents(queryStart.toISOString(), queryEnd.toISOString()),
                api.getLeaveRequests({ startDate: queryStart.toISOString(), endDate: queryEnd.toISOString(), status: 'approved' }),
                api.getAllUserHolidays()
            ]);

            setAttendanceEvents(events);
            // Extract the data array from the paginated response
            const leavesData = Array.isArray(leavesResponse) ? leavesResponse : leavesResponse.data;
            setLeaves(leavesData);
            setUserHolidaysPool(holidaysResponse || []);

            // --- Calculate "Today" Stats ---
            const todayStr = format(today, 'yyyy-MM-dd');
            const todayEvents = events.filter(e => format(new Date(e.timestamp), 'yyyy-MM-dd') === todayStr);
            const presentToday = new Set(todayEvents.map(e => e.userId)).size;

            const todayLeaves = leavesData.filter(l => {
                const start = new Date(l.startDate);
                const end = new Date(l.endDate);
                return today >= start && today <= end;
            });
            const onLeaveToday = new Set(todayLeaves.map(l => l.userId)).size;

            // Use activeStaff count (excluding management) for totalEmployees
            const totalEmployees = activeStaff.length;
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
                const activeLeaves = leavesData.filter(l => {
                    const start = new Date(l.startDate);
                    const end = new Date(l.endDate);
                    return day >= start && day <= end;
                });
                const usersOnLeave = new Set(activeLeaves.map(l => l.userId)).size;

                // Absent
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
                    const checkOut = [...ue].reverse().find(e => e.type === 'check-out');

                    if (checkIn && checkOut) {
                        const diff = differenceInMinutes(new Date(checkOut.timestamp), new Date(checkIn.timestamp));
                        totalHours += diff / 60;
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
            // Minimum 10 second loading time
            await new Promise(resolve => setTimeout(resolve, 10000));
            setIsLoading(false);
        }
    }, [isEmployeeView]);

    const reportTypeId = useId();
    const employeeId = useId();
    const roleId = useId();
    const statusId = useId();
    const recordTypeId = useId();
    const startDateId = useId();
    const endDateId = useId();

    useEffect(() => {
        if (dateRange.startDate && dateRange.endDate) {
            fetchDashboardData(dateRange.startDate, dateRange.endDate);
        }
    }, [dateRange, fetchDashboardData]);

    const availableRoles = useMemo(() => {
        const roles = new Set(users.map(u => u.role).filter(Boolean));
        return Array.from(roles).sort();
    }, [users]);



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

        // Filter users based on selection, and exclude management users
        let filteredUsers = users.filter(u => u.role !== 'management');

        if (selectedUser !== 'all') {
            filteredUsers = filteredUsers.filter(u => u.id === selectedUser);
        }
        if (selectedRole !== 'all') {
            filteredUsers = filteredUsers.filter(u => u.role === selectedRole);
        }

        const targetUsers = filteredUsers;

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
                let status = 'A';
                let checkIn = '';
                let checkOut = '';
                let duration = '';

                // Check for holidays/weekends first
                const dayName = format(day, 'EEEE');
                const isWeekend = dayName === 'Sunday';

                const officeRoles = ['admin', 'super_admin', 'hr', 'finance'];
                const userCategory = officeRoles.includes(user.role?.toLowerCase() || '') ? 'office' : 'field';

                // Check for recurring holidays
                const isRecurringHoliday = recurringHolidays.some(rule => {
                    if (rule.day.toLowerCase() !== dayName.toLowerCase()) return false;
                    const dayDate = day.getDate();
                    const occurrence = Math.ceil(dayDate / 7);
                    const ruleType = rule.type || 'office';
                    return rule.n === occurrence && ruleType === userCategory;
                });

                // Check for fixed holidays
                const isFixedHoliday = FIXED_HOLIDAYS.some(fh => {
                    const [m, d] = fh.date.split('-').map(Number);
                    return day.getMonth() === (m - 1) && day.getDate() === d;
                });

                // Check for pool holidays (selected by user)
                const isPoolHoliday = userHolidaysPool.some(uh => {
                    const uhUserId = uh.userId || (uh as any).user_id;
                    const hDate = uh.holidayDate || (uh as any).holiday_date;
                    if (!uhUserId || !hDate) return false;
                    
                    // ROBUST ID MATCHING: Handle any casing or whitespace
                    const matchId1 = String(uhUserId).trim().toLowerCase();
                    const matchId2 = String(user.id).trim().toLowerCase();
                    
                    if (matchId1 !== matchId2) return false;

                    // ROBUST DATE MATCHING
                    const compareStr = format(day, 'yyyy-MM-dd');
                    const compareMMDD = format(day, '-MM-dd');
                    
                    const hDateStr = String(hDate);
                    return hDateStr.includes(compareStr) || 
                           hDateStr.endsWith(compareMMDD) || 
                           (hDateStr.startsWith('-') && compareStr.endsWith(hDateStr));
                });

                // Check for configured holidays (group based)
                const isConfiguredHoliday = (userCategory === 'field' ? fieldHolidays : officeHolidays).some(h => {
                    const hDateStr = String(h.date);
                    const compareStr = format(day, 'yyyy-MM-dd');
                    const compareMMDD = format(day, '-MM-dd');
                    return hDateStr.includes(compareStr) || 
                           hDateStr.endsWith(compareMMDD) || 
                           (hDateStr.startsWith('-') && compareStr.endsWith(hDateStr));
                });

                const isHoliday = isFixedHoliday || isPoolHoliday || isConfiguredHoliday;

                if (isHoliday) {
                    status = 'H';
                } else if (isRecurringHoliday) {
                    status = 'F/H';
                } else if (isWeekend) {
                    status = 'W/O';
                }

                if (dayEvents.length > 0) {
                    // Sort events by time
                    const sortedEvents = [...dayEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                    const checkInEvent = sortedEvents.find(e => e.type === 'check-in');
                    // Use the last check-out of the day
                    const checkOutEvent = [...sortedEvents].reverse().find(e => e.type === 'check-out');

                    if (isRecurringHoliday) {
                        status = 'H/P';
                    } else if (isWeekend) {
                        status = 'W/P';
                    } else {
                        status = 'P';
                    }
                    
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
                    status = 'E/L'; // Default to E/L for basic report, can be specific if needed
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
    }, [users, attendanceEvents, dateRange, selectedUser, selectedRole, selectedStatus, selectedRecordType, recurringHolidays, leaves, userHolidaysPool, officeHolidays, fieldHolidays]);

    // 2. Attendance Log Data (Raw Events)
    const attendanceLogData: AttendanceLogDataRow[] = useMemo(() => {
        if (!dateRange.startDate || !dateRange.endDate) return [];

        // Exclude management users from logs
        // Exclude management users from logs
        let filteredUsers = users.filter(u => u.role !== 'management');

        if (selectedUser !== 'all') {
            filteredUsers = filteredUsers.filter(u => u.id === selectedUser);
        }
        if (selectedRole !== 'all') {
            filteredUsers = filteredUsers.filter(u => u.role === selectedRole);
        }

        const targetUsers = filteredUsers;
        const targetUserIds = new Set(targetUsers.map(u => u.id));

        return attendanceEvents
            .filter(e => targetUserIds.has(e.userId))
            .map(e => {
                const user = users.find(u => u.id === e.userId);
                // Priority: 1) event.locationName (stored in DB), 2) fallback to lat/lon if present
                const location = e.locationName || 
                                (e.latitude && e.longitude ? `${e.latitude.toFixed(4)}, ${e.longitude.toFixed(4)}` : 'N/A');

                return {
                    userName: user?.name || 'Unknown',
                    date: format(new Date(e.timestamp), 'yyyy-MM-dd'),
                    time: format(new Date(e.timestamp), 'HH:mm:ss'),
                    type: e.type,
                    locationName: location,
                    latitude: e.latitude,
                    longitude: e.longitude
                };
            })
            .sort((a, b) => {
                // Sort by date then time
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.time.localeCompare(b.time);
            });

    }, [users, attendanceEvents, dateRange, selectedUser, selectedRole, leaves, recurringHolidays, userHolidaysPool, officeHolidays, fieldHolidays]);

    // 3. Monthly Report Data (Aggregated)
    const monthlyReportData: MonthlyReportRow[] = useMemo(() => {
        if (!dateRange.startDate || !dateRange.endDate) return [];

        const days = eachDayOfInterval({ start: dateRange.startDate, end: dateRange.endDate });
        
        // Exclude management users from monthly reports
        let filteredUsers = users.filter(u => u.role !== 'management');

        if (selectedUser !== 'all') {
            filteredUsers = filteredUsers.filter(u => u.id === selectedUser);
        }
        if (selectedRole !== 'all') {
            filteredUsers = filteredUsers.filter(u => u.role === selectedRole);
        }

        const targetUsers = filteredUsers;

        return targetUsers.map(user => {
            const statuses: string[] = [];
            let presentDays = 0;
            let absentDays = 0;
            let halfDays = 0;
            let weekOffs = 0;
            let holidays = 0;
            let weekendPresents = 0;
            let holidayPresents = 0;

            let daysPresentInWeek = 0; // Track for WO rule
            // New counters
            let sickLeaves = 0;
            let earnedLeaves = 0;
            let floatingHolidays = 0;
            let compOffs = 0;
            let lossOfPays = 0;
            let workFromHomeDays = 0;

            days.forEach(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                
                // Helper for robust holiday/leave date matching
                const matchesDate = (targetDate: any, compareDay: Date) => {
                    if (!targetDate) return false;
                    try {
                        const compareStr = format(compareDay, 'yyyy-MM-dd');
                        const compareMMDD = format(compareDay, '-MM-dd');
                        
                        // Handle multiple formats: String, Date, objects
                        const dateVal = String(targetDate).split(' ')[0].split('T')[0];

                        // 1. Exact match
                        if (dateVal === compareStr) return true;
                        
                        // 2. Partial match for year-agnostic pool holidays
                        if (dateVal.includes(compareMMDD)) return true;
                        if (dateVal.endsWith(compareMMDD)) return true;

                        // 3. Pool format starting with '-'
                        if (dateVal.startsWith('-')) {
                            return compareStr.endsWith(dateVal);
                        }

                        // 4. Fallback for any weird separator
                        const normalizedCompare = compareStr.replace(/-/g, '');
                        const normalizedTarget = dateVal.replace(/[-\/]/g, '');
                        if (normalizedTarget.includes(normalizedCompare)) return true;

                        return false;
                    } catch (e) {
                        return false;
                    }
                };

                const dayEvents = attendanceEvents.filter(e =>
                    String(e.userId) === String(user.id) && format(new Date(e.timestamp), 'yyyy-MM-dd') === dateStr
                );

                const hasActivity = dayEvents.length > 0;

                // Determine day type (Weekend, Holiday, Regular)
                const dayName = format(day, 'EEEE');
                const isWeekend = dayName === 'Sunday';

                const officeRoles = ['admin', 'super_admin', 'hr', 'finance'];
                const userCategory = officeRoles.includes(user.role?.toLowerCase() || '') ? 'office' : 'field';

                // 1. Check Recurring holiday (Floating Holiday)
                const isRecurringHoliday = recurringHolidays.some(rule => {
                    if (rule.day.toLowerCase() !== dayName.toLowerCase()) return false;
                    const dayDate = day.getDate();
                    const occurrence = Math.ceil(dayDate / 7);
                    const ruleType = rule.type || 'office';
                    return rule.n === occurrence && ruleType === userCategory;
                });

                // 2. Check FIXED holidays
                const isFixedHoliday = FIXED_HOLIDAYS.some(fh => {
                    const [m, d] = fh.date.split('-').map(Number);
                    return day.getMonth() === (m - 1) && day.getDate() === d;
                });

                // 3. Check POOL holidays (User selected)
                const isPoolHoliday = userHolidaysPool.some(uh => {
                    const uhUserId = uh.userId || (uh as any).user_id;
                    const holidayDate = uh.holidayDate || (uh as any).holiday_date;
                    if (!uhUserId || !holidayDate) return false;
                    
                    // ROBUST ID MATCHING: Use toLowerCase() and trim for UUID comparison
                    const matchId1 = String(uhUserId).trim().toLowerCase();
                    const matchId2 = String(user.id).trim().toLowerCase();
                    
                    return matchId1 === matchId2 && matchesDate(holidayDate, day);
                });

                // 4. Check Configured holidays (Admin settings)
                const isConfiguredHoliday = (userCategory === 'field' ? fieldHolidays : officeHolidays).some(h => 
                    matchesDate(h.date, day)
                );

                const isCompanyHoliday = isFixedHoliday || isPoolHoliday || isConfiguredHoliday;

                // Find approved leaves for this user on this day and get the leave type
                const approvedLeave = leaves.find(l => 
                    String(l.userId) === String(user.id) && 
                    l.status === 'approved' &&
                    isWithinInterval(day, { 
                        start: startOfDay(new Date(l.startDate)), 
                        end: endOfDay(new Date(l.endDate)) 
                    })
                );

                let status = '';

                // NEW PERMANENT PRIORITY: Holiday > Approved Leave > Work Activity > Weekend > Absent
                if (isCompanyHoliday) {
                    if (hasActivity) {
                        status = 'HP';
                        holidayPresents++;
                    } else {
                        status = 'H';
                        holidays++;
                    }
                } else if (isRecurringHoliday) {
                    if (hasActivity) {
                        status = 'HP';
                        holidayPresents++;
                    } else {
                        status = 'F/H';
                        floatingHolidays++;
                    }
                } else if (approvedLeave) {
                    const leaveType = approvedLeave.leaveType?.toLowerCase();
                    if (leaveType === 'sick') {
                        status = 'S/L';
                        sickLeaves++;
                    } else if (leaveType === 'comp off' || leaveType === 'comp-off' || leaveType === 'compoff' || leaveType === 'c/o') {
                        status = 'C/O';
                        compOffs++;
                    } else if (leaveType === 'floating' || leaveType === 'floating holiday') {
                        status = 'F/H';
                        floatingHolidays++;
                    } else if (leaveType === 'loss of pay' || leaveType === 'loss-of-pay' || leaveType === 'lop') {
                        status = 'A';
                        absentDays++;
                        lossOfPays++;
                    } else {
                        status = 'E/L';
                        earnedLeaves++;
                    }
                } else if (hasActivity) {
                    // Calculate worked hours
                    const sortedEvents = dayEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                    const checkInEvent = sortedEvents.find(e => e.type === 'check-in');
                    const checkOutEvent = [...sortedEvents].reverse().find(e => e.type === 'check-out');
                    
                    let workedMinutes = 0;
                    if (checkInEvent && checkOutEvent) {
                        const start = new Date(checkInEvent.timestamp);
                        const end = new Date(checkOutEvent.timestamp);
                        workedMinutes = differenceInMinutes(end, start);
                    }
                    
                    const workedHours = workedMinutes / 60;
                    const minHoursFullDay = 6;
                    const minHoursHalfDay = 3;
                    
                    const isFullDay = workedHours >= minHoursFullDay;
                    const isHalfDay = !isFullDay && workedHours >= minHoursHalfDay;
                    const isWorkFromHome = checkInEvent?.locationName?.toLowerCase().includes('work from home') ||
                                          checkOutEvent?.locationName?.toLowerCase().includes('work from home');
                    
                    if (isWeekend) {
                        status = 'WOP';
                        weekendPresents++;
                    } else if (isWorkFromHome) {
                        status = 'W/H';
                        workFromHomeDays++; 
                    } else {
                        if (isFullDay) {
                            status = 'P';
                            presentDays++;
                        } else if (isHalfDay) {
                            status = '0.5P';
                            halfDays++;
                        } else {
                            status = 'P'; // Treat minimal activity as P for safety if threshold not met? Or A?
                            presentDays++;
                        }
                    }

                    if (workedHours >= minHoursHalfDay) {
                        daysPresentInWeek++;
                    }
                } else if (isWeekend) {
                    const isFirstSunday = day.getDate() <= 7;
                    if (isFirstSunday || daysPresentInWeek >= 4) {
                        status = 'W/O';
                        weekOffs++;
                    } else {
                        status = 'A';
                        absentDays++;
                    }
                    daysPresentInWeek = 0;
                } else {
                    status = 'A';
                    absentDays++;
                }
                
                statuses.push(status);
            });

            const totalPayableDays = presentDays + weekOffs + holidays + weekendPresents + holidayPresents + (halfDays * 0.5) 
                                     + sickLeaves + earnedLeaves + floatingHolidays + compOffs + workFromHomeDays;

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
                totalPayableDays,
                sickLeaves,
                earnedLeaves,
                floatingHolidays,
                compOffs,
                lossOfPays,
                workFromHomeDays
            };
        }).filter(row => {
            if (selectedStatus === 'all') return true;
            return row.statuses.includes(selectedStatus);
        });

    }, [users, attendanceEvents, dateRange, selectedUser, selectedRole, recurringHolidays, leaves, userHolidaysPool, officeHolidays, fieldHolidays]);


    // Determine which PDF component to render
    const renderReportContent = useCallback((isPreview: boolean = false) => {
        const generatedBy = user?.name || 'Unknown User';
        if (reportType === 'basic') {
            return <BasicReportPdfLayout data={basicReportData} dateRange={dateRange} generatedBy={generatedBy} isPreview={isPreview} />;
        } else if (reportType === 'log') {
            return <AttendanceLogPdfComponent data={attendanceLogData} dateRange={dateRange} generatedBy={generatedBy} />;
        } else if (reportType === 'monthly') {
                return <MonthlyReportPdfComponent data={monthlyReportData} dateRange={dateRange} generatedBy={generatedBy} />;
            } else if (reportType === 'audit') {
                // Pass generatedBy if/when AttendanceAuditReport is updated to accept it
                // For now, keeping as is or we can update the component definition
                return <AttendanceAuditReport logs={auditLogs} generatedBy={generatedBy} />;
            }
            return null;
        }, [reportType, basicReportData, attendanceLogData, monthlyReportData, dateRange, auditLogs, user?.name]);

    const pdfContent = useMemo(() => renderReportContent(false), [renderReportContent]);
    const previewContent = useMemo(() => renderReportContent(true), [renderReportContent]);



    const handleDownloadCsv = async () => {
        setIsDownloading(true);
        try {
            // 1. Fetch Logo (Common to all reports now)
            const logo = useLogoStore.getState().currentLogo;
            let logoBase64 = '';

            // Attempt to get logo as base64
            if (logo && logo.startsWith('data:image')) {
                logoBase64 = logo;
            } else {
                 // If no store logo or it's a URL, fallback logic.
                 const logoUrl = (logo && (logo.startsWith('http') || logo.startsWith('/'))) ? logo : pdfLogoLocalPath;
                 
                 if (logoUrl) {
                    try {
                        const response = await fetch(logoUrl);
                        if (!response.ok) throw new Error('Fetch failed');
                        const blob = await response.blob();
                        logoBase64 = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    } catch (err) {
                        console.error("Failed to fetch logo for Excel export:", err);
                    }
                }
            }

            if (reportType === 'monthly') {
                await exportAttendanceToExcel(
                    monthlyReportData,
                    { startDate: dateRange.startDate!, endDate: dateRange.endDate! },
                    logoBase64,
                    user?.name || 'Unknown User'
                );
            } else {
                // Use generic Excel export for other report types
                let columns: GenericReportColumn[] = [];
                let dataToExport: any[] = [];
                let reportTitle = '';
                let fileNamePrefix = '';

                if (reportType === 'basic') {
                    reportTitle = 'Basic Attendance Report';
                    fileNamePrefix = 'Attendance_Report';
                    columns = [
                        { header: 'Employee Name', key: 'userName', width: 25 },
                        { header: 'Date', key: 'date', width: 15 },
                        { header: 'Status', key: 'status', width: 15 },
                        { header: 'Punch In', key: 'checkIn', width: 15 },
                        { header: 'Punch Out', key: 'checkOut', width: 15 },
                        { header: 'Hours', key: 'duration', width: 15 }
                    ];
                    dataToExport = basicReportData;
                } else if (reportType === 'log') {
                    reportTitle = 'Attendance Log';
                    fileNamePrefix = 'Attendance_Log';
                    columns = [
                        { header: 'User', key: 'userName', width: 25 },
                        { header: 'Date', key: 'date', width: 15 },
                        { header: 'Time', key: 'time', width: 15 },
                        { header: 'Event', key: 'type', width: 15 },
                         { header: 'Location', key: 'locationName', width: 30 },
                        { header: 'Latitude', key: 'latitude', width: 15 },
                        { header: 'Longitude', key: 'longitude', width: 15 }
                    ];
                    dataToExport = attendanceLogData.map(row => ({
                         ...row,
                         locationName: row.locationName || ''
                    }));
                } else if (reportType === 'audit') {
                    reportTitle = 'Audit Log Report';
                    fileNamePrefix = 'Audit_Log';
                    columns = [
                        { header: 'Date & Time', key: 'dateTime', width: 20 },
                        { header: 'Action', key: 'action', width: 20 },
                        { header: 'Performed By', key: 'performer_name', width: 25 },
                        { header: 'Target Employee', key: 'target_name', width: 25 },
                        { header: 'Details', key: 'detailsStr', width: 50 },
                    ];
                    dataToExport = auditLogs.map(log => ({
                        dateTime: format(new Date(log.created_at), 'yyyy-MM-dd HH:mm'),
                        action: log.action,
                        performer_name: log.performer_name,
                        target_name: log.target_name,
                        detailsStr: JSON.stringify(log.details)
                    }));
                }

                await exportGenericReportToExcel(
                    dataToExport,
                    columns,
                    reportTitle,
                    { startDate: dateRange.startDate!, endDate: dateRange.endDate! },
                    fileNamePrefix,
                    logoBase64,
                    user?.name || 'Unknown User'
                );
            }
            setToast({ message: 'Excel report downloaded successfully.', type: 'success' });

        } catch (error) {
            console.error("Download failed:", error);
            setToast({ message: 'Failed to generate report.', type: 'error' });
        } finally {
            setIsDownloading(false);
        }
    };

    if (isLoading && !dashboardData && !isEmployeeView) {
        return <LoadingScreen message="Fetching attendance data..." />;
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

    const ReportSummaryView = () => {
        let rows: any[] = [];
        if (reportType === 'basic') rows = basicReportData || [];
        else if (reportType === 'log') rows = attendanceLogData || [];
        else if (reportType === 'monthly') rows = monthlyReportData || [];
        else if (reportType === 'audit') rows = auditLogs || [];

        if (!rows || rows.length === 0) return <div className="text-center py-10 text-gray-400">No report data available</div>;

        return (
            <div className="space-y-4 pt-4">
                {rows.slice(0, 5).map((row, i) => (
                    <div key={i} className="bg-[#041b0f] p-4 rounded-xl border border-[#1a3d2c]">
                        <div className="flex justify-between items-start mb-3">
                             <div className="font-bold text-white">{row.userName || 'Unknown'}</div>
                             <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                 row.status === 'P' || row.type === 'check-in' ? 'bg-green-500/20 text-green-400' : 
                                 row.status === 'A' || row.type === 'check-out' ? 'bg-red-500/20 text-red-400' : 
                                 'bg-blue-500/20 text-blue-400'
                             }`}>
                                 {row.status || (row.type === 'check-in' ? 'In' : row.type === 'check-out' ? 'Out' : 'Log')}
                             </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                             <div>
                                 <span className="text-gray-500 block mb-0.5">Date:</span>
                                 <div className="text-gray-300 font-medium">
                                     {row.date ? format(new Date(String(row.date).replace(/-/g, '/')), 'dd MMM yyyy') : '-'}
                                 </div>
                             </div>
                             {reportType === 'monthly' ? (
                                 <>
                                     <div>
                                         <span className="text-gray-500 block mb-0.5">Present:</span>
                                         <div className="text-gray-300 font-medium">{row.presentDays || 0}d</div>
                                     </div>
                                     <div>
                                         <span className="text-gray-500 block mb-0.5">Absent:</span>
                                         <div className="text-gray-300 font-medium">{row.absentDays || 0}d</div>
                                     </div>
                                     <div>
                                         <span className="text-gray-500 block mb-0.5">Payable:</span>
                                         <div className="text-gray-300 font-medium">{row.totalPayableDays || 0}d</div>
                                     </div>
                                 </>
                             ) : (
                                 <>
                                     <div>
                                         <span className="text-gray-500 block mb-0.5">Time/Hours:</span>
                                         <div className="text-gray-300 font-medium">{row.duration || row.time || row.checkIn || '-'}</div>
                                     </div>
                                     {row.checkOut && (
                                         <div>
                                             <span className="text-gray-500 block mb-0.5">Punch Out:</span>
                                             <div className="text-gray-300 font-medium">{row.checkOut}</div>
                                         </div>
                                     )}
                                     {row.locationName && (
                                         <div className="col-span-2">
                                             <span className="text-gray-500 block mb-0.5">Location:</span>
                                             <div className="text-gray-300 font-medium truncate">{row.locationName}</div>
                                         </div>
                                     )}
                                 </>
                             )}
                        </div>
                    </div>
                ))}
                {rows.length > 5 && (
                    <div className="text-center text-xs text-gray-500 italic py-2">
                        Showing first 5 rows in summary. Download CSV for full data.
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen p-4 space-y-6 md:bg-transparent bg-[#041b0f]">
            {/* Mobile Header with Logo */}
            <div className="flex md:hidden flex-col items-center gap-4 mb-2">
                <div className="flex justify-center w-full relative">
                    <img src={pdfLogoLocalPath} alt="Logo" className="h-12 border border-yellow-500 p-1" />
                    <div className="absolute right-0 top-0">
                         <div className="relative">
                            <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                            <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">7</span>
                         </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <h2 className="text-2xl font-bold text-primary-text md:text-gray-900">Attendance Dashboard</h2>
                {['admin', 'hr', 'super_admin'].includes(currentUserRole || '') && (
                    <Button 
                        onClick={() => setIsManualEntryModalOpen(true)}
                        className="w-full md:w-auto bg-[#22c55e] hover:bg-[#16a34a] text-white shadow-lg flex items-center justify-center gap-2 py-3 rounded-xl font-semibold"
                    >
                        <UserCheck className="w-5 h-5" />
                        Add Manual Entry
                    </Button>
                )}
            </div>

            <ManualAttendanceModal 
                isOpen={isManualEntryModalOpen}
                onClose={() => setIsManualEntryModalOpen(false)}
                onSuccess={() => {
                    setToast({ message: 'Manual entry added successfully', type: 'success' });
                    // Refresh data
                    if (dateRange.startDate && dateRange.endDate) {
                        fetchDashboardData(dateRange.startDate, dateRange.endDate);
                    }
                    if (reportType === 'audit') {
                         fetchAuditLogs();
                    }
                }}
                users={users}
                currentUserRole={currentUserRole || ''}
                currentUserId={user?.id || ''}
            />

            {/* Filters Section */}
            <div className="bg-transparent md:bg-white p-0 md:p-4 rounded-xl shadow-none md:shadow-sm border-none md:border md:border-gray-100 flex flex-col gap-6">
                
                {/* Date Pills - Scrollable on mobile */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar">
                    {['Today', 'Last 7 Days', 'This Month'].map(filter => (
                        <Button
                            key={filter}
                            type="button"
                            onClick={() => handleSetDateFilter(filter)}
                            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                                activeDateFilter === filter
                                    ? "bg-[#22c55e] text-white shadow-md border-none"
                                    : "bg-[#0b291a] md:bg-white text-gray-300 md:text-gray-700 border border-[#1a3d2c] md:border-gray-300 hover:opacity-80"
                            }`}
                        >
                            {filter}
                        </Button>
                    ))}
                    <div className="relative flex-shrink-0" ref={datePickerRef}>
                         <Button
                            type="button"
                            onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                            className={`whitespace-nowrap flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                                activeDateFilter === 'Custom'
                                    ? "bg-[#22c55e] text-white shadow-md border-none"
                                    : "bg-[#0b291a] md:bg-white text-gray-300 md:text-gray-700 border border-[#1a3d2c] md:border-gray-300 hover:opacity-80"
                            }`}
                        >
                            <Calendar className="h-4 w-4" />
                            {activeDateFilter === 'Custom'
                                ? `${format(dateRange.startDate!, 'dd MMM')} - ${format(dateRange.endDate!, 'dd MMM')}`
                                : 'Custom Range'}
                        </Button>
                        {isDatePickerOpen && (
                            <div className="absolute top-full left-0 mt-2 z-50 bg-[#0b291a] md:bg-card border border-[#1a3d2c] md:border-border rounded-xl shadow-xl p-2 min-w-[300px]">
                                <DateRangePicker
                                    onChange={handleCustomDateChange}
                                    months={1}
                                    ranges={dateRangeArray}
                                    direction="horizontal"
                                    maxDate={new Date()}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Dropdowns Grid */}
                <div className="grid grid-cols-2 md:flex md:flex-wrap items-end gap-x-3 gap-y-4">
                    <div className="col-span-1">
                        <label htmlFor={reportTypeId} className="block text-xs font-medium text-gray-400 md:text-gray-500 mb-1">Report Type</label>
                        <select
                            id={reportTypeId}
                            name="reportType"
                            className="w-full md:w-auto border border-[#1a3d2c] md:border-gray-200 rounded-lg px-3 py-2 text-sm bg-[#041b0f] md:bg-white text-white md:text-gray-900 focus:ring-2 focus:ring-[#22c55e] outline-none appearance-none"
                            value={reportType}
                            onChange={(e) => setReportType(e.target.value as any)}
                        >
                            <option value="basic">Basic Report</option>
                            <option value="log">Attendance Log</option>
                            <option value="monthly">Monthly Report</option>
                            <option value="workHours">Work Hours Report</option>
                            <option value="audit">Audit Log Report</option>
                        </select>
                    </div>

                    <div className="col-span-1">
                        <label htmlFor={roleId} className="block text-xs font-medium text-gray-400 md:text-gray-500 mb-1">Role</label>
                        <select
                            id={roleId}
                            name="role"
                            className="w-full md:w-auto border border-[#1a3d2c] md:border-gray-200 rounded-lg px-3 py-2 text-sm bg-[#041b0f] md:bg-white text-white md:text-gray-900 focus:ring-2 focus:ring-[#22c55e] outline-none appearance-none"
                            value={selectedRole}
                            onChange={(e) => {
                                setSelectedRole(e.target.value);
                                setSelectedUser('all');
                            }}
                        >
                            <option value="all">All Roles</option>
                            {availableRoles.map(role => (
                                <option key={role} value={role}>
                                    {role ? role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="col-span-1">
                        <label htmlFor={employeeId} className="block text-xs font-medium text-gray-400 md:text-gray-500 mb-1">Employee</label>
                        <select
                            id={employeeId}
                            name="employee"
                            className="w-full md:w-auto border border-[#1a3d2c] md:border-gray-200 rounded-lg px-3 py-2 text-sm bg-[#041b0f] md:bg-white text-white md:text-gray-900 focus:ring-2 focus:ring-[#22c55e] outline-none appearance-none"
                            value={selectedUser}
                            onChange={(e) => setSelectedUser(e.target.value)}
                        >
                            <option value="all">All Employees</option>
                            {users
                                .filter(u => selectedRole === 'all' || u.role === selectedRole)
                                .map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))
                            }
                        </select>
                    </div>

                    <div className="col-span-1">
                        <label htmlFor={statusId} className="block text-xs font-medium text-gray-400 md:text-gray-500 mb-1">Status</label>
                        <select
                            id={statusId}
                            name="status"
                            className="w-full md:w-auto border border-[#1a3d2c] md:border-gray-200 rounded-lg px-3 py-2 text-sm bg-[#041b0f] md:bg-white text-white md:text-gray-900 focus:ring-2 focus:ring-[#22c55e] outline-none appearance-none"
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                        >
                            <option value="all">All Status</option>
                            <option value="P">Present (P)</option>
                            <option value="0.5P">Half Day (0.5P)</option>
                            <option value="A">Absent (A)</option>
                            <option value="S/L">Sick Leave (S/L)</option>
                            <option value="E/L">Earned Leave (E/L)</option>
                            <option value="F/H">Floating Holiday (F/H)</option>
                            <option value="C/O">Comp Off (C/O)</option>
                            <option value="LOP">Loss of Pay (LOP)</option>
                            <option value="W/H">Work From Home (W/H)</option>
                            <option value="W/O">Week Off (W/O)</option>
                            <option value="W/P">Week Off Present (W/P)</option>
                            <option value="H">Holiday (H)</option>
                            <option value="H/P">Holiday Present (H/P)</option>
                        </select>
                    </div>

                    <div className="col-span-2 md:col-span-1">
                        <label htmlFor={recordTypeId} className="block text-xs font-medium text-gray-400 md:text-gray-500 mb-1">Record Type</label>
                        <select
                            id={recordTypeId}
                            name="recordType"
                            className="w-full md:w-auto border border-[#1a3d2c] md:border-gray-200 rounded-lg px-3 py-2 text-sm bg-[#041b0f] md:bg-white text-white md:text-gray-900 focus:ring-2 focus:ring-[#22c55e] outline-none appearance-none"
                            value={selectedRecordType}
                            onChange={(e) => setSelectedRecordType(e.target.value)}
                        >
                            <option value="all">All Records</option>
                            <option value="complete">Complete (Punch-in & Punch-out)</option>
                            <option value="missing_checkout">Missing Punch-out</option>
                            <option value="missing_checkin">Missing Punch-in</option>
                            <option value="incomplete">Incomplete (Any Missing)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="flex flex-col gap-8 md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-6 bg-transparent md:bg-white p-0 md:p-4 rounded-xl">
                {[
                    { title: "Total Employees", value: dashboardData?.totalEmployees || 0, icon: Users, color: "bg-emerald-500" },
                    { title: `Present ${statDateLabel}`, value: dashboardData?.presentToday || 0, icon: UserCheck, color: "bg-[#0eb161]" },
                    { title: `Absent ${statDateLabel}`, value: dashboardData?.absentToday || 0, icon: UserX, color: "bg-[#df0637]" },
                    { title: `On Leave ${statDateLabel}`, value: dashboardData?.onLeaveToday || 0, icon: Clock, color: "bg-[#1d63ff]" }
                ].map((stat, i) => (
                    <div key={i} className="flex items-center gap-6 md:bg-card md:p-6 md:rounded-2xl md:border md:border-[#1a3d2c] md:md:border-gray-100 md:shadow-sm">
                        <div className={`p-4 md:p-3 rounded-full ${stat.color} text-white shadow-xl md:shadow-none`}>
                            <stat.icon className="h-8 w-8 md:h-6 md:w-6" />
                        </div>
                        <div className="flex flex-col">
                            <p className="text-sm md:text-xs font-medium text-gray-400 md:text-gray-500 mb-1">{stat.title}</p>
                            <p className="text-4xl md:text-2xl font-bold text-white md:text-gray-900 leading-none">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#0b291a] md:bg-card p-4 md:p-6 rounded-2xl border border-[#1a3d2c] md:border-border shadow-sm">
                    <div className="flex items-center mb-6">
                        <BarChart3 className="h-5 w-5 mr-3 text-[#22c55e] md:text-muted" />
                        <h3 className="font-semibold text-white md:text-primary-text">Attendance Trend</h3>
                    </div>
                    <div className="h-64 md:h-80 relative">
                        {dashboardData ? <AttendanceTrendChart data={dashboardData.attendanceTrend} /> : <Loader2 className="h-6 w-6 animate-spin text-muted mx-auto mt-20" />}
                    </div>
                </div>
                <div className="bg-[#0b291a] md:bg-card p-4 md:p-6 rounded-2xl border border-[#1a3d2c] md:border-border shadow-sm">
                    <div className="flex items-center mb-6">
                        <TrendingUp className="h-5 w-5 mr-3 text-[#22c55e] md:text-muted" />
                        <h3 className="font-semibold text-white md:text-primary-text">Productivity Trend</h3>
                    </div>
                    <div className="h-64 md:h-80 relative">
                        {dashboardData ? <ProductivityChart data={dashboardData.productivityTrend} /> : <Loader2 className="h-6 w-6 animate-spin text-muted mx-auto mt-20" />}
                    </div>
                </div>
            </div>

            {/* Off-screen PDF Container for generation */}
            <div style={{ position: 'fixed', top: '0', left: '0', width: '1123px', zIndex: -1000, opacity: 0, pointerEvents: 'none' }}>
                <div ref={pdfRef} className="w-full bg-white">
                    {pdfContent}
                </div>
            </div>

            {/* Work Hours Report */}
            {reportType === 'workHours' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                    <MonthlyHoursReport 
                        month={(dateRange.startDate?.getMonth() ?? new Date().getMonth()) + 1}
                        year={dateRange.startDate?.getFullYear() || new Date().getFullYear()}
                        userId={selectedUser === 'all' ? undefined : selectedUser}
                    />
                </div>
            )}

            {/* Report Preview */}
            {reportType !== 'workHours' && (
                <div className="hidden md:block bg-[#0b291a] md:bg-white p-4 md:p-6 rounded-2xl border border-[#1a3d2c] md:border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <div className="flex flex-col gap-1">
                            <h2 className="text-lg font-bold text-white md:text-gray-900">Report Preview</h2>
                            <div className="md:hidden flex bg-[#041b0f] p-1 rounded-lg border border-[#1a3d2c]">
                                <button 
                                    onClick={() => setPreviewMode('summary')}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${previewMode === 'summary' ? 'bg-[#22c55e] text-white' : 'text-gray-400'}`}
                                >
                                    Summary
                                </button>
                                <button 
                                    onClick={() => setPreviewMode('full')}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${previewMode === 'full' ? 'bg-[#22c55e] text-white' : 'text-gray-400'}`}
                                >
                                    Full Layout
                                </button>
                            </div>
                        </div>
                        {canDownloadReport && (
                            <Button
                                type="button"
                                onClick={handleDownloadCsv}
                                disabled={isDownloading}
                                className="w-full sm:w-auto bg-[#22c55e] hover:bg-[#16a34a] text-white shadow-lg rounded-xl flex items-center justify-center gap-2 py-2.5 px-6 font-medium"
                            >
                                {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                {isDownloading ? 'Generating...' : 'Download CSV'}
                            </Button>
                        )}
                    </div>

                    {previewMode === 'summary' ? (
                        <div className="md:hidden">
                            <ReportSummaryView />
                        </div>
                    ) : null}

                    <div className={`border border-[#1a3d2c] md:border-gray-200 rounded-xl bg-[#041b0f] md:bg-gray-50 flex justify-center min-h-[300px] md:min-h-[400px] relative overflow-hidden ${previewMode === 'summary' ? 'hidden md:flex' : 'flex'}`}>
                        {isLoading && (
                            <div className="absolute inset-0 z-10 bg-[#041b0f]/50 md:bg-white/50 backdrop-blur-sm flex flex-col items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-[#22c55e] mb-2" />
                                <p className="text-sm font-medium text-gray-300 md:text-gray-600">Updating report data...</p>
                            </div>
                        )}
                        <div className="w-full max-w-full overflow-x-auto p-4 custom-scrollbar">
                            <div className={`origin-top-left sm:origin-top ${reportType === 'basic' ? 'w-full' : 'min-w-[800px] md:min-w-[1123px] transform scale-[0.6] xs:scale-[0.7] sm:scale-[0.85] md:scale-[0.9] lg:scale-100'}`}>
                               {previewContent}
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
