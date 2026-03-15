import { LocalNotifications } from '@capacitor/local-notifications';
import { Camera } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Contacts } from '@capacitor-community/contacts';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

// Notification IDs to ensure we can cancel them specifically
const NOTIFICATION_IDS = {
    SHIFT_END: 1001,
    BREAK_END: 1002,
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Request ALL required device permissions at once.
 * This ensures the user is prompted for everything upfront.
 */
export const requestAllPermissions = async () => {
    if (!Capacitor.isNativePlatform()) return;

    console.log('[PermissionUtils] Starting permanent unified permission request flow...');

    // 1. Notifications (System level)
    try {
        console.log('[PermissionUtils] Requesting Notifications...');
        await LocalNotifications.requestPermissions();
    } catch (e) { console.error('Notifications request error:', e); }

    await delay(1000);

    // 2. Direct Android Permissions (Native Brute Force)
    // This uses the cordova-plugin-android-permissions already in the project
    const permissions = (window as any).plugins?.permissions;
    if (permissions && Capacitor.getPlatform() === 'android') {
        const list = [
            permissions.CAMERA,
            permissions.ACCESS_FINE_LOCATION,
            permissions.ACCESS_COARSE_LOCATION,
            permissions.BLUETOOTH_SCAN,
            permissions.BLUETOOTH_CONNECT,
            permissions.READ_MEDIA_IMAGES,
            permissions.READ_MEDIA_VIDEO,
            permissions.READ_MEDIA_AUDIO,
            permissions.READ_CONTACTS
        ];

        console.log('[PermissionUtils] Requesting native Android permission block...');
        
        // We request them in groups to avoid overwhelming the OS
        const groups = [
            [permissions.CAMERA, permissions.READ_MEDIA_IMAGES, permissions.READ_MEDIA_VIDEO],
            [permissions.ACCESS_FINE_LOCATION, permissions.ACCESS_COARSE_LOCATION],
            [permissions.BLUETOOTH_SCAN, permissions.BLUETOOTH_CONNECT],
            [permissions.READ_MEDIA_AUDIO, permissions.READ_CONTACTS]
        ];

        for (const group of groups) {
            try {
                await new Promise((resolve, reject) => {
                    permissions.requestPermissions(group, 
                        (status: any) => resolve(status), 
                        (err: any) => reject(err)
                    );
                });
                console.log('[PermissionUtils] Finished permission group:', group);
                await delay(1000); // Wait between groups
            } catch (err) {
                console.error('[PermissionUtils] Error in permission group:', group, err);
            }
        }
    } else {
        // Fallback or iOS logic (using standard Capacitor plugins)
        console.log('[PermissionUtils] Native permissions plugin not found or not Android, falling back to Capacitor plugins...');
        
        try { await Camera.requestPermissions({ permissions: ['camera', 'photos'] }); } catch (e) {}
        await delay(800);
        try { await Geolocation.requestPermissions(); } catch (e) {}
        await delay(800);
        try { await BleClient.initialize(); } catch (e) {}
        await delay(800);
        try { await Contacts.requestPermissions(); } catch (e) {}
    }

    console.log('[PermissionUtils] Permanent unified permission flow finished.');
};

/**
 * Request notification permissions specifically (legacy support or targeted)
 */
export const requestNotificationPermissions = async () => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
        const result = await LocalNotifications.requestPermissions();
        if (result.display !== 'granted') {
            console.warn('Local notification permissions not granted');
        }
    } catch (error) {
        console.error('Error requesting notification permissions:', error);
    }
};

/**
 * Schedule a "Shift End" reminder.
 */
export const scheduleShiftEndReminder = async (startTime: Date, shiftDurationHours: number = 9) => {
    if (!Capacitor.isNativePlatform()) return;

    try {
        const endTime = new Date(startTime.getTime() + shiftDurationHours * 60 * 60 * 1000);
        if (endTime <= new Date()) return;

        await LocalNotifications.schedule({
            notifications: [
                {
                    title: 'Shift Ending Soon 🏠',
                    body: 'Your 9-hour shift is about to end. Don\'t forget to punch out!',
                    id: NOTIFICATION_IDS.SHIFT_END,
                    schedule: { at: endTime },
                    sound: 'beep.wav',
                    smallIcon: 'ic_stat_icon_config_sample',
                    actionTypeId: '',
                    extra: null
                }
            ]
        });
        console.log(`Scheduled shift end reminder for ${endTime.toLocaleTimeString()}`);
    } catch (error) {
        console.error('Failed to schedule shift end reminder:', error);
    }
};

/**
 * Schedule a "Break Over" reminder.
 */
export const scheduleBreakEndReminder = async (breakStartTime: Date, breakDurationMinutes: number = 60) => {
    if (!Capacitor.isNativePlatform()) return;

    try {
        const endTime = new Date(breakStartTime.getTime() + breakDurationMinutes * 60 * 1000);
        if (endTime <= new Date()) return;

        await LocalNotifications.schedule({
            notifications: [
                {
                    title: 'Break Over ⏳',
                    body: 'Your break time is up. Please punch back in!',
                    id: NOTIFICATION_IDS.BREAK_END,
                    schedule: { at: endTime },
                    sound: 'beep.wav',
                    smallIcon: 'ic_stat_icon_config_sample',
                    actionTypeId: '',
                    extra: null
                }
            ]
        });
        console.log(`Scheduled break end reminder for ${endTime.toLocaleTimeString()}`);
    } catch (error) {
        console.error('Failed to schedule break end reminder:', error);
    }
};

/**
 * Cancel a specific notification by type.
 */
export const cancelNotification = async (type: 'SHIFT_END' | 'BREAK_END') => {
    if (!Capacitor.isNativePlatform()) return;

    try {
        const id = NOTIFICATION_IDS[type];
        await LocalNotifications.cancel({ notifications: [{ id }] });
        console.log(`Cancelled notification type: ${type}`);
    } catch (error) {
        console.warn(`Error cancelling notification ${type}:`, error);
    }
};
