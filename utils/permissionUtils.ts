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
 * Robustly check if all required permissions are granted.
 * Categories: Camera, Location, Notifications, Nearby Devices, Photos/Videos, Contacts
 */
export const checkRequiredPermissions = async () => {
    if (!Capacitor.isNativePlatform()) return { allGranted: true, missing: [] };

    const missing: string[] = [];
    const permissions = (window as any).plugins?.permissions;
    const isAndroid = Capacitor.getPlatform() === 'android';

    try {
        // 1. Notifications (Standard Capacitor)
        const notif = await LocalNotifications.checkPermissions();
        if (notif.display !== 'granted') missing.push('Notifications');

        // 2. Location
        const loc = await Geolocation.checkPermissions();
        if (loc.location !== 'granted') missing.push('Location');

        // 3. Camera
        const cam = await Camera.checkPermissions();
        if (cam.camera !== 'granted') missing.push('Camera');

        // 4. Photos/Gallery (Handle Android 13 vs legacy)
        if (cam.photos !== 'granted') missing.push('Photos and videos');

        // 5. Contacts
        const contacts = await Contacts.checkPermissions();
        if (contacts.contacts !== 'granted') missing.push('Contacts');

        // 6. Nearby Devices & Media Audio (Android Specific forcefully)
        if (isAndroid && permissions) {
            const checks = [
                { id: permissions.BLUETOOTH_SCAN, label: 'Nearby devices' },
                { id: permissions.READ_MEDIA_AUDIO, label: 'Music and audio' }
            ];

            for (const c of checks) {
                if (!c.id) continue;
                await new Promise((resolve) => {
                    permissions.checkPermission(c.id, (s: any) => {
                        if (!s.hasPermission) missing.push(c.label);
                        resolve(true);
                    });
                });
            }
        } else if (!isAndroid) {
            // iOS logic for Bluetooth etc.
        }
    } catch (e) {
        console.error('[PermissionUtils] Error during check:', e);
    }

    const uniqueMissing = [...new Set(missing)];
    return {
        allGranted: uniqueMissing.length === 0,
        missing: uniqueMissing
    };
};

/**
 * Request ALL required device permissions using a unified Brute Force block.
 */
export const requestAllPermissions = async () => {
    if (!Capacitor.isNativePlatform()) return;

    console.log('[PermissionUtils] Starting UNIFIED NATIVE permission request block...');

    const permissions = (window as any).plugins?.permissions;
    const isAndroid = Capacitor.getPlatform() === 'android';

    if (isAndroid && permissions) {
        // The Big Block - Request everything in one go
        const bigBlock = [
            permissions.CAMERA,
            permissions.ACCESS_FINE_LOCATION,
            permissions.ACCESS_COARSE_LOCATION,
            permissions.READ_MEDIA_IMAGES,
            permissions.READ_MEDIA_VIDEO,
            permissions.READ_MEDIA_AUDIO,
            permissions.BLUETOOTH_SCAN,
            permissions.BLUETOOTH_CONNECT,
            permissions.READ_CONTACTS
        ].filter(p => !!p);

        console.log('[PermissionUtils] Firing Native Brute Force Block:', bigBlock);
        
        await new Promise((resolve) => {
            permissions.requestPermissions(bigBlock, (s: any) => resolve(s), (err: any) => resolve(err));
        });

        await delay(1000);
    } else {
        // Fallback or iOS
        try { await Camera.requestPermissions({ permissions: ['camera', 'photos'] }); } catch (e) {}
        await delay(800);
        try { await Geolocation.requestPermissions(); } catch (e) {}
        await delay(800);
        try { await Contacts.requestPermissions(); } catch (e) {}
        await delay(800);
    }

    // Final separate step for Notifications as it's a different system dialog
    try {
        console.log('[PermissionUtils] Firing Notifications prompt...');
        await LocalNotifications.requestPermissions();
    } catch (e) {}

    console.log('[PermissionUtils] Brute Force flow finished.');
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
