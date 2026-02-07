import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, Calendar as CalendarIcon, Clock, User, FileText } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { format } from 'date-fns';
import { User as UserType } from '../../types';

interface ManualAttendanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    users: UserType[];
    currentUserRole: string;
    currentUserId: string;
}

const ManualAttendanceModal: React.FC<ManualAttendanceModalProps> = ({ 
    isOpen, 
    onClose, 
    onSuccess, 
    users,
    currentUserRole,
    currentUserId
}) => {
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [status, setStatus] = useState<string>('Present'); // Present, W/H, On Leave
    const [checkInTime, setCheckInTime] = useState<string>('09:00');
    const [checkOutTime, setCheckOutTime] = useState<string>('18:00');
    const [locationName, setLocationName] = useState<string>('Office');
    const [reason, setReason] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            // Reset form
            setSelectedUserId('');
            setDate(format(new Date(), 'yyyy-MM-dd'));
            setStatus('Present');
            setCheckInTime('09:00');
            setCheckOutTime('18:00');
            setLocationName('Office');
            setReason('');
            setError(null);
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUserId) {
            setError('Please select an employee.');
            return;
        }
        if (!reason) {
            setError('Please provide a reason or note for this manual entry.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const selectedUser = users.find(u => u.id === selectedUserId);
            const timestampBase = date; // YYYY-MM-DD

            // 1. Insert Attendance Events
            const eventsToInsert = [];

            // Check In
            if (status === 'Present' || status === 'W/H') {
                const checkInDate = new Date(`${timestampBase}T${checkInTime}:00`);
                eventsToInsert.push({
                    user_id: selectedUserId,
                    timestamp: checkInDate.toISOString(),
                    type: 'check-in',
                    location_name: status === 'W/H' ? 'Work From Home' : locationName,
                    is_manual: true,
                    created_by: currentUserId,
                    reason: reason
                });

                // Check Out
                const checkOutDate = new Date(`${timestampBase}T${checkOutTime}:00`);
                eventsToInsert.push({
                    user_id: selectedUserId,
                    timestamp: checkOutDate.toISOString(),
                    type: 'check-out',
                    location_name: status === 'W/H' ? 'Work From Home' : locationName,
                    is_manual: true,
                    created_by: currentUserId,
                    reason: reason
                });
            }

            if (eventsToInsert.length > 0) {
                const { error: insertError } = await supabase
                    .from('attendance_events')
                    .insert(eventsToInsert);

                if (insertError) throw insertError;
            }

            // 2. Insert Audit Log
            const auditLog = {
                action: 'MANUAL_ENTRY_ADDED',
                performed_by: currentUserId,
                target_user_id: selectedUserId,
                details: {
                    date,
                    status,
                    checkIn: status === 'Present' || status === 'W/H' ? checkInTime : 'N/A',
                    checkOut: status === 'Present' || status === 'W/H' ? checkOutTime : 'N/A',
                    reason,
                    userName: selectedUser?.name
                }
            };

            const { error: auditError } = await supabase
                .from('attendance_audit_logs')
                .insert([auditLog]);

            if (auditError) throw auditError;

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Manual attendance error:', err);
            let msg = 'Failed to save manual entry.';
            if (err.message) msg = err.message;
            if (err.details) msg += ` (${err.details})`;
            if (err.hint) msg += ` Hint: ${err.hint}`;
            setError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Manual Attendance Entry</h2>
                        <p className="text-xs text-gray-500 mt-1">Add missing attendance records</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded-full"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {error && (
                        <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg flex items-center">
                            <span className="mr-2">⚠️</span> {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Employee Selection */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700 flex items-center">
                                <User className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Employee <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50/30 text-sm"
                                required
                            >
                                <option value="">Select Employee</option>
                                {users.map(user => (
                                    <option key={user.id} value={user.id}>{user.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Date and Status Row */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700 flex items-center">
                                    <CalendarIcon className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Date <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50/30 text-sm"
                                    required
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700 flex items-center">
                                    <FileText className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Status <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50/30 text-sm"
                                >
                                    <option value="Present">Present (Office)</option>
                                    <option value="W/H">Work From Home</option>
                                </select>
                            </div>
                        </div>

                        {/* Time Row */}
                        <div className="grid grid-cols-2 gap-4 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700 flex items-center">
                                    <Clock className="w-3.5 h-3.5 mr-1.5 text-green-600" /> Punch In <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="time"
                                    value={checkInTime}
                                    onChange={(e) => setCheckInTime(e.target.value)}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white text-sm"
                                    required
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700 flex items-center">
                                    <Clock className="w-3.5 h-3.5 mr-1.5 text-red-600" /> Punch Out <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="time"
                                    value={checkOutTime}
                                    onChange={(e) => setCheckOutTime(e.target.value)}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white text-sm"
                                    required
                                />
                            </div>
                        </div>

                        {/* Location (if Present) */}
                        {status === 'Present' && (
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700">Location Name</label>
                                <input
                                    type="text"
                                    value={locationName}
                                    onChange={(e) => setLocationName(e.target.value)}
                                    placeholder="e.g. Head Office, Client Site"
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50/30 text-sm"
                                />
                            </div>
                        )}

                        {/* Reason / Notes */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700">Reason / Notes <span className="text-red-500">*</span></label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Why is this being added manually? e.g. 'Forgot to punch in', 'Biometric issue'"
                                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50/30 text-sm h-20 resize-none"
                                required
                            />
                        </div>

                    </form>
                </div>

                <div className="p-5 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Add Entry
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManualAttendanceModal;
