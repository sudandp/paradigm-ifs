

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import type { User } from '../../types';
import { ShieldCheck, Plus, Edit, Trash2, Info, UserCheck, MapPin } from 'lucide-react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import TableSkeleton from '../../components/skeletons/TableSkeleton';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import ApprovalModal from '../../components/admin/ApprovalModal';
import LocationAssignmentModal from '../../components/admin/LocationAssignmentModal';

const UserManagement: React.FC = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentUserForLocation, setCurrentUserForLocation] = useState<User | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const isMobile = useMediaQuery('(max-width: 767px)');

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await api.getUsers();
            setUsers(data);
        } catch (error) {
            setToast({ message: 'Failed to fetch users.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    }, []);

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
            await api.updateUser(userId, { role: newRole });
            setToast({ message: 'User approved successfully!', type: 'success' });
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

    return (
        <div className="p-4 border-0 shadow-none md:bg-card md:p-6 md:rounded-xl md:shadow-card">
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

            <AdminPageHeader title="User Management">
                <Button onClick={handleAdd}><Plus className="mr-2 h-4 w-4" /> Add User</Button>
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

            <div className="overflow-x-auto">
                <table className="min-w-full responsive-table">
                    <thead>
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Name</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Email</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Role</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Site</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Biometric ID</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border md:bg-card md:divide-y-0">
                        {isLoading ? (
                            isMobile
                                ? <tr><td colSpan={6}><TableSkeleton rows={3} cols={6} isMobile /></td></tr>
                                : <TableSkeleton rows={5} cols={6} />
                        ) : users.map((user) => (
                            <tr key={user.id}>
                                <td data-label="Name" className="px-6 py-4 font-medium">{user.name}</td>
                                <td data-label="Email" className="px-6 py-4 text-sm text-muted">{user.email}</td>
                                <td data-label="Role" className="px-6 py-4 text-sm text-muted">
                                    {getRoleName(user.role)}
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
        </div>
    );
};

export default UserManagement;
