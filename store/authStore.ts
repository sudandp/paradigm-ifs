

import { create } from 'zustand';
import { authService } from '../services/authService';
import type { User } from '../types';
import { supabase } from '../services/supabase';
import type { RealtimeChannel, Subscription } from '@supabase/supabase-js';
// FIX: Import the 'api' object to resolve 'Cannot find name' errors.
import { api } from '../services/api';
import { withTimeout } from '../utils/async';
// Utilities for geofencing
import { calculateDistanceMeters, reverseGeocode, getPrecisePosition } from '../utils/locationUtils';

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

interface AuthState {
    user: User | null;
    isCheckedIn: boolean;
    isAttendanceLoading: boolean;
    lastCheckInTime: string | null;
    lastCheckOutTime: string | null;
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
    toggleCheckInStatus: () => Promise<{ success: boolean; message: string }>;
    error: string | null;
    setError: (error: string | null) => void;
    loading: boolean;
    setLoading: (loading: boolean) => void;
    isLoginAnimationPending: boolean;
    setLoginAnimationPending: (pending: boolean) => void;
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
        error: null,
        loading: false,

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
                const { data, error } = await withTimeout(
                    authService.signInWithPassword(email, password),
                    20000, // 20 second timeout for login
                    'Login attempt timed out. Please check your network connection.'
                ).catch(e => {
                    // Handle timeout error as a login failure
                    return { data: { user: null, session: null }, error: { message: e.message } };
                });

                // Handle sign-in errors
                if (error || !data.user || !data.session) {
                    const friendlyError = getFriendlyAuthError(error?.message || 'Invalid login credentials');
                    set({ error: friendlyError, loading: false });
                    return { error: { message: friendlyError } };
                }

                // If "Remember Me" is checked:
                // 1. Save the email to localStorage for pre-filling
                // 2. Manually save the refresh token to localStorage for custom session restoration (used in App.tsx)
                if (rememberMe) {
                    localStorage.setItem('rememberedEmail', email);
                    localStorage.setItem('supabase.auth.rememberMe', data.session.refresh_token);
                } else {
                    localStorage.removeItem('rememberedEmail');
                    localStorage.removeItem('supabase.auth.rememberMe');
                }

