

import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { authService } from '../services/authService';
import { Preferences } from '@capacitor/preferences';
import type { User } from '../types';
import { supabase } from '../services/supabase';
import type { RealtimeChannel, Subscription } from '@supabase/supabase-js';
// FIX: Import the 'api' object to resolve 'Cannot find name' errors.
import { api } from '../services/api';
import { withTimeout } from '../utils/async';
import { format } from 'date-fns';
import { calculateDistanceMeters, reverseGeocode, getPrecisePosition } from '../utils/locationUtils';
import { processDailyEvents } from '../utils/attendanceCalculations';
import { dispatchNotificationFromRules } from '../services/notificationService';

// Centralized friendly error message handler for Supabase
// Centralized friendly error message handler for Supabase
// Centralized friendly error message handler for Supabase

const getFriendlyAuthError = (errorMessage: string): string => {
    const msg = errorMessage.toLowerCase();

    if (msg.includes('timed out')) {
        return 'The request took too long. Please check your internet connection and try again.';
    }
    if (msg.includes('invalid api key') || msg.includes('configuration')) {
        return 'System configuration error. Please contact support.';
    }
    if (msg.includes('failed to fetch') || msg.includes('network')) {
        return 'Unable to connect. Please check your internet connection.';
    }
    if (msg.includes('invalid login credentials')) {
        return 'Incorrect email or password. If you use Google Sign-In, please click "Sign in with Google".';
    }
    if (msg.includes('user already registered') || msg.includes('already exists')) {
        return 'This email is already registered. Please sign in.';
    }
    if (msg.includes('email not confirmed')) {
        return 'Please verify your email address. Check your inbox for the confirmation link.';
    }
    if (msg.includes('too many requests') || msg.includes('rate limit')) {
        return 'Too many attempts. Please wait a few minutes before trying again.';
    }
    if (msg.includes('weak password')) {
        return 'Password is too weak. Please use a stronger password.';
    }

    // Log the actual error for debugging but show a friendly message to the user
    console.error("Unhandled auth error:", errorMessage);
    return 'Something went wrong. Please try again or contact support.';
};

const getActionTextForType = (type: string): string => {
    switch (type) {
        case 'check-in': return 'checked in';
        case 'check-out': return 'checked out';
        case 'break-in': return 'started a break';
        case 'break-out': return 'ended their break';
        default: return 'updated attendance';
    }
};

interface AuthState {
    user: User | null;
    isCheckedIn: boolean;
    isAttendanceLoading: boolean;
    lastCheckInTime: string | null;
    lastCheckOutTime: string | null;
    firstBreakInTime: string | null;
    lastBreakInTime: string | null;
    lastBreakOutTime: string | null;
    totalBreakDurationToday: number;
    isOnBreak: boolean;
    loginWithEmail: (email: string, password: string, rememberMe: boolean) => Promise<{ error: { message: string } | null }>;
    signUp: (name: string, email: string, password: string) => Promise<{ error: { message: string } | null }>;
    loginWithGoogle: () => Promise<{ error: { message: string } | null; }>;
    sendPasswordReset: (email: string) => Promise<{ error: { message: string } | null }>;
    logout: () => Promise<void>;
    isInitialized: boolean;
    setUser: (user: User | null) => void;
    setInitialized: (initialized: boolean) => void;
    resetAttendance: () => void;
    updateUserProfile: (updates: Partial<User>) => void;
    checkAttendanceStatus: () => Promise<void>;
    toggleCheckInStatus: (note?: string, attachmentUrl?: string | null, workType?: 'office' | 'field', fieldReportId?: string, forcedType?: string) => Promise<{ success: boolean; message: string }>;
    subscribeToAttendance: () => (() => void) | void;
    error: string | null;
    setError: (error: string | null) => void;
    loading: boolean;
    setLoading: (loading: boolean) => void;
    isLoginAnimationPending: boolean;
    setLoginAnimationPending: (pending: boolean) => void;
    geofencingSettings: { enabled: boolean; maxViolationsPerMonth: number } | null;
    fetchGeofencingSettings: () => Promise<void>;
}

