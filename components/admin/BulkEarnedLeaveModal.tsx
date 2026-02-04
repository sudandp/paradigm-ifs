import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { api } from '../../services/api';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Download, Upload, AlertCircle, CheckCircle2, Loader2, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';

interface BulkEarnedLeaveModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const BulkEarnedLeaveModal: React.FC<BulkEarnedLeaveModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    const downloadTemplate = async () => {
        setIsDownloading(true);
        try {
            const users = await api.getUsers(); // Get all users
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Earned Leaves');

            worksheet.columns = [
                { header: 'User ID', key: 'id', width: 40 },
                { header: 'Employee Name', key: 'name', width: 30 },
                { header: 'Earned Leave Balance', key: 'balance', width: 20 },
                { header: 'Opening Date (YYYY-MM-DD)', key: 'openingDate', width: 25 },
            ];

            // Add sample instructions or styling
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };

            users.forEach((u: any) => {
                worksheet.addRow({
                    id: u.id,
                    name: u.name,
                    balance: u.earnedLeaveOpeningBalance || 0,
                    openingDate: u.earnedLeaveOpeningDate || format(new Date(), 'yyyy-MM-dd')
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `Earned_Leaves_Update_Template_${format(new Date(), 'yyyyMMdd')}.xlsx`);
        } catch (err) {
            console.error('Download error:', err);
            setError('Failed to generate template.');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setError(null);
        setPreviewData([]);

        try {
            const workbook = new ExcelJS.Workbook();
            const arrayBuffer = await file.arrayBuffer();
            await workbook.xlsx.load(arrayBuffer);
            const worksheet = workbook.getWorksheet(1);
            
            const updates: any[] = [];
            worksheet?.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header

                const id = row.getCell(1).value?.toString();
                const name = row.getCell(2).value?.toString();
                const balance = parseFloat(row.getCell(3).value?.toString() || '0');
                const openingDate = row.getCell(4).value?.toString();

                if (id && !isNaN(balance)) {
                    updates.push({ 
                        id, 
                        name,
                        earned_leave_opening_balance: balance, 
                        earned_leave_opening_date: openingDate || format(new Date(), 'yyyy-MM-dd') 
                    });
                }
            });

            if (updates.length === 0) {
                setError('No valid rows found in the Excel file.');
            } else {
                setPreviewData(updates);
            }
        } catch (err) {
            console.error('Upload error:', err);
            setError('Failed to parse Excel file. Please ensure it is a valid .xlsx file.');
        } finally {
            setIsUploading(false);
            if (event.target) event.target.value = '';
        }
    };

    const handleImport = async () => {
        setIsUploading(true);
        try {
            const formattedUpdates = previewData.map(u => ({
                id: u.id,
                earned_leave_opening_balance: u.earned_leave_opening_balance,
                earned_leave_opening_date: u.earned_leave_opening_date
            }));

            await api.bulkUpdateUserLeaves(formattedUpdates);
            onSuccess();
            onClose();
        } catch (err) {
            console.error('Import error:', err);
            setError('Failed to update leave balances.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Bulk Update Earned Leaves"
            size="xl"
            hideFooter
        >
            <div className="space-y-6 p-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-dashed border-border rounded-xl p-6 text-center hover:border-emerald-500 transition-colors group">
                        <div className="bg-emerald-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-emerald-100 transition-colors">
                            <Download className="h-6 w-6 text-emerald-600" />
                        </div>
                        <h4 className="font-semibold text-primary-text mb-2">1. Download Template</h4>
                        <p className="text-xs text-muted mb-4">Get an Excel sheet pre-filled with current employee data.</p>
                        <Button 
                            variant="outline" 
                            className="w-full" 
                            onClick={downloadTemplate}
                            disabled={isDownloading}
                        >
                            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                            Download Excel
                        </Button>
                    </div>

                    <div className="border border-dashed border-border rounded-xl p-6 text-center hover:border-blue-500 transition-colors group">
                        <div className="bg-blue-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-100 transition-colors">
                            <Upload className="h-6 w-6 text-blue-600" />
                        </div>
                        <h4 className="font-semibold text-primary-text mb-2">2. Upload & Preview</h4>
                        <p className="text-xs text-muted mb-4">Select your modified Excel file to preview changes.</p>
                        <div className="relative">
                            <input
                                type="file"
                                accept=".xlsx"
                                onChange={handleFileUpload}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                disabled={isUploading}
                            />
                            <Button variant="outline" className="w-full pointer-events-none">
                                <Upload className="h-4 w-4 mr-2" />
                                Select File
                            </Button>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                        <p className="text-sm font-medium">{error}</p>
                    </div>
                )}

                {previewData.length > 0 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center justify-between border-b border-border pb-2">
                            <h5 className="font-bold text-sm uppercase tracking-wider text-muted">Preview Updates ({previewData.length} Employees)</h5>
                            <div className="flex items-center text-emerald-600 text-xs font-semibold">
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Ready to Import
                            </div>
                        </div>
                        
                        <div className="max-h-[300px] overflow-y-auto rounded-lg border border-border">
                            <table className="min-w-full text-sm">
                                <thead className="bg-muted/30 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-semibold">Employee</th>
                                        <th className="px-4 py-2 text-center font-semibold">New Balance</th>
                                        <th className="px-4 py-2 text-right font-semibold">Opening Date</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {previewData.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-muted/10 transition-colors">
                                            <td className="px-4 py-2 font-medium">{row.name}</td>
                                            <td className="px-4 py-2 text-center text-emerald-700 font-bold">{row.earned_leave_opening_balance}</td>
                                            <td className="px-4 py-2 text-right text-muted">{row.earned_leave_opening_date}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-border">
                            <Button variant="secondary" onClick={() => setPreviewData([])}>Cancel</Button>
                            <Button 
                                onClick={handleImport} 
                                disabled={isUploading}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]"
                            >
                                {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                                Confirm Import
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default BulkEarnedLeaveModal;
