import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import type { LeaveRequest, LeaveRequestStatus, ExtraWorkLog } from '../../types';
import { Loader2, Check, X, Plus, XCircle, User, Calendar, FilterX } from 'lucide-react';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import { format } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Select from '../../components/ui/Select';
import TableSkeleton from '../../components/skeletons/TableSkeleton';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import RejectClaimModal from '../../components/hr/RejectClaimModal';
import { isAdmin } from '../../utils/auth';

const StatusChip: React.FC<{ status: LeaveRequestStatus; approverName?: string | null; approvalHistory?: any[] }> = ({ status, approverName, approvalHistory }) => {
    const styles: Record<LeaveRequestStatus, string> = {
        pending_manager_approval: 'bg-yellow-100 text-yellow-800',
        pending_hr_confirmation: 'bg-blue-100 text-blue-800',
        approved: 'bg-green-100 text-green-800',
        rejected: 'bg-red-100 text-red-800',
        cancelled: 'bg-gray-100 text-gray-800',
        withdrawn: 'bg-gray-100 text-gray-600',
    };
    
    let displayText = status.replace(/_/g, ' ');
    
    // Show approver name for pending statuses
    if ((status === 'pending_manager_approval' || status === 'pending_hr_confirmation') && approverName) {
        displayText = `Pending from ${approverName}`;
    }
    // Show who approved for approved status
    else if (status === 'approved' && approvalHistory && approvalHistory.length > 0) {
        const lastApprover = approvalHistory[approvalHistory.length - 1];
        displayText = `Approved by ${lastApprover.approverName || lastApprover.approver_name}`;
    }
    
    return <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${styles[status]}`}>{displayText}</span>;
};

const ClaimStatusChip: React.FC<{ status: ExtraWorkLog['status'] }> = ({ status }) => {
    const styles = {
        Pending: 'bg-yellow-100 text-yellow-800',
        Approved: 'bg-green-100 text-green-800',
        Rejected: 'bg-red-100 text-red-800',
    };
    return <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${styles[status]}`}>{status}</span>;
};


