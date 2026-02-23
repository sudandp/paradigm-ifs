import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import type { SupportTicket, User } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { Loader2, Plus, LifeBuoy, Users, Phone, MessageSquare, Video, Search, Filter, UserCheck, AlertTriangle } from 'lucide-react';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import { formatDistanceToNow } from 'date-fns';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { ProfilePlaceholder } from '../../components/ui/ProfilePlaceholder';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';

const PriorityIndicator: React.FC<{ priority: SupportTicket['priority'] }> = ({ priority }) => {
    const styles = {
        Low: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]',
        Medium: 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]',
        High: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]',
        Urgent: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
    };
    return <span className={`w-3 h-3 rounded-full ${styles[priority]}`} title={`Priority: ${priority}`}></span>;
};

const StatusChip: React.FC<{ status: SupportTicket['status'] }> = ({ status }) => {
    const styles = {
        Open: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        'In Progress': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        'Pending Requester': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        Resolved: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
        Closed: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
            {status}
        </span>
    );
};

const TicketCard: React.FC<{ ticket: SupportTicket, onClick: () => void }> = ({ ticket, onClick }) => (
    <div
        onClick={onClick}
        className="group bg-card hover:bg-accent/5 p-5 rounded-xl border border-border hover:border-accent cursor-pointer transition-all duration-300 flex flex-col justify-between h-full shadow-sm hover:shadow-md"
    >
        <div>
            <div className="flex justify-between items-start gap-3 mb-2">
                <h4 className="font-bold text-primary-text leading-snug group-hover:text-accent transition-colors line-clamp-2">
                    {ticket.title}
                </h4>
                <div className="flex-shrink-0 mt-1"><PriorityIndicator priority={ticket.priority} /></div>
            </div>
            <p className="text-xs text-muted font-mono">#{ticket.ticketNumber}</p>
        </div>
        <div className="mt-4 pt-4 border-t border-border/50">
            <div className="flex justify-between items-center text-xs text-muted mb-3">
                <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[10px] text-white font-bold">
                        {ticket.raisedByName.charAt(0)}
                    </div>
                    <span>{ticket.raisedByName}</span>
                </div>
                <span>{formatDistanceToNow(new Date(ticket.raisedAt), { addSuffix: true })}</span>
            </div>
            <div className="flex justify-between items-center">
                <StatusChip status={ticket.status} />
            </div>
        </div>
    </div>
);

