import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, SubmitHandler, Resolver } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAuthStore } from '../../store/authStore';
import { usePermissionsStore } from '../../store/permissionsStore';
import type { User, UploadedFile } from '../../types';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import { api } from '../../services/api';
import { User as UserIcon, Loader2, ClipboardList, LogOut, LogIn, Crosshair, CheckCircle } from 'lucide-react';
import { AvatarUpload } from '../../components/onboarding/AvatarUpload';
import { format } from 'date-fns';
import Modal from '../../components/ui/Modal';

import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useThemeStore } from '../../store/themeStore';
import Checkbox from '../../components/ui/Checkbox';

// --- Profile Section ---
const profileValidationSchema = yup.object({
    name: yup.string().required('Name is required'),
    email: yup.string().email('Must be a valid email').required('Email is required'),
    phone: yup.string().matches(/^[6-9][0-9]{9}$/, 'Must be a valid 10-digit Indian mobile number').optional().nullable(),
}).defined();

type ProfileFormData = Pick<User, 'name' | 'email' | 'phone'>;


// --- Main Component ---
const ProfilePage: React.FC = () => {
    const { user, updateUserProfile, isCheckedIn, isAttendanceLoading, toggleCheckInStatus, logout, lastCheckInTime, lastCheckOutTime, checkAttendanceStatus } = useAuthStore();
    const { permissions } = usePermissionsStore();
    const navigate = useNavigate();
    const { theme, setTheme, isAutomatic, setAutomatic } = useThemeStore();

    const [isSaving, setIsSaving] = useState(false);
    const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');

    const isMobile = useMediaQuery('(max-width: 767px)');
    const isMobileView = isMobile; // Apply mobile view for all users on mobile
    // const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false); // Removed modal state
    // const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false); // Removed modal state
    // const [confirmationAction, setConfirmationAction] = useState<'check-in' | 'check-out' | null>(null); // Removed modal state

    useEffect(() => {
        const checkPermissions = async () => {
            if (!navigator.permissions?.query) {
                setPermissionStatus('prompt');
                return;
            }
            try {
                const cameraStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
                const locationStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });

                if (cameraStatus.state === 'granted' && locationStatus.state === 'granted') {
                    setPermissionStatus('granted');
                } else if (cameraStatus.state === 'denied' || locationStatus.state === 'denied') {
                    setPermissionStatus('denied');
                } else {
                    setPermissionStatus('prompt');
                }

                const updateStatus = () => checkPermissions();
                cameraStatus.onchange = updateStatus;
                locationStatus.onchange = updateStatus;

            } catch (e) {
                console.warn("Permissions API not fully supported. Defaulting to 'prompt'.", e);
                setPermissionStatus('prompt');
            }
        };

        checkPermissions();
    }, []);

    const requestPermissions = async () => {
        let cameraOk = false;
        let locationOk = false;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(track => track.stop());
            cameraOk = true;
        } catch (err) {
            console.error("Camera permission denied:", err);
        }

        try {
            await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
            });
            locationOk = true;
        } catch (err) {
            console.error("Location permission denied:", err);
        }

        if (cameraOk && locationOk) {
            setPermissionStatus('granted');
            // Only show toast if we were not already granted
            if (permissionStatus !== 'granted') {
                setToast({ message: 'Camera and Location permissions granted!', type: 'success' });
            }
        } else {
            setPermissionStatus('denied');
            let message = 'Permissions were not fully granted. ';
            if (!cameraOk) message += 'Camera access is needed. ';
            if (!locationOk) message += 'Location access is needed.';
            setToast({ message, type: 'error' });
        }
    };

    // Profile form
    const { register, handleSubmit: handleProfileSubmit, formState: { errors: profileErrors, isDirty }, getValues, trigger, reset } = useForm<ProfileFormData>({
        resolver: yupResolver(profileValidationSchema) as Resolver<ProfileFormData>,
        defaultValues: { name: user?.name || '', email: user?.email || '', phone: user?.phone || '' },
    });

    // Effect to keep form synchronized with global user state
    useEffect(() => {
        if (user) {
            reset({
                name: user.name || '',
                email: user.email || '',
                phone: user.phone || ''
            });
        }
    }, [user, reset]);

    const handlePhotoChange = async (file: UploadedFile | null) => {
        if (!user) return;
        const originalPhotoUrl = user.photoUrl;

        // Optimistically update UI
        updateUserProfile({ photoUrl: file?.preview });

        try {
            let dataUrlForApi: string | null = null;
            if (file && file.file) {
                // Convert file to data URL for the API
                dataUrlForApi = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file.file);
                });
            }

            // Call API which handles upload to Supabase Storage and DB update
            const updatedUser = await api.updateUser(user.id, { photoUrl: dataUrlForApi });

            // Final update with permanent Supabase URL
            updateUserProfile(updatedUser);
            setToast({ message: `Profile photo ${dataUrlForApi ? 'updated' : 'removed'}.`, type: 'success' });
        } catch (e) {
            console.error(e);
            setToast({ message: 'Failed to save photo.', type: 'error' });
            updateUserProfile({ photoUrl: originalPhotoUrl }); // Revert on failure
        }
    };

    const onProfileSubmit: SubmitHandler<ProfileFormData> = async (formData) => {
        if (!user) return;
        setIsSaving(true);
        try {
            const updatedUser = await api.updateUser(user.id, formData);
            updateUserProfile(updatedUser);
            // Reset the form with the new data to clear the 'dirty' state
            reset(formData);
            setToast({ message: 'Profile updated successfully!', type: 'success' });
        } catch (error) {
            setToast({ message: 'Failed to update profile.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAttendanceAction = async () => {
        setIsSubmittingAttendance(true);
        const { success, message } = await toggleCheckInStatus();
        setToast({ message, type: success ? 'success' : 'error' });
        setIsSubmittingAttendance(false);
    };

    // handleSlideConfirm, handleConfirmAction, handleCancelAction removed - now using navigation

    const isActionInProgress = isSubmittingAttendance; // removed isConfirmationModalOpen

    const handleLogoutClick = () => {
        // Navigate to the dedicated logout page instead of opening a modal
        navigate('/auth/logout');
    };

    // handleConfirmLogout removed as it's now handled in LogoutPage.tsx

    const formatTime = (isoString: string | null) => {
        if (!isoString) return '--:--';
        return format(new Date(isoString), 'hh:mm a');
    };

    const canManageTasks = user && permissions[user.role]?.includes('manage_tasks');
    const tasksLink = canManageTasks ? '/tasks' : '/onboarding/tasks';
    const getRoleName = (role: string) => role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    if (!user) return <div>Loading user profile...</div>;

    const avatarFile: UploadedFile | null = user.photoUrl
        ? { preview: user.photoUrl, name: 'Profile Photo', type: 'image/jpeg', size: 0 }
        : null;

    if (isMobileView) {
        return (
            <div className="p-4 space-y-8 md:bg-transparent bg-[#041b0f]">
                {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
                {/* Logout Modal removed */}
                {/* Attendance Confirmation Modal removed */}

                <div className="flex flex-col items-center text-center gap-4">
                    <AvatarUpload file={avatarFile} onFileChange={handlePhotoChange} />
                    <div>
                        <h2 className="text-2xl font-bold">{user.name}</h2>
                        <p className="text-muted">{user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <section>
                        <h3 className="fo-section-title mb-4">Profile Details</h3>
                        <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
                            <Input label="Full Name" id="name" error={profileErrors.name?.message} registration={register('name')} />
                            <Input label="Email Address" id="email" type="email" error={profileErrors.email?.message} registration={register('email')} readOnly className="!bg-gray-700/50" />
                            <Input label="Phone Number" id="phone" type="tel" error={profileErrors.phone?.message} registration={register('phone')} />
                            <div className="flex justify-end pt-2"><Button type="submit" isLoading={isSaving} disabled={!isDirty}>Save Changes</Button></div>
                        </form>
                    </section>

                    <section className="hidden md:block">
                        <h3 className="fo-section-title mb-4">Appearance</h3>
                        <div className="p-4 rounded-lg bg-[#041b0f] md:bg-[#243524] border border-[#374151] space-y-4">
                            <Checkbox
                                id="theme-automatic-mobile"
                                label="Automatic"
                                description="Switch themes based on screen size."
                                checked={isAutomatic}
                                onChange={(e) => setAutomatic(e.target.checked)}
                            />
                            <Checkbox
                                id="theme-dark-mode-mobile"
                                label="Dark Mode"
                                description="Manually enable or disable dark mode."
                                checked={theme === 'dark'}
                                onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
                                disabled={isAutomatic}
                            />
                        </div>
                    </section>

                    <section>
                        <h3 className="fo-section-title mb-4">Work Hours Tracking</h3>
                        <div className="fo-attendance-card space-y-4">
                            <div className="flex justify-around">
                                <div className="text-center">
                                    <p className="fo-attendance-time">Last Check In</p>
                                    <p className="fo-attendance-time"><strong>{formatTime(lastCheckInTime)}</strong></p>
                                </div>
                                <div className="text-center">
                                    <p className="fo-attendance-time">Last Check Out</p>
                                    <p className="fo-attendance-time"><strong>{formatTime(lastCheckOutTime)}</strong></p>
                                </div>
                            </div>

                            {isAttendanceLoading ? (
                                <div className="flex items-center justify-center text-muted h-[56px]"><Loader2 className="h-6 w-6 animate-spin" /></div>
                            ) : (
                                <div className="flex gap-3">
                                    <Button
                                        onClick={() => navigate('/attendance/check-in')}
                                        variant="primary"
                                        className="flex-1 !py-4 text-lg font-bold shadow-lg transition-all rounded-2xl"
                                        disabled={isCheckedIn || isActionInProgress}
                                    >
                                        <LogIn className="mr-3 h-6 w-6" /> Check In
                                    </Button>
                                    <Button
                                        onClick={() => navigate('/attendance/check-out')}
                                        variant="danger"
                                        className="flex-1 !py-4 text-lg font-bold shadow-lg transition-all rounded-2xl"
                                        disabled={!isCheckedIn || isActionInProgress}
                                    >
                                        <LogOut className="mr-3 h-6 w-6" /> Check Out
                                    </Button>
                                </div>
                            )}
                        </div>
                    </section>

                    <section>
                        <h3 className="fo-section-title mb-4">Account Actions</h3>
                        <div className="space-y-4">
                            <Button onClick={() => navigate('/leaves/dashboard')} variant="secondary" className="w-full justify-center !py-3" title="View your leave history and balances"><Crosshair className="mr-2 h-5 w-5" /> Leave Tracker</Button>
                            <Button onClick={handleLogoutClick} variant="danger" className="w-full justify-center !py-3"><LogOut className="mr-2 h-5 w-5" /> Log Out</Button>
                        </div>
                    </section>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full space-y-8">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
            {/* Logout Modal removed */}
            {/* Attendance Confirmation Modal removed */}

            <div className="relative overflow-hidden md:bg-white md:p-6 md:rounded-2xl md:shadow-lg flex flex-col md:flex-row items-center gap-6 border border-gray-100">
                <div className="absolute top-0 left-0 w-full h-32 bg-[#006b3f] border-b-4 border-[#005632] shadow-lg"></div>
                <div className="relative z-10">
                    <AvatarUpload file={avatarFile} onFileChange={handlePhotoChange} />
                </div>
                <div className="text-center md:text-left relative z-10 flex-1 mt-16 md:mt-0">
                    <h2 className="text-2xl md:text-3xl font-bold text-primary-text tracking-tight">{user.name}</h2>
                    <div className="flex items-center justify-center md:justify-start gap-2 mt-1.5">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs md:text-sm font-medium">
                            {getRoleName(user.role)}
                        </span>
                    </div>
                    <p className="text-gray-500 mt-1.5 font-medium text-sm md:text-base">{user.email}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="md:bg-white md:p-6 md:rounded-2xl md:shadow-lg border border-gray-100">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-1.5 bg-blue-50 rounded-lg">
                                <UserIcon className="h-5 w-5 text-blue-600" />
                            </div>
                            <h3 className="text-lg md:text-xl font-bold text-gray-900">Profile Details</h3>
                        </div>
                        <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <Input label="Full Name" id="name" error={profileErrors.name?.message} registration={register('name')} className="bg-gray-50 border-gray-200 focus:bg-white transition-colors" />
                                <Input label="Phone Number" id="phone" type="tel" error={profileErrors.phone?.message} registration={register('phone')} className="bg-gray-50 border-gray-200 focus:bg-white transition-colors" />
                                <div className="md:col-span-2">
                                    <Input label="Email Address" id="email" type="email" error={profileErrors.email?.message} registration={register('email')} readOnly className="bg-gray-100/50 text-gray-500 cursor-not-allowed border-gray-200" />
                                </div>
                            </div>
                            <div className="flex justify-end pt-3 border-t border-gray-100">
                                <Button type="submit" isLoading={isSaving} disabled={!isDirty} className="px-6">Save Changes</Button>
                            </div>
                        </form>
                    </div>

                    <div className="md:bg-white md:p-6 md:rounded-2xl md:shadow-lg border border-gray-100">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-1.5 bg-purple-50 rounded-lg">
                                <ClipboardList className="h-5 w-5 text-purple-600" />
                            </div>
                            <h3 className="text-lg md:text-xl font-bold text-gray-900">Work Hours Tracking</h3>
                        </div>
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-5">
                                <div className="text-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-xl border border-gray-200">
                                    <p className="text-xs md:text-sm font-medium text-gray-500 mb-1">Last Check In</p>
                                    <p className="text-2xl md:text-3xl font-bold text-emerald-600">{formatTime(lastCheckInTime)}</p>
                                </div>
                                <div className="text-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-xl border border-gray-200">
                                    <p className="text-xs md:text-sm font-medium text-gray-500 mb-1">Last Check Out</p>
                                    <p className="text-2xl md:text-3xl font-bold text-rose-600">{formatTime(lastCheckOutTime)}</p>
                                </div>
                            </div>

                            {isAttendanceLoading ? (
                                <div className="flex items-center justify-center h-[56px] bg-gray-50 rounded-xl"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                            ) : (
                                <div className="flex gap-4">
                                    <Button
                                        onClick={() => navigate('/attendance/check-in')}
                                        variant="primary"
                                        className="flex-1 !py-3 text-base md:text-lg shadow-lg shadow-emerald-100 hover:shadow-emerald-200 transition-all"
                                        disabled={isCheckedIn || isActionInProgress}
                                    >
                                        <LogIn className="mr-2 h-5 w-5" /> Check In
                                    </Button>
                                    <Button
                                        onClick={() => navigate('/attendance/check-out')}
                                        variant="danger"
                                        className="flex-1 !py-3 text-base md:text-lg shadow-lg shadow-red-100 hover:shadow-red-200 transition-all"
                                        disabled={!isCheckedIn || isActionInProgress}
                                    >
                                        <LogOut className="mr-2 h-5 w-5" /> Check Out
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="md:bg-white md:p-6 md:rounded-2xl md:shadow-lg border border-gray-100">
                        <h3 className="text-lg font-bold mb-4 text-gray-900">Appearance</h3>
                        <div className="space-y-4">
                            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                                <Checkbox id="theme-automatic-desktop" label="Automatic" description="Switch themes based on screen size." checked={isAutomatic} onChange={(e) => setAutomatic(e.target.checked)} />
                            </div>
                            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                                <Checkbox id="theme-dark-mode-desktop" label="Dark Mode" description="Manually enable or disable dark mode." checked={theme === 'dark'} onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')} disabled={isAutomatic} />
                            </div>
                        </div>
                    </div>
                    <div className="md:bg-white md:p-6 md:rounded-2xl md:shadow-lg border border-gray-100">
                        <h3 className="text-lg font-bold mb-4 text-gray-900">Account Actions</h3>
                        <div className="space-y-3">
                            <Button onClick={() => navigate('/leaves/dashboard')} variant="secondary" className="w-full justify-center py-3 bg-gray-50 hover:bg-gray-100 border-gray-200" title="View your leave history and balances"><Crosshair className="mr-2 h-4 w-4" /> Leave Tracker</Button>
                            <Button onClick={handleLogoutClick} variant="danger" className="w-full justify-center py-3" isLoading={isSaving}><LogOut className="mr-2 h-4 w-4" /> Log Out</Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;