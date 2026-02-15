import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';
import type { SiteFinanceRecord, SiteInvoiceDefault, Organization } from '../../types';
import { useForm, Controller } from 'react-hook-form';
import { ArrowLeft, Save, Building, Loader2, IndianRupee, MapPin, Calendar, ClipboardList, Wallet } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Toast from '../../components/ui/Toast';
import { format, startOfMonth } from 'date-fns';

const AddSiteFinanceRecord: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isEditing = !!id;
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [sites, setSites] = useState<Organization[]>([]);
    const [siteDefaults, setSiteDefaults] = useState<SiteInvoiceDefault[]>([]);
    const [currentUser, setCurrentUser] = useState<{ id: string, name: string, role: string } | null>(null);
    const [recordMetadata, setRecordMetadata] = useState<{ createdBy?: string, createdByName?: string, createdAt?: string, updatedBy?: string, updatedByName?: string, updatedAt?: string } | null>(null);

    const { control, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<Partial<SiteFinanceRecord>>({
        defaultValues: {
            contractAmount: '' as any,
            contractManagementFee: '' as any,
            billedAmount: '' as any,
            billedManagementFee: '' as any,
            status: 'pending',
            billingMonth: format(startOfMonth(new Date()), 'yyyy-MM-dd')
        }
    });

    const [contractAmount, contractManagementFee, billedAmount, billedManagementFee] = watch(['contractAmount', 'contractManagementFee', 'billedAmount', 'billedManagementFee']);
    
    // Derived values
    const cAmount = Number(contractAmount) || 0;
    const cFee = Number(contractManagementFee) || 0;
    const bAmount = Number(billedAmount) || 0;
    const bFee = Number(billedManagementFee) || 0;

    const billingDiff = bAmount - cAmount;
    const feeDiff = bFee - cFee;
    const totalDiff = billingDiff + feeDiff;
    const isProfit = totalDiff >= 0;

    // Auto-calculate total for submission
    useEffect(() => {
        setValue('totalBilledAmount', bAmount + bFee);
    }, [bAmount, bFee, setValue]);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [fetchedSites, defaults] = await Promise.all([
                    api.getOrganizations(),
                    api.getSiteInvoiceDefaults()
                ]);
                
                // Handle both array and paginated response
                const sitesList = Array.isArray(fetchedSites) ? fetchedSites : fetchedSites.data || [];
                setSites(sitesList.sort((a: Organization, b: Organization) => (a.shortName || '').localeCompare(b.shortName || '')));
                setSiteDefaults(defaults);
                
                // Fetch current user
                // Fetch current user details from auth store if available, otherwise fallback to metadata
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser) {
                    const name = authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Unknown';
                    // Fetch profile to get role
                    const profile = await api.getUserById(authUser.id);
                    setCurrentUser({ 
                        id: authUser.id, 
                        name, 
                        role: profile?.role || 'user' 
                    });
                }

                if (isEditing && id) {
                    const record = await api.getSiteFinanceRecord(id);
                    if (record) {
                        reset({
                            siteId: record.siteId,
                            siteName: record.siteName,
                            billingMonth: record.billingMonth,
                            companyName: record.companyName,
                            contractAmount: record.contractAmount,
                            contractManagementFee: record.contractManagementFee,
                            billedAmount: record.billedAmount, // Ensure these are set for editing
                            billedManagementFee: record.billedManagementFee,
                            status: record.status
                        });
                        setRecordMetadata({
                            createdBy: record.createdBy,
                            createdByName: record.createdByName,
                            createdAt: record.createdAt,
                            updatedBy: record.updatedBy, // These might not be in the type yet, but good to have
                            updatedAt: record.updatedAt,
                            updatedByName: record.updatedByName // If available
                        });
                    } else {
                        setToast({ message: 'Record not found', type: 'error' });
                        navigate('/finance?tab=site');
                    }
                }
            } catch (error) {
                console.error('Error loading data:', error);
                setToast({ message: 'Failed to load form data', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [isEditing, id, reset, navigate]);

    const onSubmit = async (data: Partial<SiteFinanceRecord>) => {
        setIsLoading(true);
        try {
            const payload = { ...data, id: id };
            // Add creator info for new records
            if (!id && currentUser) {
                payload.createdBy = currentUser.id;
                payload.createdByName = currentUser.name;
                payload.createdByRole = currentUser.role;
            } else if (id && currentUser) {
                // Update tracker for edits
                payload.updatedBy = currentUser.id;
                payload.updatedByName = currentUser.name;
                payload.updatedAt = new Date().toISOString();
            }
            
            await api.saveSiteFinanceRecord(payload);
            setToast({ message: 'Finance record saved successfully', type: 'success' });
            setTimeout(() => navigate('/finance?tab=site'), 1000);
        } catch (error) {
            console.error('Save error:', error);
            setToast({ message: 'Failed to save record', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSiteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedSiteId = e.target.value;
        const selectedOrg = sites.find(s => s.id === selectedSiteId);
        
        if (selectedOrg) {
            // UUID Validation helper
            const isValidUUID = (uuid: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
            
            setValue('siteId', selectedOrg.id && isValidUUID(selectedOrg.id) ? selectedOrg.id : undefined);
            setValue('siteName', selectedOrg.shortName);
            
            // Auto-fill from defaults if available
            const defaults = siteDefaults.find(d => d.siteId === selectedOrg.id || d.siteName === selectedOrg.shortName);
            if (defaults) {
                setValue('companyName', defaults.companyName);
                if (defaults.contractAmount) setValue('contractAmount', defaults.contractAmount);
                if (defaults.contractManagementFee) setValue('contractManagementFee', defaults.contractManagementFee);
            } else {
                // Clear billing specific defaults if no match found
                setValue('companyName', '');
                setValue('contractAmount', '' as any);
                setValue('contractManagementFee', '' as any);
            }
        }
    };

    return (
        <div className="w-full p-4 md:p-8 space-y-6">
            <button 
                onClick={() => navigate('/finance?tab=site')}
                className="flex items-center text-xs font-bold text-gray-400 hover:text-primary transition-all group"
            >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Tracker
            </button>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-gray-50 rounded-2xl">
                        <ClipboardList className="h-6 w-6 text-gray-600" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 leading-none">Add New Record</h2>
                        <p className="text-sm text-gray-500 mt-1.5">Fill in the site billing details below to calculate variations.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                    {/* Top Section: Site & Date */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="space-y-2">
                            <label className="text-xs font-bold text-emerald-500 uppercase tracking-wider ml-1">Select Site</label>
                            <div className="relative">
                                <select
                                    className="w-full px-4 h-12 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all appearance-none font-medium"
                                    onChange={handleSiteChange}
                                    defaultValue={watch('siteId') || ''}
                                >
                                    <option value="" disabled>Select a site...</option>
                                    {sites.map(site => (
                                        <option key={site.id} value={site.id}>{site.shortName}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                             <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Billing Date</label>
                             <Controller
                                name="billingMonth"
                                control={control}
                                render={({ field }) => (
                                    <Input 
                                        type="date" 
                                        {...field} 
                                        className="h-12 !pl-4 border-gray-200 focus:border-emerald-500"
                                    />
                                )}
                            />
                        </div>
                    </div>

                    {/* Middle Section: Grouped Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Contract Details */}
                        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                             <h3 className="text-xs font-black text-emerald-500 uppercase tracking-widest mb-6 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Wallet className="h-4 w-4" /> CONTRACT DETAILS
                                </div>
                            </h3>
                            <div className="space-y-6">
                                <Controller
                                    name="companyName"
                                    control={control}
                                    render={({ field }) => (
                                        <Input 
                                            label="Company Name" 
                                            type="text" 
                                            icon={<Building className="h-4 w-4" />} 
                                            placeholder="Auto-filled..."
                                            {...field}
                                            className="bg-white border-gray-200 focus:border-emerald-500"
                                        />
                                    )}
                                />
                                <Controller
                                    name="contractAmount"
                                    control={control}
                                    render={({ field }) => (
                                        <Input 
                                            label="Contract Amount" 
                                            type="number" 
                                            inputMode="numeric"
                                            icon={<IndianRupee className="h-4 w-4" />} 
                                            placeholder="0"
                                            {...field}
                                            className="bg-white border-gray-200 focus:border-emerald-500"
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                field.onChange(val === '' ? '' : Number(val));
                                            }}
                                            onFocus={(e) => e.target.select()}
                                            onKeyDown={(e) => {
                                                if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                                            }}
                                        />
                                    )}
                                />
                                <Controller
                                    name="contractManagementFee"
                                    control={control}
                                    render={({ field }) => (
                                        <Input 
                                            label="Management Fee" 
                                            type="number" 
                                            inputMode="numeric"
                                            icon={<IndianRupee className="h-4 w-4" />} 
                                            placeholder="0"
                                            {...field}
                                            className="bg-white border-gray-200 focus:border-emerald-500"
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                field.onChange(val === '' ? '' : Number(val));
                                            }}
                                            onFocus={(e) => e.target.select()}
                                            onKeyDown={(e) => {
                                                if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                                            }}
                                        />
                                    )}
                                />
                            </div>
                        </div>

                        {/* Billing Details */}
                        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                             <h3 className="text-xs font-black text-orange-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Calendar className="h-4 w-4" /> BILLING DETAILS
                            </h3>
                            <div className="space-y-6">
                                <Controller
                                    name="billedAmount"
                                    control={control}
                                    render={({ field }) => (
                                        <Input 
                                            label="Billed Amount" 
                                            type="number" 
                                            inputMode="numeric"
                                            icon={<IndianRupee className="h-4 w-4" />} 
                                            placeholder="0"
                                            {...field}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                field.onChange(val === '' ? '' : Number(val));
                                            }}
                                            onFocus={(e) => e.target.select()}
                                            onKeyDown={(e) => {
                                                if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                                            }}
                                        />
                                    )}
                                />
                                <Controller
                                    name="billedManagementFee"
                                    control={control}
                                    render={({ field }) => (
                                        <Input 
                                            label="Management Fee" 
                                            type="number" 
                                            inputMode="numeric"
                                            icon={<IndianRupee className="h-4 w-4" />} 
                                            placeholder="0"
                                            {...field}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                field.onChange(val === '' ? '' : Number(val));
                                            }}
                                            onFocus={(e) => e.target.select()}
                                            onKeyDown={(e) => {
                                                if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                                            }}
                                        />
                                    )}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Metadata Section (Only for Edits) */}
                    {isEditing && recordMetadata && (
                        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                             <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Record History</h3>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                <div>
                                    <span className="block font-bold text-gray-500 mb-0.5">Created By</span>
                                    <span className="text-gray-900 font-medium">{recordMetadata.createdByName || 'Unknown'}</span>
                                    <span className="text-gray-400 ml-2">{recordMetadata.createdAt ? format(new Date(recordMetadata.createdAt), 'dd MMM yyyy, hh:mm a') : '-'}</span>
                                </div>
                                {recordMetadata.updatedAt && (
                                    <div>
                                        <span className="block font-bold text-gray-500 mb-0.5">Last Updated</span>
                                        <span className="text-gray-900 font-medium">{currentUser?.name} (You)</span> 
                                        <span className="text-gray-400 ml-2">{format(new Date(), 'dd MMM yyyy')}</span>
                                    </div>
                                )}
                             </div>
                        </div>
                    )}

                    {/* Bottom Summary Bar */}
                    <div className="bg-white rounded-3xl border border-gray-300 p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
                        <div className="space-y-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">CALCULATED VARIATION</span>
                            <div className={`text-4xl font-black flex items-center ${totalDiff >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {totalDiff >= 0 ? '+' : '-'}₹{Math.abs(totalDiff).toLocaleString('en-IN')}
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] w-full text-right">VARIATION STATUS</span>
                            <div className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-black uppercase transition-all ${
                                isProfit 
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : 'bg-rose-100 text-rose-800'
                            }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${isProfit ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                {isProfit ? 'PROFIT' : 'LOSS'}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button 
                            type="button" 
                            onClick={() => navigate('/finance?tab=site')}
                            className="px-8 h-12 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={isLoading} 
                            className="px-8 h-12 rounded-xl text-sm font-bold bg-[#006B3F] text-white hover:bg-[#005632] transition-colors shadow-lg shadow-emerald-900/10 flex items-center"
                        >
                            {isLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
                            Save Record
                        </button>
                    </div>
                </form>
            </div>
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
    );
};

export default AddSiteFinanceRecord;
