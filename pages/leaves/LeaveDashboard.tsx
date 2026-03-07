import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import type { LeaveBalance, LeaveRequest, LeaveType, LeaveRequestStatus, UploadedFile, CompOffLog, AttendanceEvent, UserHoliday, AttendanceSettings, StaffAttendanceRules } from '../../types';
import { Loader2, Plus, ArrowLeft, AlertTriangle, Briefcase, HeartPulse, Plane, CalendarClock, Clock, Edit, Trash2, XCircle, Search, Calendar, Settings, Check } from 'lucide-react';
import { HOLIDAY_SELECTION_POOL, FIXED_HOLIDAYS } from '../../utils/constants';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import Select from '../../components/ui/Select';
import { useForm, Controller, SubmitHandler, Resolver } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { format, differenceInCalendarDays, isSameDay, startOfMonth, endOfMonth, differenceInMinutes } from 'date-fns';
import { calculateWorkingHours } from '../../utils/attendanceCalculations';
import DatePicker from '../../components/ui/DatePicker';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useSettingsStore } from '../../store/settingsStore';
import UploadDocument from '../../components/UploadDocument';
import AttendanceCalendar from './AttendanceCalendar';
import CompOffCalendar from './CompOffCalendar';
import OTCalendar from './OTCalendar';
import YearlyAttendanceChart from './YearlyAttendanceChart';
import EmployeeLog from './EmployeeLog';
import Modal from '../../components/ui/Modal';
import HolidayCalendar from './HolidayCalendar';

// --- Reusable Components ---

