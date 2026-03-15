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
 * Robustly check if all 6 required permissions are granted.
 */
export const checkRequiredPermissions = async () => {
    if (!Capacitor.isNativePlatform()) return { allGranted: true, missing: [] };

    const missing: string[] = [];
    
    try {
        // 1. Notifications
        const notif = await LocalNotifications.checkPermissions();
        if (notif.display !== 'granted') missing.push('Notifications');

        // 2. Location
        const loc = await Geolocation.checkPermissions();
        if (loc.location !== 'granted') missing.push('Location');

        // 3. Camera
        const cam = await Camera.checkPermissions();
        if (cam.camera !== 'granted') missing.push('Camera');

        // 4. Photos/Videos (Gallery)
        if (cam.photos !== 'granted') missing.push('Photos and videos');

        // 5. Contacts
        const contacts = await Contacts.checkPermissions();
        if (contacts.contacts !== 'granted') missing.push('Contacts');

        // 6. Nearby Devices (Bluetooth) - Use direct native check if possible
        const permissions = (window as any).plugins?.permissions;
        if (permissions && Capacitor.getPlatform() === 'android') {
            await new Promise((resolve) => {
                permissions.checkPermission(permissions.BLUETOOTH_SCAN, (status: any) => {
                    if (!status.hasPermission) missing.push('Nearby devices');
                    resolve(true);
                });
            });
            
            // Also check Audio for Android 13
            await new Promise((resolve) => {
                permissions.checkPermission(permissions.READ_MEDIA_AUDIO, (status: any) => {
                    if (!status.hasPermission) missing.push('Music and audio');
                    resolve(true);
                });
            });
        }
    } catch (e) {
        console.error('[PermissionUtils] Error during check:', e);
    }

    return {
        allGranted: missing.length === 0,
        missing
    };
};

/**
 * Request ALL required device permissions at once in a strict, sequential way.
 */
export const requestAllPermissions = async () => {
    if (!Capacitor.isNativePlatform()) return;

    console.log('[PermissionUtils] Starting STRICT unified permission request flow...');

    // We start with Location & Camera (highest priority for app core features)
    
    // 1. Location
    try {
        console.log('[PermissionUtils] Step 1: Location');
        await Geolocation.requestPermissions();
    } catch (e) {}

    await delay(1500);

    // 2. Camera & Photos
    try {
        console.log('[PermissionUtils] Step 2: Camera & Photos');
        await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    } catch (e) {}

    await delay(1500);

    // 3. Direct Android Block (Bluetooth, Media, Contacts)
    const permissions = (window as any).plugins?.permissions;
    if (permissions && Capacitor.getPlatform() === 'android') {
        const groups = [
            [permissions.BLUETOOTH_SCAN, permissions.BLUETOOTH_CONNECT],
            [permissions.READ_MEDIA_AUDIO, permissions.READ_CONTACTS]
        ];

        for (const group of groups) {
            try {
                console.log('[PermissionUtils] Step 3: Native Group', group);
                await new Promise((resolve) => {
                    permissions.requestPermissions(group, (s: any) => resolve(s), (err: any) => resolve(err));
                });
                await delay(1500);
            } catch (err) {}
        }
    } else {
        // iOS / Fallback
        try { await BleClient.initialize(); } catch (e) {}
        await delay(1500);
        try { await Contacts.requestPermissions(); } catch (e) {}
        await delay(1500);
    }

    // 4. Notifications (Final step)
    try {
        console.log('[PermissionUtils] Step 4: Notifications');
        await LocalNotifications.requestPermissions();
    } catch (e) {}

    console.log('[PermissionUtils] Strict flow finished.');
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
