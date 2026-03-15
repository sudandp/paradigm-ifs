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

        if (Capacitor.isNativePlatform()) {
            if (_nativeInitialized) {
                console.log('[OneSignal Native] Already initialized, skipping.');
                return;
            }
            try {
                // OneSignal 5.x uses Debug.setLogLevel
                if ((window as any).OneSignal?.Debug) {
                    (window as any).OneSignal.Debug.setLogLevel(6);
                } else {
                    // Fallback for older/cordova versions if needed
                    (window as any).plugins?.OneSignal?.setLogLevel(6, 0);
                }

                OneSignalNative.initialize(appId);

                OneSignalNative.Notifications.addEventListener('foregroundWillDisplay', (event) => {
                    console.log('[OneSignal Native] Notification received in foreground:', event);
                });

                OneSignalNative.Notifications.addEventListener('click', (event) => {
                    console.log('[OneSignal Native] Notification clicked:', event);
                    const data = event.notification.additionalData as any;
                    if (data && data.url) {
                        window.location.href = data.url;
                    }
                });

                OneSignalNative.Notifications.requestPermission(true).then((granted) => {
                    console.log('[OneSignal Native] Permission granted:', granted);
                });

                _nativeInitialized = true;
                console.log('[OneSignal Native] Initialized with App ID:', appId);
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
                    appId: appId,
                    allowLocalhostAsSecureOrigin: true,
                    serviceWorkerParam: { scope: '/' },
                    serviceWorkerPath: '/OneSignalSDKWorker.js',
                });
                _webInitialized = true;
                console.log('[OneSignal Web] Initialized with App ID:', appId);

                // Prompt for notification permission on web
                if (Notification.permission === 'default') {
                    console.log('[OneSignal Web] Requesting notification permission...');
                    const permission = await Notification.requestPermission();
                    console.log('[OneSignal Web] Permission result:', permission);
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
    }
};
