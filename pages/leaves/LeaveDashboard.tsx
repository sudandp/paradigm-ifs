import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';
import type { LeaveBalance, LeaveRequest, LeaveType, LeaveRequestStatus, UploadedFile, CompOffLog, AttendanceEvent } from '../../types';
import { Loader2, Plus, ArrowLeft, AlertTriangle, Briefcase, HeartPulse, Plane, CalendarClock, Clock, Edit, Trash2, XCircle, Search } from 'lucide-react';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import Select from '../../components/ui/Select';
import { useForm, Controller, SubmitHandler, Resolver } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { format, differenceInCalendarDays, isSameDay, startOfMonth, endOfMonth, differenceInMinutes } from 'date-fns';
import DatePicker from '../../components/ui/DatePicker';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useSettingsStore } from '../../store/settingsStore';
import UploadDocument from '../../components/UploadDocument';
import AttendanceCalendar from './AttendanceCalendar';
import CompOffCalendar from './CompOffCalendar';
import OTCalendar from './OTCalendar';
import EmployeeLog from './EmployeeLog';

// --- Reusable Components ---

const LeaveBalanceCard: React.FC<{ title: string; value: string; icon: React.ElementType }> = ({ title, value, icon: Icon }) => (
    <div className="bg-card p-3 md:p-4 rounded-xl flex flex-col md:flex-row items-center md:items-center gap-2 md:gap-4 border border-border text-center md:text-left w-full">
        <div className="bg-accent-light p-2 md:p-3 rounded-full flex-shrink-0">
            <Icon className="h-5 w-5 md:h-6 md:w-6 text-accent-dark" />
        </div>
        <div className="flex-1">
            <p className="text-xs md:text-sm text-muted font-medium">{title}</p>
            <p className="text-lg md:text-2xl font-bold text-primary-text">{value}</p>
        </div>
    </div>
);

const LeaveStatusChip: React.FC<{ status: LeaveRequestStatus }> = ({ status }) => {
    const statusClasses: Record<LeaveRequestStatus, string> = {
        pending_manager_approval: 'leave-status-chip--pending_manager_approval',
        pending_hr_confirmation: 'leave-status-chip--pending_hr_confirmation',
        approved: 'leave-status-chip--approved',
        rejected: 'leave-status-chip--rejected',
        cancelled: 'leave-status-chip--cancelled',
        withdrawn: 'leave-status-chip--withdrawn'
    };
    const text = status.replace(/_/g, ' ');
    return <span className={`leave-status-chip ${statusClasses[status]}`}>{text}</span>;
};


// --- Leave Request Form ---
type LeaveRequestFormData = {
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    reason: string;
    dayOption?: 'full' | 'half';
    doctorCertificate?: UploadedFile | null;
};

const getLeaveValidationSchema = (threshold: number) => yup.object({
    leaveType: yup.string<LeaveType>().oneOf(['Earned', 'Sick', 'Floating', 'Comp Off']).required('Leave type is required'),
    startDate: yup.string().required('Start date is required'),
    endDate: yup.string().required('End date is required')
        .test('is-after-start', 'End date must be on or after start date', function (value) {
            // FIX: Cast `this.parent.startDate` to string to prevent a runtime error.
            // In Yup, `this.parent` is of type `any` or `unknown`, so properties accessed on it are not type-safe.
            const { startDate } = this.parent as { startDate?: string };
            if (!startDate || !value) return true;
            return new Date(value.replace(/-/g, '/')) >= new Date(startDate.replace(/-/g, '/'));
        }),
    reason: yup.string().required('A reason for the leave is required').min(10, 'Please provide a more detailed reason.'),
    dayOption: yup.string().oneOf(['full', 'half']).optional(),
    doctorCertificate: yup.mixed<UploadedFile | null>().when(['leaveType', 'startDate', 'endDate'], {
        is: (leaveType: string, startDate: string, endDate: string) => {
            if (leaveType !== 'Sick' || !startDate || !endDate) return false;
            const duration = differenceInCalendarDays(new Date(endDate.replace(/-/g, '/')), new Date(startDate.replace(/-/g, '/'))) + 1;
            return duration > threshold;
        },
        then: schema => schema.required(`A doctor's certificate is required for sick leave longer than ${threshold} days.`),
        otherwise: schema => schema.nullable().optional(),
    })
});