const NearbyUserItem: React.FC<{ user: User, onAction: (phone?: string) => void }> = ({ user, onAction }) => (
    <div className="flex items-center gap-4 p-3 rounded-xl bg-card border border-border hover:border-accent/50 transition-colors">
        <div className="relative">
            <ProfilePlaceholder photoUrl={user.photoUrl} seed={user.id} className="w-12 h-12 rounded-full shadow-sm" />
            {/* Larger, more visible status indicator: bright green if checked in, red if not */}
            <span className={`absolute -bottom-0.5 -right-0.5 block h-4 w-4 rounded-full ${user.isAvailable ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-rose-600 shadow-[0_0_6px_rgba(225,29,72,0.6)]'} ring-2 ring-white`}></span>
        </div>
        <div className="flex-grow min-w-0">
            <p className="text-sm font-bold text-primary-text truncate">{user.name}</p>
            <p className="text-xs text-muted truncate">{user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
        </div>
        <div className="flex items-center gap-1">
            <Button
                variant="icon"
                size="sm"
                className="hover:opacity-90 transition-opacity border"
                style={{ backgroundColor: '#006B3F', color: '#FFFFFF', borderColor: '#005632' }}
                title="Call"
                onClick={() => onAction(user.phone)}
            >
                <Phone className="h-4 w-4" />
            </Button>
            <Button
                variant="icon"
                size="sm"
                className="hover:opacity-90 transition-opacity border"
                style={{ backgroundColor: '#006B3F', color: '#FFFFFF', borderColor: '#005632' }}
                title="Message"
                onClick={() => onAction(user.phone)}
            >
                <MessageSquare className="h-4 w-4" />
            </Button>
            <Button
                variant="icon"
                size="sm"
                className="hover:opacity-90 transition-opacity border"
                style={{ backgroundColor: '#006B3F', color: '#FFFFFF', borderColor: '#005632' }}
                title="Video"
                onClick={() => onAction(user.phone)}
            >
                <Video className="h-4 w-4" />
            </Button>
        </div>
    </div>
);

const SupportDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();

    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [nearbyUsers, setNearbyUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [filterCategory, setFilterCategory] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isNearbyModalOpen, setIsNearbyModalOpen] = useState(false);
    const isMobile = useMediaQuery('(max-width: 767px)');

    const [filters, setFilters] = useState({
        status: 'all',
        priority: 'all',
        searchTerm: ''
    });

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            setIsLoading(true);
            try {
                const [ticketsData, usersData] = await Promise.all([
                    api.getSupportTickets(),
                    api.getNearbyUsers()
                ]);
                setTickets(ticketsData);
                setNearbyUsers(usersData.filter(nu => nu.id !== user.id));
            } catch (error) {
                setToast({ message: 'Failed to load support data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [user]);

    const filteredTickets = useMemo(() => {
        return tickets.filter(ticket => {
            const statusMatch = filters.status === 'all' || ticket.status === filters.status;
            const priorityMatch = filters.priority === 'all' || ticket.priority === filters.priority;
            const searchMatch = filters.searchTerm === '' ||
                ticket.title.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
                ticket.ticketNumber.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
                ticket.description.toLowerCase().includes(filters.searchTerm.toLowerCase());
            return statusMatch && priorityMatch && searchMatch;
        });
    }, [tickets, filters]);

    const stats = useMemo(() => {
        const userActionTickets = tickets.filter(t => t.status === 'Resolved' && t.raisedById === user?.id);
        return {
            open: tickets.filter(t => t.status === 'Open').length,
            inProgress: tickets.filter(t => t.status === 'In Progress').length,
            pendingYourAction: userActionTickets.length,
        }
    }, [tickets, user]);

    const handleNewTicketSuccess = (newTicket: SupportTicket) => {
        setTickets(prev => [newTicket, ...prev]);
        setToast({ message: 'New ticket created successfully!', type: 'success' });
        navigate(`/support/ticket/${newTicket.id}`);
    };

    const openWhatsAppChat = (phone?: string) => {
        if (!phone) {
            setToast({ message: 'User does not have a phone number.', type: 'error' });
            return;
        }
        let numberToCall = phone.replace(/\D/g, '');
        if (numberToCall.length > 10) numberToCall = numberToCall.slice(-10);
        if (numberToCall.length !== 10) {
            setToast({ message: 'Invalid phone number format.', type: 'error' });
            return;
        }
        window.open(`https://wa.me/91${numberToCall}`, '_blank');
    };

    const StatCard: React.FC<{ title: string, value: number, icon: React.ReactNode, colorClass: string }> = ({ title, value, icon, colorClass }) => (
        <div className="bg-transparent p-5 rounded-2xl flex items-center justify-between transition-all">
            <div>
                <p className="text-sm font-medium text-muted mb-1">{title}</p>
                <p className={`text-3xl font-bold ${colorClass.replace('bg-', 'text-').split(' ')[0]}`}>{value}</p>
            </div>
            <div className={`p-3 rounded-full ${colorClass.replace('text-', 'bg-')} bg-opacity-90 shadow-sm`}>
                {React.cloneElement(icon as React.ReactElement, { className: 'h-6 w-6 text-white' })}
            </div>
        </div>
    );

    return (
        <div className="w-full p-4 lg:p-8 space-y-8">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            {/* Modals */}

            <Modal
                isOpen={isNearbyModalOpen}
                onClose={() => setIsNearbyModalOpen(false)}
                title="Nearby Available Support"
                onConfirm={() => setIsNearbyModalOpen(false)}
                confirmButtonText="Close"
            >
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                    {nearbyUsers.length > 0 ? (
                        nearbyUsers.map(u => (
                            <NearbyUserItem key={u.id} user={u} onAction={openWhatsAppChat} />
                        ))
                    ) : (
                        <div className="text-center py-8 text-muted">
                            <Users className="h-10 w-10 mx-auto mb-2 opacity-20" />
                            <p>No support staff found nearby.</p>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Header Section */}
            <div className="relative overflow-hidden rounded-3xl bg-transparent p-6 lg:p-10 transition-all">

                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-emerald-50 rounded-lg backdrop-blur-sm">
                                <LifeBuoy className="h-6 w-6 text-emerald-600" />
                            </div>
                            <h2 className="text-2xl lg:text-3xl font-bold text-primary-text">Support & Audit</h2>
                        </div>
                        <p className="text-muted max-w-xl text-sm">
                            Track issues, request audits, and connect with support staff in real-time.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                        {isMobile && (
                            <Button
                                onClick={() => setIsNearbyModalOpen(true)}
                                variant="secondary"
                                className="flex-1 lg:flex-none bg-gray-100 text-gray-900 hover:bg-gray-200 border-none shadow-none p-0 text-sm transition-colors"
                            >
                                <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Nearby
                            </Button>
                        )}
                        {(user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'hr' || user?.role === 'hr_ops' || user?.role === 'developer') && (
                            <Button
                                onClick={() => navigate('/support/alerts')}
                                variant="secondary"
                                className="flex-1 lg:flex-none bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border-red-200"
                            >
                                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Broadcast Alert
                            </Button>
                        )}
                        <Button
                            onClick={() => navigate('/support/ticket/new')}
                            className="flex-1 lg:flex-none"
                        >
                            <Plus className="mr-1.5 h-3.5 w-3.5" /> New Ticket
                        </Button>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
                <StatCard
                    title="Open Tickets"
                    value={stats.open}
                    icon={<LifeBuoy className="h-6 w-6" />}
                    colorClass="text-rose-500"
                />
                <StatCard
                    title="In Progress"
                    value={stats.inProgress}
                    icon={<Loader2 className="h-6 w-6" />}
                    colorClass="text-blue-500"
                />
                <StatCard
                    title="Pending Your Action"
                    value={stats.pendingYourAction}
                    icon={<UserCheck className="h-6 w-6" />}
                    colorClass="text-amber-500"
                />
            </div>

            <div className="lg:grid lg:grid-cols-3 lg:gap-8">
                {/* Main Content - Ticket List */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-transparent p-5 rounded-2xl">
                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <div className="relative flex-grow">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    id="search"
                                    placeholder="Search tickets..."
                                    className="!pl-10 bg-gray-50 border-gray-200"
                                    value={filters.searchTerm}
                                    onChange={e => setFilters(f => ({ ...f, searchTerm: e.target.value }))}
                                />
                            </div>
                            <div className="flex gap-2">
                                <div className="w-32 sm:w-40">
                                    <Select
                                        value={filters.status}
                                        onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                                        className="bg-gray-50 border-gray-200"
                                    >
                                        <option value="all">All Status</option>
                                        <option>Open</option>
                                        <option>In Progress</option>
                                        <option value="Pending Requester">Pending</option>
                                        <option>Resolved</option>
                                        <option>Closed</option>
                                    </Select>
                                </div>
                                <div className="w-32 sm:w-40">
                                    <Select
                                        value={filters.priority}
                                        onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
                                        className="bg-gray-50 border-gray-200"
                                    >
                                        <option value="all">All Priority</option>
                                        <option>Low</option>
                                        <option>Medium</option>
                                        <option>High</option>
                                        <option>Urgent</option>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="flex justify-center items-center h-64">
                                <Loader2 className="h-8 w-8 animate-spin text-accent" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {filteredTickets.length > 0 ? filteredTickets.map(ticket => (
                                    <TicketCard key={ticket.id} ticket={ticket} onClick={() => navigate(`/support/ticket/${ticket.id}`)} />
                                )) : (
                                    <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted">
                                        <div className="p-4 bg-accent/5 rounded-full mb-3">
                                            <Search className="h-8 w-8 opacity-50" />
                                        </div>
                                        <p>No tickets match your filters.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar - Nearby Users (Desktop) */}
                <aside className="hidden lg:block space-y-6">
                    <div className="bg-card p-6 rounded-2xl border border-border shadow-sm sticky top-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-lg text-primary-text flex items-center gap-2">
                                <Users className="h-5 w-5 text-accent" /> Nearby Support
                            </h3>
                            <span className="text-xs font-medium bg-accent/10 text-accent px-2 py-1 rounded-full">
                                {nearbyUsers.filter(u => u.isAvailable).length} Online
                            </span>
                        </div>

                        <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-1 custom-scrollbar">
                            {nearbyUsers.length > 0 ? (
                                nearbyUsers.map(u => (
                                    <NearbyUserItem key={u.id} user={u} onAction={openWhatsAppChat} />
                                ))
                            ) : (
                                <div className="text-center py-8 text-muted">
                                    <p>No support staff found nearby.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default SupportDashboard;