                // If sign-in is successful, we take full control.
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
            localStorage.removeItem('supabase.auth.rememberMe');
            // The onAuthStateChange listener in App.tsx will call setUser(null).
            await authService.signOut();
        },

        updateUserProfile: (updates) => set((state) => ({
            user: state.user ? { ...state.user, ...updates } : null
        })),

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

                // Sort events chronologically (oldest first) to easily find first/last
                events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                const firstCheckIn = events.find(e => e.type === 'check-in');
                const lastCheckOut = [...events].reverse().find(e => e.type === 'check-out');
                const lastEvent = events[events.length - 1];

                set({
                    isCheckedIn: lastEvent?.type === 'check-in',
                    lastCheckInTime: firstCheckIn ? firstCheckIn.timestamp : null,
                    lastCheckOutTime: lastCheckOut ? lastCheckOut.timestamp : null,
                    isAttendanceLoading: false
                });
            } catch (error) {
                console.error("Failed to check attendance status:", error);
                set({ isAttendanceLoading: false });
            }
        },

        toggleCheckInStatus: async () => {
            const { user, isCheckedIn } = get();
            if (!user) return { success: false, message: 'User not found' };
            const newType = isCheckedIn ? 'check-out' : 'check-in';
            try {
                // Attempt to obtain a high‑accuracy position.  If this fails, we fall back to a single geolocation call.
                let position: GeolocationPosition | null = null;
                try {
                    position = await getPrecisePosition();
                } catch {
                    // ignore and fall back
                }
                if (!position || !position.coords) {
                    // Fallback: one‑shot geolocation.  Use a Promise to wrap the callback‑based API.
                    position = await new Promise<GeolocationPosition | null>((resolve) => {
                        navigator.geolocation.getCurrentPosition(
                            (p) => resolve(p),
                            () => resolve(null),
                            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                        );
                    });
                }

                // Helper to finalize attendance
                const finalizeAttendance = async (lat?: number, lng?: number, locId?: string | null) => {
                    await api.addAttendanceEvent({
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        type: newType,
                        latitude: lat,
                        longitude: lng,
                        locationId: locId,
                    });
                    await get().checkAttendanceStatus();

                    // Send notification to the USER themselves
                    try {
                        const greeting = getTimeBasedGreeting();
                        const actionText = newType === 'check-in' ? 'checking in' : 'checking out';
                        await api.createNotification({
                            userId: user.id,
                            message: `${greeting}, ${user.name || 'there'}! Thanks for ${actionText}.`,
                            type: 'greeting',
                        });
                    } catch (e) {
                        console.warn('Failed to send user attendance notification', e);
                    }

                    // Send notifications to managers if enabled
                    try {
                        const settings = await api.getAttendanceSettings();
                        const isOfficeUser = ['admin', 'hr', 'finance', 'developer'].includes(user.role);
                        const rules = isOfficeUser ? settings?.office : settings?.field;

                        if (rules?.enableAttendanceNotifications) {
                            const recipients: { id: string }[] = [];
                            if (user.reportingManagerId) recipients.push({ id: user.reportingManagerId });
                            const nearbyManagers = await api.getNearbyUsers();
                            for (const mgr of nearbyManagers) {
                                if (!recipients.find((r) => r.id === mgr.id)) recipients.push({ id: mgr.id });
                            }
                            const actorName = user.name || 'An employee';
                            const locString = locId ? '' : (lat && lng ? ` at ${lat.toFixed(4)}, ${lng.toFixed(4)}` : '');
                            const message = `${actorName} ${newType.replace('-', ' ')}${locString}`;
                            await Promise.all(recipients.map((r) => api.createNotification({ userId: r.id, message, type: 'greeting' })));
                        }
                    } catch (notifyErr) {
                        console.warn('Failed to create manager notifications:', notifyErr);
                    }
                    return { success: true, message: `Successfully ${newType.replace('-', ' ')}!` };
                };

                // If still no valid position, record an attendance event without location
                if (!position || !position.coords) {
                    return await finalizeAttendance(undefined, undefined, null);
                }
                const { latitude, longitude, accuracy } = position.coords;
                // If accuracy is unreasonably large (>1000m), still record the raw coordinates but flag no geofence match
                if (typeof accuracy === 'number' && accuracy > 1000) {
                    return await finalizeAttendance(latitude, longitude, null);
                }
                // --- Geofencing logic ---
                let locationId: string | null = null;
                try {
                    // Fetch locations specifically assigned to this user
                    const userLocations = await api.getUserLocations(user.id);
                    // Check if the user is within any of their assigned geofences
                    for (const loc of userLocations) {
                        const dist = calculateDistanceMeters(latitude, longitude, loc.latitude, loc.longitude);
                        if (dist <= loc.radius) {
                            locationId = loc.id;
                            break;
                        }
                    }
                    // If not inside any assigned geofence, check global locations (all defined locations).
                    if (!locationId) {
                        const allLocations = await api.getLocations();
                        for (const loc of allLocations) {
                            const dist = calculateDistanceMeters(latitude, longitude, loc.latitude, loc.longitude);
                            if (dist <= loc.radius) {
                                locationId = loc.id;
                                // Automatically assign this location to the user for future checks
                                try {
                                    await api.assignLocationToUser(user.id, loc.id);
                                } catch (assignErr) {
                                    console.warn('Failed to auto‑assign location to user:', assignErr);
                                }
                                break;
                            }
                        }
                    }
                } catch (geoErr) {
                    console.warn('Geofencing check failed:', geoErr);
                }
                // If no geofence matched, automatically create a new location using the current coordinates.
                if (!locationId) {
                    try {
                        let friendlyName: string | null = null;
                        try {
                            friendlyName = await reverseGeocode(latitude, longitude);
                        } catch (err) {
                            console.warn('Reverse geocode failed for new location:', err);
                        }
                        const defaultRadius = 100;
                        const newLoc = await api.createLocation({
                            name: friendlyName || null,
                            latitude,
                            longitude,
                            radius: defaultRadius,
                            address: friendlyName || null,
                            createdBy: user.id,
                        });
                        try {
                            await api.assignLocationToUser(user.id, newLoc.id);
                        } catch (assignErr) {
                            console.warn('Failed to auto‑assign new location to user:', assignErr);
                        }
                        locationId = newLoc.id;
                    } catch (createErr) {
                        console.warn('Failed to create a new geofence location:', createErr);
                        locationId = null;
                    }
                }

                return await finalizeAttendance(latitude, longitude, locationId);

            } catch (err) {
                console.error('Error during attendance update:', err);
                return { success: false, message: 'Failed to update attendance.' };
            }
        },
    })
);