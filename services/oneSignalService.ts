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

        // OneSignal App IDs must be lowercase UUIDs
        const normalizedAppId = appId.toLowerCase().trim();

        if (Capacitor.isNativePlatform()) {
            if (_nativeInitialized) {
                console.log('[OneSignal Native] Already initialized, skipping.');
                return;
            }
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
            if (_webInitialized) {
                console.log('[OneSignal Web] Already initialized, skipping.');
                return;
            }
            try {
                await OneSignalWeb.init({
                    appId: normalizedAppId,
                    allowLocalhostAsSecureOrigin: true,
                    serviceWorkerParam: { scope: '/' },
                    serviceWorkerPath: '/OneSignalSDKWorker.js',
                });
                // Display handler for foreground (when tab is active)
                OneSignalWeb.Notifications.addEventListener('foregroundWillDisplay', (event) => {
                    console.log('[OneSignal Web] Foreground notification received:', event);
                });

                OneSignalWeb.Notifications.addEventListener('click', (event) => {
                    console.log('[OneSignal Web] Notification clicked:', event);
                });

                _webInitialized = true;
                console.log('[OneSignal Web] Initialized with App ID:', normalizedAppId);
                console.log('[OneSignal Web] Notification Permission:', OneSignalWeb.Notifications.permission);
                console.log('[OneSignal Web] Subscription ID:', OneSignalWeb.User.PushSubscription.id);

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
                // Always expose to window for debugging, even if init fails
                (window as any).OneSignal = OneSignalWeb;
                (window as any).oneSignalService = oneSignalService;
            }
        }
    },

    /**
     * Associates the device with the current Supabase user ID.
     */
    login: (userId: string) => {
        try {
            if (Capacitor.isNativePlatform()) {
                OneSignalNative.login(userId);
            } else {
                if (_webInitialized) {
                    OneSignalWeb.login(userId);
                } else {
                    console.log('[OneSignal Web] Not initialized yet, queuing login for:', userId);
                    _pendingUserId = userId;
                }
            }
            console.log('[OneSignal] User login/tag update requested:', userId);
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
                OneSignalNative.logout();
            } else {
                if (_webInitialized) {
                    OneSignalWeb.logout();
                }
            }
            console.log('[OneSignal] User logged out/untagged');
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
