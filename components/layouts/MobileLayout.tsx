import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import BottomNav from './BottomNav';
import { NotificationPanel } from '../notifications/NotificationPanel';
import { useNotificationStore } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';

const MobileLayout: React.FC = () => {
    const location = useLocation();
    const { fetchNotifications, isPanelOpen, setIsPanelOpen } = useNotificationStore();
    const { user } = useAuthStore();
    const [isHeaderVisible, setIsHeaderVisible] = useState(true);
    const lastScrollY = useRef(0);
    const ticking = useRef(false);

    useEffect(() => {
        const handleScroll = () => {
            if (!ticking.current) {
                window.requestAnimationFrame(() => {
                    const currentScrollY = window.scrollY;

                    // Show header when scrolling up or at top
                    // Hide header IMMEDIATELY when scrolling down
                    if (currentScrollY < lastScrollY.current || currentScrollY < 10) {
                        setIsHeaderVisible(true);
                    } else if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
                        // Hide immediately after scrolling down past 10px
                        setIsHeaderVisible(false);
                    }

                    lastScrollY.current = currentScrollY;
                    ticking.current = false;
                });
                ticking.current = true;
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (user) {
            fetchNotifications();
        }
    }, [user, fetchNotifications]);

    return (
        <div className="flex flex-col min-h-screen bg-[#041b0f]">
            {/* Mobile Header - Auto-hide on scroll (FAST) */}
            {/* Hide global header for specific standalone pages like Apply for Leave or Site Attendance Tracker */}
            {!location.pathname.startsWith('/leaves/apply') && 
             !location.pathname.startsWith('/onboarding/aadhaar-scan') && 
             !location.pathname.startsWith('/finance/attendance/add') && 
             !location.pathname.startsWith('/finance/attendance/edit') && 
             !location.pathname.startsWith('/finance/site-tracker/add') && 
             !location.pathname.startsWith('/finance/site-tracker/edit') && (
                <div
                    className={`sticky top-0 z-50 transition-transform duration-200 ${isHeaderVisible ? 'translate-y-0' : '-translate-y-full'
                        }`}
                >
                    <Header />
                </div>
            )}

            {/* Main Content Area */}
            {/* Increased bottom padding by 30% (9.1rem = 7rem * 1.3) for more clearance */}
            <main
                className="flex-1 overflow-y-auto px-4 pt-2"
                style={{ 
                    paddingBottom: (location.pathname.includes('/add') || location.pathname.includes('/edit'))
                        ? 'env(safe-area-inset-bottom)' 
                        : 'calc(9.1rem + env(safe-area-inset-bottom))' 
                }}
            >
                <Outlet />
            </main>

            {/* Bottom Navigation */}
            {!location.pathname.includes('/add') && 
             !location.pathname.includes('/edit') && (
                <BottomNav />
            )}

            {/* Notification Panel Overlay */}
            {isPanelOpen && (
                <div className="fixed inset-0 z-[100] animate-in slide-in-from-right duration-300">
                    <NotificationPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} isMobile={true} />
                </div>
            )}
        </div>
    );
};

export default MobileLayout;
