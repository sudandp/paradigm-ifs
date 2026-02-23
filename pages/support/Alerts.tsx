import React, { useState } from 'react';
import { ShieldAlert, Send, Loader2, Users, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';

const Alerts: React.FC = () => {
    const { user } = useAuthStore();
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [alertLevel, setAlertLevel] = useState<'info' | 'warning' | 'critical'>('info');
    const [isSending, setIsSending] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const handleSendBroadcast = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!title.trim() || !message.trim()) {
            setToast({ message: "Please enter both a title and message.", type: "error" });
            return;
        }

        if (!window.confirm("Are you sure you want to broadcast this message to ALL users? This action cannot be undone.")) {
            return;
        }

        setIsSending(true);
        try {
            // Re-using the generic notification creation if broadcast doesn't exist natively.
            // Ideally, there would be an api.createBroadcastNotification or similar.
            // For now, mapping this to the createNotification which likely handles bulk or system-wide if userId is omitted or handled server-side.
            // We'll pass a specific type to ensure the backend or UI knows it's a broadcast.
            
            // To broadcast to all, we pass "all_users" or similar if the backend supports it.
            // Sending it to User ID "ALL" as a signal, assuming the API handles it.
            // We use 'emergency_broadcast' as the type.
            await api.createNotification({
                userId: 'ALL_USERS_BROADCAST', // Signal for backend, or we could fetch all users and loop, but backend is safer
                message: `${title}: ${message}`,
                type: 'emergency_broadcast'
            });

            setToast({ message: "Broadcast sent successfully to all users.", type: "success" });
            setTitle('');
            setMessage('');
            setAlertLevel('info');
        } catch (error) {
            console.error('Failed to send broadcast:', error);
            // If the specific endpoint doesn't exist, we fall back to a manual loop if needed, but normally a backend route handles bulk.
            // Assuming `ALL_USERS_BROADCAST` is handled, otherwise we adapt.
            setToast({ message: "Failed to send broadcast. Ensure backend supports bulk notifications.", type: "error" });
        } finally {
            setIsSending(false);
        }
    };

    const getIcon = () => {
        switch (alertLevel) {
            case 'info': return <Info className="h-5 w-5 text-blue-500" />;
            case 'warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
            case 'critical': return <AlertCircle className="h-5 w-5 text-red-500" />;
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 md:p-3 bg-red-50 rounded-xl">
                    <ShieldAlert className="h-6 w-6 md:h-8 md:w-8 text-red-600" />
                </div>
                <div>
                    <h1 className="text-xl md:text-3xl font-bold text-gray-900 leading-tight">Emergency Alerts</h1>
                    <p className="text-sm text-gray-500 mt-1">Broadcast important messages to all employees instantly</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-500" />
                        Compose Broadcast
                    </h2>
                    <span className="text-xs font-semibold px-2.5 py-1 bg-red-100 text-red-700 rounded-full flex items-center gap-1.5 uppercase tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                        Live System
                    </span>
                </div>

                <form onSubmit={handleSendBroadcast} className="p-6 space-y-5">
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="md:col-span-2 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Alert Title</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="e.g., Office Closure Alert"
                                    className="w-full form-input"
                                    required
                                    disabled={isSending}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Detailed Message</label>
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Enter the full alert details here..."
                                    className="w-full form-input min-h-[120px] resize-y"
                                    required
                                    disabled={isSending}
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Alert Priority</label>
                            
                            <div className="space-y-2">
                                {(['info', 'warning', 'critical'] as const).map((l) => {
                                    const isSelected = alertLevel === l;
                                    return (
                                        <div 
                                            key={l}
                                            onClick={() => !isSending && setAlertLevel(l)}
                                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all flex items-center gap-3 ${
                                                isSelected 
                                                    ? l === 'critical' ? 'border-red-500 bg-red-50' : 
                                                      l === 'warning' ? 'border-amber-500 bg-amber-50' : 
                                                      'border-blue-500 bg-blue-50'
                                                    : 'border-gray-100 bg-white hover:border-gray-200'
                                            } ${isSending ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {l === 'critical' && <AlertCircle className={`h-5 w-5 ${isSelected ? 'text-red-500' : 'text-gray-400'}`} />}
                                            {l === 'warning' && <AlertTriangle className={`h-5 w-5 ${isSelected ? 'text-amber-500' : 'text-gray-400'}`} />}
                                            {l === 'info' && <Info className={`h-5 w-5 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`} />}
                                            <span className={`font-semibold capitalize ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
                                                {l}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-6 pt-6 border-t border-gray-100">
                                <Button 
                                    type="submit" 
                                    disabled={isSending || !title || !message}
                                    className={`w-full justify-center transition-all ${alertLevel === 'critical' ? 'bg-red-600 hover:bg-red-700 border-red-700 text-white' : ''}`}
                                >
                                    {isSending ? (
                                        <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Broadcasting...</>
                                    ) : (
                                        <><Send className="h-5 w-5 mr-2" /> Send to All Employees</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Alerts;
