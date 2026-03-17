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
                        displayPredicate: async () => {
                            // Only show if the user hasn't granted notifications yet
                            // This matches OneSignal's recommended standard behavior
                            const permission = await OneSignalWeb.Notifications.permission;
                            return !permission;
                        },
                        colors: {
                            'circle.background': '#006b3f',
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
                OneSignalWeb.Notifications.addEventListener('foregroundWillDisplay', (event) => {
                    console.log('[OneSignal Web] Foreground notification received:', event);
                });

                OneSignalWeb.Notifications.addEventListener('click', (event) => {
                    console.log('[OneSignal Web] Notification clicked:', event);
                });

                // Add subscription change listener for debugging
                OneSignalWeb.User.PushSubscription.addEventListener('change', (event) => {
                    console.log('[OneSignal Web] Subscription state changed:', {
                        current: event.current,
                        previous: event.previous
                    });
                });

                _webInitialized = true;
                console.log('[OneSignal Web] Initialized with App ID:', normalizedAppId);
                console.log('[OneSignal Web] Notification Permission:', OneSignalWeb.Notifications.permission);
                console.log('[OneSignal Web] Subscription ID:', OneSignalWeb.User.PushSubscription.id);
                console.log('[OneSignal Web] Opted In:', OneSignalWeb.User.PushSubscription.optedIn);
                console.log('[OneSignal Web] Current Origin:', window.location.origin);

                // Process pending login if one was deferred
                if (_pendingUserId) {
                    console.log('[OneSignal Web] Processing deferred login for:', _pendingUserId);
                    OneSignalWeb.login(_pendingUserId);
                    _pendingUserId = null;
                }

                // Prompt for notification permission on web
                if (!OneSignalWeb.Notifications.permission) {
                    console.log('[OneSignal Web] Requesting notification permission via Slidedown...');
                    try {
                        await (OneSignalWeb.Slidedown as any).promptNotifications();
                    } catch (e) {
                        console.warn('[OneSignal Web] Slidedown prompt failed, trying native prompt:', e);
                        await OneSignalWeb.Notifications.requestPermission();
                    }
                }
            } catch (error) {
                console.error('[OneSignal Web] Initialization failed:', error);
            } finally {
                _initializing = false;
                
                // Set up a global debug helper
                (window as any).debugOneSignal = async () => {
                    const permission = await OneSignalWeb.Notifications.permission;
                    const subId = OneSignalWeb.User.PushSubscription.id;
                    const optedIn = OneSignalWeb.User.PushSubscription.optedIn;
                    
                    console.table({
                        'App ID': normalizedAppId,
                        'Initialized': _webInitialized,
                        'Permission': permission,
                        'Subscription ID': subId || 'None',
                        'Opted In': optedIn,
                        'Origin': window.location.origin,
                        'Service Worker': !!navigator.serviceWorker.controller
                    });
                    
                    if (!subId) {
                        console.warn('[OneSignal Debug] No Subscription ID. Check OneSignal dashboard -> Settings -> Web Configuration to ensure this domain is allowed.');
                    }
                    return { permission, subId, optedIn };
                };

                // Expose to window with a tiny delay to ensure SDK internal state has settled
                setTimeout(() => {
                    (window as any).OneSignal = OneSignalWeb;
                    (window as any).oneSignalService = oneSignalService;
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
                    OneSignalWeb.login(userId);
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
                        await (OneSignalWeb.Slidedown as any).promptNotifications();
                    } catch (e) {
                        await OneSignalWeb.Notifications.requestPermission();
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
