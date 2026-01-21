import React, { useState, useEffect } from 'react';
import { 
    Bell, 
    Send, 
    Settings, 
    Shield, 
    Users, 
    Plus, 
    Trash2, 
    Save, 
    Info, 
    User as UserIcon,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Target,
    Filter,
    Mail
} from 'lucide-react';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Toast from '../../components/ui/Toast';
import Checkbox from '../../components/ui/Checkbox';
import { api } from '../../services/api';
import type { NotificationRule, NotificationType, User as AppUser, Role } from '../../types';

const EVENT_TYPES = [
    { value: 'check_in', label: 'Check-in Event', icon: CheckCircle2 },
    { value: 'check_out', label: 'Check-out Event', icon: Clock },
    { value: 'violation', label: 'Geofencing Violation', icon: AlertTriangle },
    { value: 'field_report', label: 'Field Report Submission', icon: Target },
    { value: 'task_assigned', label: 'Task Assignment', icon: Users },
    { value: 'leave_request', label: 'Leave Request', icon: Mail },
    { value: 'security_alert', label: 'Security Alert', icon: Shield }
];

const RECIPIENT_ROLES = [
    { value: 'direct_manager', label: 'Direct Reporting Manager' },
    { value: 'hr', label: 'HR Admin' },
    { value: 'ops_manager', label: 'Operations Manager' },
    { value: 'admin', label: 'System Administrator' },
    { value: 'finance', label: 'Finance Team' }
];

const NOTIFICATION_TYPES: { value: NotificationType; label: string }[] = [
    { value: 'info', label: 'Information' },
    { value: 'security', label: 'Security Alert' },
    { value: 'task_assigned', label: 'Task Update' },
    { value: 'greeting', label: 'General / Greeting' }
];

