import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import type { SiteAttendanceRecord, Organization } from '../../types';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import { Save, ArrowLeft, ClipboardList, IndianRupee, TrendingUp, TrendingDown, Building, Calendar } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { format } from 'date-fns';

const AddSiteAttendanceRecord: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isEditing = !!id;
    const isMobile = useMediaQuery('(max-width: 767px)');

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [sites, setSites] = useState<Organization[]>([]);
    const [record, setRecord] = useState<Partial<SiteAttendanceRecord>>({
        siteId: '',
        siteName: '',
        billingDate: format(new Date(), 'yyyy-MM-dd'),
        contractAmount: undefined,
        contractManagementFee: undefined,
        billedAmount: undefined,
        billedManagementFee: undefined,
        billingDifference: 0,
        managementFeeDifference: 0,
        variationStatus: 'Profit'
    });
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const fetchedSites = await api.getOrganizations();
                setSites(fetchedSites);

                if (isEditing && id) {
                    const records = await api.getSiteAttendanceRecords();
                    const existingRecord = records.find(r => r.id === id);
                    if (existingRecord) {
                        setRecord(existingRecord);
                    } else {
                        setToast({ message: 'Record not found', type: 'error' });
                        setTimeout(() => navigate('/billing/site-attendance-tracker'), 2000);
                    }
                }
            } catch (error) {
                console.error('Error loading form data:', error);
                setToast({ message: 'Failed to load data', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [id, isEditing, navigate]);

    const handleInputChange = (field: keyof SiteAttendanceRecord, value: any) => {
        setRecord(prev => {
            const updated = { ...prev, [field]: value };

            // Auto-calculate differences
            if (['contractAmount', 'billedAmount', 'contractManagementFee', 'billedManagementFee'].includes(field as string)) {
                const billedAmount = field === 'billedAmount' ? (value === '' ? 0 : Number(value)) : Number(updated.billedAmount || 0);
                const contractAmount = field === 'contractAmount' ? (value === '' ? 0 : Number(value)) : Number(updated.contractAmount || 0);
                const billedFee = field === 'billedManagementFee' ? (value === '' ? 0 : Number(value)) : Number(updated.billedManagementFee || 0);
                const contractFee = field === 'contractManagementFee' ? (value === '' ? 0 : Number(value)) : Number(updated.contractManagementFee || 0);

                updated.billingDifference = billedAmount - contractAmount;
                updated.managementFeeDifference = billedFee - contractFee;
                updated.variationStatus = updated.billingDifference >= 0 ? 'Profit' : 'Loss';
            }

            if (field === 'siteId') {
                const site = sites.find(s => s.id === value);
                if (site) {
                    updated.siteName = site.shortName;
                }
            }

            return updated;
        });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!record.siteId || !record.billingDate) {
            setToast({ message: 'Please select a site and date', type: 'error' });
            return;
        }

        setIsSaving(true);
        try {
            // Ensure numeric fields are numbers before saving
            const recordToSave = {
                ...record,
                contractAmount: Number(record.contractAmount || 0),
                contractManagementFee: Number(record.contractManagementFee || 0),
                billedAmount: Number(record.billedAmount || 0),
                billedManagementFee: Number(record.billedManagementFee || 0),
            };
            await api.saveSiteAttendanceRecord(recordToSave);
            setToast({ message: `Record ${isEditing ? 'updated' : 'created'} successfully!`, type: 'success' });
            setTimeout(() => navigate('/billing/site-attendance-tracker'), 1500);
        } catch (error) {
            console.error('Save error:', error);
            setToast({ message: 'Failed to save record', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-muted italic">Loading form...</p>
            </div>
        );
    }

    const FormContent = (
        <form onSubmit={handleSave} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-card/50 md:bg-white/40 rounded-2xl border border-border/50">
                <div className="space-y-1">
                    <label htmlFor="siteId" className="text-sm font-semibold text-primary/80 dark:text-emerald-400">Select Site</label>
                    <select
                        id="siteId"
                        name="siteId"
                        className="w-full flex h-11 rounded-lg border border-border bg-card md:bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm text-primary-text"
                        value={record.siteId}
                        onChange={(e) => handleInputChange('siteId', e.target.value)}
                        required
                    >
                        <option value="">Select a site...</option>
                        {sites.map(site => (
                            <option key={site.id} value={site.id}>{site.shortName}</option>
                        ))}
                    </select>
                </div>
                <Input
                    id="billingDate"
                    name="billingDate"
                    label="Billing Date"
                    type="date"
                    value={record.billingDate}
                    onChange={(e) => handleInputChange('billingDate', e.target.value)}
                    required
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Contract Details Section */}
                <div className="space-y-4 bg-card/50 md:bg-white/40 p-6 rounded-2xl border border-border/50 shadow-sm">
                    <h4 className="text-sm font-bold uppercase text-primary dark:text-emerald-400 tracking-wider border-b border-border/60 pb-3 flex items-center">
                        <Building className="w-4 h-4 mr-2" />
                        Contract Details
                    </h4>
                    <div className="space-y-4">
                        <Input
                            id="contractAmount"
                            name="contractAmount"
                            label="Contract Amount"
                            type="number"
                            value={record.contractAmount ?? ''}
                            onChange={(e) => handleInputChange('contractAmount', e.target.value)}
                            placeholder="Enter contract amount"
                            icon={<IndianRupee className="h-4 w-4" />}
                        />
                        <Input
                            id="contractManagementFee"
                            name="contractManagementFee"
                            label="Management Fee"
                            type="number"
                            value={record.contractManagementFee ?? ''}
                            onChange={(e) => handleInputChange('contractManagementFee', e.target.value)}
                            placeholder="Enter management fee"
                        />
                    </div>
                </div>

                {/* Billing Details Section */}
                <div className="space-y-4 bg-card/50 md:bg-white/40 p-6 rounded-2xl border border-border/50 shadow-sm">
                    <h4 className="text-sm font-bold uppercase text-accent-dark dark:text-orange-400 tracking-wider border-b border-border/60 pb-3 flex items-center">
                        <Calendar className="w-4 h-4 mr-2" />
                        Billing Details
                    </h4>
                    <div className="space-y-4">
                        <Input
                            id="billedAmount"
                            name="billedAmount"
                            label="Billed Amount"
                            type="number"
                            value={record.billedAmount ?? ''}
                            onChange={(e) => handleInputChange('billedAmount', e.target.value)}
                            placeholder="Enter billed amount"
                            icon={<IndianRupee className="h-4 w-4" />}
                        />
                        <Input
                            id="billedManagementFee"
                            name="billedManagementFee"
                            label="Management Fee"
                            type="number"
                            value={record.billedManagementFee ?? ''}
                            onChange={(e) => handleInputChange('billedManagementFee', e.target.value)}
                            placeholder="Enter management fee"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-primary/5 p-6 rounded-2xl border border-primary/20 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-inner">
                <div className="text-center sm:text-left">
                    <p className="text-xs text-muted uppercase tracking-wider font-bold mb-1">Calculated Variation</p>
                    <p className={`text-4xl font-black ${(record.billingDifference || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(record.billingDifference || 0) >= 0 ? '+' : ''}₹{(record.billingDifference || 0).toLocaleString()}
                    </p>
                </div>
                <div className="text-center sm:text-right">
                    <p className="text-xs text-muted uppercase tracking-wider font-bold mb-2">Variation Status</p>
                    <span className={`inline-flex items-center px-5 py-2 rounded-full text-base font-black border-2 ${
                        record.variationStatus === 'Profit' 
                        ? 'bg-green-100 text-green-700 border-green-200' 
                        : 'bg-red-100 text-red-700 border-red-200'
                    }`}>
                        {record.variationStatus === 'Profit' ? <TrendingUp className="w-5 h-5 mr-2" /> : <TrendingDown className="w-5 h-5 mr-2" />}
                        {record.variationStatus?.toUpperCase()}
                    </span>
                </div>
            </div>

            {!isMobile && (
                <div className="flex justify-end space-x-3 pt-6 border-t border-border">
                    <Button type="button" variant="secondary" onClick={() => navigate('/billing/site-attendance-tracker')}>
                        Cancel
                    </Button>
                    <Button type="submit" isLoading={isSaving} className="px-8">
                        <Save className="h-4 w-4 mr-2" />
                        {isEditing ? 'Update Record' : 'Save Record'}
                    </Button>
                </div>
            )}
        </form>
    );

    if (isMobile) {
        return (
            <div className="h-full flex flex-col bg-[#041b0f]">
                <header className="p-4 flex-shrink-0 bg-[#062414] border-b border-[#1f3d2b] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/billing/site-attendance-tracker')} className="p-1 hover:bg-white/5 rounded-full text-white">
                            <ArrowLeft className="h-6 w-6" />
                        </button>
                        <h1 className="text-xl font-bold text-white">{isEditing ? 'Edit Record' : 'Add Record'}</h1>
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-4 pb-28">
                    <div className="space-y-6">
                        {FormContent}
                    </div>
                </main>
                <footer className="fixed bottom-0 left-0 right-0 p-4 bg-[#062414] border-t border-[#1f3d2b] flex gap-4 z-[60] shadow-[0_-4px_20px_rgba(0,0,0,0.4)]">
                    <Button type="button" variant="secondary" onClick={() => navigate('/billing/site-attendance-tracker')} className="flex-1 bg-white/5 border-white/10 text-white hover:bg-white/10">
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleSave} isLoading={isSaving} className="flex-1 !bg-emerald-500 hover:!bg-emerald-600 text-white font-bold">
                        {isEditing ? 'Save' : 'Create'}
                    </Button>
                </footer>
                {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 lg:p-8">
            <button 
                onClick={() => navigate('/billing/site-attendance-tracker')}
                className="flex items-center text-sm font-medium text-muted hover:text-primary transition-colors mb-6 group"
            >
                <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                Back to Tracker
            </button>

            <div className="bg-card p-8 rounded-xl shadow-xl border border-border premium-glass w-full">
                <div className="flex items-center mb-8">
                    <div className="bg-primary/10 p-4 rounded-2xl mr-5">
                        <ClipboardList className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-primary-text">{isEditing ? 'Edit Attendance Record' : 'Add New Record'}</h2>
                        <p className="text-muted">Fill in the site billing details below to calculate variations.</p>
                    </div>
                </div>

                {FormContent}
            </div>
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
    );
};

export default AddSiteAttendanceRecord;
