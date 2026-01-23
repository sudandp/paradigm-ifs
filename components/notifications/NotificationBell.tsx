import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../../store/notificationStore';
import { 
    Bell, 
    UserPlus, 
    AlertTriangle, 
    ClipboardCheck, 
    Shield, 
    Info, 
    Sun, 
    Check, 
    MoreHorizontal,
    Inbox,
    Clock,
    ArrowLeft
} from 'lucide-react';
import { formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';
import type { Notification, NotificationType } from '../../types';

const NotificationIcon: React.FC<{ type: NotificationType; size?: string }> = ({ type, size = "h-5 w-5" }) => {
    const iconMap: Record<NotificationType, React.ElementType> = {
        task_assigned: UserPlus,
        task_escalated: AlertTriangle,
        provisional_site_reminder: ClipboardCheck,
        security: Shield,
        info: Info,
        greeting: Sun,
    };

    const bgMap: Record<NotificationType, string> = {
        task_assigned: 'bg-indigo-50 text-indigo-600 border-indigo-100',
        task_escalated: 'bg-amber-50 text-amber-600 border-amber-100',
        provisional_site_reminder: 'bg-purple-50 text-purple-600 border-purple-100',
        security: 'bg-rose-50 text-rose-600 border-rose-100',
        info: 'bg-sky-50 text-sky-600 border-sky-100',
        greeting: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    };

    const Icon = iconMap[type] || Bell;
    const styleClasses = bgMap[type] || 'bg-gray-50 text-gray-500 border-gray-100';
    
    return (
        <div className={`flex-shrink-0 p-2 rounded-xl border ${styleClasses} transition-colors group-hover:scale-110 duration-300`}>
            <Icon className={size} />
        </div>
    );
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

    const groupedNotifications = useMemo(() => {
        const groups: { title: string; items: Notification[] }[] = [
            { title: 'Today', items: [] },
            { title: 'Yesterday', items: [] },
            { title: 'Earlier', items: [] }
        ];

        notifications.slice(0, 15).forEach(notif => {
            const date = parseISO(notif.createdAt);
            if (isToday(date)) {
                groups[0].items.push(notif);
            } else if (isYesterday(date)) {
                groups[1].items.push(notif);
            } else {
                groups[2].items.push(notif);
            }
        });

        return groups.filter(g => g.items.length > 0);
    }, [notifications]);

    return (
        <div className={`relative ${className}`}>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`group relative p-2.5 rounded-xl transition-all duration-300 btn-icon ${
                    isOpen 
                    ? 'bg-accent/10 text-emerald-400 ring-2 ring-emerald-400/20' 
                    : 'bg-transparent text-emerald-500 md:text-muted hover:bg-page hover:text-primary-text'
                }`}
            >
                <Bell className={`h-5 w-5 transition-transform duration-300 ${isOpen ? 'scale-110' : 'group-hover:rotate-12'}`} />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-red-600 text-[10px] items-center justify-center font-bold text-white shadow-lg border border-white">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    </span>
                )}
            </button>

            {isOpen && createPortal(
                <>
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[90] md:hidden" onClick={() => setIsOpen(false)} />

                    <div
                        ref={panelRef}
                        className="fixed inset-0 pt-safe z-[100] flex flex-col bg-[#0A3D2E] md:bg-white md:rounded-2xl md:shadow-[0_20px_50px_rgba(0,0,0,0.15)] md:border md:border-gray-100 md:absolute md:inset-auto md:top-16 md:right-0 md:mt-2 md:w-[420px] md:h-auto md:max-h-[640px] md:bottom-auto md:pt-0 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-300 overflow-hidden"
                        style={{ position: window.innerWidth >= 768 ? 'absolute' : 'fixed' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-4 md:px-6 md:py-5 bg-white border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="md:hidden flex items-center gap-1 -ml-2 px-2 py-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                >
                                    <ArrowLeft className="h-5 w-5" />
                                    <span className="text-base font-medium">Back</span>
                                </button>
                                <div className="md:block hidden">
                                    <h4 className="font-bold text-xl text-gray-900 flex items-center gap-2">
                                        Notifications
                                        {unreadCount > 0 && (
                                            <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-full">
                                                {unreadCount} New
                                            </span>
                                        )}
                                    </h4>
                                </div>
                            </div>
                            {unreadCount > 0 && (
                                <button
                                    onClick={() => markAllAsRead()}
                                    className="text-xs font-bold text-accent hover:bg-accent/5 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                                >
                                    <Check className="h-4 w-4" />
                                    <span className="hidden md:inline">Mark all as read</span>
                                </button>
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar pb-4 bg-[#0A3D2E] md:bg-white">
                            {groupedNotifications.length > 0 ? (
                                <div className="space-y-6 pt-4">
                                    {groupedNotifications.map((group) => (
                                        <div key={group.title} className="space-y-1">
                                            <div className="px-6 flex items-center justify-between">
                                                <h5 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/70 md:text-muted/60 flex items-center gap-2">
                                                    <div className="w-1 h-3 bg-accent/40 rounded-full" />
                                                    {group.title}
                                                </h5>
                                            </div>
                                            
                                            <div className="divide-y divide-gray-50/50">
                                                {group.items.map((notif) => (
                                                    <div
                                                        key={notif.id}
                                                        onClick={() => handleNotificationClick(notif)}
                                                        className={`group relative flex items-start gap-4 px-6 py-4 cursor-pointer transition-all duration-300 ${
                                                            !notif.isRead
                                                            ? 'bg-indigo-50/10 hover:bg-indigo-50/40'
                                                            : 'hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {!notif.isRead && (
                                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-accent rounded-r-full" />
                                                        )}
                                                        
                                                        <NotificationIcon type={notif.type} />
                                                        
                                                        <div className="flex-1 min-w-0">
                                                            <p className={`text-[14px] leading-relaxed mb-1.5 ${
                                                                !notif.isRead 
                                                                ? 'text-white md:text-gray-900 font-semibold md:font-semibold' 
                                                                : 'text-white/80 md:text-gray-600 font-medium md:font-normal'
                                                            }`}>
                                                                {notif.message}
                                                            </p>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[11px] text-white/80 md:text-muted flex items-center gap-1">
                                                                    <Clock className="h-3 w-3" />
                                                                    {formatDistanceToNow(parseISO(notif.createdAt), { addSuffix: true })}
                                                                </span>
                                                                {!notif.isRead && (
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                                                                )}
                                                            </div>
                                                        </div>
                                                        
                                                        <button 
                                                            className="opacity-0 group-hover:opacity-100 p-2 text-muted hover:text-primary-text rounded-xl transition-all"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                markAsRead(notif.id);
                                                            }}
                                                        >
                                                            <Check className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-24 text-center px-10">
                                    <div className="relative mb-6">
                                        <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center rotate-6">
                                            <Inbox className="h-10 w-10 text-gray-200" />
                                        </div>
                                        <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-white rounded-2xl shadow-lg border border-gray-100 flex items-center justify-center -rotate-6">
                                            <Check className="h-5 w-5 text-accent" />
                                        </div>
                                    </div>
                                    <h5 className="text-gray-900 font-bold text-lg mb-2">No notifications</h5>
                                    <p className="text-sm text-gray-400">
                                        You're all caught up! New messages will appear here.
                                    </p>
                                </div>
                            )}
                        </div>
                        
                        {/* Footer */}
                        {notifications.length > 0 && (
                            <div className="p-4 bg-[#0A3D2E] md:bg-gray-50 border-t border-white/10 md:border-gray-100 text-center">
                                <button className="text-xs font-bold text-white md:text-muted hover:text-white/80 md:hover:text-primary-text transition-colors">
                                    All Notifications
                                </button>
                            </div>
                        )}
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};

export default NotificationBell;