// --- Main Dashboard ---
const LeaveDashboard: React.FC = () => {
    const { user } = useAuthStore();
    const [balance, setBalance] = useState<LeaveBalance | null>(null);
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [compOffLogs, setCompOffLogs] = useState<CompOffLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCompOffHistoryDisabled, setIsCompOffHistoryDisabled] = useState(false);
    const [filter, setFilter] = useState<LeaveRequestStatus | 'all'>('all');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [actioningRequestId, setActioningRequestId] = useState<string | null>(null);
    const isMobile = useMediaQuery('(max-width: 767px)');
    const navigate = useNavigate();
    const [calculatedOTHours, setCalculatedOTHours] = useState<number>(0);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        setIsCompOffHistoryDisabled(false);
        try {
            const [balanceData, requestsData, compOffData] = await Promise.all([
                api.getLeaveBalancesForUser(user.id),
                api.getLeaveRequests({
                    userId: user.id,
                    status: filter === 'all' ? undefined : filter
                }).then(res => res.data),
                api.getCompOffLogs(user.id).catch(error => {
                    if (error && error.message && (error.message.includes('comp_off_logs') || error.message.includes("relation \"public.comp_off_logs\" does not exist"))) {
                        setIsCompOffHistoryDisabled(true);
                        return []; // Return empty array to not break Promise.all
                    }
                    throw error; // Re-throw other errors
                })
            ]);
            setBalance(balanceData);
            setRequests(requestsData);
            setCompOffLogs(compOffData);

            // Calculate OT hours for field staff
            if (user.role === 'field_staff') {
                const now = new Date();
                const start = startOfMonth(now).toISOString();
                const end = endOfMonth(now).toISOString();
                const events = await api.getAttendanceEvents(user.id, start, end);

                // Group by day
                const eventsByDay: Record<string, AttendanceEvent[]> = {};
                events.forEach(e => {
                    const dateStr = format(new Date(e.timestamp), 'yyyy-MM-dd');
                    if (!eventsByDay[dateStr]) eventsByDay[dateStr] = [];
                    eventsByDay[dateStr].push(e);
                });

                let totalOT = 0;
                Object.values(eventsByDay).forEach(dayEvents => {
                    // Sort events
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

                    const hours = totalMinutes / 60;
                    if (hours > 8) {
                        totalOT += (hours - 8);
                    }
                });
                setCalculatedOTHours(parseFloat(totalOT.toFixed(1)));
            }

        } catch (error: any) {
            let message = 'Failed to load leave data.';
            if (error && typeof error.message === 'string') {
                if (error.message.includes('relation "leave_requests" does not exist')) {
                    message = 'Database setup error: The "leave_requests" table is missing.';
                }
            }
            console.error("Failed to load leave data", error);
            if (!isCompOffHistoryDisabled) { // Avoid double-toast if comp-off is the only issue
                setToast({ message, type: 'error' });
            }
        } finally {
            setIsLoading(false);
        }
    }, [user, filter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleNewRequest = () => {
        navigate('/leaves/apply');
    };
    
    const handleEditRequest = (id: string) => {
        navigate(`/leaves/apply?edit=${id}`);
    };

    const handleCancelRequest = async (id: string) => {
        if (!window.confirm('Are you sure you want to withdraw this leave request?')) return;
        
        setActioningRequestId(id);
        try {
            await api.withdrawLeaveRequest(id, user!.id);
            setToast({ message: 'Leave request withdrawn successfully.', type: 'success' });
            fetchData();
        } catch (error) {
            setToast({ message: 'Failed to withdraw leave request.', type: 'error' });
        } finally {
            setActioningRequestId(null);
        }
    };

    const formatTabName = (tab: string) => tab.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const filterTabs: Array<LeaveRequestStatus | 'all'> = ['all', 'pending_manager_approval', 'pending_hr_confirmation', 'approved', 'rejected'];

    const balanceCards = balance ? [
        { title: 'Earned Leave', value: `${Math.max(0, balance.earnedTotal - balance.earnedUsed)} / ${balance.earnedTotal}`, icon: Briefcase },
        { title: 'Sick Leave', value: `${Math.max(0, balance.sickTotal - balance.sickUsed)} / ${balance.sickTotal}`, icon: HeartPulse },
        { title: 'Floating Holiday', value: `${Math.max(0, balance.floatingTotal - balance.floatingUsed)} / ${balance.floatingTotal}`, icon: Plane },
        { title: 'Compensatory Off', value: `${Math.max(0, balance.compOffTotal - balance.compOffUsed)} / ${balance.compOffTotal}`, icon: CalendarClock },
    ] : [];

    return (
        <div className="p-4 space-y-6">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-primary-text">My Leave Requests</h2>
                {!isMobile && (
                    <Button onClick={handleNewRequest}><Plus className="mr-2 h-4" /> New Request</Button>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6 justify-items-center md:justify-items-start">
                {balanceCards.map(b => <LeaveBalanceCard key={b.title} {...b} />)}
                {/* Show Overtime card only for field staff */}
                {user?.role === 'field_staff' && (
                    <LeaveBalanceCard title="Overtime Hours" value={`${calculatedOTHours} hrs`} icon={Clock} />
                )}
            </div>

            {/* Attendance Calendar Section */}
            <div className="flex flex-col md:flex-row gap-6 items-start">
                <AttendanceCalendar />
                <CompOffCalendar logs={compOffLogs} isLoading={isLoading} />
                {/* Show OT Calendar only for field staff */}
                {user?.role === 'field_staff' && <OTCalendar />}
            </div>

            {isMobile && (
                <div className="my-4 w-full">
                    <Button onClick={handleNewRequest} size="lg" className="w-full justify-center text-lg">
                        <Plus className="mr-2 h-5" /> New Request
                    </Button>
                </div>
            )}

            <div className="border-0 shadow-none md:bg-card md:p-6 md:rounded-xl md:shadow-card w-full md:w-full">
                <div className="mb-6">
                    <div className="w-full sm:w-auto md:border-b border-border">
                        <nav className="flex flex-col md:flex-row md:space-x-6 space-y-2 md:space-y-0" aria-label="Tabs">
                            {filterTabs.map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setFilter(tab)}
                                    className={`whitespace-nowrap font-medium text-base rounded-lg md:rounded-none w-full md:w-auto text-left px-4 py-2 md:px-1 md:py-3 md:bg-transparent md:border-b-2
                                    ${filter === tab
                                            ? 'bg-accent-light text-accent-dark md:border-accent'
                                            : 'text-muted hover:bg-accent-light hover:text-accent-dark md:border-transparent md:hover:border-accent'
                                        }`}
                                >
                                    {formatTabName(tab)}
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full responsive-table">
                        <thead>
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-medium text-muted uppercase">Type</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-muted uppercase">Dates</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-muted uppercase">Reason</th>
                                 <th className="px-4 py-3 text-left text-sm font-medium text-muted uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-muted uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border md:bg-card md:divide-y-0">
                            {isLoading ? (
                                <tr><td colSpan={5} className="text-center py-10 text-muted">Loading...</td></tr>
                            ) : requests.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-10 text-muted text-lg">No requests found.</td></tr>
                            ) : (
                                requests.map(req => (
                                    <tr key={req.id}>
                                        <td data-label="Type" className="px-4 py-3 font-medium text-base">{req.leaveType} {req.dayOption && `(${req.dayOption})`}</td>
                                        <td data-label="Dates" className="px-4 py-3 text-muted text-base">{format(new Date(req.startDate.replace(/-/g, '/')), 'dd MMM')} - {format(new Date(req.endDate.replace(/-/g, '/')), 'dd MMM')}</td>
                                        <td data-label="Reason" className="px-4 py-3 text-muted max-w-xs truncate text-base">{req.reason}</td>
                                         <td data-label="Status" className="px-4 py-3 text-base"><LeaveStatusChip status={req.status} /></td>
                                        <td data-label="Actions" className="px-4 py-3">
                                            {req.status === 'pending_manager_approval' ? (
                                                <div className="flex md:justify-start justify-end gap-2">
                                                    {actioningRequestId === req.id ? (
                                                        <Loader2 className="h-5 w-5 animate-spin text-accent" />
                                                    ) : (
                                                        <>
                                                            <Button size="sm" variant="icon" onClick={() => handleEditRequest(req.id)} title="Edit Request">
                                                                <Edit className="h-4 w-4 text-emerald-600" />
                                                            </Button>
                                                            <Button size="sm" variant="icon" onClick={() => handleCancelRequest(req.id)} title="Cancel Request">
                                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-muted italic">No actions available</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="border-0 shadow-none md:bg-card md:p-6 md:rounded-xl md:shadow-card w-full md:w-full">
                <h3 className="text-lg font-semibold mb-4 text-primary-text">Compensatory Off Tracker</h3>
                {isCompOffHistoryDisabled ? (
                    <div className="text-center py-10 text-muted bg-page rounded-lg">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                        <p className="font-semibold">Feature Unavailable</p>
                        <p className="text-sm">The Compensatory Off feature is disabled because the required 'comp_off_logs' table is missing in the database.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full responsive-table">
                            <thead>
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Date Earned</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Reason for Comp-Off</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Granted By</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border md:bg-card md:divide-y-0">
                                {isLoading ? (
                                    <tr><td colSpan={4} className="text-center py-10 text-muted">Loading...</td></tr>
                                ) : compOffLogs.length === 0 ? (
                                    <tr><td colSpan={4} className="text-center py-10 text-muted text-lg">No comp-off history found.</td></tr>
                                ) : (
                                    compOffLogs.map(log => (
                                        <tr key={log.id}>
                                            <td data-label="Date Earned" className="px-4 py-3 font-medium">{format(new Date(log.dateEarned.replace(/-/g, '/')), 'dd MMM, yyyy')}</td>
                                            <td data-label="Reason" className="px-4 py-3 text-muted">{log.reason}</td>
                                            <td data-label="Granted By" className="px-4 py-3 text-muted">{log.grantedByName || '-'}</td>
                                            <td data-label="Status" className="px-4 py-3">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${log.status === 'earned' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-800'}`}>
                                                    {log.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Employee Attendance Log */}
            <EmployeeLog />
        </div>
    );
};

export default LeaveDashboard;