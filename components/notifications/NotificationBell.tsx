import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../../store/notificationStore';
import { Bell, UserPlus, AlertTriangle, ClipboardCheck, Shield, Info, Sun, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Notification, NotificationType } from '../../types';
import Button from '../ui/Button';

const NotificationIcon: React.FC<{ type: NotificationType }> = ({ type }) => {
    const iconMap: Record<NotificationType, React.ElementType> = {
        task_assigned: UserPlus,
        task_escalated: AlertTriangle,
        provisional_site_reminder: ClipboardCheck,
        security: Shield,
        info: Info,
        greeting: Sun,
    };
    const colorMap: Record<NotificationType, string> = {
        task_assigned: 'text-blue-500 dark:text-blue-400',
        task_escalated: 'text-orange-500 dark:text-orange-400',
        provisional_site_reminder: 'text-purple-500 dark:text-purple-400',
        security: 'text-red-500 dark:text-red-400',
        info: 'text-blue-400 dark:text-blue-300',
        greeting: 'text-yellow-500 dark:text-yellow-400',
    };
    const Icon = iconMap[type] || Bell;
    return <Icon className={`h-5 w-5 ${colorMap[type]}`} />;
};

const NotificationBell: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                panelRef.current &&
                !panelRef.current.contains(event.target as Node) &&
                triggerRef.current &&
                !triggerRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNotificationClick = (notification: Notification) => {
        markAsRead(notification.id);
        if (notification.linkTo) {
            navigate(notification.linkTo);
        }
        setIsOpen(false);
    };

    const handleMarkAll = () => {
        markAllAsRead();
    }

    return (
        <div className={`relative notification-bell ${className}`}>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className="btn-icon relative p-2 rounded-full hover:bg-page text-muted"
                aria-label={`Notifications (${unreadCount} unread)`}
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="notification-dot absolute top-0 right-0 block h-2.5 w-2.5 rounded-full bg-red-500" />
                )}
            </button>

            {isOpen && createPortal(
                <>
                    {/* Mobile Backdrop */}
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] md:hidden" onClick={() => setIsOpen(false)} />

                    {/* Notification Panel */}
                    <div
                        ref={panelRef}
                        className="fixed inset-x-4 top-20 bottom-20 z-[100] flex flex-col bg-white dark:!bg-[#0d1f12] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 md:absolute md:inset-auto md:top-16 md:right-4 md:mt-2 md:w-[400px] md:h-auto md:max-h-[600px] md:bottom-auto animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
                        style={{ position: window.innerWidth >= 768 ? 'absolute' : 'fixed' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:!bg-[#0d1f12]">
                            <div>
                                <h4 className="font-bold text-lg text-gray-900 dark:text-white">Notifications</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    You have {unreadCount} unread messages
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {unreadCount > 0 && (
                                    <span
                                        onClick={handleMarkAll}
                                        className="relative isolate overflow-hidden before:!content-none after:!content-none text-xs h-8 px-4 flex items-center justify-center rounded-3xl !bg-[#32CD32] hover:!bg-[#28a428] !text-[#0D1A0D] !font-bold cursor-pointer transition-colors"
                                        style={{ backgroundImage: 'none' }}
                                    >
                                        <span className="relative z-10">Mark all read</span>
                                    </span>
                                )}

                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:!bg-[#0d1f12] dark:[color-scheme:dark]">
                            {notifications.slice(0, 10).length > 0 ? (
                                <div className="divide-y divide-gray-100 dark:divide-white/20">
                                    {notifications.slice(0, 10).map((notif) => (
                                        <div
                                            key={notif.id}
                                            onClick={() => handleNotificationClick(notif)}
                                            className={`group flex items-start gap-4 p-5 cursor-pointer transition-all duration-200 ${!notif.isRead
                                                ? 'bg-emerald-50 dark:!bg-[#0d1f12] hover:bg-emerald-100 dark:hover:!bg-[#152b1b]'
                                                : 'bg-white dark:!bg-[#0d1f12] hover:bg-gray-50 dark:hover:!bg-[#152b1b]'
                                                }`}
                                        >
                                            <div className={`flex-shrink-0 p-2.5 rounded-full ${!notif.isRead ? 'bg-white dark:bg-[#1a2e1a] shadow-sm' : 'bg-gray-100 dark:bg-[#1a2e1a]'
                                                }`}>
                                                <NotificationIcon type={notif.type} />
                                            </div>
                                            <div className="flex-1 min-w-0 pt-1">
                                                <p className={`text-sm font-medium leading-snug mb-1.5 ${!notif.isRead ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
                                                    }`}>
                                                    {notif.message}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-500 flex items-center gap-1">
                                                    {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                                                </p>
                                            </div>
                                            {!notif.isRead && (
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2.5 flex-shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-64 text-center p-8">
                                    <div className="w-16 h-16 bg-gray-100 dark:bg-[#1a2e1a] rounded-full flex items-center justify-center mb-4">
                                        <Bell className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                                    </div>
                                    <h5 className="text-gray-900 dark:text-white font-medium mb-1">No notifications</h5>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        You're all caught up! Check back later.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};

export default NotificationBell;