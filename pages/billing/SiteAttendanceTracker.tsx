import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import type { SiteAttendanceRecord, Organization } from '../../types';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { format } from 'date-fns';
import { Loader2, IndianRupee, Plus, Trash2, Edit2, TrendingUp, TrendingDown, ClipboardList, Building } from 'lucide-react';
import Button from '../../components/ui/Button';
import StatCard from '../../components/ui/StatCard';
import Toast from '../../components/ui/Toast';

const SiteAttendanceTracker: React.FC = () => {
    const navigate = useNavigate();
    const [records, setRecords] = useState<SiteAttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const fetchInitialData = useCallback(async () => {
        setIsLoading(true);
        try {
            const fetchedRecords = await api.getSiteAttendanceRecords();
            setRecords(fetchedRecords);
        } catch (error) {
            console.error('Error fetching tracker data:', error);
            setToast({ message: 'Failed to load data', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this record?')) return;
        
        try {
            await api.deleteSiteAttendanceRecord(id);
            setToast({ message: 'Record deleted', type: 'success' });
            fetchInitialData();
        } catch (error) {
            console.error('Delete error:', error);
            setToast({ message: 'Failed to delete record', type: 'error' });
        }
    };

    const stats = useMemo(() => {
        const totalDiff = records.reduce((acc, r) => acc + (r.billingDifference || 0), 0);
        const totalFeeDiff = records.reduce((acc, r) => acc + (r.managementFeeDifference || 0), 0);
        const profitCount = records.filter(r => r.variationStatus === 'Profit').length;
        
        return {
            totalDiff,
            totalFeeDiff,
            profitCount,
            totalRecords: records.length
        };
    }, [records]);

    return (
        <div className="space-y-6">
            <AdminPageHeader title="Site Attendance Tracker">
                <Button onClick={() => navigate('/billing/site-attendance-tracker/add')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Record
                </Button>
            </AdminPageHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Variation"
                    value={`₹${stats.totalDiff.toLocaleString('en-IN')}`}
                    icon={IndianRupee}
                />
                <StatCard
                    title="Fee Variation"
                    value={`₹${stats.totalFeeDiff.toLocaleString('en-IN')}`}
                    icon={TrendingUp}
                />
                <StatCard
                    title="Profit Sites"
                    value={stats.profitCount.toString()}
                    icon={TrendingUp}
                />
                <StatCard
                    title="Total Records"
                    value={stats.totalRecords.toString()}
                    icon={Building}
                />
            </div>

            <div className="bg-card rounded-2xl border border-border overflow-hidden premium-glass">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center p-20 space-y-4">
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        <p className="text-muted italic">Loading attendance records...</p>
                    </div>
                ) : records.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 space-y-4 text-center">
                        <div className="bg-primary/10 p-4 rounded-full">
                            <ClipboardList className="h-12 w-12 text-primary" />
                        </div>
                        <h3 className="text-xl font-semibold text-primary-text">No records found</h3>
                        <p className="text-muted max-w-xs">Start tracking site variations by adding your first record.</p>
                        <Button onClick={() => navigate('/billing/site-attendance-tracker/add')} variant="secondary">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Your First Record
                        </Button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-border">
                                    <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Site Name</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Billing Date</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Contract Amt</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Billed Amt</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Variation</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Mgmt Fee</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {records.map((record) => (
                                    <tr key={record.id} className="hover:bg-gray-50/30 transition-colors group">
                                        <td className="px-6 py-4 font-medium text-primary-text">{record.siteName}</td>
                                        <td className="px-6 py-4 text-muted">{format(new Date(record.billingDate), 'MMM yyyy')}</td>
                                        <td className="px-6 py-4">₹{record.contractAmount.toLocaleString()}</td>
                                        <td className="px-6 py-4 font-semibold">₹{record.billedAmount.toLocaleString()}</td>
                                        <td className={`px-6 py-4 font-bold ${record.billingDifference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {record.billingDifference >= 0 ? '+' : ''}₹{record.billingDifference.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm">
                                                <span className="text-muted">B: ₹{record.contractManagementFee}</span>
                                                <br />
                                                <span className="font-medium text-primary-text">D: ₹{record.billedManagementFee}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                                record.variationStatus === 'Profit' 
                                                ? 'bg-green-50 text-green-700 border-green-200' 
                                                : 'bg-red-50 text-red-700 border-red-200'
                                            }`}>
                                                {record.variationStatus === 'Profit' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                                {record.variationStatus}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <button 
                                                onClick={() => navigate(`/billing/site-attendance-tracker/edit/${record.id}`)} 
                                                className="p-2 text-muted hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => handleDelete(record.id)} className="p-2 text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onDismiss={() => setToast(null)}
                />
            )}
        </div>
    );
};

export default SiteAttendanceTracker;
