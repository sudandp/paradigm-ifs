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

    console.log('[PermissionUtils] Starting staggered unified permission request...');

    // 1. Notifications
    try {
        const notifResult = await LocalNotifications.requestPermissions();
        console.log('[PermissionUtils] Notification permission:', notifResult.display);
    } catch (e) { console.warn('Notification permission request failed', e); }

    await delay(1200); // Give the OS time to breathe

    // 2. Location
    try {
        const geoResult = await Geolocation.requestPermissions();
        console.log('[PermissionUtils] Location permission:', geoResult.location);
    } catch (e) { console.warn('Location permission request failed', e); }

    await delay(1200);

    // 3. Camera & Photos
    try {
        // Explicitly asking for both camera and photos
        // This targets both the Camera and "Photos and videos" sections
        const cameraResult = await Camera.requestPermissions({ 
            permissions: ['camera', 'photos'] 
        });
        console.log('[PermissionUtils] Camera/Photos permission result:', cameraResult);
    } catch (e) { console.warn('Camera/Photos permission request failed', e); }

    await delay(1200);

    // 4. Nearby Devices (Bluetooth)
    try {
        console.log('[PermissionUtils] Initializing BleClient for Nearby Devices prompt...');
        // BleClient initialize is the most reliable way to trigger the Bluetooth system prompt
        await BleClient.initialize();
        console.log('[PermissionUtils] Bluetooth LE initialized');
    } catch (e) { 
        console.warn('Bluetooth/Nearby Devices permission request failed or rejected', e); 
    }

    await delay(1200);

    // 5. Contacts
    try {
        const contactsResult = await Contacts.requestPermissions();
        console.log('[PermissionUtils] Contacts permission:', contactsResult.contacts);
    } catch (e) { console.warn('Contacts permission request failed', e); }

    console.log('[PermissionUtils] All staggered permission requests completed.');
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
