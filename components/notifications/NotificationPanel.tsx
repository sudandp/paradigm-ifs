import React, { useMemo } from 'react';
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
    Inbox,
    Clock,
    X,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';
import type { Notification, NotificationType } from '../../types';
import Button from '../ui/Button';

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

export const NotificationPanel: React.FC<{ isOpen: boolean; onClose: () => void; isMobile?: boolean }> = ({ isOpen, onClose, isMobile = false }) => {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();
    const navigate = useNavigate();
    const [currentPage, setCurrentPage] = React.useState(1);
    const [pageSize, setPageSize] = React.useState(5);
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [currentPage]);

    const handleNotificationClick = (notification: Notification) => {
        markAsRead(notification.id);
        if (notification.linkTo) {
            navigate(notification.linkTo);
        }
        if (window.innerWidth < 768) {
            onClose();
        }
    };

    const groupedNotifications = useMemo(() => {
        const groups: { title: string; items: Notification[] }[] = [
            { title: 'Today', items: [] },
            { title: 'Yesterday', items: [] },
            { title: 'Earlier', items: [] }
        ];

        const startIndex = (currentPage - 1) * pageSize;
        const pagedNotifs = notifications.slice(startIndex, startIndex + pageSize);

        pagedNotifs.forEach(notif => {
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
    }, [notifications, currentPage, pageSize]);

    const totalPages = Math.ceil(notifications.length / pageSize);

    if (!isOpen) return null;

    return (
        <div className={`h-full w-full flex flex-col animate-in slide-in-from-right duration-300 ${isMobile ? 'bg-[#0A3D2E]' : 'bg-white'}`}>
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-5 border-b ${isMobile ? 'bg-[#0A3D2E] border-white/10' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center gap-3">
                    <h4 className={`font-bold text-xl ${isMobile ? 'text-white' : 'text-gray-900'}`}>Notifications</h4>
                    {unreadCount > 0 && (
                        <span className={`px-2 py-0.5 text-xs rounded-full font-bold ${
                            isMobile 
                            ? 'bg-accent text-[#041b0f] shadow-[0_0_10px_rgba(34,197,94,0.2)]' 
                            : 'bg-accent/10 text-accent border border-accent/20'
                        }`}>
                            {unreadCount} New
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                        <button
                            onClick={() => markAllAsRead()}
                            className={`text-xs font-bold px-2 py-1 rounded-lg transition-colors ${isMobile ? 'text-accent hover:bg-white/5' : 'text-accent hover:bg-accent/5'}`}
                        >
                            Mark all read
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className={`p-2 rounded-xl transition-all ${isMobile ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-muted hover:text-primary-text hover:bg-page'}`}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div 
                ref={scrollContainerRef}
                className={`flex-1 overflow-y-auto custom-scrollbar ${isMobile ? 'bg-[#0A3D2E]' : 'bg-white'}`}
            >
                {groupedNotifications.length > 0 ? (
                    <div className={`divide-y pt-2 ${isMobile ? 'divide-white/5' : 'divide-gray-50'}`}>
                        {groupedNotifications.map((group) => (
                            <div key={group.title} className="pb-4">
                                <div className={`px-6 py-3 ${isMobile ? 'bg-white/5' : 'bg-gray-50/50'}`}>
                                    <h5 className={`text-[10px] font-black uppercase tracking-[0.15em] flex items-center gap-2 ${isMobile ? 'text-white/50' : 'text-muted/60'}`}>
                                        <div className="w-1 h-3 bg-accent/40 rounded-full" />
                                        {group.title}
                                    </h5>
                                </div>
                                
                                <div className={`divide-y ${isMobile ? 'divide-white/5' : 'divide-gray-50'}`}>
                                    {group.items.map((notif) => (
                                        <div
                                            key={notif.id}
                                            onClick={() => handleNotificationClick(notif)}
                                            className={`group relative flex items-start gap-4 px-6 py-4 cursor-pointer transition-all duration-300 ${
                                                !notif.isRead
                                                ? isMobile ? 'bg-white/5 hover:bg-white/10' : 'bg-accent/5 hover:bg-accent/10'
                                                : isMobile ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                                            }`}
                                        >
                                            {!notif.isRead && (
                                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-10 bg-accent rounded-r-full" />
                                            )}
                                            
                                            <NotificationIcon type={notif.type} size="h-4 w-4" />
                                            
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm leading-relaxed mb-1.5 ${
                                                    !notif.isRead 
                                                    ? isMobile ? 'text-white font-semibold' : 'text-gray-900 font-semibold' 
                                                    : isMobile ? 'text-white/70 font-normal' : 'text-gray-600 font-normal'
                                                }`}>
                                                    {notif.message}
                                                </p>
                                                <span className={`text-[11px] flex items-center gap-1 ${isMobile ? 'text-white/50' : 'text-muted'}`}>
                                                    <Clock className="h-3 w-3" />
                                                    {formatDistanceToNow(parseISO(notif.createdAt), { addSuffix: true })}
                                                </span>
                                            </div>
                                            
                                            <button 
                                                className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all ${isMobile ? 'text-white/50 hover:text-white' : 'text-muted hover:text-accent'}`}
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
                            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center rotate-6 ${isMobile ? 'bg-white/5' : 'bg-gray-50'}`}>
                                <Inbox className={`h-10 w-10 ${isMobile ? 'text-white/10' : 'text-gray-200'}`} />
                            </div>
                            <div className={`absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl shadow-lg border flex items-center justify-center -rotate-6 ${isMobile ? 'bg-[#0A3D2E] border-white/10' : 'bg-white border-gray-100'}`}>
                                <Check className="h-5 w-5 text-accent" />
                            </div>
                        </div>
                        <h5 className={`font-bold text-lg mb-2 ${isMobile ? 'text-white' : 'text-gray-900'}`}>No notifications</h5>
                        <p className={`text-sm ${isMobile ? 'text-white/40' : 'text-gray-400'}`}>You're all caught up!</p>
                    </div>
                )}
            </div>
            
            {/* Footer */}
            {notifications.length > 0 && (
                <div className={`px-6 py-6 border-t ${isMobile ? 'bg-[#0A3D2E] border-white/10' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex flex-col gap-6">
                        {/* Mobile Optimized Layout: Stacks on mobile, Side-by-side on desktop */}
                        <div className={`flex ${isMobile ? 'flex-col gap-6' : 'items-center justify-between gap-4'}`}>
                            
                            {/* Page Size Selector */}
                            <div className={`flex flex-col ${isMobile ? 'items-center w-full' : 'gap-2'}`}>
                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 ${isMobile ? 'text-white/40' : 'text-muted/60'}`}>
                                    Items per page
                                </span>
                                <div className="flex items-center gap-2">
                                    {[5, 10, 15, 20, 50].map(size => (
                                        <button
                                            key={size}
                                            onClick={() => {
                                                setPageSize(size);
                                                setCurrentPage(1);
                                            }}
                                            className={`min-w-[40px] h-9 px-2 rounded-xl text-xs font-bold transition-all duration-300 border ${
                                                pageSize === size
                                                ? isMobile 
                                                    ? 'bg-accent text-[#041b0f] border-accent shadow-[0_0_15px_rgba(34,197,94,0.3)]' 
                                                    : 'bg-accent text-white border-accent shadow-sm'
                                                : isMobile
                                                    ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:border-accent hover:text-accent'
                                            }`}
                                        >
                                            {size}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Navigation Controls */}
                            {totalPages > 1 && (
                                <div className={`flex flex-col ${isMobile ? 'items-center w-full' : 'items-end text-right gap-2'}`}>
                                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 ${isMobile ? 'text-white/40' : 'text-muted/60'}`}>
                                        Navigation
                                    </span>
                                    <div className="flex items-center gap-4">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className={`!p-2 h-10 w-10 !rounded-xl ${isMobile ? 'bg-white/5 text-white border-white/10 hover:bg-white/10 disabled:opacity-20' : 'bg-white disabled:opacity-40'}`}
                                        >
                                            <ChevronLeft className="h-5 w-5" />
                                        </Button>
                                        
                                        <div className={`flex items-baseline gap-1.5 ${isMobile ? 'text-white' : 'text-gray-900'}`}>
                                            <span className="text-sm font-black tracking-wider">{currentPage}</span>
                                            <span className="text-[10px] font-bold text-muted/40 uppercase tracking-tighter">of</span>
                                            <span className="text-sm font-black tracking-wider">{totalPages}</span>
                                        </div>
                                        
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            className={`!p-2 h-10 w-10 !rounded-xl ${isMobile ? 'bg-white/5 text-white border-white/10 hover:bg-white/10 disabled:opacity-20' : 'bg-white disabled:opacity-40'}`}
                                        >
                                            <ChevronRight className="h-5 w-5" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Divider for Desktop */}
                        {!isMobile && <div className="w-full h-px bg-gray-100" />}
                        
                        {/* Action Link */}
                        <div className="text-center pt-2">
                            <button 
                                className={`group flex items-center justify-center gap-2 mx-auto text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${
                                    isMobile ? 'text-accent/80 hover:text-white' : 'text-muted hover:text-accent'
                                }`}
                            >
                                <span>All Notifications</span>
                                <div className={`w-4 h-px transition-all duration-300 group-hover:w-8 ${isMobile ? 'bg-accent/30 group-hover:bg-accent' : 'bg-muted/30 group-hover:bg-accent'}`} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
