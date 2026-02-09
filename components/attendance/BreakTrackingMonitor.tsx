import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import Toast from '../ui/Toast';
import { differenceInMinutes } from 'date-fns';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

const BreakTrackingMonitor: React.FC = () => {
    const { isOnBreak, lastBreakInTime, breakLimit } = useAuthStore();
    const [alert, setAlert] = useState<{ message: string; type: 'error' } | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const notificationIdRef = useRef<number>(Date.now());
    const hasNotifiedForCurrentBreak = useRef<boolean>(false);

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            LocalNotifications.requestPermissions();
        }
    }, []);

    const playAlertSound = () => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            
            const ctx = audioContextRef.current;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note

            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch (e) {
            console.warn('Failed to play alert sound:', e);
        }
    };

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isOnBreak && lastBreakInTime) {
            const checkBreakDuration = () => {
                const now = new Date();
                const breakStart = new Date(lastBreakInTime);
                const elapsedMinutes = differenceInMinutes(now, breakStart);

                if (elapsedMinutes >= breakLimit) {
                    const message = `Break Warning: You've been on break for ${elapsedMinutes} minutes. Please Break Out now!`;
                    
                    setAlert({
                        message,
                        type: 'error'
                    });
                    playAlertSound();

                    if (Capacitor.isNativePlatform() && !hasNotifiedForCurrentBreak.current) {
                        LocalNotifications.schedule({
                            notifications: [
                                {
                                    title: '�☕ 🏁 Break Warning',
                                    body: `⚠️ You are taking a long break! (${elapsedMinutes} mins). Please Break Out to resume work 🏃‍♂️💨`,
                                    id: notificationIdRef.current,
                                    schedule: { at: new Date(Date.now() + 500) },
                                    sound: 'beep.wav',
                                    extra: null
                                }
                            ]
                        });
                        hasNotifiedForCurrentBreak.current = true;
                    }
                }
            };

            // Run check every minute
            interval = setInterval(checkBreakDuration, 60000);
            
            // Run immediate check
            checkBreakDuration();
        } else {
            setAlert(null);
            hasNotifiedForCurrentBreak.current = false;
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isOnBreak, lastBreakInTime, breakLimit]);

    if (!alert) return null;

    return (
        <div className="fixed top-4 right-4 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300">
            <Toast 
                message={alert.message} 
                type={alert.type} 
                onDismiss={() => setAlert(null)} 
            />
        </div>
    );
};

export default BreakTrackingMonitor;