const NotificationsControl: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'rules' | 'broadcast'>('rules');
    const [rules, setRules] = useState<NotificationRule[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // New Rule Form State
    const [newRule, setNewRule] = useState<Partial<NotificationRule>>({
        eventType: 'check_in',
        recipientRole: 'direct_manager',
        isEnabled: true
    });

    // Broadcast Form State
    const [broadcastData, setBroadcastData] = useState({
        role: '',
        userIds: [] as string[],
        title: '',
        message: '',
        type: 'info' as NotificationType
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [fetchedRules, fetchedRoles, fetchedUsers] = await Promise.all([
                    api.getNotificationRules(),
                    api.getRoles(),
                    api.getUsers()
                ]);
                setRules(fetchedRules);
                setRoles(fetchedRoles);
                setUsers(fetchedUsers.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
            } catch (err) {
                setToast({ message: 'Failed to load data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleAddRule = async () => {
        setIsSaving(true);
        try {
            const rule = await api.saveNotificationRule(newRule);
            setRules([rule, ...rules]);
            setToast({ message: 'Rule added successfully.', type: 'success' });
            setNewRule({ eventType: 'check_in', recipientRole: 'direct_manager', isEnabled: true });
        } catch (err) {
            setToast({ message: 'Failed to add rule.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleRule = async (rule: NotificationRule) => {
        try {
            const updated = await api.saveNotificationRule({ ...rule, isEnabled: !rule.isEnabled });
            setRules(rules.map(r => r.id === rule.id ? updated : r));
        } catch (err) {
            setToast({ message: 'Failed to update rule.', type: 'error' });
        }
    };

    const handleDeleteRule = async (id: string) => {
        if (!confirm('Are you sure you want to delete this rule?')) return;
        try {
            await api.deleteNotificationRule(id);
            setRules(rules.filter(r => r.id !== id));
            setToast({ message: 'Rule deleted.', type: 'success' });
        } catch (err) {
            setToast({ message: 'Failed to delete rule.', type: 'error' });
        }
    };

    const handleBroadcast = async () => {
        if (!broadcastData.message) {
            setToast({ message: 'Please enter a message.', type: 'error' });
            return;
        }
        setIsSaving(true);
        try {
            await api.broadcastNotification(broadcastData);
            setToast({ message: 'Broadcast sent successfully!', type: 'success' });
            setBroadcastData({ role: '', userIds: [], title: '', message: '', type: 'info' });
        } catch (err) {
            setToast({ message: 'Failed to send broadcast.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            <AdminPageHeader title="Notification Management">
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setActiveTab('rules')} className={activeTab === 'rules' ? 'bg-accent text-white' : ''}>
                        <Settings className="mr-2 h-4 w-4" /> Rules
                    </Button>
                    <Button variant="secondary" onClick={() => setActiveTab('broadcast')} className={activeTab === 'broadcast' ? 'bg-accent text-white' : ''}>
                        <Send className="mr-2 h-4 w-4" /> Broadcast
                    </Button>
                </div>
            </AdminPageHeader>

            {activeTab === 'rules' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Add Rule Sidebar */}
                    <div className="lg:col-span-1 space-y-6">
                        <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
                            <h3 className="text-lg font-semibold mb-4 flex items-center">
                                <Plus className="mr-2 h-5 w-5 text-accent" /> New Dispatch Rule
                            </h3>
                            <div className="space-y-4">
                                <Select 
                                    label="When event occurs..." 
                                    value={newRule.eventType} 
                                    onChange={(e) => setNewRule({ ...newRule, eventType: e.target.value })}
                                >
                                    {EVENT_TYPES.map(et => (
                                        <option key={et.value} value={et.value}>{et.label}</option>
                                    ))}
                                </Select>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-primary-text">Notify this recipient...</label>
                                    <Select 
                                        value={newRule.recipientRole || ''} 
                                        onChange={(e) => setNewRule({ ...newRule, recipientRole: e.target.value, recipientUserId: undefined })}
                                    >
                                        <option value="">Select Role</option>
                                        {RECIPIENT_ROLES.map(role => (
                                            <option key={role.value} value={role.value}>{role.label}</option>
                                        ))}
                                    </Select>
                                    <div className="relative flex items-center py-2">
                                        <div className="flex-grow border-t border-border"></div>
                                        <span className="flex-shrink mx-4 text-xs text-muted uppercase">Or Specific User</span>
                                        <div className="flex-grow border-t border-border"></div>
                                    </div>
                                    <Select 
                                        value={newRule.recipientUserId || ''} 
                                        onChange={(e) => setNewRule({ ...newRule, recipientUserId: e.target.value, recipientRole: undefined })}
                                    >
                                        <option value="">Select User</option>
                                        {users.map(user => (
                                            <option key={user.id} value={user.id}>{user.name}</option>
                                        ))}
                                    </Select>
                                </div>

                                <Button className="w-full" onClick={handleAddRule} isLoading={isSaving}>
                                    Create Rule
                                </Button>
                            </div>
                        </section>

                                <div className="p-4 bg-accent/5 rounded-xl border border-accent/10">
                            <div className="flex items-start gap-3">
                                <Info className="h-5 w-5 text-accent mt-0.5" />
                                <div className="text-sm text-primary-text/80 space-y-2">
                                    <p>Rules define automatic notification routing based on system events.</p>
                                    <p><strong>Example:</strong> If you set "Violation" to "HR Admin", every geofencing violation will trigger an alert to all HR users.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Rules List */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold flex items-center">
                                <Filter className="mr-2 h-5 w-5 text-muted" /> Active Rules ({rules.length})
                            </h3>
                        </div>

                        {rules.map(rule => {
                            const eventType = EVENT_TYPES.find(et => et.value === rule.eventType);
                            const Icon = eventType?.icon || Bell;
                            const recipientUser = rule.recipientUserId ? users.find(u => u.id === rule.recipientUserId) : null;
                            const recipientRole = RECIPIENT_ROLES.find(r => r.value === rule.recipientRole);

                            return (
                                <div key={rule.id} className={`bg-card p-4 rounded-xl border transition-all ${rule.isEnabled ? 'border-border' : 'border-dashed opacity-60'}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-2 rounded-lg ${rule.isEnabled ? 'bg-accent/10 text-accent' : 'bg-muted/10 text-muted'}`}>
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-primary-text">{eventType?.label || rule.eventType}</p>
                                                <p className="text-sm text-muted">
                                                    Notifies: <span className="font-medium text-emerald-600">
                                                        {recipientUser ? `User: ${recipientUser.name}` : (recipientRole?.label || rule.recipientRole)}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-2 pr-4 border-r border-border">
                                                <span className="text-xs text-muted uppercase font-bold tracking-wider">Active</span>
                                                <Checkbox 
                                                    id={`rule-${rule.id}`} 
                                                    label=""
                                                    checked={rule.isEnabled} 
                                                    onChange={() => handleToggleRule(rule)} 
                                                />
                                            </div>
                                            <Button variant="icon" onClick={() => handleDeleteRule(rule.id)} className="text-red-500 hover:bg-red-50">
                                                <Trash2 className="h-5 w-5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {rules.length === 0 && (
                            <div className="text-center py-20 bg-card rounded-xl border border-dashed border-border">
                                <Settings className="h-12 w-12 text-muted mx-auto mb-4 opacity-20" />
                                <p className="text-muted">No dispatch rules configured yet.</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="max-w-3xl mx-auto space-y-6">
                    <section className="bg-card p-8 rounded-2xl border border-border shadow-lg">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-3 bg-emerald-500 rounded-2xl text-white shadow-emerald-200 shadow-xl">
                                <Send className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">Compose Broadcast</h3>
                                <p className="text-muted text-sm">Send a custom notification to targeted groups.</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Select 
                                    label="Target Audience" 
                                    value={broadcastData.role} 
                                    onChange={(e) => setBroadcastData({ ...broadcastData, role: e.target.value, userIds: [] })}
                                >
                                    <option value="">Specific Users</option>
                                    <option value="all">Everyone</option>
                                    {roles.map(r => (
                                        <option key={r.id} value={r.id}>{r.displayName}</option>
                                    ))}
                                </Select>

                                <Select 
                                    label="Alert Level" 
                                    value={broadcastData.type} 
                                    onChange={(e) => setBroadcastData({ ...broadcastData, type: e.target.value as NotificationType })}
                                >
                                    {NOTIFICATION_TYPES.map(nt => (
                                        <option key={nt.value} value={nt.value}>{nt.label}</option>
                                    ))}
                                </Select>
                            </div>

                            {!broadcastData.role && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-primary-text">Select Recipients</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-3 border border-border rounded-xl bg-page/50">
                                        {users.map(user => (
                                            <label key={user.id} className="flex items-center gap-2 p-1.5 hover:bg-white rounded-lg cursor-pointer transition-colors">
                                                <input 
                                                    type="checkbox" 
                                                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                    checked={broadcastData.userIds.includes(user.id)}
                                                    onChange={(e) => {
                                                        const userIds = e.target.checked 
                                                            ? [...broadcastData.userIds, user.id]
                                                            : broadcastData.userIds.filter(id => id !== user.id);
                                                        setBroadcastData({ ...broadcastData, userIds });
                                                    }}
                                                />
                                                <span className="text-xs truncate">{user.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <Input 
                                label="Subject / Title" 
                                placeholder="e.g. Office Closure Notice"
                                value={broadcastData.title}
                                onChange={(e) => setBroadcastData({ ...broadcastData, title: e.target.value })}
                            />

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-primary-text">Message Content</label>
                                <textarea 
                                    className="w-full h-32 p-4 rounded-xl border border-border focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                                    placeholder="Type your message here..."
                                    value={broadcastData.message}
                                    onChange={(e) => setBroadcastData({ ...broadcastData, message: e.target.value })}
                                />
                            </div>

                            <Button 
                                className="w-full h-12 text-lg shadow-emerald-100 shadow-xl" 
                                onClick={handleBroadcast} 
                                isLoading={isSaving}
                                disabled={!broadcastData.message}
                            >
                                <Send className="mr-2 h-5 w-5" /> Send Notification
                            </Button>
                        </div>
                    </section>

                    <div className="p-6 bg-amber-50 rounded-2xl border border-amber-200 flex gap-4">
                        <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
                        <div>
                            <h4 className="font-bold text-amber-800">Broadcast Caution</h4>
                            <p className="text-amber-700 text-sm">
                                Manual broadcasts are sent immediately to the selected users' notification centers. 
                                Use this tool responsibly for critical updates or universal reminders.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationsControl;