const LeaveBalanceCard: React.FC<{ title: string; value: string; icon: React.ElementType; isExpired?: boolean; description?: string }> = ({ title, value, icon: Icon, isExpired, description }) => (
    <div className={`bg-card p-3 md:p-4 rounded-xl flex flex-col md:flex-row items-center md:items-center gap-2 md:gap-4 border text-center md:text-left w-full ${isExpired ? 'border-amber-500/50 bg-amber-500/5' : 'border-border'}`}>
        <div className={`${isExpired ? 'bg-amber-100' : 'bg-accent-light'} p-2 md:p-3 rounded-full flex-shrink-0`}>
            <Icon className={`h-5 w-5 md:h-6 md:w-6 ${isExpired ? 'text-amber-600' : 'text-accent-dark'}`} />
        </div>
        <div className="flex-1">
            <div className="flex items-center justify-center md:justify-start gap-2">
                <p className="text-xs md:text-sm text-muted font-medium">{title}</p>
                {isExpired && <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">Expired</span>}
            </div>
            <p className={`text-lg md:text-2xl font-bold ${isExpired ? 'text-amber-600' : 'text-primary-text'}`}>{value}</p>
            {description && <p className="text-[10px] md:text-xs text-muted-foreground mt-1">{description}</p>}
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
    const [balanceDataState, setBalance] = useState<LeaveBalance | null>(null);
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [compOffLogs, setCompOffLogs] = useState<CompOffLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCompOffHistoryDisabled, setIsCompOffHistoryDisabled] = useState(false);
    const [filter, setFilter] = useState<LeaveRequestStatus | 'all'>('all');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [actioningRequestId, setActioningRequestId] = useState<string | null>(null);
    const isMobile = useMediaQuery('(max-width: 767px)');
    const navigate = useNavigate();
    const [calculatedOTHours, setCalculatedOTHours] = useState<number>(0);

    // Holiday Selection State
    const [userHolidays, setUserHolidays] = useState<UserHoliday[]>([]);
    const [isHolidaySelectionEnabled, setIsHolidaySelectionEnabled] = useState(false);
    const [activeHolidayPool, setActiveHolidayPool] = useState<{ name: string; date: string }[]>([]);

    // Emergency Self-Healing for Attendance Rules
    useEffect(() => {
        const repairSettings = async () => {
            try {
                const settings = await api.getAttendanceSettings();
                let needsUpdate = false;
                
                ['office', 'field', 'site'].forEach((cat) => {
                    const typedCat = cat as keyof AttendanceSettings;
                    // Safely cast to StaffAttendanceRules for the self-healing logic
                    const catRules = settings[typedCat] as StaffAttendanceRules;
                    
                    if (!catRules) {
                        (settings as any)[typedCat] = {};
                        needsUpdate = true;
                        return;
                    }
                    
                    // User requested 1.5 EL for every month completed.
                    // Sequence: 1.5, 3.0, 4.5, 6.0, 7.5...
                    if (!catRules.earnedLeaveAccrual || catRules.earnedLeaveAccrual.amountEarned !== 1.5) {
                        catRules.earnedLeaveAccrual = { daysRequired: 30, amountEarned: 1.5 };
                        needsUpdate = true;
                    }
                    
                    if (catRules.enableSickLeaveAccrual === undefined) {
                        catRules.enableSickLeaveAccrual = true;
                        needsUpdate = true;
                    }

                    // Fallback for missing recurring holidays in JSON
                    if (!catRules.recurringHolidays || catRules.recurringHolidays.length === 0) {
                        if (cat === 'office' || cat === 'site') {
                            catRules.recurringHolidays = [{ day: 'Saturday', n: 3, type: cat as any }];
                            needsUpdate = true;
                        }
                    }
                });

                if (needsUpdate) {
                    await api.saveAttendanceSettings(settings);
                    console.log("Self-healing: Updated attendance rules for all categories.");
                    // Refresh the page once to apply new rules
                    window.location.reload();
                }
            } catch (err) {
                console.error("Self-healing failed:", err);
            }
        };

        if (user && (user.role?.toLowerCase().includes('admin') || user.role?.toLowerCase().includes('hr'))) {
            repairSettings();
        }
    }, [user]);

    const [viewingDate, setViewingDate] = useState(new Date());
    const [threshold, setThreshold] = useState(8);
    const currentYear = viewingDate.getFullYear();

    const formatPreciseHours = (hours: number) => {
        const totalMinutes = Math.round((hours || 0) * 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${h}h ${m}m`;
    };

    const { officeHolidays, fieldHolidays } = useSettingsStore();

    const adminHolidays = useMemo(() => {
        if (!user) return [];
        // Map user role to admin holiday list
        if (user.role === 'field_staff') return fieldHolidays;
        return officeHolidays;
    }, [user, fieldHolidays, officeHolidays]);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        setError(null);
        
        try {
            const dateStr = format(viewingDate, 'yyyy-MM-dd');
            const startStr = startOfMonth(viewingDate).toISOString();
            const endStr = endOfMonth(viewingDate).toISOString();

            // Fetch base data points
            const [balanceData, requestsData, compOffData, eventsData, settings] = await Promise.all([
                api.getLeaveBalancesForUser(user.id, dateStr),
                api.getLeaveRequests({
                    userId: user.id,
                    status: filter === 'all' ? undefined : filter
                }).then(res => res.data),
                api.getCompOffLogs(user.id).catch(() => []),
                api.getAttendanceEvents(user.id, startStr, endStr),
                api.getAttendanceSettings()
            ]);

            setBalance(balanceData);
            setRequests(requestsData);
            setCompOffLogs(compOffData);
            
            // Refetch current user profile to get latest persistent OT fields (bank, monthly)
            // This ensures we have the most up-to-date role and balance information
            const freshUser = await supabase
                .from('users')
                .select('*, role:roles(display_name)')
                .eq('id', user.id)
                .single();

            let currentUserData = user;
            if (freshUser.data) {
                const data = freshUser.data;
                const roleData = data.role;
                const rawRoleName = (Array.isArray(roleData) ? roleData[0]?.display_name : (roleData as any)?.display_name) || data.role_id;
                const normalizedRole = typeof rawRoleName === 'string' ? rawRoleName.toLowerCase().replace(/\s+/g, '_') : rawRoleName;
                
                currentUserData = {
                    ...api.toCamelCase(data),
                    role: normalizedRole,
                    roleId: data.role_id
                };
                
                // Update store asynchronously to avoid interrupting current calculation
                setTimeout(() => {
                    useAuthStore.getState().updateUserProfile(currentUserData);
                }, 0);
            }

            // Map User Role to Staff Category (office, field, site)
            let staffCategory: keyof AttendanceSettings = 'office';
            const userRole = (currentUserData.role || '').toLowerCase();

            if ([
                'admin', 'hr', 'finance', 'developer', 'management', 'office_staff', 
                'back_office_staff', 'bd', 'operation_manager', 'finance_manager', 
                'hr_ops', 'business developer', 'operation manager', 'finance manager', 'hr ops'
            ].includes(userRole)) {
                staffCategory = 'office';
            } else if (userRole.includes('site')) {
                staffCategory = 'site';
            } else {
                staffCategory = 'field';
            }

            const userRules = settings[staffCategory];
            const shiftThreshold = userRules?.dailyWorkingHours?.max || 8;
            setThreshold(shiftThreshold);

            // Group events by day and calculate OT using normalized logic
            const dayLogs: Record<string, AttendanceEvent[]> = {};
            eventsData.forEach(e => {
                const d = format(new Date(e.timestamp), 'yyyy-MM-dd');
                if (!dayLogs[d]) dayLogs[d] = [];
                dayLogs[d].push(e);
            });

            let totalOTHours = 0;
            Object.values(dayLogs).forEach(dayEvents => {
                const { workingHours } = calculateWorkingHours(dayEvents);
                if (workingHours > shiftThreshold) {
                    totalOTHours += (workingHours - shiftThreshold);
                }
            });

            setCalculatedOTHours(parseFloat(totalOTHours.toFixed(1)));
            setIsHolidaySelectionEnabled(userRules?.enableCustomHolidays || false);
            setActiveHolidayPool(userRules?.holidayPool || HOLIDAY_SELECTION_POOL);
            
            if (userRules?.enableCustomHolidays) {
                const selections = await api.getUserHolidays(user.id);
                setUserHolidays(selections);
            }

        } catch (err: any) {
            console.error('Error fetching dashboard data:', err);
            let message = 'Failed to load leave data.';
            if (err && typeof err.message === 'string') {
                if (err.message.includes('relation "leave_requests" does not exist')) {
                    message = 'Database setup error: The "leave_requests" table is missing.';
                } else {
                    message = err.message;
                }
            }
            setError(message);
            setToast({ message, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    }, [user?.id, user?.role, filter, viewingDate]);

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

    const balanceCards = balanceDataState ? [
        { 
            title: 'Earned Leave', 
            value: `${parseFloat((balanceDataState.earnedTotal - balanceDataState.earnedUsed).toFixed(1))} / ${parseFloat(balanceDataState.earnedTotal.toFixed(1))}`, 
            description: `Total: ${parseFloat(balanceDataState.earnedTotal.toFixed(1))}d. Available: ${parseFloat((balanceDataState.earnedTotal - balanceDataState.earnedUsed).toFixed(1))}d.`,
            icon: Briefcase,
            isExpired: balanceDataState.expiryStates?.earned 
        },
        { 
            title: 'Sick Leave', 
            value: `${parseFloat((balanceDataState.sickTotal - balanceDataState.sickUsed).toFixed(1))} / ${parseFloat(balanceDataState.sickTotal.toFixed(1))}`, 
            description: `Total: ${parseFloat(balanceDataState.sickTotal.toFixed(1))}d. Available: ${parseFloat((balanceDataState.sickTotal - balanceDataState.sickUsed).toFixed(1))}d.`,
            icon: HeartPulse,
            isExpired: balanceDataState.expiryStates?.sick
        },
        { 
            title: 'Floating Holiday', 
            value: `${parseFloat((balanceDataState.floatingTotal - balanceDataState.floatingUsed).toFixed(1))} / ${parseFloat(balanceDataState.floatingTotal.toFixed(1))}`, 
            description: `Total: ${parseFloat(balanceDataState.floatingTotal.toFixed(1))}d. Available: ${parseFloat((balanceDataState.floatingTotal - balanceDataState.floatingUsed).toFixed(1))}d.`,
            icon: Plane,
            isExpired: balanceDataState.expiryStates?.floating
        },
        { 
            title: 'Compensatory Off', 
            value: `${parseFloat((balanceDataState.compOffTotal - balanceDataState.compOffUsed).toFixed(1))} / ${parseFloat(balanceDataState.compOffTotal.toFixed(1))}`, 
            description: `Total: ${parseFloat(balanceDataState.compOffTotal.toFixed(1))}d. Available: ${parseFloat((balanceDataState.compOffTotal - balanceDataState.compOffUsed).toFixed(1))}d.`,
            icon: CalendarClock,
            isExpired: balanceDataState.expiryStates?.compOff
        },
    ].filter(card => !card.isExpired) : [];

    return (
        <div className="p-4 space-y-6">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                    <h2 className="text-2xl font-bold text-primary-text">My Leave Requests</h2>
                </div>
                {!isMobile && (
                    <div className="flex gap-2">
                        <Button onClick={handleNewRequest}><Plus className="mr-2 h-4" /> New Request</Button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {balanceCards.map(b => <LeaveBalanceCard key={b.title} {...b} />)}
                {/* Show Overtime card for everyone now that we track it persistent */}
                <div className="relative group w-full">
                    <LeaveBalanceCard 
                        title="Monthly OT Hours" 
                        value={formatPreciseHours(calculatedOTHours || user?.monthlyOtHours || 0)} 
                        description={`Calculated from hours exceeding ${threshold}h daily.`}
                        icon={Clock} 
                    />
                    <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-popover text-popover-foreground text-[10px] p-2 rounded shadow-lg border border-border w-48 pointer-events-none">
                            <p className="font-bold border-b border-border mb-1 pb-1">OT Accumulation</p>
                            <p>Current Bank: <span className="text-accent-dark font-bold">
                                {formatPreciseHours(user?.otHoursBank || 0)}
                            </span></p>
                            <p className="mt-1 text-muted-foreground italic">Every 8h of accumulated OT is automatically converted to 1 Comp Off.</p>
                        </div>
                    </div>
                </div>
            </div>


            {/* Holiday Selection Section */}
            {isHolidaySelectionEnabled && (
                isMobile ? (
                    /* Mobile: Premium Dark Theme */
                    <div className="bg-[#0f291e]/80 backdrop-blur-md rounded-2xl border border-white/5 p-5 shadow-xl relative overflow-hidden group mb-6">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                        <div className="flex flex-col gap-4 relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-emerald-500/20 rounded-xl">
                                    <Calendar className="h-6 w-6 text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Holiday Selection</h3>
                                    <p className="text-emerald-100/60 text-xs text-left">Pick 6 holidays from the company list</p>
                                </div>
                            </div>
                            <div className="flex flex-col items-center gap-3 w-full">
                                <div className="px-3 py-1 bg-black/40 rounded-full border border-white/10">
                                    <span className={`text-sm font-bold ${userHolidays.length === 6 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {userHolidays.length} / 6 Selected
                                    </span>
                                </div>
                                <Button onClick={() => navigate('/leaves/holiday-selection')} className="w-full justify-center">
                                    {userHolidays.length > 0 ? 'Update Selection' : 'Select Holidays'}
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Desktop: Integrated Light Theme */
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-5">
                            <div className="p-3 bg-emerald-50 rounded-xl">
                                <Calendar className="h-7 w-7 text-emerald-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Holiday Selection</h3>
                                <p className="text-gray-500 text-sm">Pick 6 holidays from the company list to complete your allowance.</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col items-end mr-2">
                                <span className={`text-sm font-bold ${userHolidays.length === 6 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                    {userHolidays.length} / 6 Selected
                                </span>
                                <div className="w-32 h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-500 ${userHolidays.length === 6 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                        style={{ width: `${(userHolidays.length / 6) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                            
                            <Button onClick={() => navigate('/leaves/holiday-selection')} className="px-8 py-2.5">
                                {userHolidays.length > 0 ? 'Update Selection' : 'Select Holidays'}
                            </Button>
                        </div>
                    </div>
                )
            )}



            {/* Attendance Calendar Section */}
            <div className="flex flex-wrap gap-6 items-start">
                <AttendanceCalendar 
                    leaveRequests={requests} 
                    userHolidays={userHolidays} 
                    currentDate={viewingDate}
                    setCurrentDate={setViewingDate}
                />
                <CompOffCalendar 
                    logs={compOffLogs} 
                    leaveRequests={requests} 
                    userHolidays={userHolidays} 
                    isLoading={isLoading} 
                    viewingDate={viewingDate}
                    onDateChange={setViewingDate}
                />
                <HolidayCalendar 
                    adminHolidays={adminHolidays} 
                    userSelectedHolidays={userHolidays} 
                    isLoading={isLoading} 
                    viewingDate={viewingDate}
                    onDateChange={setViewingDate}
                />
                <YearlyAttendanceChart />
                <OTCalendar 
                    viewingDate={viewingDate}
                    onDateChange={setViewingDate}
                />
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