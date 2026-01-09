import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import type { User, UserRole, Role } from '../../types';
import { Loader2, Save, Table, Network, Maximize2 } from 'lucide-react';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import WorkflowChart2D from '../../components/admin/WorkflowChart2D';
import OrgWorkflowCard from '../../components/admin/OrgWorkflowCard';


type UserWithManager = User & { managerName?: string };

type ViewTab = 'table' | '2d';

const ApprovalWorkflow: React.FC = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState<UserWithManager[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [finalConfirmationRole, setFinalConfirmationRole] = useState<UserRole>('hr');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [activeTab, setActiveTab] = useState<ViewTab>('table');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [usersData, settingsData, rolesData] = await Promise.all([
                api.getUsersWithManagers(),
                api.getApprovalWorkflowSettings(),
                api.getRoles()
            ]);
            setUsers(usersData);
            setFinalConfirmationRole(settingsData.finalConfirmationRole);
            // Filter to only show roles that can be approvers
            setRoles(rolesData.filter(r => ['admin', 'hr', 'operation_manager'].includes(r.id)));
        } catch (error) {
            setToast({ message: 'Failed to load workflow data.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleManagerChange = (userId: string, managerId: string) => {
        setUsers(currentUsers =>
            currentUsers.map(u => u.id === userId ? { ...u, reportingManagerId: managerId || undefined } : u)
        );
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await Promise.all(users.map(u => api.updateUserReportingManager(u.id, u.reportingManagerId || null)));
            await api.updateApprovalWorkflowSettings(finalConfirmationRole);
            setToast({ message: 'Workflow saved successfully!', type: 'success' });
            fetchData(); // re-fetch to confirm names
        } catch (error) {
            setToast({ message: 'Failed to save workflow.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-4 border-0 shadow-none md:bg-card md:p-8 md:rounded-xl md:shadow-card">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            <AdminPageHeader title="Leave Approval Settings">
                <Button onClick={handleSave} isLoading={isSaving}><Save className="mr-2 h-4 w-4" /> Save Workflow</Button>
            </AdminPageHeader>

            <section className="mb-8">
                <h3 className="text-xl font-bold text-primary-text mb-2">Final Confirmation Step</h3>
                <p className="text-sm text-muted mb-4">Select the role responsible for the final confirmation of a leave request after it has been approved by the reporting manager chain.</p>
                <div className="max-w-xs">
                    <Select
                        label="Final Confirmation Role"
                        id="final-approver"
                        value={finalConfirmationRole}
                        onChange={e => setFinalConfirmationRole(e.target.value as UserRole)}
                    >
                        {roles.map(role => <option key={role.id} value={role.id}>{role.displayName}</option>)}
                    </Select>
                </div>
            </section>

            <section>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-primary-text mb-1">Reporting Structure</h3>
                        <p className="text-sm text-muted">View and manage organizational hierarchy</p>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="border-b border-border mb-6">
                    <div className="flex gap-1 overflow-x-auto">
                        <button
                            onClick={() => setActiveTab('table')}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${activeTab === 'table'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted hover:text-primary-text hover:border-border'
                                }`}
                        >
                            <Table className="w-4 h-4" />
                            Table View
                        </button>
                        <button
                            onClick={() => setActiveTab('2d')}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${activeTab === '2d'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted hover:text-primary-text hover:border-border'
                                }`}
                        >
                            <Network className="w-4 h-4" />
                            2D Workflow Chart
                        </button>

                    </div>
                </div>

                {/* Tab Content */}
                {isLoading ? (
                    <div className="flex justify-center items-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-muted" />
                    </div>
                ) : (
                    <>
                        {/* Table View */}
                        {activeTab === 'table' && (
                            <>
                                <p className="text-sm text-muted mb-4">For each employee, assign a reporting manager. Leave requests will be sent to this manager for first-level approval.</p>
                                <div className="overflow-x-auto hidden md:block border border-border rounded-lg">
                                    <table className="min-w-full">
                                        <thead className="bg-page">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Employee</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Role</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase w-1/2">Reporting Manager</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-card divide-y divide-border">
                                            {users.map(user => (
                                                <tr key={user.id}>
                                                    <td className="px-6 py-4 font-medium text-primary-text">{user.name}</td>
                                                    <td className="px-6 py-4 text-sm text-muted capitalize">{roles.find(r => r.id === user.role)?.displayName || user.role.replace(/_/g, ' ')}</td>
                                                    <td className="px-6 py-4">
                                                        <Select
                                                            label=""
                                                            id={`manager-for-desktop-${user.id}`}
                                                            value={user.reportingManagerId || ''}
                                                            onChange={e => handleManagerChange(user.id, e.target.value)}
                                                            className="w-full"
                                                        >
                                                            <option value="">None (Reports to Final Approver)</option>
                                                            {users.filter(m => m.id !== user.id).map(manager => (
                                                                <option key={manager.id} value={manager.id}>{manager.name}</option>
                                                            ))}
                                                        </Select>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="space-y-3 md:hidden">
                                    {users.map(user => (
                                        <div key={user.id} className="bg-card rounded-lg border border-border overflow-hidden">
                                            <div className="p-3">
                                                <p className="font-semibold text-primary-text">{user.name}</p>
                                                <p className="text-sm text-muted capitalize">{roles.find(r => r.id === user.role)?.displayName || user.role.replace(/_/g, ' ')}</p>
                                            </div>
                                            <div className="p-3 border-t border-border">
                                                <label className="text-sm text-muted block mb-1">Manager</label>
                                                <Select
                                                    id={`manager-for-mobile-${user.id}`}
                                                    value={user.reportingManagerId || ''}
                                                    onChange={e => handleManagerChange(user.id, e.target.value)}
                                                >
                                                    <option value="">None</option>
                                                    {users.filter(m => m.id !== user.id).map(manager => (
                                                        <option key={manager.id} value={manager.id}>{manager.name}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* 2D Workflow Chart */}
                        {activeTab === '2d' && (
                            <OrgWorkflowCard users={users} />
                        )}


                    </>
                )}
            </section>
        </div>
    );
};

export default ApprovalWorkflow;