

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import type { User } from '../../types';
import { ShieldCheck, Plus, Edit, Trash2, Info, UserCheck, MapPin, Search, FilterX, FileSpreadsheet, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import TableSkeleton from '../../components/skeletons/TableSkeleton';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import ApprovalModal from '../../components/admin/ApprovalModal';
import LocationAssignmentModal from '../../components/admin/LocationAssignmentModal';
import BulkEarnedLeaveModal from '../../components/admin/BulkEarnedLeaveModal';
import Pagination from '../../components/ui/Pagination';
import Input from '../../components/ui/Input';

const UserManagement: React.FC = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [totalUsers, setTotalUsers] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Column filters
    const [filterName, setFilterName] = useState('');
    const [filterEmail, setFilterEmail] = useState('');
    const [filterRole, setFilterRole] = useState('');
    const [filterSite, setFilterSite] = useState('');
    const [filterBiometricId, setFilterBiometricId] = useState('');

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [isBulkLeaveModalOpen, setIsBulkLeaveModalOpen] = useState(false);

    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentUserForLocation, setCurrentUserForLocation] = useState<User | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const isMobile = useMediaQuery('(max-width: 767px)');

    const hasActiveFilters = filterName || filterEmail || filterRole || filterSite || filterBiometricId;

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            if (hasActiveFilters) {
                // When filters are active, fetch ALL users for client-side filtering
                const allUsers = await api.getUsers();
                setUsers(allUsers);
                setTotalUsers(allUsers.length);
            } else {
                const res = await api.getUsers({ 
                    page: currentPage, 
                    pageSize,
                    search: searchTerm 
                });
                setUsers(res.data);
                setTotalUsers(res.total);
            }
        } catch (error) {
            setToast({ message: 'Failed to fetch users.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, pageSize, hasActiveFilters]);

    useEffect(() => {
        setCurrentPage(1);
    }, [pageSize, searchTerm]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleAdd = () => {
        navigate('/admin/users/add');
    };

    const handleEdit = (user: User) => {
        navigate(`/admin/users/edit/${user.id}`);
    };

    const handleApprove = (user: User) => {
        setCurrentUser(user);
        setIsApprovalModalOpen(true);
    };

    const handleDelete = (user: User) => {
        setCurrentUser(user);
        setIsDeleteModalOpen(true);
    };

    const handleManageLocations = (user: User) => {
        setCurrentUserForLocation(user);
        setIsLocationModalOpen(true);
    };

    const handleConfirmApproval = async (userId: string, newRole: string) => {
        setIsSaving(true);
        try {
            await api.approveUser(userId, newRole);
            setToast({ message: 'User approved and email confirmed successfully!', type: 'success' });
            setIsApprovalModalOpen(false);
            fetchUsers();
        } catch (error) {
            setToast({ message: 'Failed to approve user.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (currentUser) {
            setIsSaving(true);
            try {
                await api.deleteUser(currentUser.id);
                setToast({ message: 'User deleted. Remember to also remove them from Supabase Auth.', type: 'success' });
                setIsDeleteModalOpen(false);
                fetchUsers();
            } catch (error) {
                setToast({ message: 'Failed to delete user.', type: 'error' });
            } finally {
                setIsSaving(false);
            }
        }
    };

    const getRoleName = (role: string) => {
        return role ? role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A';
    }

    const getRoleBadgeClass = (role: string) => {
        switch (role) {
            case 'admin': return 'bg-purple-100 text-purple-700';
            case 'hr': return 'bg-blue-100 text-blue-700';
            case 'management': return 'bg-emerald-100 text-emerald-700';
            case 'site_manager': return 'bg-orange-100 text-orange-800';
            case 'field_staff': return 'bg-sky-100 text-sky-800';
            case 'finance': return 'bg-teal-100 text-teal-700';
            case 'developer': return 'bg-indigo-100 text-indigo-700';
            case 'operation_manager': return 'bg-rose-100 text-rose-700';
            case 'unverified': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-slate-100 text-slate-700';
        }
    };

    const clearAllFilters = () => {
        setFilterName('');
        setFilterEmail('');
        setFilterRole('');
        setFilterSite('');
        setFilterBiometricId('');
    };

    // Derive unique roles for dropdown
    const uniqueRoles = Array.from(new Set(users.map(u => u.role).filter(Boolean))).sort();

    const filteredUsers = users.filter(user => {
        if (filterName && !user.name?.toLowerCase().includes(filterName.toLowerCase())) return false;
        if (filterEmail && !user.email?.toLowerCase().includes(filterEmail.toLowerCase())) return false;
        if (filterRole && user.role !== filterRole) return false;
        if (filterSite && !(user.organizationName || '').toLowerCase().includes(filterSite.toLowerCase())) return false;
        if (filterBiometricId && !(user.biometricId || '').toLowerCase().includes(filterBiometricId.toLowerCase())) return false;
        return true;
    });

    return (
        <div className="p-4 border-0 shadow-none lg:bg-card lg:p-6 lg:rounded-xl lg:shadow-card">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            <ApprovalModal
                isOpen={isApprovalModalOpen}
                onClose={() => setIsApprovalModalOpen(false)}
                onApprove={handleConfirmApproval}
                user={currentUser}
                isConfirming={isSaving}
            />

            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Confirm Deletion"
                isConfirming={isSaving}
            >
                Are you sure you want to delete the user "{currentUser?.name}"? This action cannot be undone.
            </Modal>

            <LocationAssignmentModal
                isOpen={isLocationModalOpen}
                onClose={() => setIsLocationModalOpen(false)}
                userId={currentUserForLocation?.id || ''}
                userName={currentUserForLocation?.name || ''}
            />

            <BulkEarnedLeaveModal 
                isOpen={isBulkLeaveModalOpen}
                onClose={() => setIsBulkLeaveModalOpen(false)}
                onSuccess={() => {
                    setToast({ message: 'Bulk leave update successful!', type: 'success' });
                    fetchUsers();
                }}
            />

            <AdminPageHeader title="User Management">
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsBulkLeaveModalOpen(true)}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Bulk Update Leaves
                    </Button>
                    <Button onClick={handleAdd}><Plus className="mr-2 h-4 w-4" /> Add User</Button>
                </div>
            </AdminPageHeader>

            <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg text-sm">
                <div className="flex items-start">
                    <Info className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-semibold">Adding New Users</h4>
                        <p className="mt-1">
                            Use the <strong>Add User</strong> button below to create a new user. Provide their name, email, role and a temporary password. The system will automatically provision their login, send them a verification email and create their profile.
                        </p>
                        <p className="mt-2">
                            Once they confirm their email they can sign in using the password you set. You can edit or delete users at any time from this page.
                        </p>
                    </div>
                </div>
            </div>




            {/* Content Area */}
            {isLoading ? (
                <div className="w-full">
                    {/* Desktop Skeleton */}
                    <div className="hidden lg:block">
                        <TableSkeleton rows={5} cols={6} />
                    </div>
                    {/* Mobile/Tablet Skeleton */}
                    <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
                       {[1, 2, 3, 4].map(i => (
                           <div key={i} className="bg-card p-4 rounded-xl border border-border h-40 animate-pulse"></div>
                       ))}
                    </div>
                </div>
            ) : (
                <>
                    {/* Mobile/Tablet View - Cards Grid */}
                    <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredUsers.map((user) => (
                            <div key={user.id} className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col gap-3 h-full">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-semibold text-primary-text">{user.name}</h3>
                                        <p className="text-sm text-muted">{user.email}</p>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getRoleBadgeClass(user.role)}`}>
                                        {getRoleName(user.role)}
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-2 text-sm mt-1 flex-grow">
                                    <div>
                                        <span className="text-xs text-muted block">Site</span>
                                        <span className="font-medium text-primary-text">{user.organizationName || '-'}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted block">Biometric ID</span>
                                        <span className="font-mono text-primary-text">{user.biometricId || '-'}</span>
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-border flex justify-end gap-2 mt-auto">
                                    {user.role === 'unverified' && (
                                        <Button variant="outline" size="sm" onClick={() => handleApprove(user)} className="flex-1">
                                            <UserCheck className="h-4 w-4 mr-2" />Approve
                                        </Button>
                                    )}
                                    <Button variant="icon" size="sm" onClick={() => handleEdit(user)} className="h-9 w-9 border border-border rounded-lg">
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button variant="icon" size="sm" onClick={() => handleManageLocations(user)} className="h-9 w-9 border border-border rounded-lg">
                                        <MapPin className="h-4 w-4 text-emerald-500" />
                                    </Button>
                                    <Button variant="icon" size="sm" onClick={() => handleDelete(user)} className="h-9 w-9 border border-border rounded-lg hover:bg-red-50 text-red-500">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {filteredUsers.length === 0 && (
                            <div className="col-span-full text-center py-8 text-muted">
                                No users found{hasActiveFilters ? ' matching the current filters' : ''}.
                            </div>
                        )}
                    </div>

                    {/* Desktop View - Table */}
                    <div className="hidden lg:block overflow-x-auto max-w-full">
                        <table className="w-full table-auto responsive-table">
                            <thead>
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Name</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Email</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Role</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Site</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Biometric ID</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                                        <div className="flex items-center gap-2">
                                            Actions
                                            {hasActiveFilters && (
                                                <button onClick={clearAllFilters} className="text-red-500 hover:text-red-700 transition-colors" title="Clear all filters">
                                                    <FilterX className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </th>
                                </tr>
                                {/* Filter Row */}
                                <tr className="bg-gray-50/50">
                                    <th className="px-6 py-2">
                                        <input
                                            type="text"
                                            placeholder="Filter..."
                                            value={filterName}
                                            onChange={(e) => setFilterName(e.target.value)}
                                            className="w-full text-sm font-normal px-2 py-1.5 border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                        />
                                    </th>
                                    <th className="px-6 py-2">
                                        <input
                                            type="text"
                                            placeholder="Filter..."
                                            value={filterEmail}
                                            onChange={(e) => setFilterEmail(e.target.value)}
                                            className="w-full text-sm font-normal px-2 py-1.5 border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                        />
                                    </th>
                                    <th className="px-6 py-2">
                                        <select
                                            value={filterRole}
                                            onChange={(e) => setFilterRole(e.target.value)}
                                            className="w-full text-sm font-normal px-2 py-1.5 border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                        >
                                            <option value="">All Roles</option>
                                            {uniqueRoles.map(role => (
                                                <option key={role} value={role}>{getRoleName(role)}</option>
                                            ))}
                                        </select>
                                    </th>
                                    <th className="px-6 py-2">
                                        <input
                                            type="text"
                                            placeholder="Filter..."
                                            value={filterSite}
                                            onChange={(e) => setFilterSite(e.target.value)}
                                            className="w-full text-sm font-normal px-2 py-1.5 border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                        />
                                    </th>
                                    <th className="px-6 py-2">
                                        <input
                                            type="text"
                                            placeholder="Filter..."
                                            value={filterBiometricId}
                                            onChange={(e) => setFilterBiometricId(e.target.value)}
                                            className="w-full text-sm font-normal px-2 py-1.5 border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                        />
                                    </th>
                                    <th className="px-6 py-2"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border md:bg-card md:divide-y-0">
                                {filteredUsers.map((user) => (
                                    <tr key={user.id}>
                                        <td data-label="Name" className="px-6 py-4 font-medium">{user.name}</td>
                                        <td data-label="Email" className="px-6 py-4 text-sm text-muted">{user.email}</td>
                                        <td data-label="Role" className="px-6 py-4 text-sm text-muted">
                                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getRoleBadgeClass(user.role)}`}>
                                                {getRoleName(user.role)}
                                            </span>
                                            {user.role === 'unverified' && (
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 ml-2">Pending Approval</span>
                                            )}
                                        </td>
                                        <td data-label="Site" className="px-6 py-4 text-sm text-muted">
                                            {user.organizationName || '-'}
                                        </td>
                                        <td data-label="Biometric ID" className="px-6 py-4 text-sm font-mono text-muted">
                                            {user.biometricId || '-'}
                                        </td>
                                        <td data-label="Actions" className="px-6 py-4">
                                            <div className="flex items-center gap-2 md:justify-start justify-end">
                                                {user.role === 'unverified' && (
                                                    <Button variant="outline" size="sm" onClick={() => handleApprove(user)} aria-label={`Approve user ${user.name}`} title={`Approve user ${user.name}`}><UserCheck className="h-4 w-4 mr-2" />Approve</Button>
                                                )}
                                                <Button variant="icon" size="sm" onClick={() => handleEdit(user)} aria-label={`Edit user ${user.name}`} title={`Edit user ${user.name}`}><Edit className="h-4 w-4" /></Button>
                                                <Button variant="icon" size="sm" onClick={() => handleManageLocations(user)} aria-label={`Manage Geofencing for ${user.name}`} title={`Manage Geofencing for ${user.name}`}><MapPin className="h-4 w-4 text-emerald-500" /></Button>
                                                <Button variant="icon" onClick={() => handleDelete(user)} aria-label={`Delete user ${user.name}`} title={`Delete user ${user.name}`} className="p-2 hover:bg-red-500/10 rounded-full transition-colors"><Trash2 className="h-5 w-5 text-red-500" /></Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {!hasActiveFilters && (
                <Pagination 
                    currentPage={currentPage}
                    totalItems={totalUsers}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                    className="mt-6"
                />
            )}
            {hasActiveFilters && filteredUsers.length > 0 && (
                <div className="mt-4 text-sm text-muted text-center">
                    Showing {filteredUsers.length} of {users.length} total users
                </div>
            )}
        </div>
    );
};

export default UserManagement;
