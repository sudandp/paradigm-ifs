import React, { useState, useEffect, useRef } from 'react';
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
import { dispatchNotificationFromRules } from '../../services/notificationService';
import { User as UserIcon, Loader2, ClipboardList, LogOut, LogIn, Crosshair, CheckCircle, Info, MapPin, AlertTriangle, Clock, Lock } from 'lucide-react';
import { AvatarUpload } from '../../components/onboarding/AvatarUpload';
import { format } from 'date-fns';
import Modal from '../../components/ui/Modal';

import { useMediaQuery } from '../../hooks/useMediaQuery';
import { isAdmin } from '../../utils/auth';

// --- Profile Section ---
const profileValidationSchema = yup.object({
    name: yup.string().required('Name is required'),
    email: yup.string().email('Must be a valid email').required('Email is required'),
    phone: yup.string().matches(/^[6-9][0-9]{9}$/, 'Must be a valid 10-digit Indian mobile number').optional().nullable(),
}).defined();

type ProfileFormData = Pick<User, 'name' | 'email' | 'phone'>;


// --- Main Component ---
const ProfilePage: React.FC = () => {
    const { 
        user, 
        updateUserProfile, 
        isCheckedIn, 
        isOnBreak,
        isAttendanceLoading, 
        toggleCheckInStatus, 
        logout, 
        lastCheckInTime, 
        lastCheckOutTime,
        firstBreakInTime,
        lastBreakInTime,
        lastBreakOutTime,
        totalBreakDurationToday,
        totalWorkingDurationToday,
        checkAttendanceStatus,
        dailyPunchCount,
        isFieldCheckedIn,
        isFieldCheckedOut
    } = useAuthStore();
    const { permissions } = usePermissionsStore();
    const navigate = useNavigate();

    const [isSaving, setIsSaving] = useState(false);
    const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
    const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');
    
    // Interactive Hints State
    const [showPunchHint, setShowPunchHint] = useState(false);
    const [showBreakHint, setShowBreakHint] = useState(false);
    
    // Unlock Request State
    const [unlockRequestStatus, setUnlockRequestStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');

    // Punch Restriction: 1 punch-in per day, unlimited unlock requests (1st=duty, 2nd+=OT)
    const hasPunchedToday = (dailyPunchCount || 0) >= 1;
    const isPunchUnlocked = useAuthStore(s => s.isPunchUnlocked);
    const dailyUnlockRequestCount = useAuthStore(s => s.dailyUnlockRequestCount);
    const approvedUnlockCount = useAuthStore(s => s.approvedUnlockCount);
    
    // Blocked if: Punched Today AND Not Currently Checked In (office or field) AND Not Unlocked
    const isPunchBlocked = hasPunchedToday && !isCheckedIn && !isFieldCheckedIn && !isPunchUnlocked;
    // Combined check-in state: true if user is checked in via either office or field
    const effectivelyCheckedIn = isCheckedIn || isFieldCheckedIn;
    // Is the next unlock request for OT? (1st request = duty, 2nd+ = OT)
    const isNextRequestOT = dailyUnlockRequestCount >= 1;

    const punchHintTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const breakHintTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    const isFieldStaff = user?.role === 'field_staff';

    // Check for existing unlock request
    // Check for existing unlock request on mount/update
    useEffect(() => {
        if (hasPunchedToday && !isPunchUnlocked) {
            api.getMyUnlockRequest().then(req => {
                if (req) {
                    setUnlockRequestStatus(req.status);
                    // Sync store if approved
                    if (req.status === 'approved') {
                        checkAttendanceStatus();
                    }
                }
            });
        }
    }, [hasPunchedToday, isPunchUnlocked, checkAttendanceStatus]);

    // Poll for status update if pending (Real-time update)
    useEffect(() => {
        if (unlockRequestStatus === 'pending') {
            const interval = setInterval(() => {
                 api.getMyUnlockRequest().then(req => {
                    if (req) {
                        setUnlockRequestStatus(req.status);
                        if (req.status === 'approved') {
                            checkAttendanceStatus();
                        }
                    }
                });
            }, 5000); // Check every 5 seconds for faster feedback
            return () => clearInterval(interval);
        }
    }, [unlockRequestStatus, checkAttendanceStatus]);

    // Show warning toast for blocked punch
    useEffect(() => {
        if (isPunchBlocked && unlockRequestStatus !== 'pending') {
            setToast({ 
                message: isNextRequestOT
                    ? 'Request manager approval for overtime (OT) punch.'
                    : 'One punch-in allowed per day. Request approval for emergency punch.', 
                type: 'warning' 
            });
        }
    }, [isPunchBlocked, unlockRequestStatus, isNextRequestOT]);

    const isMobile = useMediaQuery('(max-width: 767px)');
    const isMobileView = isMobile; // Apply mobile view for all users on mobile

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

    const isActionInProgress = isSubmittingAttendance;

    const handleLogoutClick = () => {
        window.location.hash = '#/auth/logout';
    };

    const formatTime = (isoString: string | null) => {
        if (!isoString) return '--:--';
        return format(new Date(isoString), 'hh:mm a');
    };

    const handleToggleHint = (type: 'punch' | 'break') => {
        if (type === 'punch') {
            if (punchHintTimeoutRef.current) clearTimeout(punchHintTimeoutRef.current);
            setShowPunchHint(true);
            punchHintTimeoutRef.current = setTimeout(() => setShowPunchHint(false), 10000);
        } else {
            if (breakHintTimeoutRef.current) clearTimeout(breakHintTimeoutRef.current);
            setShowBreakHint(true);
            breakHintTimeoutRef.current = setTimeout(() => setShowBreakHint(false), 10000);
        }
    };

    const canManageTasks = user && (isAdmin(user.role) || permissions[user.role]?.includes('manage_tasks'));
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

                <div className="flex flex-col items-center text-center gap-4">
                    <AvatarUpload file={avatarFile} onFileChange={handlePhotoChange} />
                    <div className="space-y-1">
                        <h2 className="text-2xl font-bold text-white">{user.name}</h2>
                        <p className="text-emerald-400/90 font-medium text-sm">{user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <section>
                        <h3 className="fo-section-title mb-4">Profile Details</h3>
                        <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
                            <Input label="Full Name" id="name" error={profileErrors.name?.message} registration={register('name')} autoComplete="name" />
                            <Input label="Email Address" id="email" type="email" error={profileErrors.email?.message} registration={register('email')} readOnly className="!bg-gray-700/50" autoComplete="email" />
                            <Input label="Phone Number" id="phone" type="tel" error={profileErrors.phone?.message} registration={register('phone')} autoComplete="tel" />
                            <div className="flex justify-end pt-2"><Button type="submit" isLoading={isSaving} disabled={!isDirty}>Save Changes</Button></div>
                        </form>
                    </section>


                    {user.role !== 'management' && (
                        <section className={`relative transition-all duration-500 ${isOnBreak ? 'ring-2 ring-rose-500 ring-offset-2 ring-offset-[#041b0f] rounded-2xl' : ''}`}>
                            {isOnBreak && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 bg-rose-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg shadow-rose-900/50 animate-pulse uppercase tracking-tighter">
                                    Active Break
                                </div>
                            )}
                            <h3 className="fo-section-title mb-4">Work Hours Tracking</h3>
                            <div className="bg-[#0f291e]/80 backdrop-blur-md rounded-2xl border border-white/5 p-5 shadow-xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                                
                                {/* 2x2 Grid for Attendance Times */}
                                <div className="grid grid-cols-2 gap-3 mb-6 relative z-10">
                                    <div className="text-center p-3 bg-black/30 rounded-xl border border-white/10">
                                        <p className="text-[9px] text-emerald-400 mb-1 uppercase tracking-widest font-bold flex items-center justify-center gap-1">
                                            <LogIn className="h-3 w-3" /> First In
                                        </p>
                                        <p className="text-base font-bold text-white font-mono">{formatTime(lastCheckInTime)}</p>
                                    </div>
                                    <div className="text-center p-3 bg-black/30 rounded-xl border border-white/10">
                                        <p className="text-[9px] text-rose-400 mb-1 uppercase tracking-widest font-bold flex items-center justify-center gap-1">
                                            <LogOut className="h-3 w-3" /> Last Out
                                        </p>
                                        <p className="text-base font-bold text-white font-mono">{formatTime(lastCheckOutTime)}</p>
                                    </div>
                                    <div className="text-center p-3 bg-black/30 rounded-xl border border-white/10">
                                        <p className="text-[9px] text-blue-400 mb-1 uppercase tracking-widest font-bold flex items-center justify-center gap-1">
                                            <CheckCircle className="h-3 w-3" /> First B-In
                                        </p>
                                        <p className="text-base font-bold text-white font-mono">{formatTime(firstBreakInTime)}</p>
                                    </div>
                                    <div className="text-center p-3 bg-black/30 rounded-xl border border-white/10">
                                        <p className="text-[9px] text-amber-400 mb-1 uppercase tracking-widest font-bold flex items-center justify-center gap-1">
                                            <CheckCircle className="h-3 w-3" /> Last B-Out
                                        </p>
                                        <p className="text-base font-bold text-white font-mono">{formatTime(lastBreakOutTime)}</p>
                                    </div>
                                </div>

                                {/* Stats Grid: Break & Work */}
                                <div className="grid grid-cols-2 gap-3 mb-6 relative z-10">
                                    <div className="px-4 py-4 bg-blue-500/5 rounded-xl border border-blue-500/10 flex flex-col items-center justify-center gap-2">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle className="h-5 w-5 text-blue-500" />
                                            <span className="text-xs text-gray-400 uppercase tracking-wider font-bold">Total Break</span>
                                        </div>
                                        <p className="text-lg font-bold text-white font-mono">
                                            {totalBreakDurationToday > 0 
                                                ? `${Math.floor(totalBreakDurationToday)}h ${Math.round((totalBreakDurationToday % 1) * 60)}m` 
                                                : '0h 0m'}
                                        </p>
                                    </div>
                                    <div className="px-4 py-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10 flex flex-col items-center justify-center gap-2">
                                        <div className="flex items-center gap-2">
                                            <ClipboardList className="h-5 w-5 text-emerald-500" />
                                            <span className="text-xs text-gray-400 uppercase tracking-wider font-bold">Total Work</span>
                                        </div>
                                        <p className="text-lg font-bold text-white font-mono">
                                            {totalWorkingDurationToday > 0 
                                                ? `${Math.floor(totalWorkingDurationToday)}h ${Math.round((totalWorkingDurationToday % 1) * 60)}m` 
                                                : '0h 0m'}
                                        </p>
                                    </div>
                                </div>

                                {isAttendanceLoading ? (
                                    <div className="flex items-center justify-center text-emerald-500 h-[60px] bg-black/20 rounded-xl border border-white/5"><Loader2 className="h-6 w-6 animate-spin" /></div>
                                ) : (
                                        <div className="space-y-4 relative z-10">
                                            <div className="flex flex-col space-y-3">
                                                <div className="flex items-center gap-2 px-0.5">
                                                    <button 
                                                        onClick={() => handleToggleHint('punch')}
                                                        className="focus:outline-none hover:scale-110 transition-all active:scale-95 !bg-transparent !border-none !p-0 !shadow-none !ring-0 flex items-center justify-center"
                                                        title="Click for hint"
                                                    >
                                                        <Info className="h-5 w-5 text-emerald-400" />
                                                    </button>
                                                    {showPunchHint && (
                                                        <span className="text-base italic text-emerald-100/70 font-medium leading-tight animate-in fade-in slide-in-from-left-2 duration-300">
                                                            Punch in is required when starting the day, and Punch out when the day ends
                                                        </span>
                                                    )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 relative z-10">
                                                {/* Punch In / Request Unlock Button */}
                                                 <button
                                                    onClick={() => {
                                                        if (isPunchBlocked) {
                                                            if (unlockRequestStatus === 'pending') return;
                                                            navigate('/attendance/request-unlock');
                                                            return;
                                                        }
                                                        // Always use 'office' for the main day punch, even for field staff.
                                                        // This separates the Daily Punch (Day Start) from Site Visits.
                                                        navigate('/attendance/check-in?workType=office');
                                                    }}
                                                    disabled={isCheckedIn || isOnBreak || isActionInProgress || (isPunchBlocked && unlockRequestStatus === 'pending')}
                                                    className={`
                                                        relative overflow-hidden rounded-xl border p-0 transition-all duration-300 active:scale-[0.98] shadow-lg
                                                        flex flex-col items-center justify-center gap-1 h-[72px]
                                                        ${isPunchBlocked 
                                                            ? 'bg-gradient-to-br from-amber-500 to-orange-600 border-amber-400/30 shadow-amber-500/20' 
                                                            : 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400/30 shadow-emerald-500/20'
                                                        }
                                                        ${(isCheckedIn || isOnBreak || isActionInProgress || (isPunchBlocked && unlockRequestStatus === 'pending')) ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:brightness-110'}
                                                    `}
                                                >
                                                    {/* Shine Effect */}
                                                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none"></div>
                                                    
                                                    {isPunchBlocked ? (
                                                        <>
                                                            {unlockRequestStatus === 'pending' 
                                                                ? <Clock className="h-6 w-6 text-white drop-shadow-sm" />
                                                                : <Lock className="h-6 w-6 text-white drop-shadow-sm" />
                                                            }
                                                            <span className="text-white font-bold text-sm tracking-wide drop-shadow-sm">
                                                                {unlockRequestStatus === 'pending' ? 'PENDING' : 'REQUEST PUNCH IN'}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <LogIn className={`h-6 w-6 text-white drop-shadow-sm ${!isCheckedIn ? 'animate-pulse' : ''}`} />
                                                            <span className="text-white font-bold text-sm tracking-wide drop-shadow-sm">PUNCH IN</span>
                                                        </>
                                                    )}
                                                </button>

                                                {/* Punch Out Button */}
                                                 <button
                                                    onClick={() => navigate('/attendance/check-out?workType=office')}
                                                    disabled={!isCheckedIn || isFieldCheckedIn || isOnBreak || (isFieldStaff && !isFieldCheckedOut) || isActionInProgress || isPunchBlocked}
                                                    className={`
                                                        relative overflow-hidden rounded-xl border p-0 transition-all duration-300 active:scale-[0.98] shadow-lg
                                                        flex flex-col items-center justify-center gap-1 h-[72px]
                                                        ${(!isCheckedIn || isFieldCheckedIn || isOnBreak || (isFieldStaff && !isFieldCheckedOut) || isActionInProgress || isPunchBlocked)
                                                            ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed opacity-50' // Disabled Glass State
                                                            : 'bg-gradient-to-br from-rose-500 to-pink-600 border-rose-400/30 shadow-rose-500/20 hover:brightness-110'
                                                        }
                                                    `}
                                                >
                                                    {(!(!effectivelyCheckedIn || isFieldCheckedIn || isOnBreak || isActionInProgress || isPunchBlocked)) && (
                                                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none"></div>
                                                    )}
                                                    <LogOut className={`h-6 w-6 ${(!isCheckedIn || isFieldCheckedIn || isOnBreak || (isFieldStaff && !isFieldCheckedOut) || isActionInProgress || isPunchBlocked) ? 'text-white/30' : 'text-white drop-shadow-sm'}`} />
                                                    <span className={`font-bold text-sm tracking-wide ${(!isCheckedIn || isFieldCheckedIn || isOnBreak || (isFieldStaff && !isFieldCheckedOut) || isActionInProgress || isPunchBlocked) ? 'text-white/30' : 'text-white drop-shadow-sm'}`}>
                                                        PUNCH OUT
                                                    </span>
                                                </button>
                                            </div>

                                                {/* Field Staff Buttons - Only show once session is active */}
                                                {(user?.role === 'field_staff' || user?.role === 'operation_manager') && isCheckedIn && !isPunchBlocked && (
                                                    <div className="grid grid-cols-2 gap-3 pb-2 border-b border-white/5">
                                                         <Button
                                                             onClick={() => navigate("/attendance/check-in?workType=field")}
                                                             disabled={!isCheckedIn || isFieldCheckedIn || isOnBreak || isActionInProgress || isPunchBlocked}
                                                             variant="primary"
                                                             className={`attendance-action-btn !bg-blue-600 !border-blue-700 ${!isCheckedIn || isFieldCheckedIn || isOnBreak || isPunchBlocked ? 'pointer-events-none opacity-50' : ''}`}
                                                         >
                                                             <MapPin className="mr-2 h-4 w-4" />
                                                             Site Check In
                                                         </Button>
 
                                                         <Button
                                                             onClick={() => navigate("/attendance/check-out?workType=field")}
                                                             disabled={!isFieldCheckedIn || isOnBreak || isActionInProgress || isPunchBlocked}
                                                             variant="secondary"
                                                             className={`attendance-action-btn !bg-amber-600 !border-amber-700 !text-white ${!isFieldCheckedIn || isOnBreak || isPunchBlocked ? 'pointer-events-none opacity-50' : ''}`}
                                                         >
                                                             <MapPin className="mr-2 h-4 w-4" />
                                                             Site Check Out
                                                         </Button>
                                                    </div>
                                                )}
                                            </div>

                                            
                                              {isCheckedIn && (
                                                <div className="flex flex-col space-y-3 pt-2 border-t border-white/5">
                                                    <div className="flex items-center gap-2 px-0.5">
                                                        <button 
                                                            onClick={() => handleToggleHint('break')}
                                                            className="focus:outline-none hover:scale-110 transition-all active:scale-95 !bg-transparent !border-none !p-0 !shadow-none !ring-0 flex items-center justify-center"
                                                            title="Click for hint"
                                                        >
                                                            <Info className="h-5 w-5 text-blue-400" />
                                                        </button>
                                                        {showBreakHint && (
                                                            <span className="text-base italic text-blue-100/70 font-medium leading-tight animate-in fade-in slide-in-from-left-2 duration-300">
                                                                Break in when user goes for lunch is mandatory, or it will be a violation
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                         <Button
                                                             onClick={() => navigate('/attendance/break-in')}
                                                             disabled={(isFieldStaff ? !isFieldCheckedIn : !isCheckedIn) || isOnBreak || isActionInProgress || isPunchBlocked}
                                                             variant="primary"
                                                             className={`attendance-action-btn !bg-emerald-600 !border-emerald-700 ${((isFieldStaff ? !isFieldCheckedIn : !isCheckedIn) || isOnBreak || isPunchBlocked) ? 'pointer-events-none opacity-50' : ''}`}
                                                         >
                                                             <CheckCircle className="mr-2 h-4 w-4" />
                                                             Break In
                                                         </Button>
                                                         <Button
                                                             onClick={() => navigate('/attendance/break-out')}
                                                             disabled={!isOnBreak || isActionInProgress || isPunchBlocked}
                                                             variant="primary"
                                                             className={`attendance-action-btn !bg-emerald-600 !border-emerald-700 ${(!isOnBreak || isPunchBlocked) ? 'pointer-events-none opacity-50' : ''}`}
                                                         >
                                                             <CheckCircle className="mr-2 h-4 w-4" />
                                                             Break Out
                                                         </Button>
                                                    </div>
                                                </div>
                                             )}
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}


                    <section>
                        <h3 className="fo-section-title mb-4">Account Actions</h3>
                        <div className="space-y-4">
                            <button 
                                onClick={() => navigate('/leaves/dashboard')} 
                                className="w-full group relative overflow-hidden bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl py-3 px-4 flex items-center justify-between transition-all duration-300 active:scale-[0.98]"
                            >
                                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors"></div>
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className="p-2 rounded-xl bg-white/20 text-white backdrop-blur-sm">
                                        <Crosshair className="h-5 w-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-white font-bold text-sm">Leave Tracker</p>
                                        <p className="text-emerald-100 text-[10px] mt-0.5">View history & balances</p>
                                    </div>
                                </div>
                                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/70 group-hover:bg-white group-hover:text-emerald-700 transition-all">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            </button>

                            <button 
                                onClick={async () => {
                                    try {
                                        if ('serviceWorker' in navigator) {
                                            const registrations = await navigator.serviceWorker.getRegistrations();
                                            for (let registration of registrations) {
                                                await registration.unregister();
                                            }
                                        }
                                        if ('caches' in window) {
                                            const cacheNames = await caches.keys();
                                            await Promise.all(cacheNames.map(name => caches.delete(name)));
                                        }
                                        setToast({ message: 'Cache cleared! Reloading...', type: 'success' });
                                        setTimeout(() => window.location.reload(), 1000);
                                    } catch (error) {
                                        console.error('Failed to clear cache:', error);
                                        setToast({ message: 'Failed to clear cache. Try again.', type: 'error' });
                                    }
                                }}
                                className="w-full group relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-4 flex items-center justify-between transition-all duration-300 active:scale-[0.98]"
                            >
                                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors"></div>
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className="p-3 rounded-xl bg-white/20 text-white backdrop-blur-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </div>
                                    <div className="text-left">
                                        <p className="text-white font-bold text-base">Clear Cache & Reload</p>
                                        <p className="text-blue-100 text-xs mt-0.5">Fix loading issues</p>
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 group-hover:bg-white group-hover:text-blue-700 transition-all">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            </button>

                            <button 
                                onClick={handleLogoutClick} 
                                className="w-full group relative overflow-hidden bg-gradient-to-br from-rose-600 to-rose-800 rounded-2xl p-4 flex items-center justify-between transition-all duration-300 active:scale-[0.98]"
                            >
                                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors"></div>
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className="p-3 rounded-xl bg-white/20 text-white backdrop-blur-sm">
                                        <LogOut className="h-6 w-6" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-white font-bold text-base">Log Out</p>
                                        <p className="text-rose-100 text-xs mt-0.5">Sign out of your account</p>
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 group-hover:bg-white group-hover:text-rose-700 transition-all">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full space-y-8 md:space-y-5">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            <div className="relative overflow-hidden md:bg-white md:p-4 md:rounded-xl md:shadow-sm flex flex-col md:flex-row items-center gap-6 md:gap-4 border border-gray-100">
                <div className="absolute top-0 left-0 w-full h-32 md:h-20 bg-[#006b3f] border-b-4 border-[#005632] shadow-lg"></div>
                <div className="relative z-10 md:scale-75 md:origin-left">
                    <AvatarUpload file={avatarFile} onFileChange={handlePhotoChange} />
                </div>
                <div className="text-center md:text-left relative z-10 flex-1 mt-16 md:-mt-4">
                    <h2 className="text-2xl md:text-xl font-bold text-white md:text-gray-900 md:drop-shadow-none tracking-tight drop-shadow-sm">{user.name}</h2>
                    <div className="flex items-center justify-center md:justify-start gap-2 mt-2 md:mt-1">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white shadow-sm border border-emerald-500 text-xs md:text-[10px] font-bold">
                            {getRoleName(user.role)}
                        </span>
                    </div>
                    <p className="text-emerald-50/70 md:text-gray-500 mt-2 md:mt-1 font-medium text-sm md:text-xs">{user.email}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-4">
                <div className="lg:col-span-2 space-y-6 lg:space-y-4">
                    <div className="md:bg-white md:p-4 md:rounded-xl md:shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3 mb-5 md:mb-3">
                            <div className="p-1.5 md:p-1 md:scale-90 bg-blue-50 rounded-lg">
                                <UserIcon className="h-5 w-5 text-blue-600" />
                            </div>
                            <h3 className="text-lg md:text-base font-bold text-gray-900">Profile Details</h3>
                        </div>
                        <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-5 md:space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-3">
                                <div className="md:scale-[0.85] md:origin-top-left md:w-[117%]">
                                    <Input label="Full Name" id="name" error={profileErrors.name?.message} registration={register('name')} className="bg-gray-50 border-gray-200 focus:bg-white transition-colors" autoComplete="name" />
                                </div>
                                <div className="md:scale-[0.85] md:origin-top-left md:w-[117%]">
                                    <Input label="Phone Number" id="phone" type="tel" error={profileErrors.phone?.message} registration={register('phone')} className="bg-gray-50 border-gray-200 focus:bg-white transition-colors" autoComplete="tel" />
                                </div>
                                <div className="md:col-span-2 md:scale-[0.85] md:origin-top-left md:w-[117%]">
                                    <Input label="Email Address" id="email" type="email" error={profileErrors.email?.message} registration={register('email')} readOnly className="bg-gray-100/50 text-gray-500 cursor-not-allowed border-gray-200" autoComplete="email" />
                                </div>
                            </div>
                            <div className="flex justify-end pt-3 md:pt-2 border-t border-gray-100">
                                <Button type="submit" isLoading={isSaving} disabled={!isDirty} className="px-6 md:!px-4 md:!py-1 md:!h-8 md:!text-xs">Save Changes</Button>
                            </div>
                        </form>
                    </div>

                    {user.role !== 'management' && (
                        <div className={`relative transition-all duration-500 md:bg-white md:p-4 md:rounded-xl md:shadow-sm border ${isOnBreak ? 'border-rose-500 ring-4 ring-rose-100' : 'border-gray-100'}`}>
                            {isOnBreak && (
                                <div className="absolute -top-3 left-6 z-20 bg-rose-600 text-white text-[10px] md:text-[8px] font-black px-4 md:px-2 py-1 md:py-0.5 rounded-full shadow-lg shadow-rose-600/30 animate-pulse uppercase tracking-widest">
                                    On Break
                                </div>
                            )}
                            <div className="flex items-center gap-3 md:gap-2 mb-5 md:mb-3">
                                <div className="p-1.5 md:p-1 md:scale-90 bg-purple-50 rounded-lg">
                                    <ClipboardList className="h-5 w-5 md:h-4 md:w-4 text-purple-600" />
                                </div>
                                <h3 className="text-lg md:text-base font-bold text-gray-900">Work Hours Tracking</h3>
                            </div>
                            <div className="space-y-5 md:space-y-3">
                                <div className="grid grid-cols-2 gap-5 md:gap-3">
                                    <div className="text-center bg-gray-50 p-4 md:p-2 rounded-xl border border-gray-100 shadow-sm">
                                        <p className="text-xs md:text-[9px] font-semibold text-gray-500 mb-1 md:mb-0.5 uppercase tracking-wider flex items-center justify-center gap-1">
                                            <LogIn className="h-3 w-3 md:h-2.5 md:w-2.5 text-emerald-600" /> First Punch In
                                        </p>
                                        <p className="text-2xl md:text-lg font-bold text-gray-900 font-mono">{formatTime(lastCheckInTime)}</p>
                                    </div>
                                    <div className="text-center bg-gray-50 p-4 md:p-2 rounded-xl border border-gray-100 shadow-sm">
                                        <p className="text-xs md:text-[9px] font-semibold text-gray-500 mb-1 md:mb-0.5 uppercase tracking-wider flex items-center justify-center gap-1">
                                            <LogOut className="h-3 w-3 md:h-2.5 md:w-2.5 text-rose-600" /> Last Punch Out
                                        </p>
                                        <p className="text-2xl md:text-lg font-bold text-gray-900 font-mono">{formatTime(lastCheckOutTime)}</p>
                                    </div>
                                    <div className="text-center bg-gray-50 p-4 md:p-2 rounded-xl border border-gray-100 shadow-sm">
                                        <p className="text-xs md:text-[9px] font-semibold text-gray-500 mb-1 md:mb-0.5 uppercase tracking-wider flex items-center justify-center gap-1">
                                            <CheckCircle className="h-3 w-3 md:h-2.5 md:w-2.5 text-blue-600" /> First B-In
                                        </p>
                                        <p className="text-2xl md:text-lg font-bold text-gray-900 font-mono">{formatTime(firstBreakInTime)}</p>
                                    </div>
                                    <div className="text-center bg-gray-50 p-4 md:p-2 rounded-xl border border-gray-100 shadow-sm">
                                        <p className="text-xs md:text-[9px] font-semibold text-gray-500 mb-1 md:mb-0.5 uppercase tracking-wider flex items-center justify-center gap-1">
                                            <CheckCircle className="h-3 w-3 md:h-2.5 md:w-2.5 text-amber-600" /> Last B-Out
                                        </p>
                                        <p className="text-2xl md:text-lg font-bold text-gray-900 font-mono">{formatTime(lastBreakOutTime)}</p>
                                    </div>
                                </div>

                                {isAttendanceLoading ? (
                                    <div className="flex items-center justify-center h-[56px] md:h-[40px] bg-gray-50 rounded-xl"><Loader2 className="h-6 w-6 md:h-4 md:w-4 animate-spin text-gray-400" /></div>
                                ) : (
                                    <div className="space-y-6 md:space-y-3">
                                            <div className="flex flex-col space-y-3 md:space-y-1.5">
                                                <div className="flex items-center gap-2 px-0.5">
                                                    <button 
                                                        onClick={() => handleToggleHint('punch')}
                                                        className="focus:outline-none hover:scale-110 transition-all active:scale-95 !bg-transparent !border-none !p-0 !shadow-none !ring-0 flex items-center justify-center"
                                                        title="Click for hint"
                                                    >
                                                        <Info className="h-5 w-5 md:h-3.5 md:w-3.5 text-emerald-600" />
                                                    </button>
                                                    {showPunchHint && (
                                                        <span className="text-base md:text-xs italic text-emerald-700 font-medium animate-in fade-in slide-in-from-left-2 duration-300">
                                                            Punch in is required when starting the day, and Punch out when the day ends
                                                        </span>
                                                    )}
                                                </div>
                                            <div className="grid grid-cols-2 gap-4 md:gap-3">
                                                <div className="relative group">
                                                       <Button
                                                           onClick={() => {
                                                               if (isPunchBlocked) {
                                                                   if (unlockRequestStatus === 'pending') return;
                                                                   navigate('/attendance/request-unlock');
                                                                   
                                                                   return;
                                                               }
                                                               if (user?.role === 'field_staff' || user?.role === 'operation_manager') {
                                                                   navigate('/attendance/check-in?workType=office');
                                                               } else {
                                                                   navigate('/attendance/check-in');
                                                               }
                                                           }}
                                                           variant={isPunchBlocked ? 'secondary' : 'primary'}
                                                           className={`attendance-action-btn md:!py-1 md:!h-8 md:!text-[11px] shadow-lg transition-all ${
                                                               isPunchBlocked ? '!bg-amber-600 !border-amber-600 !text-white shadow-amber-100/20' : 'shadow-emerald-100/20'
                                                           } ${isCheckedIn || isOnBreak || isActionInProgress || (isPunchBlocked && unlockRequestStatus === 'pending') ? 'pointer-events-none opacity-50' : ''}`}
                                                           disabled={isCheckedIn || isOnBreak || isActionInProgress || (isPunchBlocked && unlockRequestStatus === 'pending')}
                                                       >
                                                          {isPunchBlocked ? (
                                                               unlockRequestStatus === 'pending' 
                                                                 ? <Clock className="mr-2 h-4 w-4 md:h-3.5 md:w-3.5" /> 
                                                                 : <Lock className="mr-2 h-4 w-4 md:h-3.5 md:w-3.5" />
                                                          ) : <LogIn className={`mr-2 h-4 w-4 md:h-3.5 md:w-3.5 ${!isCheckedIn ? 'animate-pulse' : ''}`} />}
                                                          {isPunchBlocked 
                                                              ? (unlockRequestStatus === 'pending' 
                                                                  ? 'Pending' 
                                                                  : 'Request Punch In') 
                                                              : 'Punch In'}
                                                       </Button>
                                                </div>
                                                 <Button
                                                     onClick={() => navigate('/attendance/check-out?workType=office')}
                                                     variant="danger"
                                                     className={`attendance-action-btn md:!py-1 md:!h-8 md:!text-[11px] shadow-lg shadow-red-100/20 transition-all ${(!isCheckedIn || isFieldCheckedIn || isOnBreak || (isFieldStaff && !isFieldCheckedOut) || isPunchBlocked) ? 'pointer-events-none opacity-50' : ''}`}
                                                     disabled={!isCheckedIn || isFieldCheckedIn || isOnBreak || (isFieldStaff && !isFieldCheckedOut) || isActionInProgress || isPunchBlocked}
                                                 >
                                                     <LogOut className="mr-2 h-4 w-4 md:h-3.5 md:w-3.5" /> Punch Out
                                                 </Button>
                                            </div>

                                            {/* Field Staff Buttons */}
                                            {user?.role === 'field_staff' && (
                                                <div className="grid grid-cols-2 gap-4 md:gap-3 mt-4 md:mt-2">
                                                     <Button
                                                         onClick={() => navigate('/attendance/check-in?workType=field')}
                                                         variant="primary"
                                                         className={`attendance-action-btn md:!py-1 md:!h-8 md:!text-[11px] !bg-blue-600 hover:!bg-blue-700 !border-blue-600 shadow-lg shadow-blue-100/20 transition-all ${(!isCheckedIn || isFieldCheckedIn || isOnBreak || isPunchBlocked) ? 'pointer-events-none opacity-50' : ''}`}
                                                         disabled={!isCheckedIn || isFieldCheckedIn || isOnBreak || isActionInProgress || isPunchBlocked}
                                                     >
                                                         <MapPin className="mr-2 h-4 w-4 md:h-3.5 md:w-3.5" /> Site Check In
                                                     </Button>
                                                     <Button
                                                         onClick={() => navigate('/attendance/check-out?workType=field')}
                                                         variant="secondary"
                                                         className={`attendance-action-btn md:!py-1 md:!h-8 md:!text-[11px] !bg-amber-600 hover:!bg-amber-700 !border-amber-600 !text-white shadow-lg shadow-amber-100/20 transition-all ${(!isFieldCheckedIn || isOnBreak || isPunchBlocked) ? 'pointer-events-none opacity-50' : ''}`}
                                                         disabled={!isFieldCheckedIn || isOnBreak || isActionInProgress || isPunchBlocked}
                                                     >
                                                         <MapPin className="mr-2 h-4 w-4 md:h-3.5 md:w-3.5" /> Site Check Out
                                                     </Button>
                                                </div>
                                            )}
                                        </div>


                                        <div className="flex flex-col space-y-3 md:space-y-1.5">
                                            <div className="flex items-center gap-2 px-0.5">
                                                <button 
                                                    onClick={() => handleToggleHint('break')}
                                                    className="focus:outline-none hover:scale-110 transition-all active:scale-95 !bg-transparent !border-none !p-0 !shadow-none !ring-0 flex items-center justify-center"
                                                    title="Click for hint"
                                                >
                                                    <Info className="h-5 w-5 md:h-3.5 md:w-3.5 text-blue-600" />
                                                </button>
                                                {showBreakHint && (
                                                    <span className="text-base md:text-xs italic text-blue-700 font-medium animate-in fade-in slide-in-from-left-2 duration-300">
                                                        Break in when user goes for lunch is mandatory, or it will be a violation
                                                    </span>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 md:gap-3">
                                                 <Button
                                                     onClick={() => navigate('/attendance/break-in')}
                                                     variant="primary"
                                                     className={`attendance-action-btn md:!py-1 md:!h-8 md:!text-[11px] !bg-emerald-600 hover:!bg-emerald-700 !border-emerald-600 shadow-lg shadow-emerald-100/20 transition-all ${((isFieldStaff ? !isFieldCheckedIn : !isCheckedIn) || isOnBreak || isPunchBlocked) ? 'pointer-events-none opacity-50' : ''}`}
                                                     disabled={(isFieldStaff ? !isFieldCheckedIn : !isCheckedIn) || isOnBreak || isActionInProgress || isPunchBlocked}
                                                 >
                                                     <CheckCircle className="mr-2 h-4 w-4 md:h-3.5 md:w-3.5" /> Break In
                                                 </Button>
                                                 <Button
                                                     onClick={() => navigate('/attendance/break-out')}
                                                     variant="primary"
                                                     className={`attendance-action-btn md:!py-1 md:!h-8 md:!text-[11px] !bg-emerald-600 hover:!bg-emerald-700 !border-emerald-600 shadow-lg shadow-emerald-100/20 transition-all ${(!isOnBreak || isPunchBlocked) ? 'pointer-events-none opacity-50' : ''}`}
                                                     disabled={!isOnBreak || isActionInProgress || isPunchBlocked}
                                                 >
                                                     <CheckCircle className="mr-2 h-4 w-4 md:h-3.5 md:w-3.5" /> Break Out
                                                 </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-6 md:space-y-4">
                    <div className="md:bg-white md:p-4 md:rounded-xl md:shadow-sm border border-gray-100">
                        <h3 className="text-lg md:text-base font-bold mb-4 md:mb-3 text-gray-900">Account Actions</h3>
                        <div className="space-y-3 md:space-y-2">
                            <Button onClick={() => navigate('/leaves/dashboard')} variant="secondary" className="w-full justify-center py-3 md:!py-1 md:!h-8 md:!text-xs bg-gray-50 hover:bg-gray-100 border-gray-200" title="View your leave history and balances"><Crosshair className="mr-2 h-4 w-4 md:h-3.5 md:w-3.5" /> Leave Tracker</Button>
                            <Button onClick={handleLogoutClick} variant="danger" className="w-full justify-center py-3 md:!py-1 md:!h-8 md:!text-xs" isLoading={isSaving}><LogOut className="mr-2 h-4 w-4 md:h-3.5 md:w-3.5" /> Log Out</Button>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default ProfilePage;
