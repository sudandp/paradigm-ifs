import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { api } from '../../services/api';
import type { SiteFinanceRecord, SiteInvoiceDefault } from '../../types';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { format, startOfMonth } from 'date-fns';
import { Loader2, Plus, Edit2, Trash2, IndianRupee, FileSpreadsheet, TrendingUp, TrendingDown, ClipboardCheck, Building2, Download, Upload } from 'lucide-react';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import StatCard from '../../components/ui/StatCard';

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

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [recordsData, defaultsData] = await Promise.all([
                api.getSiteFinanceRecords(billingMonth),
                api.getSiteInvoiceDefaults()
            ]);
            setRecords(recordsData);
            setSiteDefaults(defaultsData.sort((a, b) => a.siteName.localeCompare(b.siteName)));
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
            // First save the monthly records
            await api.bulkSaveSiteFinanceRecords(previewData);
            
            // Then sync the contract details to defaults for future use
            const defaultsToUpdate: Partial<SiteInvoiceDefault>[] = previewData
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

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
                    <Button 
                        variant="outline" 
                        onClick={handleDownloadTemplate}
                        disabled={isExporting}
                        className="h-10 px-4 rounded-xl text-xs font-bold border-gray-200 hover:bg-gray-50 flex-shrink-0"
                    >
                        {isExporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                        Template
                    </Button>
                    <Button 
                        variant="outline" 
                        onClick={() => fileInputRef.current?.click()}
                        className="h-10 px-4 rounded-xl text-xs font-bold border-gray-200 hover:bg-gray-50 flex-shrink-0"
                    >
                        <Upload className="h-4 w-4 mr-2" />
                        Import
                    </Button>
                    <Button 
                        variant="outline" 
                        onClick={handleExport}
                        disabled={isExporting}
                        className="h-10 px-4 rounded-xl text-xs font-bold border-gray-200 hover:bg-gray-50 flex-shrink-0"
                    >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept=".xlsx, .xls" 
                        className="hidden" 
                    />
                </div>

                <div className="flex items-center gap-3">
                    <input 
                        type="month" 
                        value={billingMonth.substring(0, 7)}
                        onChange={(e) => setBillingMonth(e.target.value + '-01')}
                        className="form-input w-44 h-11 !bg-white border-gray-200 rounded-xl focus:border-emerald-500"
                    />
                    <Button 
                        onClick={() => navigate('/finance/site-tracker/add')}
                        className="!bg-[#006B3F] hover:!bg-[#005632] h-11 px-6 rounded-xl shadow-lg shadow-emerald-900/10"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Record
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            {!isLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 flex items-center gap-5 shadow-sm">
                        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <IndianRupee className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Variation</p>
                            <h3 className="text-xl font-black text-gray-900 mt-0.5">{formatCurrency(totalBillingVariation)}</h3>
                        </div>
                    </div>
                    
                    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 flex items-center gap-5 shadow-sm">
                        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <TrendingUp className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Fee Variation</p>
                            <h3 className="text-xl font-black text-gray-900 mt-0.5">{formatCurrency(totalFeeVariation)}</h3>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 flex items-center gap-5 shadow-sm">
                        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <TrendingUp className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Profit Sites</p>
                            <h3 className="text-xl font-black text-gray-900 mt-0.5">{profitSitesCount}</h3>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 flex items-center gap-5 shadow-sm">
                        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <Building2 className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Records</p>
                            <h3 className="text-xl font-black text-gray-900 mt-0.5">{records.length}</h3>
                        </div>
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden min-h-[400px] flex flex-col">
                {isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                        <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading Records...</span>
                    </div>
                ) : records.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-6">
                        <div className="w-24 h-24 bg-gray-50 rounded-[2rem] flex items-center justify-center relative">
                            <ClipboardCheck className="h-10 w-10 text-gray-300" />
                        </div>
                        <div className="space-y-2">
                             <h2 className="text-2xl font-black text-gray-900 tracking-tight">No records found</h2>
                             <p className="text-gray-500 max-w-sm mx-auto font-medium">Start tracking site variations by adding your first record.</p>
                        </div>
                        <Button 
                            variant="secondary"
                            onClick={() => navigate('/finance/site-tracker/add')}
                            className="!bg-emerald-50 hover:!bg-emerald-100 !text-emerald-700 !border-transparent px-8 h-12 rounded-xl !font-bold"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Your First Record
                        </Button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="bg-gray-50/50 border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Site Name</th>
                                    <th className="px-6 py-4 text-xs font-black text-emerald-500 uppercase tracking-widest text-right">Contract (A)</th>
                                    <th className="px-6 py-4 text-xs font-black text-emerald-500 uppercase tracking-widest text-right">Fee (B)</th>
                                    <th className="px-6 py-4 text-xs font-black text-orange-500 uppercase tracking-widest text-right">Billed (C)</th>
                                    <th className="px-6 py-4 text-xs font-black text-orange-500 uppercase tracking-widest text-right">Fee (D)</th>
                                    <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest text-right">Net Variation</th>
                                    <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                                    <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {records.map(record => {
                                    const variations = ((record.billedAmount || 0) + (record.billedManagementFee || 0)) - ((record.contractAmount || 0) + (record.contractManagementFee || 0));
                                    const isProfit = variations >= 0;

                                    return (
                                        <tr key={record.id} className="hover:bg-gray-50/30 transition-colors group">
                                            <td className="px-6 py-5">
                                                <div className="font-bold text-gray-900">{record.siteName}</div>
                                                <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-0.5">{record.companyName || 'No Company'}</div>
                                            </td>
                                            <td className="px-6 py-5 text-right font-mono font-medium text-gray-500">{formatCurrency(record.contractAmount)}</td>
                                            <td className="px-6 py-5 text-right font-mono font-medium text-gray-500">{formatCurrency(record.contractManagementFee)}</td>
                                            <td className="px-6 py-5 text-right font-mono font-bold text-gray-900">{formatCurrency(record.billedAmount)}</td>
                                            <td className="px-6 py-5 text-right font-mono font-bold text-gray-900">{formatCurrency(record.billedManagementFee)}</td>
                                            <td className={`px-6 py-5 text-right font-mono font-black ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                {isProfit ? '+' : ''}{formatCurrency(variations)}
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                    isProfit ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                                }`}>
                                                    <div className={`w-1 h-1 rounded-full ${isProfit ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                    {isProfit ? 'Profit' : 'Loss'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <button 
                                                    onClick={() => navigate(`/finance/site-tracker/edit/${record.id}`)}
                                                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                                                >
                                                    <Edit2 className="h-4 w-4" />
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
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            {/* Import Preview Modal */}
            {previewData.length > 0 && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-black text-gray-900 leading-none">Import Preview</h2>
                                <p className="text-sm text-gray-500 mt-2 font-medium">Review {previewData.length} records before final import.</p>
                            </div>
                            <button onClick={() => setPreviewData([])} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <Plus className="h-6 w-6 rotate-45 text-gray-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-1">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="bg-gray-50/50 border-b border-gray-100 sticky top-0 bg-white z-10">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Site Name</th>
                                        <th className="px-6 py-4 text-xs font-black text-emerald-500 uppercase tracking-widest text-right">Contract</th>
                                        <th className="px-6 py-4 text-xs font-black text-emerald-500 uppercase tracking-widest text-right">Fee</th>
                                        <th className="px-6 py-4 text-xs font-black text-orange-500 uppercase tracking-widest text-right">Billed</th>
                                        <th className="px-6 py-4 text-xs font-black text-orange-500 uppercase tracking-widest text-right">Fee</th>
                                        <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest text-right">Net Var</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {previewData.map((record, idx) => {
                                        const totalContract = (record.contractAmount || 0) + (record.contractManagementFee || 0);
                                        const totalBilled = (record.billedAmount || 0) + (record.billedManagementFee || 0);
                                        const variations = totalBilled - totalContract;
                                        const isProfit = variations >= 0;

                                        return (
                                            <tr key={idx} className="hover:bg-gray-50/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-gray-900">{record.siteName}</div>
                                                    <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-0.5">{record.companyName}</div>
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono text-gray-500">{formatCurrency(record.contractAmount || 0)}</td>
                                                <td className="px-6 py-4 text-right font-mono text-gray-500">{formatCurrency(record.contractManagementFee || 0)}</td>
                                                <td className="px-6 py-4 text-right font-mono font-bold text-gray-900">{formatCurrency(record.billedAmount || 0)}</td>
                                                <td className="px-6 py-4 text-right font-mono font-bold text-gray-900">{formatCurrency(record.billedManagementFee || 0)}</td>
                                                <td className={`px-6 py-4 text-right font-mono font-black ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {isProfit ? '+' : ''}{formatCurrency(variations)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-8 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-4">
                            <Button variant="outline" onClick={() => setPreviewData([])} className="px-8 h-12 rounded-xl !font-bold">
                                Cancel
                            </Button>
                            <Button 
                                onClick={handleConfirmImport} 
                                isLoading={isImporting}
                                className="!bg-[#006B3F] hover:!bg-[#005632] px-10 h-12 rounded-xl shadow-lg shadow-emerald-900/10 shadow-lg !font-bold"
                            >
                                Confirm Import
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SiteFinanceTracker;
