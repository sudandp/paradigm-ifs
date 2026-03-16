import OneSignalNative from 'onesignal-cordova-plugin';
import { Capacitor } from '@capacitor/core';
import OneSignalWeb from 'react-onesignal';

/**
 * Service to manage OneSignal push notifications.
 * Uses the external_user_id to target notifications to specific Supabase users.
 */

let _webInitialized = false;
let _nativeInitialized = false;

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
                    notifyButton: {
                        enable: true,
                        position: 'bottom-right',
                        size: 'medium',
                        prenotify: true,
                        showCredit: false,
                        text: {
                            'tip.state.unsubscribed': 'Subscribe to notifications',
                            'tip.state.subscribed': "You're subscribed to notifications",
                            'tip.state.blocked': "You've blocked notifications",
                            'message.prenotify': 'Click to subscribe to notifications',
                            'message.action.subscribing': "Subscribing...",
                            'message.action.subscribed': "Thanks for subscribing!",
                            'message.action.resubscribed': "You're subscribed to notifications",
                            'message.action.unsubscribed': "You won't receive notifications anymore",
                            'dialog.main.title': 'Manage Site Notifications',
                            'dialog.main.button.subscribe': 'SUBSCRIBE',
                            'dialog.main.button.unsubscribe': 'UNSUBSCRIBE',
                            'dialog.blocked.title': 'Unblock Notifications',
                            'dialog.blocked.message': 'Follow these instructions to allow notifications:'
                        },
                        displayPredicate: () => {
                            return !OneSignalWeb.Notifications.permission || !OneSignalWeb.User.PushSubscription.id;
                        }
                    },
                    promptOptions: {
                        slidedown: {
                            prompts: [
                                {
                                    type: 'push',
                                    autoPrompt: true,
                                    text: {
                                        actionMessage: "We'd like to send you notifications for updates and alerts.",
                                        acceptButton: "Allow",
                                        cancelButton: "Cancel",
                                    },
                                    delay: {
                                        pageViews: 1,
                                        timeDelay: 10,
                                    }
                                }
                            ]
                        }
                    }
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
                    console.warn('[OneSignal Web] Not initialized yet, deferring login.');
                }
            }
            console.log('[OneSignal] User logged in/tagged:', userId);
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
                if (!_webInitialized) {
                    console.warn('[OneSignal Web] Not initialized, cannot request permission');
                    return;
                }
                console.log('[OneSignal Web] Manually requesting notification permission...');
                try {
                    await (OneSignalWeb.Slidedown as any).promptNotifications();
                } catch (e) {
                    await OneSignalWeb.Notifications.requestPermission();
                }
            }
        } catch (error) {
            console.error('[OneSignal] Request permission failed:', error);
        }
    }
};