// Helper for time-based greetings
const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
};

export const useAuthStore = create<AuthState>()(
    (set, get) => ({
        user: null,
        isInitialized: false,
        isCheckedIn: false,
        isAttendanceLoading: true,
        lastCheckInTime: null,
        lastCheckOutTime: null,
        firstBreakInTime: null,
        lastBreakInTime: null,
        lastBreakOutTime: null,
        totalBreakDurationToday: 0,
        isOnBreak: false,
        error: null,
        loading: false,
        geofencingSettings: null,

        isLoginAnimationPending: false,
        setLoginAnimationPending: (pending) => set({ isLoginAnimationPending: pending }),

        setUser: (user) => set({ user, error: null, loading: false }),
        setInitialized: (initialized) => set({ isInitialized: initialized }),
        setLoading: (loading) => set({ loading }),
        resetAttendance: () => set({
            isCheckedIn: false,
            isAttendanceLoading: false,
            lastCheckInTime: null,
            lastCheckOutTime: null,
            firstBreakInTime: null,
            lastBreakInTime: null,
            lastBreakOutTime: null,
            totalBreakDurationToday: 0,
            isOnBreak: false,
            isLoginAnimationPending: false,
        }),
        setError: (error) => set({ error }),

        loginWithEmail: async (email, password, rememberMe) => {
            set({ error: null, loading: true });

            // Ensure a clean state before attempting login. This helps if there's a stale session
            // lingering that might confuse the client or the user.
            try {
                await authService.signOut();
            } catch (e) {
                // Ignore signout errors, we just want to try to clear state
            }

            try {
                // Determine effective timeout: infinite/long for mobile, 20s for web
                const isMobile = Capacitor.isNativePlatform();
                
                // On mobile, we skip the timeout wrapper or make it very long (e.g., 5 mins)
                // because mobile networks can be flaky and we don't want premature timeouts.
                const loginPromise = authService.signInWithPassword(email, password);
                
                const { data, error } = isMobile 
                    ? await loginPromise 
                    : await withTimeout(
                        loginPromise,
                        20000, 
                        'Login attempt timed out. Please check your network connection.'
                    ).catch(e => ({ data: { user: null, session: null }, error: { message: e.message } }));

                // Handle sign-in errors
                if (error || !data.user || !data.session) {
                    const friendlyError = getFriendlyAuthError(error?.message || 'Invalid login credentials');
                    set({ error: friendlyError, loading: false });
                    return { error: { message: friendlyError } };
                }

                // If sign-in is successful, we take full control.
                // FORCE PERSISTENCE: As per user request ("keep login until unless user logout by them"),
                // we always save the refresh token to Preferences, regardless of the "Remember Me" checkbox.
                await Preferences.set({ key: 'rememberedEmail', value: email });
                await Preferences.set({ key: 'supabase.auth.rememberMe', value: data.session.refresh_token });
                
                const appUser = await authService.getAppUserProfile(data.user);

                if (appUser) {
                    // Success case: profile fetched
                    set({ user: appUser, error: null, loading: false });
                    // Send a one‑time greeting notification on the first successful login
                    try {
                        const greetKey = `greetingSent_${appUser.id}`;
                        // Always send a greeting on new login session, not just once per browser install
                        // We use a session-based key or just send it every time login happens explicitly
                        const greeting = getTimeBasedGreeting();
                        await api.createNotification({
                            userId: appUser.id,
                            message: `${greeting}, ${appUser.name || 'there'}! Welcome back to Paradigm Services.`,
                            type: 'greeting',
                        });
                    } catch (e) {
                        console.error('Failed to send login greeting notification', e);
                    }
                    return { error: null };
                } else {
                    // Critical failure: sign-in worked, but profile fetch failed.
                    // Sign the user out to prevent an inconsistent state.
                    await authService.signOut();
                    const friendlyError = 'Login successful, but failed to retrieve user profile. Please try again.';
                    set({ user: null, error: friendlyError, loading: false });
                    return { error: { message: friendlyError } };
                }
            } catch (e) {
                // Catch exceptions from getAppUserProfile or other unexpected errors
                console.error('Unexpected error during login flow:', e);
                const friendlyError = getFriendlyAuthError('Unexpected error during login flow');
                set({ user: null, error: friendlyError, loading: false });
                return { error: { message: friendlyError } };
            }
        },

        signUp: async (name, email, password) => {
            set({ error: null, loading: true });
            const { error } = await authService.signUpWithPassword({
                email,
                password,
                options: { data: { name } }
            });

            if (error) {
                const friendlyError = getFriendlyAuthError(error.message);
                set({ error: friendlyError, loading: false });
                return { error: { message: friendlyError } };
            }
            set({ loading: false });
            return { error: null };
        },

        loginWithGoogle: async () => {
            set({ error: null, loading: true });
            const { error } = await authService.signInWithGoogle();

            if (error) {
                const friendlyError = getFriendlyAuthError(error.message);
                set({ error: friendlyError, loading: false });
                return { error: { message: friendlyError } };
            }

            // With redirect flow, the user is not returned immediately.
            // The onAuthStateChange listener will handle the session.
            set({ loading: false }); // Set loading to false after initiating redirect
            return { error: null };
        },

        sendPasswordReset: async (email: string) => {
            const { error } = await authService.resetPasswordForEmail(email);
            if (error) {
                return { error: { message: error.message } };
            }
            return { error: null };
        },

        logout: async () => {
            const currentUser = get().user;
            // Attempt to send a one‑time farewell notification before logging out.
            if (currentUser) {
                try {
                    const greeting = getTimeBasedGreeting();
                    // If it's late (after 8 PM), say Good Night, otherwise use the time-based greeting
                    const farewell = new Date().getHours() >= 20 ? 'Good Night' : greeting;

                    await api.createNotification({
                        userId: currentUser.id,
                        message: `${farewell}, ${currentUser.name || 'there'}! Thanks for your hard work today.`,
                        type: 'greeting',
                    });
                } catch (e) {
                    console.error('Failed to send logout farewell notification', e);
                }
            }
            // Clear the long-term token on logout
            await Preferences.remove({ key: 'supabase.auth.rememberMe' });
            // The onAuthStateChange listener in App.tsx will call setUser(null).
            await authService.signOut();
        },

        updateUserProfile: (updates) => set((state) => ({
            user: state.user ? { ...state.user, ...updates } : null
        })),

        fetchGeofencingSettings: async () => {
            const { user } = get();
            if (!user) return;
            try {
                const fullSettings = await api.getAttendanceSettings();
                const isOfficeUser = ['admin', 'hr', 'finance', 'developer'].includes(user.role);
                const rules = isOfficeUser ? fullSettings.office : fullSettings.field;
                set({ geofencingSettings: {
                    enabled: rules.geofencingEnabled ?? false,
                    maxViolationsPerMonth: rules.maxViolationsPerMonth ?? 3
                }});
            } catch (error) {
                console.error('Failed to fetch geofencing settings:', error);
            }
        },

        checkAttendanceStatus: async () => {
            const { user } = get();
            if (!user) {
                set({ isAttendanceLoading: false });
                return;
            }
            set({ isAttendanceLoading: true });
            try {
                const today = new Date();
                const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).toISOString();
                const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

                const events = await api.getAttendanceEvents(user.id, startOfDay, endOfDay);

                if (events.length === 0) {
                    set({
                        isCheckedIn: false,
                        lastCheckInTime: null,
                        lastCheckOutTime: null,
                        isAttendanceLoading: false
                    });
                    return;
                }

                const { checkIn, checkOut, firstBreakIn, lastBreakIn, breakOut, breakHours } = processDailyEvents(events);
                const lastEvent = events[events.length - 1];
                
                set({
                    isCheckedIn: lastEvent?.type !== 'check-out',
                    isOnBreak: lastEvent?.type === 'break-in',
                    lastCheckInTime: checkIn,
                    lastCheckOutTime: lastEvent?.type === 'check-out' ? checkOut : null,
                    firstBreakInTime: firstBreakIn,
                    lastBreakInTime: lastBreakIn,
                    lastBreakOutTime: breakOut,
                    totalBreakDurationToday: breakHours,
                    isAttendanceLoading: false
                });
            } catch (error) {
                console.error("Failed to check attendance status:", error);
                set({ isAttendanceLoading: false });
            } finally {
                // Pre-fetch geofencing settings for faster toggle action
                get().fetchGeofencingSettings();
            }
        },

        toggleCheckInStatus: async (note?: string, attachmentUrl?: string | null, workType?: 'office' | 'field', fieldReportId?: string, forcedType?: string) => {
            const { user, isCheckedIn, geofencingSettings } = get();
            if (!user) return { success: false, message: 'User not found' };
            const newType = (forcedType || (isCheckedIn ? 'check-out' : 'check-in')) as 'check-in' | 'check-out' | 'break-in' | 'break-out';

            // Ensure we have settings
            let settings = geofencingSettings;
            if (!settings) {
                try {
                    const fullSettings = await api.getAttendanceSettings();
                    const isOfficeUser = ['admin', 'hr', 'finance', 'developer'].includes(user.role);
                    const rules = isOfficeUser ? fullSettings.office : fullSettings.field;
                    settings = { 
                        enabled: rules.geofencingEnabled ?? false, 
                        maxViolationsPerMonth: rules.maxViolationsPerMonth ?? 3 
                    };
                    set({ geofencingSettings: settings });
                } catch (e) {
                    settings = { enabled: false, maxViolationsPerMonth: 3 };
                }
            }

            // --- strict session enforcement REMOVED to allow multiple check-ins ---
            // Previous logic for preventing multiple check-ins per day has been removed
            // based on user feedback to support multiple sessions.
            // ----------------------------------------------------------------------

            try {
                // --- 3-Stage Location Acquisition using Capacitor ---
                let position: GeolocationPosition | null = null;
                let locationStatus: string | null = null;

                try {
                    // Stage 1: Primary - Robust Position Acquisition with internal fallbacks
                    position = await getPrecisePosition(150, 15000);
                } catch (err: any) {
                    console.warn('Location acquisition failed:', err.message);
                    // Determine the final failure reason
                    locationStatus = 'GPS Unavailable';
                }

                const finalizeAttendance = async (lat?: number, lng?: number, locId?: string | null, locName?: string | null) => {
                    await api.addAttendanceEvent({
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        type: newType,
                        latitude: lat,
                        longitude: lng,
                        locationId: locId,
                        locationName: locName,
                        checkoutNote: newType === 'check-out' ? note : undefined,
                        attachmentUrl: newType === 'check-out' ? (attachmentUrl || undefined) : undefined,
                        workType: newType === 'check-out' ? workType : undefined,
                        fieldReportId: newType === 'check-out' ? fieldReportId : undefined
                    });
                    await get().checkAttendanceStatus();

                    // Send notification to the USER themselves
                    try {
                        const greeting = getTimeBasedGreeting();
                        const actionText = newType === 'check-in' ? 'checked in' : 'checked out';
                        const atText = locName ? ` at ${locName}` : '';
                        await api.createNotification({
                            userId: user.id,
                            message: `${greeting}, ${user.name || 'there'}! You have ${actionText}${atText}.`,
                            type: 'greeting',
                        });
                    } catch (e) {
                        console.warn('Failed to send user attendance notification', e);
                    }

                    // Send notifications via Dynamic Rules
                    dispatchNotificationFromRules(
                        newType.replace('-', '_'),
                        {
                            actorName: user.name || 'An employee',
                            actionText: getActionTextForType(newType),
                            locString: locName ? ` at ${locName}` : '',
                            actor: {
                                id: user.id,
                                name: user.name,
                                role: user.role,
                                reportingManagerId: user.reportingManagerId
                            }
                        }
                    );

                    // Automatic Field Staff Violation Detection
                    if (user.role === 'field_staff') {
                        const today = format(new Date(), 'yyyy-MM-dd');
                        api.processFieldAttendance(user.id, today).catch(e => console.error('Violation check failed:', e));
                    }

                    return { success: true, message: `Successfully ${newType.replace('-', ' ')}!` };
                };

                // If still no valid position, record an attendance event with specific failure reason
                if (!position || !position.coords) {
                    return await finalizeAttendance(undefined, undefined, null, locationStatus || 'Location Unavailable');
                }
                const { latitude, longitude, accuracy } = position.coords;
                // If accuracy is unreasonably large (>1000m), still record the raw coordinates but flag no geofence match
                if (typeof accuracy === 'number' && accuracy > 1000) {
                    return await finalizeAttendance(latitude, longitude, null, null);
                }
                // --- Location Context & Geofencing ---
                let locationId: string | null = null;
                let locationName: string | null = null;
                let isViolation = false;

                try {
                    // Stage 1: Always attempt to match against known locations (sites) first
                    // to get a friendly name (e.g., "PIFS Bangalore") regardless of geofencing status.
                    const userLocations = await api.getUserLocations(user.id);
                    for (const loc of userLocations) {
                        const dist = calculateDistanceMeters(latitude, longitude, loc.latitude, loc.longitude);
                        if (dist <= loc.radius) {
                            locationId = loc.id;
                            locationName = loc.name;
                            break;
                        }
                    }

                    if (!locationId) {
                        const allLocations = await api.getLocations();
                        for (const loc of allLocations) {
                            const dist = calculateDistanceMeters(latitude, longitude, loc.latitude, loc.longitude);
                            if (dist <= loc.radius) {
                                locationId = loc.id;
                                locationName = loc.name;
                                // Auto-assign this location to the user
                                api.assignLocationToUser(user.id, loc.id).catch(() => {});
                                break;
                            }
                        }
                    }

                    // Stage 2: Handle Geofencing enforcement (Violations)
                    if (settings.enabled && !locationId) {
                        isViolation = true;
                        try {
                            locationName = await reverseGeocode(latitude, longitude);
                        } catch (err) {
                            locationName = 'Outside Geofence';
                        }

                        // Log the violation
                        const now = new Date();
                        await api.addViolation({
                            userId: user.id,
                            violationDate: now.toISOString(),
                            violationMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
                            attemptedLatitude: latitude,
                            attemptedLongitude: longitude,
                            locationName: locationName,
                        }).catch(err => console.error('Failed to log geofencing violation:', err));

                        // Send violation notification via Dynamic Rules
                        dispatchNotificationFromRules(
                            'violation',
                            {
                                actorName: user.name || 'An employee',
                                actionText: newType === 'check-in' ? 'checked in' : 'checked out',
                                locString: ` outside their assigned geofence at ${locationName}`,
                                title: '📍 Geofencing Violation',
                                link: '/hr/field-staff-tracking',
                                actor: {
                                    id: user.id,
                                    name: user.name,
                                    role: user.role,
                                    reportingManagerId: user.reportingManagerId
                                }
                            }
                        );
                    } else if (!locationId) {
                        // Geofencing disabled or no enforcement, and no site match:
                        // Use reverse geocode but try to keep it concise if possible.
                        try {
                            locationName = await reverseGeocode(latitude, longitude);
                        } catch (err) {
                            locationName = 'Mobile Check-in';
                        }
                    }
                } catch (geoErr) {
                    console.warn('Location name resolution failed:', geoErr);
                }

                const result = await finalizeAttendance(latitude, longitude, locationId, locationName);
                
                if (isViolation) {
                    return { 
                        success: true, 
                        message: `Successfully ${newType.replace('-', ' ')}! (Note: Recorded as geofencing violation)` 
                    };
                }
                
                return result;

            } catch (err) {
                console.error('Error during attendance update:', err);
                return { success: false, message: 'Failed to update attendance.' };
            }
        },

        subscribeToAttendance: () => {
            const { user } = get();
            if (!user?.id) return; // Changed userId to user?.id

            const channel = supabase
                .channel(`attendance_changes_${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'attendance_events',
                        filter: `user_id=eq.${user.id}`,
                    },
                    () => {
                        console.log('Realtime: Attendance event detected, refreshing status...');
                        get().checkAttendanceStatus();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        },
    })
);