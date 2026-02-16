import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { api } from '../../services/api';
import type { SiteInvoiceRecord, SiteInvoiceDefault } from '../../types';
import { format, differenceInCalendarDays, parseISO, isBefore, isToday, startOfDay, subDays } from 'date-fns';
import { Loader2, Plus, Trash2, Edit2, ClipboardList, CheckCircle2, Clock, Mail, AlertTriangle, Building, Download, Upload, FileSpreadsheet, X, Search, RotateCcw, ShieldX, Info } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import Toast from '../../components/ui/Toast';

const SiteAttendanceTracker: React.FC = () => {
    const navigate = useNavigate();
    const [records, setRecords] = useState<SiteInvoiceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [previewData, setPreviewData] = useState<Partial<SiteInvoiceRecord>[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [siteDefaults, setSiteDefaults] = useState<SiteInvoiceDefault[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filter & Pagination State
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({ siteName: '', status: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Deletion State
    const [deletedRecords, setDeletedRecords] = useState<SiteInvoiceRecord[]>([]);
    const [activeSubTab, setActiveSubTab] = useState<'active' | 'log'>('active');
    const [recordToDelete, setRecordToDelete] = useState<SiteInvoiceRecord | null>(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRestoring, setIsRestoring] = useState<string | null>(null);

    const { user } = useAuthStore();

    const fetchInitialData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const isSuperAdmin = ['admin', 'super_admin'].includes(user.role);
            const managerId = isSuperAdmin ? undefined : user.id;

            const [fetchedRecords, fetchedDefaults, fetchedDeleted] = await Promise.all([
                api.getSiteInvoiceRecords(managerId),
                api.getSiteInvoiceDefaults(managerId),
                api.getDeletedSiteInvoiceRecords(managerId)
            ]);
            setRecords(fetchedRecords);
            setSiteDefaults(fetchedDefaults);
            setDeletedRecords(fetchedDeleted);

            // Auto-cleanup records older than 7 days
            const sevenDaysAgo = subDays(new Date(), 7);
            const recordsToCleanup = fetchedDeleted.filter(r => 
                r.deletedAt && new Date(r.deletedAt) < sevenDaysAgo
            );

            if (recordsToCleanup.length > 0) {
                await Promise.all(recordsToCleanup.map(r => api.permanentlyDeleteSiteInvoiceRecord(r.id)));
                const refreshedDeleted = await api.getDeletedSiteInvoiceRecords();
                setDeletedRecords(refreshedDeleted);
            }
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

    const handleDelete = async (reason: string) => {
        if (isBulkDeleting) {
            await handleBulkDelete(reason);
            return;
        }
        if (!recordToDelete || !user) return;
        setIsDeleting(true);
        try {
            await api.softDeleteSiteInvoiceRecord(recordToDelete.id, reason, user.id, user.name || 'Unknown');
            setToast({ message: 'Record moved to deletion log', type: 'success' });
            setRecordToDelete(null);
            setDeleteReason('');
            setShowDeleteModal(false);
            fetchInitialData();
        } catch (error) {
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
            await api.bulkSoftDeleteSiteInvoiceRecords(
                ids,
                reason,
                user.id,
                user.name || 'Unknown'
            );
            setToast({ message: `${selectedIds.size} records moved to deletion log`, type: 'success' });
            setSelectedIds(new Set());
            setDeleteReason('');
            setIsBulkDeleting(false);
            setShowDeleteModal(false);
            fetchInitialData();
        } catch (error) {
            console.error('Bulk delete error:', error);
            setToast({ message: 'Failed to delete selected records', type: 'error' });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRestore = async (id: string) => {
        setIsRestoring(id);
        try {
            await api.restoreSiteInvoiceRecord(id);
            setToast({ message: 'Record restored successfully', type: 'success' });
            fetchInitialData();
        } catch (error) {
            setToast({ message: 'Failed to restore record', type: 'error' });
        } finally {
            setIsRestoring(null);
        }
    };

  const handlePermanentDelete = async (id: string) => {
        if (!window.confirm('This will permanently delete the record. Continue?')) return;
        try {
            await api.permanentlyDeleteSiteInvoiceRecord(id);
            setToast({ message: 'Record permanently deleted', type: 'success' });
            fetchInitialData();
        } catch (error) {
            setToast({ message: 'Failed to delete record', type: 'error' });
        }
    };

    const handleBulkRestore = async () => {
        if (selectedIds.size === 0 || !isAdmin) return;
        setIsRestoring('bulk');
        try {
            const ids = Array.from(selectedIds);
            await api.bulkRestoreSiteInvoiceRecords(ids);
            setToast({ message: `${selectedIds.size} records restored successfully`, type: 'success' });
            setSelectedIds(new Set());
            fetchInitialData();
        } catch (error) {
            setToast({ message: 'Failed to restore records', type: 'error' });
        } finally {
            setIsRestoring(null);
        }
    };

    const handleBulkPermanentDelete = async () => {
        if (selectedIds.size === 0 || !isAdmin) return;
        if (!window.confirm(`Are you sure you want to permanently delete these ${selectedIds.size} records? This action cannot be undone.`)) return;

        try {
            const ids = Array.from(selectedIds);
            await api.bulkPermanentlyDeleteSiteInvoiceRecords(ids);
            setToast({ message: `${selectedIds.size} records permanently deleted`, type: 'success' });
            setSelectedIds(new Set());
            fetchInitialData();
        } catch (error) {
            setToast({ message: 'Failed to delete records', type: 'error' });
        }
    };

    const getDelayColor = (delay: number | null) => {
        if (delay === null) return 'text-gray-400';
        if (delay > 5) return 'text-rose-600 bg-rose-50 px-2 py-0.5 rounded font-bold';
        if (delay > 0) return 'text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-semibold';
        return 'text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-medium';
    };

    const parseExcelDate = (val: any): string | null => {
        if (!val) return null;
        if (val instanceof Date) return format(val, 'yyyy-MM-dd');
        const str = val.toString().trim();
        if (!str) return null;
        // Handle common Excel date formats or raw strings
        try {
            const date = new Date(str);
            if (!isNaN(date.getTime())) {
                return format(date, 'yyyy-MM-dd');
            }
        } catch (e) {
            console.warn('Failed to parse date:', str);
        }
        return null;
    };

    const calculateDelay = (received: string, tentative: string): number | null => {
        if (!received || !tentative) return null;
        try {
            return differenceInCalendarDays(parseISO(received), parseISO(tentative));
        } catch (e) {
            return null;
        }
    };

    // --- Excel Functions ---
    const handleExport = async () => {
        setIsExporting(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet('Invoice Tracker');
            ws.columns = [
                { header: 'Site Name', key: 'siteName', width: 25 },
                { header: 'Company Name', key: 'companyName', width: 18 },
                { header: 'Billing Cycle', key: 'billingCycle', width: 18 },
                { header: 'Ops Incharge', key: 'opsIncharge', width: 15 },
                { header: 'HR Incharge', key: 'hrIncharge', width: 15 },
                { header: 'Invoice Incharge', key: 'invoiceIncharge', width: 18 },
                { header: 'Ops Remarks', key: 'opsRemarks', width: 20 },
                { header: 'HR Remarks', key: 'hrRemarks', width: 20 },
                { header: 'Finance Remarks', key: 'financeRemarks', width: 20 },
                { header: 'Manager Tentative Date', key: 'managerTentativeDate', width: 15 },
                { header: 'Manager Received Date', key: 'managerReceivedDate', width: 15 },
                { header: 'HR Tentative Date', key: 'hrTentativeDate', width: 15 },
                { header: 'HR Received Date', key: 'hrReceivedDate', width: 15 },
                { header: 'Attendance Received Time', key: 'attendanceReceivedTime', width: 12 },
                { header: 'Invoice Sharing Tentative Date', key: 'invoiceSharingTentativeDate', width: 15 },
                { header: 'Invoice Prepared Date', key: 'invoicePreparedDate', width: 15 },
                { header: 'Invoice Sent Date', key: 'invoiceSentDate', width: 15 },
                { header: 'Invoice Sent Time', key: 'invoiceSentTime', width: 12 },
                { header: 'Invoice Sent Method Remarks', key: 'invoiceSentMethodRemarks', width: 25 },
                { header: 'Received Balance', key: 'receivedBalance', width: 15 },
                { header: 'Balance Receipt No / Remarks', key: 'receivedBalanceReceipt', width: 25 },
            ];
            ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006B3F' } };
            records.forEach(r => ws.addRow(r));
            const buffer = await workbook.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `Attendance_Tracker_${format(new Date(), 'yyyyMMdd')}.xlsx`);
            setToast({ message: 'Exported successfully!', type: 'success' });
        } catch (err) {
            setToast({ message: 'Failed to export', type: 'error' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleDownloadTemplate = async () => {
        setIsExporting(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet('Template');
            ws.columns = [
                { header: 'Site Name', key: 'siteName', width: 25 },
                { header: 'Company Name', key: 'companyName', width: 20 },
                { header: 'Billing Cycle', key: 'billingCycle', width: 20 },
                { header: 'Ops Incharge', key: 'opsIncharge', width: 20 },
                { header: 'HR Incharge', key: 'hrIncharge', width: 20 },
                { header: 'Invoice Incharge', key: 'invoiceIncharge', width: 20 },
                { header: 'Ops Remarks', key: 'opsRemarks', width: 20 },
                { header: 'HR Remarks', key: 'hrRemarks', width: 20 },
                { header: 'Finance Remarks', key: 'financeRemarks', width: 20 },
                { header: 'Manager Tentative Date', key: 'managerTentativeDate', width: 15 },
                { header: 'Manager Received Date', key: 'managerReceivedDate', width: 15 },
                { header: 'HR Tentative Date', key: 'hrTentativeDate', width: 15 },
                { header: 'HR Received Date', key: 'hrReceivedDate', width: 15 },
                { header: 'Attendance Received Time', key: 'attendanceReceivedTime', width: 12 },
                { header: 'Invoice Sharing Tentative Date', key: 'invoiceSharingTentativeDate', width: 15 },
                { header: 'Invoice Prepared Date', key: 'invoicePreparedDate', width: 15 },
                { header: 'Invoice Sent Date', key: 'invoiceSentDate', width: 15 },
                { header: 'Invoice Sent Time', key: 'invoiceSentTime', width: 12 },
                { header: 'Invoice Sent Method Remarks', key: 'invoiceSentMethodRemarks', width: 25 },
                { header: 'Received Balance', key: 'receivedBalance', width: 15 },
                { header: 'Balance Receipt No / Remarks', key: 'receivedBalanceReceipt', width: 25 },
            ];
            ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
            siteDefaults.forEach(d => ws.addRow(d));
            const buffer = await workbook.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), 'Attendance_Template.xlsx');
            setToast({ message: 'Template downloaded!', type: 'success' });
        } catch (err) {
            setToast({ message: 'Failed to download template', type: 'error' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(await file.arrayBuffer());
            const ws = workbook.getWorksheet(1);
            const parsed: Partial<SiteInvoiceRecord>[] = [];
            ws?.eachRow((row, i) => {
                if (i === 1) return;
                parsed.push({
                    siteName: row.getCell(1).value?.toString() || '',
                    companyName: row.getCell(2).value?.toString() || '',
                    billingCycle: row.getCell(3).value?.toString() || '',
                    opsIncharge: row.getCell(4).value?.toString() || '',
                    hrIncharge: row.getCell(5).value?.toString() || '',
                    invoiceIncharge: row.getCell(6).value?.toString() || '',
                    opsRemarks: row.getCell(7).value?.toString() || '',
                    hrRemarks: row.getCell(8).value?.toString() || '',
                    financeRemarks: row.getCell(9).value?.toString() || '',
                    managerTentativeDate: parseExcelDate(row.getCell(10).value),
                    managerReceivedDate: parseExcelDate(row.getCell(11).value),
                    hrTentativeDate: parseExcelDate(row.getCell(12).value),
                    hrReceivedDate: parseExcelDate(row.getCell(13).value),
                    attendanceReceivedTime: row.getCell(14).value?.toString() || '',
                    invoiceSharingTentativeDate: parseExcelDate(row.getCell(15).value),
                    invoicePreparedDate: parseExcelDate(row.getCell(16).value),
                    invoiceSentDate: parseExcelDate(row.getCell(17).value),
                    invoiceSentTime: row.getCell(18).value?.toString() || '',
                    invoiceSentMethodRemarks: row.getCell(19).value?.toString() || '',
                });
            });
            setPreviewData(parsed.filter(p => !!p.siteName));
            setToast({ message: 'File parsed. Please review.', type: 'success' });
        } catch (err) {
            setToast({ message: 'Failed to parse file', type: 'error' });
        }
    };

    const handleConfirmImport = async () => {
        if (!user) return;
        setIsImporting(true);
        try {
            const recordsWithUser = previewData.map(r => ({
                ...r,
                createdBy: user.id,
                createdByName: user.name,
                createdByRole: user.role
            }));
            await api.bulkSaveSiteInvoiceRecords(recordsWithUser);
            setToast({ message: 'Records imported!', type: 'success' });
            setPreviewData([]);
            fetchInitialData();
        } catch (err: any) {
            console.error('Import failed:', err);
            const detailedError = err.message || err.details || 'Check console for details';
            setToast({ message: `Import failed: ${detailedError}`, type: 'error' });
        } finally {
            setIsImporting(false);
        }
    };

    // --- Filter & Stats ---
    const currentRecords = activeSubTab === 'active' ? records : deletedRecords;

    const filteredRecords = useMemo(() => {
        return currentRecords.filter(r => {
            const matchesSearch = r.siteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (r.companyName || '').toLowerCase().includes(searchQuery.toLowerCase());
            
            const matchesSiteName = !filters.siteName || 
                r.siteName.toLowerCase().includes(filters.siteName.toLowerCase());
                
            const matchesStatus = !filters.status || (() => {
                const isSent = !!r.invoiceSentDate;
                return filters.status === 'sent' ? isSent : !isSent;
            })();

            return matchesSearch && matchesSiteName && matchesStatus;
        });
    }, [currentRecords, searchQuery, filters]);

    const stats = useMemo(() => {
        const total = records.length;
        const sent = records.filter(r => !!r.invoiceSentDate).length;
        const pending = total - sent;
        const today = startOfDay(new Date());
        const due = records.filter(r => {
            if (!!r.invoiceSentDate || !r.invoiceSharingTentativeDate) return false;
            return isBefore(parseISO(r.invoiceSharingTentativeDate), today) || isToday(parseISO(r.invoiceSharingTentativeDate));
        });
        return { total, sent, pending, due };
    }, [records]);

    const totalPages = Math.ceil(filteredRecords.length / rowsPerPage);
    const paginatedRecords = filteredRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

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

    useEffect(() => { 
        setCurrentPage(1); 
    }, [searchQuery, filters, activeSubTab]);

    useEffect(() => {
        setFilters({ siteName: '', status: '' });
        setSelectedIds(new Set());
    }, [activeSubTab]);

    const isAdmin = ['admin', 'super_admin', 'management', 'hr'].includes(user?.role || '');

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
                            <Download className="h-3.5 w-3.5 text-emerald-600" />
                            Template
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Upload className="h-3.5 w-3.5 text-emerald-600" />
                            Import
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                        >
                            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                            Export
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
                    </div>
                    <button
                        onClick={() => navigate('/finance/attendance/add')}
                        className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#006B3F] rounded-lg hover:bg-[#005632] transition-all duration-150 shadow-sm shadow-emerald-900/10 hover:shadow-md hover:shadow-emerald-900/15 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        New Entry
                    </button>
                </div>
            </div>

            {/* ── KPI Summary Cards ── */}
            {!isLoading && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200/80 p-5 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-emerald-600">Total Sites</p>
                                <h3 className="text-xl font-bold text-gray-900 mt-1.5">{stats.total}</h3>
                                <p className="text-[10px] font-medium text-gray-400 mt-1">Active site connections</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                                <Building className="h-5 w-5 text-emerald-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200/80 p-5 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-rose-600">Pending Invoices</p>
                                <h3 className="text-xl font-bold text-gray-900 mt-1.5">{stats.pending}</h3>
                                <p className="text-[10px] font-medium text-rose-500 mt-1">{stats.due.length} Action required</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center">
                                <Clock className="h-5 w-5 text-rose-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200/80 p-5 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-emerald-600">Successfully Sent</p>
                                <h3 className="text-xl font-bold text-gray-900 mt-1.5">{stats.sent}</h3>
                                <p className="text-[10px] font-medium text-emerald-500 mt-1">{Math.round((stats.sent / (stats.total || 1)) * 100)}% Completion</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200/80 p-5 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-emerald-600">Mail Dispatched</p>
                                <h3 className="text-xl font-bold text-gray-900 mt-1.5">{records.filter(r => r.invoiceSentMethodRemarks?.toLowerCase().includes('mail')).length}</h3>
                                <p className="text-[10px] font-medium text-gray-400 mt-1">Via organizational email</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                                <Mail className="h-5 w-5 text-emerald-600" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Due Alerts ── */}
            {!isLoading && stats.due.length > 0 && (
                <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                        <AlertTriangle className="h-4 w-4 text-rose-600" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-rose-900">Immediate Action Required</h4>
                        <p className="text-xs text-rose-700 mt-0.5">The following sites have reached their tentative invoice sharing date:</p>
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {stats.due.map(site => (
                                <span key={site.id} className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-rose-200 text-rose-800 text-[10px] font-bold shadow-sm whitespace-nowrap">
                                    {site.siteName} (Due: {site.invoiceSharingTentativeDate ? format(parseISO(site.invoiceSharingTentativeDate), 'dd MMM') : 'N/A'})
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main Data Section ── */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-6">
                        <div className="flex bg-gray-100/80 p-1 rounded-lg">
                            <button
                                onClick={() => setActiveSubTab('active')}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                                    activeSubTab === 'active' 
                                        ? 'bg-white text-emerald-700 shadow-sm' 
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Active Records
                            </button>
                            <button
                                onClick={() => setActiveSubTab('log')}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                                    activeSubTab === 'log' 
                                        ? 'bg-white text-rose-700 shadow-sm' 
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Deletion Log
                                {deletedRecords.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 text-[10px]">
                                        {deletedRecords.length}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>

                    {!isLoading && (
                        <div className="flex flex-1 items-center justify-end gap-3 w-full sm:w-auto">
                            <div className="relative flex-1 max-w-xs">
                                <input
                                    type="text"
                                    placeholder={`Search ${activeSubTab === 'active' ? 'records' : 'deleted ones'}...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full h-8 pl-8 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all placeholder:text-gray-400"
                                />
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                            </div>
                        </div>
                    )}
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
                        <span className="text-sm text-gray-400 font-medium">Loading records...</span>
                    </div>
                ) : filteredRecords.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-5">
                            <ClipboardList className="h-7 w-7 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">
                            {activeSubTab === 'active' ? 'No attendance records' : 'Deletion log is empty'}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1.5 max-w-xs">
                            {activeSubTab === 'active' 
                                ? 'No records found for the current filter. Add a new entry to get started.' 
                                : 'Records deleted in the last 7 days will appear here.'}
                        </p>
                        {activeSubTab === 'active' && (
                            <button
                                onClick={() => navigate('/finance/attendance/add')}
                                className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white bg-[#006B3F] rounded-lg hover:bg-[#005632] transition-all"
                            >
                                <Plus className="h-4 w-4" />
                                Add First Entry
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
                                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Site Information</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Incharges (Ops / HR)</th>
                                        {activeSubTab === 'active' ? (
                                            <>
                                                <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Mgr Delay</th>
                                                <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">HR Delay</th>
                                                <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Sharing Delay</th>
                                                <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Deleted By</th>
                                                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Reason</th>
                                                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Deleted At</th>
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
                                                placeholder="Filter Site..."
                                                value={filters.siteName}
                                                onChange={(e) => setFilters(prev => ({ ...prev, siteName: e.target.value }))}
                                                className="w-full text-[10px] px-2 py-1 bg-gray-50 border border-gray-200 rounded focus:border-emerald-500 outline-none transition-all"
                                            />
                                        </td>
                                        <td className="px-4 py-2 hidden md:table-cell" />
                                        {activeSubTab === 'active' ? (
                                            <>
                                                <td className="px-4 py-2" />
                                                <td className="px-4 py-2" />
                                                <td className="px-4 py-2" />
                                                <td className="px-4 py-2">
                                                    <select
                                                        value={filters.status}
                                                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                                                        className="w-full text-[10px] px-1 py-1 bg-gray-50 border border-gray-200 rounded focus:border-emerald-500 outline-none transition-all font-bold text-gray-600"
                                                    >
                                                        <option value="">All Status</option>
                                                        <option value="sent">Sent</option>
                                                        <option value="pending">Pending</option>
                                                    </select>
                                                </td>
                                                <td className="px-4 py-2" />
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-4 py-2" />
                                                <td className="px-4 py-2" />
                                                <td className="px-4 py-2" />
                                            </>
                                        )}
                                        <td className="px-4 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {paginatedRecords.map((record, idx) => {
                                        const mgrDelay = calculateDelay(record.managerReceivedDate!, record.managerTentativeDate!);
                                        const hrDelay = calculateDelay(record.hrReceivedDate!, record.hrTentativeDate!);
                                        const sharingDelay = calculateDelay(record.invoiceSentDate!, record.invoiceSharingTentativeDate!);
                                        const isSelected = selectedIds.has(record.id);

                                        return (
                                            <tr key={record.id} className={`hover:bg-gray-50/60 transition-all duration-100 group ${isSelected ? 'bg-emerald-50/30' : ''}`}>
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
                                                    {record.billingCycle && <div className="inline-block mt-1.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-tighter">{record.billingCycle}</div>}
                                                </td>
                                                <td className="px-4 py-3.5 hidden md:table-cell">
                                                    <div className="text-xs text-gray-600 font-medium">Ops: {record.opsIncharge || '—'}</div>
                                                    <div className="text-[11px] text-gray-400 mt-0.5">HR: {record.hrIncharge || '—'}</div>
                                                </td>
                                                {activeSubTab === 'active' ? (
                                                    <>
                                                        <td className="px-4 py-3.5 text-center text-xs">
                                                            <span className={getDelayColor(mgrDelay)}>
                                                                {mgrDelay !== null ? `${mgrDelay}d` : '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-center text-xs">
                                                            <span className={getDelayColor(hrDelay)}>
                                                                {hrDelay !== null ? `${hrDelay}d` : '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-center text-xs">
                                                            <span className={getDelayColor(sharingDelay)}>
                                                                {sharingDelay !== null ? `${sharingDelay}d` : '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-center">
                                                            {record.invoiceSentDate ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                                                    <CheckCircle2 className="h-3 w-3" />
                                                                    Sent
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold whitespace-nowrap">
                                                                    <Clock className="h-3 w-3" />
                                                                    Pending
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <div className="text-[11px] font-medium text-gray-900">{format(parseISO(record.createdAt!), 'dd MMM yyyy')}</div>
                                                            <div className="flex items-center gap-1 mt-1">
                                                                <span className="text-[10px] text-gray-400">{record.createdByName || 'System'}</span>
                                                                {record.createdByRole && (
                                                                    <span className="px-1 py-0.5 rounded bg-gray-100 text-[10px] font-bold text-gray-500 uppercase border border-gray-200">
                                                                        {record.createdByRole.replace('_', ' ')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="px-4 py-3.5">
                                                            <div className="text-xs font-semibold text-gray-900">{record.deletedByName || 'Unknown'}</div>
                                                            <div className="text-[10px] text-gray-400 mt-0.5">ID: {record.deletedBy?.slice(0, 8)}...</div>
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <div className="flex items-start gap-1.5">
                                                                <Info className="h-3 w-3 text-rose-400 mt-0.5 shrink-0" />
                                                                <p className="text-xs text-rose-600 font-medium leading-relaxed italic">"{record.deletedReason || 'No reason provided'}"</p>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <div className="text-xs font-medium text-gray-900">{record.deletedAt ? format(parseISO(record.deletedAt), 'dd MMM, HH:mm') : '—'}</div>
                                                            <div className="text-[10px] text-gray-400 mt-0.5">Auto-purge in 7 days</div>
                                                        </td>
                                                    </>
                                                )}
                                                <td className="px-4 py-3.5 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {activeSubTab === 'active' ? (
                                                            <>
                                                                <button 
                                                                    onClick={() => navigate(`/finance/attendance/edit/${record.id}`)} 
                                                                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-all h-8 w-8 flex items-center justify-center border border-transparent hover:border-emerald-100"
                                                                    title="Edit"
                                                                >
                                                                    <Edit2 className="h-3.5 w-3.5" />
                                                                </button>
                                                                <button 
                                                                    onClick={() => { setRecordToDelete(record); setIsBulkDeleting(false); setShowDeleteModal(true); }} 
                                                                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all h-8 w-8 flex items-center justify-center border border-transparent hover:border-rose-100"
                                                                    title="Delete"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button 
                                                                    onClick={() => handleRestore(record.id)} 
                                                                    disabled={isRestoring === record.id || !isAdmin}
                                                                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-all h-8 w-8 flex items-center justify-center border border-transparent hover:border-emerald-100 disabled:opacity-50"
                                                                    title="Restore"
                                                                >
                                                                    {isRestoring === record.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                                                </button>
                                                                <button 
                                                                    onClick={() => handlePermanentDelete(record.id)} 
                                                                    disabled={!isAdmin}
                                                                    className="p-1.5 text-gray-400 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-all h-8 w-8 flex items-center justify-center border border-transparent hover:border-rose-100 disabled:opacity-50"
                                                                    title="Permanent Delete"
                                                                >
                                                                    <ShieldX className="h-3.5 w-3.5" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
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
                                        className="px-2.5 py-1 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40"
                                    >Prev</button>
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map(page => (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-7 h-7 text-xs font-medium rounded-md transition-all ${page === currentPage ? 'bg-[#006B3F] text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                                        >{page}</button>
                                    ))}
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-2.5 py-1 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40"
                                    >Next</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Import Preview Modal ── */}
            {previewData.length > 0 && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200">
                        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Attendance Import Preview</h2>
                                <p className="text-sm text-gray-500 mt-0.5">{previewData.length} records ready to import</p>
                            </div>
                            <button onClick={() => setPreviewData([])} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                                <X className="h-5 w-5 text-gray-400" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Site Name</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Company</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Billing</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Ops Incharge</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">HR Incharge</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {previewData.map((record, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/50">
                                            <td className="px-5 py-3 font-semibold text-gray-900">{record.siteName}</td>
                                            <td className="px-4 py-3 text-xs text-gray-600">{record.companyName}</td>
                                            <td className="px-4 py-3 text-xs text-gray-600">{record.billingCycle}</td>
                                            <td className="px-4 py-3 text-xs text-gray-600">{record.opsIncharge}</td>
                                            <td className="px-4 py-3 text-xs text-gray-600">{record.hrIncharge}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                            <button onClick={() => setPreviewData([])} className="px-5 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                            <button
                                onClick={handleConfirmImport}
                                disabled={isImporting}
                                className="inline-flex items-center gap-1.5 px-6 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-50"
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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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

            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
    );
};

export default SiteAttendanceTracker;
