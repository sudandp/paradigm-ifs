import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { api } from '../../services/api';
import type { SiteFinanceRecord, SiteInvoiceDefault } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { format, startOfMonth } from 'date-fns';
import { 
    Loader2, Plus, Edit2, Trash2, IndianRupee, FileSpreadsheet, TrendingUp, TrendingDown, 
    ClipboardCheck, Building2, Download, Upload, AlertTriangle, RotateCcw, ShieldX, Search, Info 
} from 'lucide-react';
import Toast from '../../components/ui/Toast';

const SiteFinanceTracker: React.FC = () => {
    const navigate = useNavigate();
    const [records, setRecords] = useState<SiteFinanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [previewData, setPreviewData] = useState<Partial<SiteFinanceRecord>[]>([]);
    const [billingMonth, setBillingMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [siteDefaults, setSiteDefaults] = useState<SiteInvoiceDefault[]>([]);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const { user } = useAuthStore();
    
    // Deletion State
    const [deletedRecords, setDeletedRecords] = useState<SiteFinanceRecord[]>([]);
    const [activeSubTab, setActiveSubTab] = useState<'active' | 'log'>('active');
    const [recordToDelete, setRecordToDelete] = useState<SiteFinanceRecord | null>(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRestoring, setIsRestoring] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [recordsData, defaultsData, deletedData] = await Promise.all([
                api.getSiteFinanceRecords(billingMonth),
                api.getSiteInvoiceDefaults(),
                api.getDeletedSiteFinanceRecords()
            ]);
            setRecords(recordsData);
            setDeletedRecords(deletedData);
            setSiteDefaults(defaultsData.sort((a, b) => a.siteName.localeCompare(b.siteName)));

            // Auto-cleanup records older than 7 days
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            const recordsToCleanup = deletedData.filter(r => 
                r.deletedAt && new Date(r.deletedAt) < sevenDaysAgo
            );

            if (recordsToCleanup.length > 0) {
                console.log(`Cleaning up ${recordsToCleanup.length} expired records...`);
                await Promise.all(recordsToCleanup.map(r => api.permanentlyDeleteSiteFinanceRecord(r.id)));
                // Refresh deleted records after cleanup
                const refreshedDeleted = await api.getDeletedSiteFinanceRecords();
                setDeletedRecords(refreshedDeleted);
            }
        } catch (error) {
            console.error('Error fetching finance data:', error);
            setToast({ message: 'Failed to load finance data', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    }, [billingMonth]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    const handleDownloadTemplate = async () => {
        setIsExporting(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet('Finance Template');

            ws.columns = [
                { header: 'Site Name', key: 'siteName', width: 25 },
                { header: 'Company Name', key: 'companyName', width: 20 },
                { header: 'Contract Amount', key: 'contractAmount', width: 15 },
                { header: 'Contract Management Fee', key: 'contractManagementFee', width: 25 },
                { header: 'Billed Amount', key: 'billedAmount', width: 15 },
                { header: 'Billed Management Fee', key: 'billedManagementFee', width: 25 },
            ];

            ws.getRow(1).font = { bold: true };
            ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006B3F' } };
            ws.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

            siteDefaults.forEach(site => {
                ws.addRow({
                    siteName: site.siteName,
                    companyName: site.companyName || '',
                    contractAmount: site.contractAmount || 0,
                    contractManagementFee: site.contractManagementFee || 0,
                    billedAmount: '',
                    billedManagementFee: ''
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `Site_Finance_Template_${billingMonth.substring(0, 7)}.xlsx`);
            setToast({ message: 'Template downloaded!', type: 'success' });
        } catch (error) {
            console.error('Template error:', error);
            setToast({ message: 'Failed to generate template', type: 'error' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const workbook = new ExcelJS.Workbook();
            const arrayBuffer = await file.arrayBuffer();
            await workbook.xlsx.load(arrayBuffer);
            const ws = workbook.getWorksheet(1);

            const parsed: Partial<SiteFinanceRecord>[] = [];
            ws?.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return;

                const siteName = row.getCell(1).value?.toString() || '';
                if (!siteName) return;

                const siteDef = siteDefaults.find(s => s.siteName === siteName);
                
                // UUID Validation helper
                const isValidUUID = (uuid: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
                const validatedSiteId = siteDef?.siteId && isValidUUID(siteDef.siteId) ? siteDef.siteId : undefined;

                const bAmount = Number(row.getCell(5).value) || 0;
                const bFee = Number(row.getCell(6).value) || 0;

                parsed.push({
                    siteId: validatedSiteId,
                    siteName,
                    companyName: row.getCell(2).value?.toString() || '',
                    contractAmount: Number(row.getCell(3).value) || 0,
                    contractManagementFee: Number(row.getCell(4).value) || 0,
                    billedAmount: bAmount,
                    billedManagementFee: bFee,
                    billingMonth,
                    totalBilledAmount: bAmount + bFee,
                    status: 'pending'
                });
            });

            if (parsed.length === 0) {
                setToast({ message: 'No valid records found in file', type: 'error' });
            } else {
                setPreviewData(parsed);
                setToast({ message: `${parsed.length} records parsed for preview`, type: 'success' });
            }
        } catch (error) {
            console.error('Import error:', error);
            setToast({ message: 'Failed to process Excel file', type: 'error' });
        }
        if (e.target) e.target.value = '';
    };

    const handleConfirmImport = async () => {
        setIsImporting(true);
        try {
            // Inject creator info into preview data
            const enrichedPreviewData = previewData.map(record => ({
                ...record,
                createdBy: user?.id,
                createdByName: user?.name,
                createdByRole: user?.role
            }));

            // First save the monthly records
            await api.bulkSaveSiteFinanceRecords(enrichedPreviewData);
            
            // Then sync the contract details to defaults for future use
            const defaultsToUpdate: Partial<SiteInvoiceDefault>[] = enrichedPreviewData
                .filter(r => !!r.siteId) // Only update sites we know
                .map(r => ({
                    siteId: r.siteId,
                    siteName: r.siteName,
                    companyName: r.companyName,
                    contractAmount: r.contractAmount,
                    contractManagementFee: r.contractManagementFee
                }));
            
            if (defaultsToUpdate.length > 0) {
                await api.bulkSaveSiteInvoiceDefaults(defaultsToUpdate);
            }

            setToast({ message: 'Records imported and defaults synced successfully!', type: 'success' });
            setPreviewData([]);
            fetchData();
        } catch (error) {
            console.error('Bulk save error:', error);
            setToast({ message: 'Failed to save imported records', type: 'error' });
        } finally {
            setIsImporting(false);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet('Finance Records');

            ws.columns = [
                { header: 'Site Name', key: 'siteName', width: 25 },
                { header: 'Contract Amount', key: 'contractAmount', width: 15 },
                { header: 'Contract Fee', key: 'contractManagementFee', width: 15 },
                { header: 'Billed Amount', key: 'billedAmount', width: 15 },
                { header: 'Billed Fee', key: 'billedManagementFee', width: 15 },
                { header: 'Total Billed', key: 'totalBilledAmount', width: 15 },
                { header: 'Billing Variation', key: 'billingVar', width: 15 },
                { header: 'Fee Variation', key: 'feeVar', width: 15 },
                { header: 'Net Variation', key: 'netVar', width: 15 },
            ];

            records.forEach(r => {
                const bVar = (r.billedAmount || 0) - (r.contractAmount || 0);
                const fVar = (r.billedManagementFee || 0) - (r.contractManagementFee || 0);
                ws.addRow({
                    ...r,
                    billingVar: bVar,
                    feeVar: fVar,
                    netVar: bVar + fVar
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `Finance_Export_${billingMonth.substring(0, 7)}.xlsx`);
        } catch (error) {
            console.error('Export error:', error);
            setToast({ message: 'Failed to export data', type: 'error' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleDelete = async (reason: string) => {
        if (isBulkDeleting) {
            await handleBulkDelete(reason);
            return;
        }
        if (!recordToDelete || !user) return;
        
        setIsDeleting(true);
        try {
            await api.deleteSiteFinanceRecord(
                recordToDelete.id, 
                reason, 
                user.id, 
                user.name || 'Admin'
            );
            setToast({ message: 'Record moved to Deletion Log', type: 'success' });
            setRecordToDelete(null);
            setDeleteReason('');
            setShowDeleteModal(false);
            fetchData();
        } catch (error) {
            console.error('Delete error:', error);
            setToast({ message: 'Failed to delete record', type: 'error' });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleBulkDelete = async (reason: string) => {
        if (selectedIds.size === 0 || !user) return;
        setIsDeleting(true);
        try {
            const ids = Array.from(selectedIds);
            await api.bulkSoftDeleteSiteFinanceRecords(
                ids,
                reason,
                user.id,
                user.name || 'Admin'
            );
            setToast({ message: `${selectedIds.size} records moved to Deletion Log`, type: 'success' });
            setSelectedIds(new Set());
            setDeleteReason('');
            setIsBulkDeleting(false);
            setShowDeleteModal(false);
            fetchData();
        } catch (error) {
            console.error('Bulk delete error:', error);
            setToast({ message: 'Failed to delete selected records', type: 'error' });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRestoreRecord = async (id: string) => {
        setIsRestoring(id);
        try {
            await api.restoreSiteFinanceRecord(id);
            setToast({ message: 'Record restored successfully', type: 'success' });
            fetchData();
        } catch (error) {
            console.error('Restore error:', error);
            setToast({ message: 'Failed to restore record', type: 'error' });
        } finally {
            setIsRestoring(null);
        }
    };

    const handlePermanentDelete = async (id: string) => {
        if (!confirm('Are you sure you want to permanently delete this record? This cannot be undone.')) return;
        try {
            await api.permanentlyDeleteSiteFinanceRecord(id);
            setToast({ message: 'Record permanently deleted', type: 'success' });
            fetchData();
        } catch (error) {
            console.error('Permanent delete error:', error);
            setToast({ message: 'Failed to delete record permanently', type: 'error' });
        }
    };

    const isAdmin = ['admin', 'super_admin', 'management', 'hr'].includes(user?.role || '');

    const handleBulkRestore = async () => {
        if (selectedIds.size === 0 || !isAdmin) return;
        setIsRestoring('bulk');
        try {
            const ids = Array.from(selectedIds);
            await api.bulkRestoreSiteFinanceRecords(ids);
            setToast({ message: `${selectedIds.size} records restored successfully`, type: 'success' });
            setSelectedIds(new Set());
            fetchData();
        } catch (error) {
            console.error('Bulk restore error:', error);
            setToast({ message: 'Failed to restore records', type: 'error' });
        } finally {
            setIsRestoring(null);
        }
    };

    const handleBulkPermanentDelete = async () => {
        if (selectedIds.size === 0 || !isAdmin) return;
        if (!confirm(`Are you sure you want to permanently delete these ${selectedIds.size} records? This action cannot be undone.`)) return;

        try {
            const ids = Array.from(selectedIds);
            await api.bulkPermanentlyDeleteSiteFinanceRecords(ids);
            setToast({ message: `${selectedIds.size} records permanently deleted`, type: 'success' });
            setSelectedIds(new Set());
            fetchData();
        } catch (error) {
            console.error('Bulk permanent delete error:', error);
            setToast({ message: 'Failed to delete records permanently', type: 'error' });
        }
    };

    // Calculate variations for stats
    let totalBillingVariation = 0;
    let totalFeeVariation = 0;
    let profitSitesCount = 0;

    records.forEach(r => {
        const bDiff = (r.billedAmount || 0) - (r.contractAmount || 0);
        const fDiff = (r.billedManagementFee || 0) - (r.contractManagementFee || 0);
        totalBillingVariation += bDiff;
        totalFeeVariation += fDiff;
        if (bDiff + fDiff >= 0) profitSitesCount++;
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({ siteName: '', status: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const currentRecords = activeSubTab === 'active' ? records : deletedRecords;

    const filteredRecords = currentRecords.filter(r => {
        const matchesSearch = r.siteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (r.companyName || '').toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesSiteName = !filters.siteName || 
            r.siteName.toLowerCase().includes(filters.siteName.toLowerCase());
            
        const matchesStatus = !filters.status || (() => {
            const variations = ((r.billedAmount || 0) + (r.billedManagementFee || 0)) - ((r.contractAmount || 0) + (r.contractManagementFee || 0));
            const isProfit = variations >= 0;
            return filters.status === 'profit' ? isProfit : !isProfit;
        })();

        return matchesSearch && matchesSiteName && matchesStatus;
    });

    const totalPages = Math.ceil(filteredRecords.length / rowsPerPage);
    const paginatedRecords = filteredRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    // Reset page when search, filters or tab changes
    useEffect(() => { 
        setCurrentPage(1); 
    }, [searchQuery, filters, activeSubTab]);

    // Clear column filters and selection when switching sub-tabs
    useEffect(() => {
        setFilters({ siteName: '', status: '' });
        setSelectedIds(new Set());
    }, [activeSubTab]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const allIds = paginatedRecords.map(r => r.id);
            setSelectedIds(new Set(allIds));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="space-y-6 w-full px-4">

            {/* ── Action Bar ── */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={handleDownloadTemplate}
                            disabled={isExporting}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                        >
                            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            Template
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Upload className="h-3.5 w-3.5" />
                            Import
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                        >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            Export
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            type="month"
                            value={billingMonth.substring(0, 7)}
                            onChange={(e) => setBillingMonth(e.target.value + '-01')}
                            className="h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all"
                        />
                        <button
                            onClick={() => navigate('/finance/site-tracker/add')}
                            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#006B3F] rounded-lg hover:bg-[#005632] transition-all duration-150 shadow-sm shadow-emerald-900/10 hover:shadow-md hover:shadow-emerald-900/15 hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Add Record
                        </button>
                    </div>
                </div>
            </div>

            {/* ── KPI Summary Cards ── */}
            {!isLoading && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Total Variation */}
                    <div className={`rounded-xl border p-5 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 ${totalBillingVariation >= 0 ? 'bg-emerald-50/40 border-emerald-100' : 'bg-rose-50/40 border-rose-100'}`}>
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Variation</p>
                                <h3 className={`text-xl font-bold mt-1.5 ${totalBillingVariation >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(totalBillingVariation)}</h3>
                                <p className={`text-[10px] font-medium mt-1 ${totalBillingVariation >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {totalBillingVariation >= 0 ? '↑' : '↓'} Billing difference
                                </p>
                            </div>
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${totalBillingVariation >= 0 ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                                <IndianRupee className={`h-5 w-5 ${totalBillingVariation >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
                            </div>
                        </div>
                    </div>

                    {/* Fee Variation */}
                    <div className={`rounded-xl border p-5 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 ${totalFeeVariation >= 0 ? 'bg-emerald-50/40 border-emerald-100' : 'bg-rose-50/40 border-rose-100'}`}>
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Fee Variation</p>
                                <h3 className={`text-xl font-bold mt-1.5 ${totalFeeVariation >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(totalFeeVariation)}</h3>
                                <p className={`text-[10px] font-medium mt-1 ${totalFeeVariation >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {totalFeeVariation >= 0 ? '↑' : '↓'} Fee difference
                                </p>
                            </div>
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${totalFeeVariation >= 0 ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                                {totalFeeVariation >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-600" /> : <TrendingDown className="h-5 w-5 text-rose-600" />}
                            </div>
                        </div>
                    </div>

                    {/* Profit Sites */}
                    <div className="bg-white rounded-xl border border-gray-200/80 p-5 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Profit Sites</p>
                                <h3 className="text-xl font-bold text-gray-900 mt-1.5">{profitSitesCount} <span className="text-sm font-normal text-gray-400">/ {records.length}</span></h3>
                                <p className="text-[10px] font-medium text-emerald-600 mt-1">
                                    {records.length > 0 ? Math.round((profitSitesCount / records.length) * 100) : 0}% profitable
                                </p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                                <TrendingUp className="h-5 w-5 text-emerald-600" />
                            </div>
                        </div>
                    </div>

                    {/* Total Records */}
                    <div className="bg-white rounded-xl border border-gray-200/80 p-5 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Records</p>
                                <h3 className="text-xl font-bold text-gray-900 mt-1.5">{records.length}</h3>
                                <p className="text-[10px] font-medium text-gray-400 mt-1">
                                    For {format(new Date(billingMonth), 'MMM yyyy')}
                                </p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                <Building2 className="h-5 w-5 text-gray-500" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Records Table ── */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
                {/* Sub-Tabs & Search Bar */}
                <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center p-1 bg-gray-50 rounded-lg self-start">
                        <button
                            onClick={() => setActiveSubTab('active')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeSubTab === 'active' ? 'bg-white text-emerald-700 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Active Records
                        </button>
                        <button
                            onClick={() => setActiveSubTab('log')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${activeSubTab === 'log' ? 'bg-white text-emerald-700 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Deletion Log
                            {deletedRecords.length > 0 && (
                                <span className={`flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] ${activeSubTab === 'log' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                                    {deletedRecords.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {!isLoading && currentRecords.length > 0 && (
                        <div className="flex flex-1 items-center justify-end gap-3 w-full sm:w-auto">
                            <div className="relative flex-1 max-w-xs">
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full h-8 pl-8 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all placeholder:text-gray-400"
                                />
                                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">{filteredRecords.length} found</span>
                        </div>
                    )}
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
                        <span className="text-sm text-gray-400 font-medium">Loading records...</span>
                    </div>
                ) : currentRecords.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-5">
                            <ClipboardCheck className="h-7 w-7 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">
                            {activeSubTab === 'active' ? 'No finance records found' : 'Deletion Log is empty'}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1.5 max-w-xs">
                            {activeSubTab === 'active' 
                                ? 'No records found for the selected month. Add your first record to get started.' 
                                : 'No records have been deleted in the last 7 days.'}
                        </p>
                        {activeSubTab === 'active' && (
                            <button
                                onClick={() => navigate('/finance/site-tracker/add')}
                                className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white bg-[#006B3F] rounded-lg hover:bg-[#005632] transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <Plus className="h-4 w-4" />
                                Add First Record
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50/80 border-b border-gray-200">
                                        <th className="px-5 py-3 text-left w-10">
                                            <input 
                                                type="checkbox" 
                                                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                checked={paginatedRecords.length > 0 && paginatedRecords.every(r => selectedIds.has(r.id))}
                                                onChange={handleSelectAll}
                                            />
                                        </th>
                                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Client Name</th>
                                        {activeSubTab === 'active' ? (
                                            <>
                                                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Contract</th>
                                                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Billed</th>
                                                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Mgmt Fee</th>
                                                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Billed Fee</th>
                                                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Net Variation</th>
                                                <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Date</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Deleted By</th>
                                                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Reason</th>
                                                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Deleted At</th>
                                                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Expires In</th>
                                            </>
                                        )}
                                        <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-24">Actions</th>
                                    </tr>
                                    {/* Filter Row */}
                                    <tr className="bg-white border-b border-gray-100">
                                        <td className="px-5 py-2" />
                                        <td className="px-5 py-2">
                                            <input 
                                                type="text"
                                                placeholder="Filter Client..."
                                                value={filters.siteName}
                                                onChange={(e) => setFilters(prev => ({ ...prev, siteName: e.target.value }))}
                                                className="w-full text-[10px] px-2 py-1 bg-gray-50 border border-gray-200 rounded focus:border-emerald-500 outline-none transition-all"
                                            />
                                        </td>
                                        {activeSubTab === 'active' ? (
                                            <>
                                                <td className="px-4 py-2" />
                                                <td className="px-4 py-2" />
                                                <td className="px-4 py-2 hidden md:table-cell" />
                                                <td className="px-4 py-2 hidden md:table-cell" />
                                                <td className="px-4 py-2" />
                                                <td className="px-4 py-2">
                                                    <select
                                                        value={filters.status}
                                                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                                                        className="w-full text-[10px] px-1 py-1 bg-gray-50 border border-gray-200 rounded focus:border-emerald-500 outline-none transition-all font-bold text-gray-600"
                                                    >
                                                        <option value="">All Status</option>
                                                        <option value="profit">Profit</option>
                                                        <option value="loss">Loss</option>
                                                    </select>
                                                </td>
                                                <td className="px-4 py-2 hidden lg:table-cell" />
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-4 py-2" />
                                                <td className="px-4 py-2" />
                                                <td className="px-4 py-2" />
                                                <td className="px-4 py-2" />
                                            </>
                                        )}
                                        <td className="px-4 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {paginatedRecords.map(record => {
                                        const bDiff = (record.billedAmount || 0) - (record.contractAmount || 0);
                                        const fDiff = (record.billedManagementFee || 0) - (record.contractManagementFee || 0);
                                        const isProfit = bDiff + fDiff >= 0;
                                        const isSelected = selectedIds.has(record.id);
                                        
                                        // Calculate expiry for log
                                        let daysRemaining = 0;
                                        if (record.deletedAt) {
                                            const expiryDate = new Date(record.deletedAt);
                                            expiryDate.setDate(expiryDate.getDate() + 7);
                                            const diff = expiryDate.getTime() - new Date().getTime();
                                            daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
                                        }

                                        return (
                                            <tr key={record.id} className={`hover:bg-gray-50/60 transition-colors duration-100 group ${isSelected ? 'bg-emerald-50/30' : ''}`}>
                                                <td className="px-5 py-3.5">
                                                    <input 
                                                        type="checkbox" 
                                                        className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                        checked={isSelected}
                                                        onChange={() => handleSelectRow(record.id)}
                                                    />
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="font-semibold text-gray-900 text-sm">{record.siteName}</div>
                                                    <div className="text-[11px] text-gray-400 mt-0.5">{record.companyName || '—'}</div>
                                                    {activeSubTab === 'log' && record.billingMonth && (
                                                        <div className="text-[10px] text-emerald-600 font-bold mt-1 uppercase tracking-tighter">
                                                            For {format(new Date(record.billingMonth), 'MMM yyyy')}
                                                        </div>
                                                    )}
                                                </td>

                                                {activeSubTab === 'active' ? (
                                                    <>
                                                        <td className="px-4 py-3.5 text-right font-mono text-sm text-gray-600">{formatCurrency(record.contractAmount)}</td>
                                                        <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold text-gray-900">{formatCurrency(record.billedAmount)}</td>
                                                        <td className="px-4 py-3.5 text-right font-mono text-sm text-gray-600 hidden md:table-cell">{formatCurrency(record.contractManagementFee)}</td>
                                                        <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold text-gray-900 hidden md:table-cell">{formatCurrency(record.billedManagementFee)}</td>
                                                        <td className={`px-4 py-3.5 text-right font-mono text-sm font-bold ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                            {isProfit ? '+' : ''}{formatCurrency(bDiff + fDiff)}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-center">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isProfit ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${isProfit ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                                {isProfit ? 'Profit' : 'Loss'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 hidden lg:table-cell">
                                                            <div className="flex flex-col gap-0.5">
                                                                {(record.createdByName || record.createdByRole) && (
                                                                    <div className="flex items-center gap-1.5">
                                                                        {record.createdByName && (
                                                                            <span className="text-[11px] font-bold text-gray-700">{record.createdByName.split(' ')[0]}</span>
                                                                        )}
                                                                        {record.createdByRole && (
                                                                            <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-black uppercase tracking-tighter">
                                                                                {record.createdByRole.replace('_', ' ')}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {record.createdAt && <div className="text-[10px] text-gray-400">{format(new Date(record.createdAt), 'MMM d, h:mm a')}</div>}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right">
                                                            <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity duration-150">
                                                                <button onClick={() => navigate(`/finance/site-tracker/edit/${record.id}`)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-all" title="Edit">
                                                                    <Edit2 className="h-3.5 w-3.5" />
                                                                </button>
                                                                <button onClick={() => { setRecordToDelete(record); setIsBulkDeleting(false); setShowDeleteModal(true); }} className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all" title="Delete">
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="px-4 py-3.5 text-sm text-gray-600">{record.deletedByName || '—'}</td>
                                                        <td className="px-4 py-3.5 text-[11px] text-gray-500 max-w-[200px] truncate" title={record.deletedReason}>{record.deletedReason || '—'}</td>
                                                        <td className="px-4 py-3.5 text-[11px] text-gray-400">
                                                            {record.deletedAt && format(new Date(record.deletedAt), 'MMM d, h:mm a')}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right text-[11px] font-bold text-rose-500">
                                                            {daysRemaining} days
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right">
                                                            {user?.role === 'admin' ? (
                                                                <div className="flex items-center justify-end gap-1.5">
                                                                    <button 
                                                                        onClick={() => handleRestoreRecord(record.id)} 
                                                                        disabled={isRestoring === record.id}
                                                                        className="px-2.5 py-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-md hover:bg-emerald-100 transition-all flex items-center gap-1 disabled:opacity-50"
                                                                    >
                                                                        {isRestoring === record.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3" />}
                                                                        Restore
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handlePermanentDelete(record.id)} 
                                                                        className="p-1.5 text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all"
                                                                        title="Permanently Delete"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px] font-medium text-gray-400 italic">Admin only</span>
                                                            )}
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">Rows per page:</span>
                                        <select
                                            value={rowsPerPage}
                                            onChange={(e) => {
                                                setRowsPerPage(Number(e.target.value));
                                                setCurrentPage(1);
                                            }}
                                            className="h-7 px-2 text-[11px] font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded outline-none focus:border-emerald-500 transition-all cursor-pointer"
                                        >
                                            <option value={10}>10</option>
                                            <option value={15}>15</option>
                                            <option value={20}>20</option>
                                            <option value={50}>50</option>
                                        </select>
                                    </div>
                                    <p className="text-xs text-gray-400">
                                        Showing {((currentPage - 1) * rowsPerPage) + 1}–{Math.min(currentPage * rowsPerPage, filteredRecords.length)} of {filteredRecords.length}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="px-2.5 py-1 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                    >Prev</button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-7 h-7 text-xs font-medium rounded-md transition-all ${page === currentPage ? 'bg-[#006B3F] text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                                        >{page}</button>
                                    ))}
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-2.5 py-1 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                    >Next</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            {/* ── Import Preview Modal ── */}
            {previewData.length > 0 && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200">
                        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Import Preview</h2>
                                <p className="text-sm text-gray-500 mt-0.5">{previewData.length} records ready to import</p>
                            </div>
                            <button onClick={() => setPreviewData([])} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                                <Plus className="h-5 w-5 rotate-45 text-gray-400" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Site Name</th>
                                        <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Contract</th>
                                        <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Fee</th>
                                        <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Billed</th>
                                        <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Billed Fee</th>
                                        <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Net Var</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {previewData.map((record, idx) => {
                                        const totalContract = (record.contractAmount || 0) + (record.contractManagementFee || 0);
                                        const totalBilled = (record.billedAmount || 0) + (record.billedManagementFee || 0);
                                        const variations = totalBilled - totalContract;
                                        const isProfit = variations >= 0;
                                        return (
                                            <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-5 py-3">
                                                    <div className="font-semibold text-gray-900">{record.siteName}</div>
                                                    <div className="text-[11px] text-gray-400 mt-0.5">{record.companyName}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-gray-600">{formatCurrency(record.contractAmount || 0)}</td>
                                                <td className="px-4 py-3 text-right font-mono text-gray-600">{formatCurrency(record.contractManagementFee || 0)}</td>
                                                <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{formatCurrency(record.billedAmount || 0)}</td>
                                                <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{formatCurrency(record.billedManagementFee || 0)}</td>
                                                <td className={`px-4 py-3 text-right font-mono font-bold ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {isProfit ? '+' : ''}{formatCurrency(variations)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                            <button onClick={() => setPreviewData([])} className="px-5 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">Cancel</button>
                            <button
                                onClick={handleConfirmImport}
                                disabled={isImporting}
                                className="inline-flex items-center gap-1.5 px-6 py-2 text-sm font-bold text-white bg-[#006B3F] rounded-lg hover:bg-[#005632] transition-all shadow-sm disabled:opacity-50"
                            >
                                {isImporting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Confirm Import
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Actions Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6">
                        <span className="text-sm font-medium border-r border-gray-700 pr-6">
                            {selectedIds.size} records selected
                        </span>
                        <div className="flex items-center gap-3">
                            {activeSubTab === 'active' ? (
                                <button
                                    onClick={() => {
                                        setIsBulkDeleting(true);
                                        setShowDeleteModal(true);
                                    }}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-red-500 hover:bg-red-600 rounded-full text-xs font-bold transition-all"
                                >
                                    <Trash2 size={14} />
                                    Delete Selected
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={handleBulkRestore}
                                        disabled={isRestoring === 'bulk'}
                                        className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-full text-xs font-bold transition-all disabled:opacity-50"
                                    >
                                        <RotateCcw size={14} className={isRestoring === 'bulk' ? 'animate-spin' : ''} />
                                        Restore Selected
                                    </button>
                                    <button
                                        onClick={handleBulkPermanentDelete}
                                        disabled={!isAdmin}
                                        className="flex items-center gap-2 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 rounded-full text-xs font-bold transition-all disabled:opacity-50"
                                    >
                                        <ShieldX size={14} />
                                        Permanently Delete
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="px-4 py-1.5 hover:bg-white/10 rounded-full text-xs font-medium transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
                                    <Trash2 size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">
                                        {isBulkDeleting ? `Delete ${selectedIds.size} Records` : 'Delete Record'}
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Records will be moved to the Deletion Log.
                                    </p>
                                </div>
                            </div>

                            {!isBulkDeleting && recordToDelete && (
                                <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Selected Site</p>
                                    <p className="text-sm font-semibold text-gray-900">{recordToDelete.siteName}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{recordToDelete.companyName}</p>
                                </div>
                            )}

                            <div className="mb-6">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Reason for Deletion</label>
                                <textarea
                                    value={deleteReason}
                                    onChange={(e) => setDeleteReason(e.target.value)}
                                    placeholder="Enter reason..."
                                    className="w-full h-24 px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-red-500 rounded-xl outline-none transition-all resize-none text-sm"
                                />
                            </div>

                            <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 mb-6 flex items-start gap-3">
                                <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
                                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                                    Records can be restored from the Deletion Log within 7 days. After 7 days, they will be permanently deleted.
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowDeleteModal(false);
                                        setRecordToDelete(null);
                                        setIsBulkDeleting(false);
                                    }}
                                    className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleDelete(deleteReason)}
                                    disabled={!deleteReason.trim() || isDeleting}
                                    className="flex-2 py-3 px-6 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2"
                                >
                                    {isDeleting ? 'Deleting...' : 'Confirm Deletion'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SiteFinanceTracker;