const LeaveManagement: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [claims, setClaims] = useState<ExtraWorkLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<LeaveRequestStatus | 'all' | 'claims'>('pending_manager_approval');
    const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('all');
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [actioningId, setActioningId] = useState<string | null>(null);
    const isMobile = useMediaQuery('(max-width: 767px)');
    const [isCompOffFeatureEnabled, setIsCompOffFeatureEnabled] = useState(true);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [claimToReject, setClaimToReject] = useState<ExtraWorkLog | null>(null);
    const [requestToCancel, setRequestToCancel] = useState<LeaveRequest | null>(null);
    const [finalConfirmationRole, setFinalConfirmationRole] = useState<string>('hr');

    useEffect(() => {
        const checkFeature = async () => {
            try {
                await api.checkCompOffTableExists();
                setIsCompOffFeatureEnabled(true);
            } catch (e) {
                setIsCompOffFeatureEnabled(false);
            }
        };
        const fetchSettings = async () => {
            try {
                const settings = await api.getApprovalWorkflowSettings();
                setFinalConfirmationRole(settings.finalConfirmationRole);
            } catch (e) {
                console.error('Failed to fetch approval settings:', e);
            }
        };
        const fetchUsers = async () => {
            try {
                const users = await api.getUsers();
                setAllUsers(users.map(u => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name)));
            } catch (e) {
                console.error('Failed to fetch users:', e);
            }
        };
        checkFeature();
        fetchSettings();
        fetchUsers();
    }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const isApprover = ['admin', 'hr', 'operation_manager', 'site_manager'].includes(user.role);
            
            // Determine filter based on role and current filter tab
            let leaveFilter: any = { 
                status: (filter !== 'all' && filter !== 'claims') ? filter : undefined,
                userId: selectedUserId !== 'all' ? selectedUserId : undefined,
                startDate: selectedDate || undefined,
                endDate: selectedDate || undefined
            };

            // Admin and HR see all requests. Managers see only their team's requests.
            if (user.role !== 'admin' && user.role !== 'hr') {
                // For managers, get their team's requests
                const teamMembers = await api.getTeamMembers(user.id);
                const teamIds = teamMembers.map(m => m.id);
                
                // If a specific user is selected, ensure they are in the team
                if (selectedUserId !== 'all') {
                    leaveFilter.userId = teamIds.includes(selectedUserId) ? selectedUserId : 'none';
                } else {
                    leaveFilter.userIds = teamIds;
                }
            }

            const claimsFilter = {
                status: isApprover ? 'Pending' : undefined,
                userId: selectedUserId !== 'all' ? selectedUserId : undefined,
                workDate: selectedDate || undefined
            };

            const [leaveData, claimsData] = await Promise.all([
                api.getLeaveRequests(leaveFilter),
                isApprover ? api.getExtraWorkLogs(claimsFilter) : Promise.resolve([])
            ]);

            setRequests(leaveData);
            setClaims(claimsData);
        } catch (error) {
            setToast({ message: 'Failed to load approval data.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    }, [user, filter]);

    useEffect(() => {
        fetchData();
    }, [fetchData, selectedUserId, selectedDate]);

    const handleAction = async (id: string, action: 'approve' | 'reject' | 'confirm') => {
        if (!user) return;
        setActioningId(id);
        try {
            switch (action) {
                case 'approve':
                    await api.approveLeaveRequest(id, user.id);
                    break;
                case 'reject':
                    await api.rejectLeaveRequest(id, user.id);
                    break;
                case 'confirm':
                    await api.confirmLeaveByHR(id, user.id);
                    break;
            }
            setToast({ message: `Request actioned successfully.`, type: 'success' });
            fetchData();
        } catch (error) {
            setToast({ message: 'Failed to update request.', type: 'error' });
        } finally {
            setActioningId(null);
        }
    };

    const handleApproveClaim = async (claimId: string) => {
        if (!user) return;
        setActioningId(claimId);
        try {
            await api.approveExtraWorkClaim(claimId, user.id);
            setToast({ message: 'Claim approved successfully.', type: 'success' });
            fetchData();
        } catch (error) {
            setToast({ message: 'Failed to approve claim.', type: 'error' });
        } finally {
            setActioningId(null);
        }
    };

    const handleRejectClaim = async (reason: string) => {
        if (!user || !claimToReject) return;
        setActioningId(claimToReject.id);
        try {
            await api.rejectExtraWorkClaim(claimToReject.id, user.id, reason);
            setToast({ message: 'Claim rejected successfully.', type: 'success' });
            fetchData();
        } catch (error) {
            setToast({ message: 'Failed to reject claim.', type: 'error' });
        } finally {
            setActioningId(null);
            setIsRejectModalOpen(false);
            setClaimToReject(null);
        }
    };


    const handleCancelLeave = async (reason: string) => {
        if (!user || !requestToCancel) return;
        setActioningId(requestToCancel.id);
        try {
            await api.cancelApprovedLeave(requestToCancel.id, user.id, reason);
            setToast({ message: 'Leave request cancelled successfully.', type: 'success' });
            fetchData();
        } catch (error) {
            setToast({ message: 'Failed to cancel leave request.', type: 'error' });
        } finally {
            setActioningId(null);
            setIsCancelModalOpen(false);
            setRequestToCancel(null);
        }
    };

    const filterTabs: Array<LeaveRequestStatus | 'all' | 'claims'> = ['pending_manager_approval', 'claims', 'pending_hr_confirmation', 'approved', 'rejected', 'all']
        .filter(tab => {
            // Hide 'pending_hr_confirmation' tab if finalConfirmationRole is 'reporting_manager'
            if (tab === 'pending_hr_confirmation' && finalConfirmationRole === 'reporting_manager') {
                return false;
            }
            return true;
        }) as Array<LeaveRequestStatus | 'all' | 'claims'>;

    const ActionButtons: React.FC<{ request: LeaveRequest }> = ({ request }) => {
        if (!user) return null;
        if (user.role === 'hr' && request.status !== 'pending_hr_confirmation') return null; // HR is mostly read-only

        // Allow cancellation of approved leaves by manager/admin
        if (request.status === 'approved') {
            const canCancel = (['admin', 'operation_manager', 'hr'].includes(user.role)) || (request.currentApproverId === user.id);
            if (canCancel) {
                return (
                    <Button 
                        size="sm" 
                        variant="icon" 
                        onClick={() => { setRequestToCancel(request); setIsCancelModalOpen(true); }} 
                        disabled={actioningId === request.id} 
                        title="Cancel Approved Leave" 
                        aria-label="Cancel approved leave"
                    >
                        <XCircle className="h-4 w-4 text-orange-600" />
                    </Button>
                );
            }
            return null;
        }

        if (request.status === 'rejected' || request.status === 'cancelled' || request.status === 'withdrawn') return null;

        const isMyTurn = request.currentApproverId === user.id || user.role === 'admin';

        if (isMyTurn) {
            if (request.status === 'pending_manager_approval') {
                return (
                    <div className="flex gap-2">
                        <Button size="sm" variant="icon" onClick={() => handleAction(request.id, 'approve')} disabled={actioningId === request.id} title="Approve" aria-label="Approve request"><Check className="h-4 w-4 text-green-600" /></Button>
                        <Button size="sm" variant="icon" onClick={() => handleAction(request.id, 'reject')} disabled={actioningId === request.id} title="Reject" aria-label="Reject request"><X className="h-4 w-4 text-red-600" /></Button>
                    </div>
                );
            }
            if (request.status === 'pending_hr_confirmation') {
                return (
                    <div className="flex gap-2">
                        <Button size="sm" variant="icon" onClick={() => handleAction(request.id, 'confirm')} disabled={actioningId === request.id} title="Confirm & Finalize" aria-label="Confirm and finalize request"><Check className="h-4 w-4 text-blue-600" /></Button>
                        <Button size="sm" variant="icon" onClick={() => handleAction(request.id, 'reject')} disabled={actioningId === request.id} title="Reject" aria-label="Reject request"><X className="h-4 w-4 text-red-600" /></Button>
                    </div>
                );
            }
        }
        return null;
    };

    const formatTabName = (tab: string) => tab.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    return (
        <div className="p-4 border-0 shadow-none md:bg-card md:p-6 md:rounded-xl md:shadow-card">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
            <RejectClaimModal
                isOpen={isRejectModalOpen}
                onClose={() => { setIsRejectModalOpen(false); setClaimToReject(null); }}
                onConfirm={handleRejectClaim}
                isConfirming={!!actioningId}
            />
            
            <RejectClaimModal
                isOpen={isCancelModalOpen}
                onClose={() => { setIsCancelModalOpen(false); setRequestToCancel(null); }}
                onConfirm={handleCancelLeave}
                isConfirming={!!actioningId}
                title="Cancel Approved Leave"
                label="Reason for cancellation"
            />

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-primary-text">Leave Approval Inbox</h2>
                {!isMobile && (
                    <Button
                        onClick={() => navigate('/hr/leave-management/grant-comp-off')}
                        disabled={!isCompOffFeatureEnabled}
                        title={!isCompOffFeatureEnabled ? "Feature disabled: 'comp_off_logs' table missing in database." : "Grant a compensatory off day"}
                        style={{ backgroundColor: '#006B3F', color: '#FFFFFF', borderColor: '#005632' }}
                        className="border hover:opacity-90 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                        <Plus className="mr-2 h-4 w-4" /> Grant Comp Off
                    </Button>
                )}
            </div>

            {isMobile && (
                <div className="mb-6">
                    <Button
                        onClick={() => navigate('/hr/leave-management/grant-comp-off')}
                        disabled={!isCompOffFeatureEnabled}
                        title={!isCompOffFeatureEnabled ? "Feature disabled: 'comp_off_logs' table missing in database." : "Grant a compensatory off day"}
                        style={{ backgroundColor: '#006B3F', color: '#FFFFFF', borderColor: '#005632' }}
                        className="w-full justify-center border hover:opacity-90 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                        <Plus className="mr-2 h-4 w-4" /> Grant Comp Off
                    </Button>
                </div>
            )}

            {/* Filter Bar */}
            <div className="bg-page/50 p-4 rounded-xl border border-border mb-6">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="w-full md:w-64">
                        <label className="block text-xs font-semibold text-muted uppercase mb-1.5 ml-1">Filter by Employee</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                            <select 
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-border text-primary-text focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all appearance-none"
                            >
                                <option value="all">All Employees</option>
                                {allUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                            </div>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-48">
                        <label className="block text-xs font-semibold text-muted uppercase mb-1.5 ml-1">Filter by Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                            <input 
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 rounded-lg bg-card border border-border text-primary-text focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button 
                            variant="secondary" 
                            onClick={() => { setSelectedUserId('all'); setSelectedDate(''); }}
                            className="h-[42px] px-4"
                            disabled={selectedUserId === 'all' && !selectedDate}
                        >
                            <FilterX className="h-4 w-4 mr-2" /> Clear
                        </Button>
                        <Button 
                            variant="primary" 
                            onClick={fetchData}
                            className="h-[42px] px-4"
                        >
                            Refresh
                        </Button>
                    </div>
                </div>
            </div>

            <div className="mb-6">
                <div className="w-full sm:w-auto md:border-b border-border">
                    <nav className="flex flex-col md:flex-row md:space-x-6 md:overflow-x-auto space-y-1 md:space-y-0" aria-label="Tabs">
                        {filterTabs.map(tab => (
                            <button
                                key={tab}
                                onClick={() => setFilter(tab)}
                                className={`whitespace-nowrap font-medium text-sm rounded-lg md:rounded-none w-full md:w-auto text-left md:text-center px-4 py-3 md:px-1 md:py-3 md:bg-transparent md:border-b-2 transition-colors duration-200
                                ${filter === tab
                                        ? 'bg-emerald-50 text-emerald-700 md:border-emerald-500 md:bg-transparent'
                                        : 'text-muted hover:bg-emerald-50 hover:text-emerald-700 md:border-transparent md:hover:border-emerald-500'
                                    }`}
                            >
                                {formatTabName(tab)}
                            </button>
                        ))}
                    </nav>
                </div>
            </div>

            {filter === 'claims' ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full responsive-table">
                        <thead>
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Employee</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Date & Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Claim</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Reason</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border md:bg-card md:divide-y-0">
                            {isLoading ? (
                                <tr><td colSpan={6} className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
                            ) : claims.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-10 text-muted">No pending claims found.</td></tr>
                            ) : (
                                claims.map(claim => (
                                    <tr key={claim.id}>
                                        <td data-label="Employee" className="px-4 py-3 font-medium">{claim.userName}</td>
                                        <td data-label="Date & Type" className="px-4 py-3 text-muted">{format(new Date(claim.workDate), 'dd MMM, yyyy')} ({claim.workType})</td>
                                        <td data-label="Claim" className="px-4 py-3 text-muted">{claim.claimType}{claim.claimType === 'OT' ? ` (${claim.hoursWorked} hrs)` : ''}</td>
                                        <td data-label="Reason" className="px-4 py-3 text-muted max-w-xs truncate">{claim.reason}</td>
                                        <td data-label="Status" className="px-4 py-3"><ClaimStatusChip status={claim.status} /></td>
                                        <td data-label="Actions" className="px-4 py-3">
                                            <div className="flex md:justify-start justify-end gap-2">
                                                <Button size="sm" variant="icon" onClick={() => handleApproveClaim(claim.id)} disabled={actioningId === claim.id} title="Approve Claim"><Check className="h-4 w-4 text-green-600" /></Button>
                                                <Button size="sm" variant="icon" onClick={() => { setClaimToReject(claim); setIsRejectModalOpen(true); }} disabled={actioningId === claim.id} title="Reject Claim"><X className="h-4 w-4 text-red-600" /></Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full responsive-table">
                        <thead>
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Employee</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Dates</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Raised On</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Reason</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border md:bg-card md:divide-y-0">
                            {isLoading ? (
                                isMobile
                                    ? <tr><td colSpan={6}><TableSkeleton rows={3} cols={6} isMobile /></td></tr>
                                    : <TableSkeleton rows={5} cols={6} />
                            ) : requests.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-10 text-muted">No requests found for this filter.</td></tr>
                            ) : (
                                requests.map(req => (
                                    <tr key={req.id}>
                                        <td data-label="Employee" className="px-4 py-3 font-medium">{req.userName}</td>
                                        <td data-label="Type" className="px-4 py-3 text-muted">{req.leaveType} {req.dayOption && `(${req.dayOption})`}</td>
                                        <td data-label="Dates" className="px-4 py-3 text-muted">{format(new Date(req.startDate.replace(/-/g, '/')), 'dd MMM')} - {format(new Date(req.endDate.replace(/-/g, '/')), 'dd MMM')}</td>
                                        <td data-label="Raised On" className="px-4 py-3 text-muted">{(req as any).createdAt ? format(new Date((req as any).createdAt), 'dd MMM, hh:mm a') : 'N/A'}</td>
                                        <td data-label="Reason" className="px-4 py-3 text-muted max-w-xs truncate">{req.reason}</td>
                                        <td data-label="Status" className="px-4 py-3"><StatusChip status={req.status} approverName={req.currentApproverName} approvalHistory={req.approvalHistory} /></td>
                                        <td data-label="Actions" className="px-4 py-3">
                                            <div className="flex md:justify-start justify-end">
                                                {actioningId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ActionButtons request={req} />}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default LeaveManagement;