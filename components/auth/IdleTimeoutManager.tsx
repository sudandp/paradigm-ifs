
import React from 'react';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import { useAuthStore } from '../../store/authStore';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import { ShieldAlert } from 'lucide-react';

// Desktop/Web: 30 minutes of inactivity before showing warning
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
// User has 2 minutes to respond to the warning before auto-logout
const PROMPT_TIMEOUT = 2 * 60 * 1000; // 2 minutes

export const IdleTimeoutManager: React.FC = () => {
    const { logout } = useAuthStore();
    const navigate = useNavigate();

    const handleIdle = () => {
        logout();
        navigate('/auth/login', { replace: true });
    };

    // FORCE DISABLE on mobile/PWA as per user request to prevent auto-logout.
    // We treat anything not explicitly 'web' (desktop) as mobile.
    // Even on web, if the screen is small, we assume mobile.
    const isMobile = true; 
    // PREVIOUS LOGIC: useMediaQuery('(max-width: 768px)') || Capacitor.getPlatform() !== 'web';

    const { isIdle, countdown, reset } = useIdleTimer({
        onIdle: handleIdle,
        idleTimeout: IDLE_TIMEOUT,
        promptTimeout: PROMPT_TIMEOUT,
        disabled: isMobile
    });

    if (!isIdle) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm" aria-modal="true" role="dialog">
            <div className="bg-card rounded-xl shadow-card p-6 w-full max-w-md m-4 text-center animate-fade-in-scale">
                <ShieldAlert className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-primary-text">Are you still there?</h3>
                <p className="mt-2 text-muted">
                    For your security, you will be logged out due to inactivity.
                </p>
                <div className="my-6 text-4xl font-bold text-accent">
                    {Math.ceil(countdown / 1000)}
                </div>
                <p className="text-sm text-muted mb-6">
                    Click the button below to stay logged in.
                </p>
                <div className="flex justify-center gap-4">
                    <Button onClick={reset} variant="primary" size="lg">Stay Logged In</Button>
                </div>
            </div>
        </div>
    );
};
