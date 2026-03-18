import OneSignalNative from 'onesignal-cordova-plugin';
import { Capacitor } from '@capacitor/core';
import OneSignalWeb from 'react-onesignal';

/**
 * Service to manage OneSignal push notifications.
 * Uses the external_user_id to target notifications to specific Supabase users.
 */

// We expose to window.OneSignal and window.oneSignalService for debugging.
// Using (window as any) internally to avoid TS conflicts with the SDK's own types.

let _webInitialized = false;
let _nativeInitialized = false;
let _initializing = false;
let _pendingUserId: string | null = null;

export const oneSignalService = {
    /**
     * Initializes OneSignal and sets up event listeners.
     */
    init: async (appId: string) => {
        if (!appId) {
            console.error('[OneSignal] Error: No App ID provided');
            return;
        }

        // OneSignal App IDs must be lowercase UUIDs. 
        // We also strip quotes in case they were included in env variables.
        const normalizedAppId = appId.toLowerCase().trim().replace(/['"]/g, '');

        console.log('[OneSignal] Attempting initialization with ID:', normalizedAppId);

        if (_initializing || _webInitialized || _nativeInitialized) {
            console.log('[OneSignal] Initialization already in progress or completed, skipping.');
            return;
        }

        _initializing = true;

        if (Capacitor.isNativePlatform()) {
            try {
                // OneSignal 5.x uses Debug.setLogLevel
                OneSignalNative.Debug.setLogLevel(6);

                OneSignalNative.initialize(normalizedAppId);

                OneSignalNative.Notifications.addEventListener('foregroundWillDisplay', (event) => {
                    console.log('[OneSignal Native] Notification received in foreground:', event);
                    // In OneSignal 5.x, foreground notifications are often suppressed.
                    // We explicitly tell it to display.
                    event.getNotification().display();
                });

                OneSignalNative.Notifications.addEventListener('click', (event) => {
                    console.log('[OneSignal Native] Notification clicked:', event);
                    const data = event.notification.additionalData as any;
                    if (data && data.url) {
                        window.location.href = data.url;
                    }
                });

                // OneSignal initialization is enough. 
                // Permissions are handled by the unified flow in permissionUtils.ts
                _nativeInitialized = true;
                
                // Log subscription status for debugging
                const pushSub = OneSignalNative.User.pushSubscription;
                console.log('[OneSignal Native] Initialized with App ID:', normalizedAppId);
                console.log('[OneSignal Native] Subscription ID:', pushSub.id);
                console.log('[OneSignal Native] Opted In:', pushSub.optedIn);
                
            } catch (error) {
                console.error('[OneSignal Native] Initialization failed:', error);
            }
        } else {
            // Web Integration
            try {
                await OneSignalWeb.init({
                    appId: normalizedAppId,
                    allowLocalhostAsSecureOrigin: true,
                    serviceWorkerParam: { scope: '/' },
                    serviceWorkerPath: '/OneSignalSDKWorker.js',
                    promptOptions: {
                        slidedown: {
                            prompts: [
                                {
                                    type: "push",
                                    autoPrompt: true,
                                    text: {
                                        actionMessage: "Subscribe to our notifications for the latest news and updates. You can disable anytime.",
                                        acceptButton: "Subscribe",
                                        cancelButton: "Later"
                                    },
                                    delay: {
                                        pageViews: 1,
                                        timeDelay: 5
                                    }
                                }
                            ]
                        }
                    },
                    notifyButton: {
                        enable: true,
                        position: 'bottom-right',
                        size: 'medium',
                        showCredit: false,
                        prenotify: true,
                        colors: {
                            'circle.background': '#006b3f', // Back to green
                            'circle.foreground': 'white',
                            'badge.background': '#ef4444',
                            'badge.foreground': 'white',
                            'badge.bordercolor': 'white',
                            'pulse.color': 'white',
                            'dialog.button.background.hover': '#005632',
                            'dialog.button.background.active': '#005632',
                            'dialog.button.background': '#006b3f',
                            'dialog.button.foreground': 'white'
                        },
                        text: {
                            'tip.state.unsubscribed': 'Subscribe to notifications',
                            'tip.state.subscribed': "You're subscribed to notifications",
                            'tip.state.blocked': "You've blocked notifications",
                            'message.prenotify': 'Click to subscribe to notifications',
                            'message.action.subscribed': "Thanks for subscribing!",
                            'message.action.resubscribed': "You're subscribed to notifications",
                            'message.action.unsubscribed': "You won't receive notifications anymore",
                            'dialog.main.title': 'Manage Site Notifications',
                            'dialog.main.button.subscribe': 'SUBSCRIBE',
                            'dialog.main.button.unsubscribe': 'UNSUBSCRIBE',
                            'dialog.blocked.title': 'Unblock Notifications',
                            'dialog.blocked.message': "Follow these instructions to allow notifications:"
                        }
                    } as any
                });
                _webInitialized = true;
                console.log('[OneSignal Web] Initialized with App ID:', normalizedAppId);
                
                // Defensive property access for OneSignal v16
                const notifications = (OneSignalWeb as any).Notifications;
                const user = (OneSignalWeb as any).User;
                const pushSubscription = user?.PushSubscription;

                if (notifications) {
                    notifications.addEventListener('foregroundWillDisplay', (event: any) => {
                        console.log('[OneSignal Web] Foreground notification received:', event);
                    });

                    notifications.addEventListener('click', (event: any) => {
                        console.log('[OneSignal Web] Notification clicked:', event);
                    });
                }

                // Add subscription change listener for debugging
                if (pushSubscription) {
                    pushSubscription.addEventListener('change', (event: any) => {
                        console.log('[OneSignal Web] Subscription state changed:', {
                            current: event.current,
                            previous: event.previous
                        });
                    });
                }

                console.log('[OneSignal Web] Notification Permission:', notifications?.permission);
                console.log('[OneSignal Web] Subscription ID:', pushSubscription?.id);
                console.log('[OneSignal Web] Opted In:', pushSubscription?.optedIn);
                console.log('[OneSignal Web] Current Origin:', window.location.origin);

                // Process pending login if one was deferred
                if (_pendingUserId) {
                    console.log('[OneSignal Web] Processing deferred login for:', _pendingUserId);
                    OneSignalWeb.login(_pendingUserId).catch(err => console.warn('[OneSignal Web] Deferred login failed:', err));
                    _pendingUserId = null;
                }

                // Check permission correctly (handle both boolean and string for OneSignal v16)
                const permissionResult = await notifications?.permission;
                console.log('[OneSignal Web] Current permission state:', permissionResult);

                // In v16, permission is 'default' if not yet asked.
                // In some react-onesignal versions it might be boolean false.
                const shouldPrompt = permissionResult === 'default' || permissionResult === false || !permissionResult;

                if (shouldPrompt) {
                    console.log('[OneSignal Web] Requesting notification permission via Slidedown...');
                    try {
                        if (OneSignalWeb.Slidedown) {
                            // The standard method name in react-onesignal 3.x is promptPush
                            if (typeof (OneSignalWeb.Slidedown as any).promptPush === 'function') {
                                await (OneSignalWeb.Slidedown as any).promptPush();
                            } else if (typeof (OneSignalWeb.Slidedown as any).promptNotifications === 'function') {
                                await (OneSignalWeb.Slidedown as any).promptNotifications();
                            } else {
                                // Fallback to generic showSlidedownPrompt if available or just requestPermission
                                if (OneSignalWeb.Notifications) {
                                    await OneSignalWeb.Notifications.requestPermission();
                                }
                            }
                        } else if (OneSignalWeb.Notifications) {
                            await OneSignalWeb.Notifications.requestPermission();
                        }
                    } catch (e) {
                        console.warn('[OneSignal Web] Slidedown prompt failed, trying native prompt:', e);
                        if (OneSignalWeb.Notifications) {
                            await OneSignalWeb.Notifications.requestPermission();
                        }
                    }
                }
            } catch (error) {
                console.error('[OneSignal Web] Initialization failed:', error);
            } finally {
                _initializing = false;
                
                // Set up a global debug helper
                const debugHelper = async () => {
                    const notifications = (OneSignalWeb as any).Notifications;
                    const user = (OneSignalWeb as any).User;
                    const pushSubscription = user?.PushSubscription;

                    const permission = await notifications?.permission;
                    const subId = pushSubscription?.id;
                    const optedIn = pushSubscription?.optedIn;
                    
                    console.table({
                        'App ID': normalizedAppId,
                        'Initialized': _webInitialized,
                        'Permission': permission || 'Unknown',
                        'Subscription ID': subId || 'None',
                        'Opted In': optedIn ?? 'Unknown',
                        'Origin': window.location.origin,
                        'Service Worker': !!navigator.serviceWorker.controller
                    });
                    
                    return { permission, subId, optedIn };
                };

                // Expose to window with a tiny delay to ensure SDK internal state has settled
                setTimeout(() => {
                    (window as any).OneSignal = OneSignalWeb;
                    (window as any).oneSignalService = oneSignalService;
                    (window as any).debugOneSignal = debugHelper;
                }, 500);
            }
        }
    },

    /**
     * Associates the device with the current Supabase user ID.
     */
    login: (userId: string) => {
        try {
            if (Capacitor.isNativePlatform()) {
                console.log('[OneSignal Native] Setting external ID:', userId);
                OneSignalNative.login(userId);
            } else {
                if (_webInitialized) {
                    console.log('[OneSignal Web] Setting external ID:', userId);
                    OneSignalWeb.login(userId).catch(err => console.warn('[OneSignal Web] Login failed:', err));
                } else {
                    console.log('[OneSignal Web] Not initialized yet, queuing login for:', userId);
                    _pendingUserId = userId;
                }
            }
        } catch (error) {
            console.error('[OneSignal] Failed to set external user ID:', error);
        }
    },

    /**
     * Disassociates the device from the user on logout.
     */
    logout: () => {
        try {
            if (Capacitor.isNativePlatform()) {
                console.log('[OneSignal Native] Removing external ID');
                OneSignalNative.logout();
            } else {
                if (_webInitialized) {
                    console.log('[OneSignal Web] Removing external ID');
                    OneSignalWeb.logout();
                } else {
                    console.log('[OneSignal Web] Logout requested but not initialized');
                    _pendingUserId = null;
                }
            }
        } catch (error) {
            console.error('[OneSignal] Failed to remove external user ID:', error);
        }
    },
    /**
     * Explicitly requests notification permissions.
     */
    requestPermission: async () => {
        try {
            if (Capacitor.isNativePlatform()) {
                await OneSignalNative.Notifications.requestPermission(true);
            } else {
                if (_webInitialized) {
                    console.log('[OneSignal Web] Requesting notification permission via Slidedown/SDK...');
                    try {
                        const slidedown = (OneSignalWeb as any).Slidedown;
                        const notifications = (OneSignalWeb as any).Notifications;
                        
                        if (slidedown && typeof slidedown.promptNotifications === 'function') {
                            await slidedown.promptNotifications();
                        } else if (notifications && typeof notifications.requestPermission === 'function') {
                            await notifications.requestPermission();
                        } else {
                            throw new Error('OneSignal Slidedown/Notifications not available');
                        }
                    } catch (e) {
                        console.warn('[OneSignal Web] SDK prompt failed, falling back to browser:', e);
                        if (window.Notification) {
                            await window.Notification.requestPermission();
                        }
                    }
                } else {
                    // FALLBACK: If OneSignal isn't working (e.g. localhost domain restriction),
                    // use the browser's native API so the user isn't stuck on the compliance screen.
                    console.warn('[OneSignal Web] Not initialized, falling back to window.Notification.requestPermission()');
                    if (window.Notification) {
                        const result = await window.Notification.requestPermission();
                        console.log('[OneSignal Web] Browser Notification request result:', result);
                    } else {
                        console.error('[OneSignal Web] Notifications not supported by this browser.');
                    }
                }
            }
        } catch (error) {
            console.error('[OneSignal] Request permission failed:', error);
        }
    }
};
