import OneSignal from 'onesignal-cordova-plugin';
import { Capacitor } from '@capacitor/core';

/**
 * Service to manage OneSignal push notifications.
 * Uses the external_user_id to target notifications to specific Supabase users.
 */
export const oneSignalService = {
    /**
     * Initializes OneSignal and sets up event listeners.
     */
    init: (appId: string) => {
        if (!Capacitor.isNativePlatform()) {
            console.log('[OneSignal] Skipping initialization: Not on a native platform');
            return;
        }

        if (!appId) {
            console.error('[OneSignal] Error: No App ID provided');
            return;
        }

        try {
            // Uncomment this to enable debug logs
            // (window as any).plugins.OneSignal.setLogLevel(6, 0);

            OneSignal.initialize(appId);

            // Handler for when a notification is received while the app is in the foreground
            OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event) => {
                console.log('[OneSignal] Notification received in foreground:', event);
                // Optionally display a custom alert or update UI
            });

            // Handler for when a notification is clicked/opened
            OneSignal.Notifications.addEventListener('click', (event) => {
                console.log('[OneSignal] Notification clicked:', event);
                const data = event.notification.additionalData as any;
                if (data && data.url) {
                    // Navigate to the deep link if provided
                    window.location.href = data.url;
                }
            });


            // Request push notification permissions
            OneSignal.Notifications.requestPermission(true).then((granted) => {
                console.log('[OneSignal] Permission granted:', granted);
            });

            console.log('[OneSignal] Initialized with App ID:', appId);
        } catch (error) {
            console.error('[OneSignal] Initialization failed:', error);
        }
    },

    /**
     * Associates the device with the current Supabase user ID.
     * This allows the backend to send targeted push notifications using the user's ID.
     */
    login: (userId: string) => {
        if (!Capacitor.isNativePlatform()) return;

        try {
            OneSignal.login(userId);
            console.log('[OneSignal] User logged in/tagged:', userId);
        } catch (error) {
            console.error('[OneSignal] Failed to set external user ID:', error);
        }
    },

    /**
     * Disassociates the device from the user on logout.
     */
    logout: () => {
        if (!Capacitor.isNativePlatform()) return;

        try {
            OneSignal.logout();
            console.log('[OneSignal] User logged out/untagged');
        } catch (error) {
            console.error('[OneSignal] Failed to remove external user ID:', error);
        }
    }
};
