import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { api } from '../../services/api';
import type { SiteInvoiceRecord, SiteInvoiceDefault } from '../../types';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { format, differenceInCalendarDays, parseISO, isBefore, isToday, startOfDay } from 'date-fns';
import { Loader2, Plus, Trash2, Edit2, ClipboardList, CheckCircle2, Clock, Mail, AlertTriangle, Building, Download, Upload, FileSpreadsheet, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import StatCard from '../../components/ui/StatCard';

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

    const fetchInitialData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [fetchedRecords, fetchedDefaults] = await Promise.all([
                api.getSiteInvoiceRecords(),
                api.getSiteInvoiceDefaults()
            ]);
            setRecords(fetchedRecords);
            setSiteDefaults(fetchedDefaults);
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
            await api.deleteSiteInvoiceRecord(id);
            setToast({ message: 'Record deleted', type: 'success' });
            fetchInitialData();
        } catch (error) {
            console.error('Delete error:', error);
            setToast({ message: 'Failed to delete record', type: 'error' });
        }
    };

    const getDelayColor = (delay: number | null) => {
        if (delay === null) return '';
        if (delay > 5) return 'bg-red-100 text-red-700 font-black';
        if (delay > 0) return 'bg-orange-100 text-orange-700 font-bold';
        if (delay === 0) return 'bg-green-50 text-green-700';
        return 'bg-green-100 text-green-800 font-bold';
    };

    const calculateDelay = (received: string, tentative: string): number | null => {
        if (!received || !tentative) return null;
        return differenceInCalendarDays(parseISO(received), parseISO(tentative));
    };

    // --- Excel Export ---
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
                { header: 'Mgr Tentative Date', key: 'managerTentativeDate', width: 18 },
                { header: 'Mgr Received Date', key: 'managerReceivedDate', width: 18 },
                { header: 'HR Tentative Date', key: 'hrTentativeDate', width: 18 },
                { header: 'HR Received Date', key: 'hrReceivedDate', width: 18 },
                { header: 'Attendance Received Time', key: 'attendanceReceivedTime', width: 22 },
                { header: 'Invoice Tentative Date', key: 'invoiceSharingTentativeDate', width: 22 },
                { header: 'Invoice Prepared Date', key: 'invoicePreparedDate', width: 20 },
                { header: 'Invoice Sent Date', key: 'invoiceSentDate', width: 18 },
                { header: 'Invoice Sent Time', key: 'invoiceSentTime', width: 18 },
                { header: 'Sent Method/Remarks', key: 'invoiceSentMethodRemarks', width: 22 },
            ];

            // Style header row
            ws.getRow(1).font = { bold: true, size: 11 };
            ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
            ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

            records.forEach(r => {
                ws.addRow({
                    siteName: r.siteName,
                    companyName: r.companyName,
                    billingCycle: r.billingCycle,
                    opsIncharge: r.opsIncharge,
                    hrIncharge: r.hrIncharge,
                    invoiceIncharge: r.invoiceIncharge,
                    opsRemarks: r.opsRemarks,
                    hrRemarks: r.hrRemarks,
                    financeRemarks: r.financeRemarks,
                    managerTentativeDate: r.managerTentativeDate || '',
                    managerReceivedDate: r.managerReceivedDate || '',
                    hrTentativeDate: r.hrTentativeDate || '',
                    hrReceivedDate: r.hrReceivedDate || '',
                    attendanceReceivedTime: r.attendanceReceivedTime || '',
                    invoiceSharingTentativeDate: r.invoiceSharingTentativeDate || '',
                    invoicePreparedDate: r.invoicePreparedDate || '',
                    invoiceSentDate: r.invoiceSentDate || '',
                    invoiceSentTime: r.invoiceSentTime || '',
                    invoiceSentMethodRemarks: r.invoiceSentMethodRemarks || '',
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `Site_Invoice_Tracker_${format(new Date(), 'yyyyMMdd')}.xlsx`);
            setToast({ message: 'Excel exported successfully!', type: 'success' });
        } catch (err) {
            console.error('Export error:', err);
            setToast({ message: 'Failed to export data', type: 'error' });
        } finally {
            setIsExporting(false);
        }
    };

    // --- Download Template (with site defaults pre-filled) ---
    const handleDownloadTemplate = async () => {
        setIsExporting(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet('Invoice Template');

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
                { header: 'Mgr Tentative Date', key: 'managerTentativeDate', width: 18 },
                { header: 'Mgr Received Date', key: 'managerReceivedDate', width: 18 },
                { header: 'HR Tentative Date', key: 'hrTentativeDate', width: 18 },
                { header: 'HR Received Date', key: 'hrReceivedDate', width: 18 },
                { header: 'Attendance Received Time', key: 'attendanceReceivedTime', width: 22 },
                { header: 'Invoice Tentative Date', key: 'invoiceSharingTentativeDate', width: 22 },
                { header: 'Invoice Prepared Date', key: 'invoicePreparedDate', width: 20 },
                { header: 'Invoice Sent Date', key: 'invoiceSentDate', width: 18 },
                { header: 'Invoice Sent Time', key: 'invoiceSentTime', width: 18 },
                { header: 'Sent Method/Remarks', key: 'invoiceSentMethodRemarks', width: 22 },
            ];

            ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
            ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

            // Pre-fill with site defaults
            siteDefaults.forEach(d => {
                ws.addRow({
                    siteName: d.siteName,
                    companyName: d.companyName || '',
                    billingCycle: d.billingCycle || '',
                    opsIncharge: d.opsIncharge || '',
                    hrIncharge: d.hrIncharge || '',
                    invoiceIncharge: d.invoiceIncharge || '',
                    opsRemarks: '',
                    hrRemarks: '',
                    financeRemarks: '',
                    managerTentativeDate: d.managerTentativeDate || '',
                    managerReceivedDate: '',
                    hrTentativeDate: d.hrTentativeDate || '',
                    hrReceivedDate: '',
                    attendanceReceivedTime: '',
                    invoiceSharingTentativeDate: d.invoiceSharingTentativeDate || '',
                    invoicePreparedDate: '',
                    invoiceSentDate: '',
                    invoiceSentTime: '',
                    invoiceSentMethodRemarks: '',
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `Invoice_Template_${format(new Date(), 'yyyyMMdd')}.xlsx`);
            setToast({ message: 'Template downloaded!', type: 'success' });
        } catch (err) {
            console.error('Template error:', err);
            setToast({ message: 'Failed to generate template', type: 'error' });
        } finally {
            setIsExporting(false);
        }
    };

    // --- Excel Import (parse and preview) ---
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const workbook = new ExcelJS.Workbook();
            const arrayBuffer = await file.arrayBuffer();
            await workbook.xlsx.load(arrayBuffer);
            const ws = workbook.getWorksheet(1);

            const parsed: Partial<SiteInvoiceRecord>[] = [];
            ws?.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return;

                const siteName = row.getCell(1).value?.toString() || '';
                if (!siteName) return;

                const getDateStr = (cell: any): string => {
                    const val = cell.value;
                    if (!val) return '';
                    if (val instanceof Date) return format(val, 'yyyy-MM-dd');
                    return val.toString();
                };

                parsed.push({
                    siteName,
                    companyName: row.getCell(2).value?.toString() || '',
                    billingCycle: row.getCell(3).value?.toString() || '',
                    opsIncharge: row.getCell(4).value?.toString() || '',
                    hrIncharge: row.getCell(5).value?.toString() || '',
                    invoiceIncharge: row.getCell(6).value?.toString() || '',
                    opsRemarks: row.getCell(7).value?.toString() || '',
                    hrRemarks: row.getCell(8).value?.toString() || '',
                    financeRemarks: row.getCell(9).value?.toString() || '',
                    managerTentativeDate: getDateStr(row.getCell(10)),
                    managerReceivedDate: getDateStr(row.getCell(11)),
                    hrTentativeDate: getDateStr(row.getCell(12)),
                    hrReceivedDate: getDateStr(row.getCell(13)),
                    attendanceReceivedTime: row.getCell(14).value?.toString() || '',
                    invoiceSharingTentativeDate: getDateStr(row.getCell(15)),
                    invoicePreparedDate: getDateStr(row.getCell(16)),
                    invoiceSentDate: getDateStr(row.getCell(17)),
                    invoiceSentTime: row.getCell(18).value?.toString() || '',
                    invoiceSentMethodRemarks: row.getCell(19).value?.toString() || '',
                });
            });

            if (parsed.length === 0) {
                setToast({ message: 'No valid rows found in the file', type: 'error' });
            } else {
                setPreviewData(parsed);
                setToast({ message: `${parsed.length} records parsed. Review below.`, type: 'success' });
            }
        } catch (err) {
            console.error('Import error:', err);
            setToast({ message: 'Failed to parse Excel file', type: 'error' });
        }
        if (event.target) event.target.value = '';
    };

    const handleConfirmImport = async () => {
        setIsImporting(true);
        try {
            await api.bulkSaveSiteInvoiceRecords(previewData);
            setToast({ message: `${previewData.length} records imported successfully!`, type: 'success' });
            setPreviewData([]);
            fetchInitialData();
        } catch (err) {
            console.error('Bulk save error:', err);
            setToast({ message: 'Failed to import records', type: 'error' });
        } finally {
            setIsImporting(false);
        }
    };

    const stats = useMemo(() => {
        const total = records.length;
        const sentRecords = records.filter(r => !!r.invoiceSentDate);
        const onTimeCount = sentRecords.filter(r => {
            if (!r.invoiceSentDate || !r.invoiceSharingTentativeDate) return false;
            return !isBefore(parseISO(r.invoiceSharingTentativeDate), parseISO(r.invoiceSentDate));
        }).length;

        const mailSentCount = sentRecords.filter(r =>
            r.invoiceSentMethodRemarks?.toLowerCase().includes('mail')
        ).length;

        const pendingCount = total - sentRecords.length;

        const today = startOfDay(new Date());
        const dueSites = records.filter(r => {
            if (!!r.invoiceSentDate || !r.invoiceSharingTentativeDate) return false;
            const tentativeDate = parseISO(r.invoiceSharingTentativeDate);
            return isBefore(tentativeDate, today) || isToday(tentativeDate);
        });

        return { total, onTimeCount, mailSentCount, pendingCount, dueSites, invoiceSentCount: sentRecords.length };
    }, [records]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" onClick={handleDownloadTemplate} disabled={isExporting}>
                        <FileSpreadsheet className="h-4 w-4 mr-1" />
                        Template
                    </Button>
                    <Button variant="outline" onClick={handleExport} disabled={isExporting}>
                        <Download className="h-4 w-4 mr-1" />
                        Export
                    </Button>
                    <div className="relative">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx"
                            onChange={handleFileUpload}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full"
                        />
                        <Button variant="outline">
                            <Upload className="h-4 w-4 mr-1" />
                            Import
                        </Button>
                    </div>
                </div>
                <Button onClick={() => navigate('/finance/attendance/add')}>
                    <Plus className="h-4 w-4 mr-1" />
                    New Entry
                </Button>
            </div>

            {/* Statistics Section */}
            {!isLoading && records.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <StatCard title="Sent On Time" value={stats.onTimeCount} icon={CheckCircle2} />
                    <StatCard title="Mail Sent" value={stats.mailSentCount} icon={Mail} />
                    <StatCard title="Pending" value={stats.pendingCount} icon={Clock} />
                    <StatCard title="Invoice Sent" value={stats.invoiceSentCount} icon={FileSpreadsheet} />
                    <StatCard title="Total Sites" value={stats.total} icon={Building} />
                </div>
            )}

            {/* Due Dates Alert Section */}
            {!isLoading && stats.dueSites.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-4">
                    <div className="bg-red-100 p-2 rounded-xl">
                        <AlertTriangle className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                        <h4 className="text-red-900 font-bold text-sm">Action Required: Pending Due Invoices</h4>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {stats.dueSites.map(site => (
                                <span key={site.id} className="bg-red-600 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-sm">
                                    {site.siteName} (Due: {format(parseISO(site.invoiceSharingTentativeDate), 'dd MMM')})
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Import Preview Section */}
            {previewData.length > 0 && (
                <div className="bg-white border border-blue-200 rounded-2xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                    <div className="p-5 border-b border-border bg-blue-50/50 flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-primary-text flex items-center gap-2">
                                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                                Preview Import ({previewData.length} Records)
                            </h3>
                            <p className="text-sm text-muted mt-1">Review the data before confirming the import.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button variant="secondary" onClick={() => setPreviewData([])}>
                                <X className="h-4 w-4 mr-1" /> Discard
                            </Button>
                            <Button onClick={handleConfirmImport} disabled={isImporting} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6">
                                {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Confirm & Import
                            </Button>
                        </div>
                    </div>
                    <div className="overflow-x-auto max-h-[400px]">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-gray-50 sticky top-0 border-b border-border z-10">
                                <tr>
                                    <th className="px-3 py-3 font-bold text-muted uppercase">#</th>
                                    <th className="px-3 py-3 font-bold text-muted uppercase">Site Name</th>
                                    <th className="px-3 py-3 font-bold text-muted uppercase">Company</th>
                                    <th className="px-3 py-3 font-bold text-muted uppercase">Billing Cycle</th>
                                    <th className="px-3 py-3 font-bold text-muted uppercase">Ops</th>
                                    <th className="px-3 py-3 font-bold text-muted uppercase">HR</th>
                                    <th className="px-3 py-3 font-bold text-muted uppercase">Invoice</th>
                                    <th className="px-3 py-3 font-bold text-muted uppercase">Mgr Tent.</th>
                                    <th className="px-3 py-3 font-bold text-muted uppercase">HR Tent.</th>
                                    <th className="px-3 py-3 font-bold text-muted uppercase">Inv. Tent.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {previewData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-3 py-2.5 text-muted">{idx + 1}</td>
                                        <td className="px-3 py-2.5 font-bold">{row.siteName}</td>
                                        <td className="px-3 py-2.5">{row.companyName}</td>
                                        <td className="px-3 py-2.5">{row.billingCycle}</td>
                                        <td className="px-3 py-2.5">{row.opsIncharge}</td>
                                        <td className="px-3 py-2.5">{row.hrIncharge}</td>
                                        <td className="px-3 py-2.5">{row.invoiceIncharge}</td>
                                        <td className="px-3 py-2.5">{row.managerTentativeDate || '-'}</td>
                                        <td className="px-3 py-2.5">{row.hrTentativeDate || '-'}</td>
                                        <td className="px-3 py-2.5">{row.invoiceSharingTentativeDate || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Main Data Table */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden premium-glass">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center p-20 space-y-4">
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        <p className="text-muted italic">Loading invoice tracker data...</p>
                    </div>
                ) : records.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 space-y-4 text-center">
                        <div className="bg-primary/10 p-4 rounded-full">
                            <ClipboardList className="h-12 w-12 text-primary" />
                        </div>
                        <h3 className="text-xl font-semibold text-primary-text">No records found</h3>
                        <p className="text-muted max-w-xs">Start tracking site invoices by adding your first entry or importing an Excel template.</p>
                        <div className="flex gap-3">
                            <Button onClick={() => navigate('/finance/attendance/add')} variant="secondary">
                                <Plus className="h-4 w-4 mr-2" /> Add Entry
                            </Button>
                            <Button variant="outline" onClick={handleDownloadTemplate}>
                                <FileSpreadsheet className="h-4 w-4 mr-2" /> Download Template
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px] text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b-2 border-border text-[10px] uppercase font-bold text-muted-foreground">
                                    <th className="px-3 py-3 border-r border-border w-10 text-center">S.No</th>
                                    <th className="px-3 py-3 border-r border-border">Site Name</th>
                                    <th className="px-3 py-3 border-r border-border">Ops Incharge</th>
                                    <th className="px-3 py-3 border-r border-border">HR Incharge</th>
                                    <th className="px-3 py-3 border-r border-border">Invoice Incharge</th>
                                    <th className="px-3 py-3 border-r border-border bg-yellow-50 text-center">Difference (Mgr)</th>
                                    <th className="px-3 py-3 border-r border-border bg-blue-50 text-center">Days Delayed (HR)</th>
                                    <th className="px-3 py-3 border-r border-border bg-green-50 text-center">Days Delayed (Invoice)</th>
                                    <th className="px-3 py-3 border-r border-border bg-green-50 text-center">Invoice Sent</th>
                                    <th className="px-3 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {records.map((record, idx) => {
                                    const managerDelay = calculateDelay(record.managerReceivedDate, record.managerTentativeDate);
                                    const hrDelay = calculateDelay(record.hrReceivedDate, record.hrTentativeDate);
                                    const invoiceDelay = calculateDelay(record.invoiceSentDate, record.invoiceSharingTentativeDate);

                                    return (
                                        <tr key={record.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="px-3 py-3 border-r border-border text-center font-bold text-muted">{idx + 1}</td>
                                            <td className="px-3 py-3 border-r border-border font-bold text-primary-text">{record.siteName}</td>
                                            <td className="px-3 py-3 border-r border-border text-xs font-medium">{record.opsIncharge || '-'}</td>
                                            <td className="px-3 py-3 border-r border-border text-xs font-medium">{record.hrIncharge || '-'}</td>
                                            <td className="px-3 py-3 border-r border-border text-xs font-medium">{record.invoiceIncharge || '-'}</td>
                                            <td className={`px-3 py-3 border-r border-border text-center ${getDelayColor(managerDelay)}`}>
                                                {managerDelay !== null ? `${managerDelay} day${Math.abs(managerDelay) !== 1 ? 's' : ''}` : '-'}
                                            </td>
                                            <td className={`px-3 py-3 border-r border-border text-center ${getDelayColor(hrDelay)}`}>
                                                {hrDelay !== null ? `${hrDelay} day${Math.abs(hrDelay) !== 1 ? 's' : ''}` : '-'}
                                            </td>
                                            <td className={`px-3 py-3 border-r border-border text-center ${getDelayColor(invoiceDelay)}`}>
                                                {invoiceDelay !== null ? `${invoiceDelay} day${Math.abs(invoiceDelay) !== 1 ? 's' : ''}` : '-'}
                                            </td>
                                            <td className="px-3 py-3 border-r border-border text-center">
                                                {record.invoiceSentDate ? (
                                                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                                        <CheckCircle2 className="h-3 w-3" /> Sent
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                                        <Clock className="h-3 w-3" /> Pending
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-right space-x-1">
                                                <button
                                                    onClick={() => navigate(`/finance/attendance/edit/${record.id}`)}
                                                    className="p-1.5 text-muted hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                                                >
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => handleDelete(record.id)} className="p-1.5 text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
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
