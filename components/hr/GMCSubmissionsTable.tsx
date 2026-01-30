import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../services/api';
import type { GmcSubmission, Entity, OrganizationGroup } from '../../types';
import { Search, Filter, ChevronLeft, ChevronRight, FileText, Download, Building2, MapPin, User, Hash, Calendar as CalendarIcon, Heart, Info, X, ShieldCheck, ClipboardList } from 'lucide-react';
import Button from '../ui/Button';
import { format, differenceInYears } from 'date-fns';
import { exportGenericReportToExcel } from '../../utils/excelExport';
import html2pdf from 'html2pdf.js';

// Reusable PDF Template for individual GMC submission (Hidden from view)
const GMCSubmissionPdfTemplate: React.FC<{ sub: GmcSubmission }> = ({ sub }) => {
    const employeeAge = sub.dob ? differenceInYears(new Date(), new Date(sub.dob)) : 'N/A';
    
    return (
        <div id={`gmc-pdf-template-${sub.id}`} className="p-10 bg-white text-[#041b0f] font-sans" style={{ width: '210mm', minHeight: '297mm' }}>
            {/* Header */}
            <div className="flex justify-between items-center border-b-2 border-accent pb-6 mb-8">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter text-accent">GMC Enrollment Receipt</h1>
                    <p className="text-xs font-bold text-muted">PARADIGM SERVICES - SECURE SUBMISSION</p>
                </div>
                <div className="text-right">
                    <p className="text-xs font-bold text-muted uppercase">Submission ID</p>
                    <p className="font-mono text-sm leading-none">#{sub.id.substring(0, 8).toUpperCase()}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-10 mb-10">
                <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-accent/60 mb-2">Member Identity</h3>
                    <div>
                        <p className="text-[10px] font-bold text-muted uppercase">Full Name</p>
                        <p className="font-black text-xl">{sub.employeeName}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase">Date of Birth</p>
                            <p className="font-bold">{sub.dob}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase">Gender</p>
                            <p className="font-bold">{sub.gender}</p>
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-muted uppercase">Contact Number</p>
                        <p className="font-bold">{sub.contactNumber}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-accent/60 mb-2">Assignment Details</h3>
                    <div>
                        <p className="text-[10px] font-bold text-muted uppercase">Company/Org</p>
                        <p className="font-bold text-lg">{sub.companyName}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-muted uppercase">Primary Site</p>
                        <p className="font-bold text-lg">{sub.siteName}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-muted uppercase">Marital Status</p>
                        <p className="font-bold">{sub.maritalStatus}</p>
                    </div>
                </div>
            </div>

            {/* Plan Summary */}
            <div className="bg-accent/5 rounded-3xl p-8 border border-accent/10 mb-10 relative overflow-hidden">
                <div className="absolute right-[-20px] bottom-[-20px] opacity-[0.03] transform rotate-12">
                    <Heart size={200} fill="currentColor" />
                </div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-accent mb-6">Selected Insurance Plan</h3>
                <div className="grid grid-cols-3 gap-8">
                    <div>
                        <p className="text-[10px] font-bold text-muted uppercase mb-1">Coverage Tier</p>
                        <p className="text-2xl font-black text-accent">{sub.planName}</p>
                    </div>
                    <div className="border-l border-accent/20 pl-8">
                        <p className="text-[10px] font-bold text-muted uppercase mb-1">Verified Age</p>
                        <p className="text-2xl font-black">{employeeAge} Years</p>
                    </div>
                    <div className="border-l border-accent/20 pl-8">
                        <p className="text-[10px] font-bold text-muted uppercase mb-1">Monthly Premium</p>
                        <p className="text-2xl font-black">₹{sub.premiumAmount}</p>
                    </div>
                </div>
            </div>

            {/* Family Details if any */}
            {(sub.maritalStatus === 'Married' || (sub.children && sub.children.length > 0)) && (
                <div className="mb-10">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-accent/60 mb-4">Family Declarations</h3>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-muted/20">
                                <th className="text-left py-2 text-[10px] font-bold text-muted uppercase">Relation</th>
                                <th className="text-left py-2 text-[10px] font-bold text-muted uppercase">Name</th>
                                <th className="text-left py-2 text-[10px] font-bold text-muted uppercase">DOB</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-muted/10">
                            {sub.maritalStatus === 'Married' && sub.spouseName && (
                                <tr>
                                    <td className="py-3 font-bold text-accent">Spouse</td>
                                    <td className="py-3 font-medium">{sub.spouseName}</td>
                                    <td className="py-3">{sub.spouseContact || '—'}</td>
                                </tr>
                            )}
                            {sub.children?.map((child: any, idx: number) => (
                                <tr key={idx}>
                                    <td className="py-3 font-bold text-accent">Child {idx + 1}</td>
                                    <td className="py-3 font-medium">{child.name}</td>
                                    <td className="py-3">{child.dob} ({child.gender})</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Parental Details - New Fields */}
            {(sub.fatherName || sub.motherName) && (
                <div className="mb-10">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-accent/60 mb-4">Parental Declarations</h3>
                    <div className="grid grid-cols-2 gap-6">
                        {sub.fatherName && (
                            <div className="p-4 bg-gray-50 rounded-xl">
                                <p className="text-[10px] font-bold text-muted uppercase">Father's Name</p>
                                <p className="font-bold">{sub.fatherName}</p>
                                <p className="text-xs text-muted">DOB: {sub.fatherDob || '—'}</p>
                            </div>
                        )}
                        {sub.motherName && (
                            <div className="p-4 bg-gray-50 rounded-xl">
                                <p className="text-[10px] font-bold text-muted uppercase">Mother's Name</p>
                                <p className="font-bold">{sub.motherName}</p>
                                <p className="text-xs text-muted">DOB: {sub.motherDob || '—'}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Footer / Certification */}
            <div className="mt-auto pt-10 border-t border-muted/20 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/5 text-accent rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
                    <ShieldCheck size={14} /> Digitally Verified Enrollment
                </div>
                <p className="text-[10px] text-muted leading-relaxed max-w-lg mx-auto">
                    This document is a computer generated enrollment record and does not require a physical signature. Verified on {format(new Date(sub.updatedAt), 'dd MMMM yyyy')} at {format(new Date(sub.updatedAt), 'HH:mm:ss')}.
                </p>
            </div>
        </div>
    );
};

const GMCSubmissionsTable: React.FC = () => {
    const [submissions, setSubmissions] = useState<GmcSubmission[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [page, setPage] = useState(1);
    const [limit] = useState(10);
    
    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSite, setSelectedSite] = useState('');
    const [selectedCompany, setSelectedCompany] = useState('');
    const [selectedMaritalStatus, setSelectedMaritalStatus] = useState('');
    const [minAge, setMinAge] = useState<string>('');
    const [maxAge, setMaxAge] = useState<string>('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    
    // Data for filters
    const [sites, setSites] = useState<Entity[]>([]);
    const [companies, setCompanies] = useState<OrganizationGroup[]>([]);

    const fetchDropdownData = useCallback(async () => {
        try {
            const [sitesData, companiesData] = await Promise.all([
                api.getEntities(),
                api.getGroups()
            ]);
            setSites(sitesData);
            setCompanies(companiesData);
        } catch (error) {
            console.error('Failed to fetch filter data:', error);
        }
    }, []);

    const fetchSubmissions = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, total } = await api.getGmcSubmissions({
                name: searchTerm,
                site: selectedSite,
                company: selectedCompany,
                maritalStatus: selectedMaritalStatus,
                minAge: minAge ? parseInt(minAge) : undefined,
                maxAge: maxAge ? parseInt(maxAge) : undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                page,
                limit
            });
            setSubmissions(data);
            setTotal(total);
        } catch (error) {
            console.error('Failed to fetch GMC submissions:', error);
        } finally {
            setIsLoading(false);
        }
    }, [searchTerm, selectedSite, selectedCompany, selectedMaritalStatus, minAge, maxAge, startDate, endDate, page, limit]);

    useEffect(() => {
        fetchDropdownData();
    }, [fetchDropdownData]);

    useEffect(() => {
        fetchSubmissions();
    }, [fetchSubmissions]);

    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            const { data } = await api.getGmcSubmissions({
                name: searchTerm,
                site: selectedSite,
                company: selectedCompany,
                maritalStatus: selectedMaritalStatus,
                minAge: minAge ? parseInt(minAge) : undefined,
                maxAge: maxAge ? parseInt(maxAge) : undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                limit: -1 // Special flag for all records
            });

            const columns = [
                { header: 'Employee Name', key: 'employeeName', width: 25 },
                { header: 'DOB', key: 'dob', width: 15 },
                { header: 'Gender', key: 'gender', width: 10 },
                { header: 'Contact', key: 'contactNumber', width: 15 },
                { header: 'Marital Status', key: 'maritalStatus', width: 15 },
                { header: 'Company', key: 'companyName', width: 20 },
                { header: 'Site', key: 'siteName', width: 20 },
                { header: 'Plan Name', key: 'planName', width: 15 },
                { header: 'Premium', key: 'premiumAmount', width: 10 },
                { header: 'Father Name', key: 'fatherName', width: 20 },
                { header: 'Mother Name', key: 'motherName', width: 20 },
                { header: 'Spouse Name', key: 'spouseName', width: 20 },
                { header: 'Submission Date', key: 'createdAtFormatted', width: 20 },
            ];

            const exportData = data.map(sub => ({
                ...sub,
                createdAtFormatted: format(new Date(sub.updatedAt), 'MMM dd, yyyy HH:mm')
            }));

            await exportGenericReportToExcel(
                exportData,
                columns,
                'GMC Form Submissions Report',
                { 
                    startDate: startDate ? new Date(startDate) : new Date(0), 
                    endDate: endDate ? new Date(endDate) : new Date() 
                },
                'GMC_Report',
                undefined, // logo will be handled by the utility if configured
                'HR/Admin System'
            );
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const handleDownloadPdf = (sub: GmcSubmission) => {
        const element = document.getElementById(`gmc-pdf-template-${sub.id}`);
        if (!element) return;

        const opt = {
            margin: 0,
            filename: `GMC_Record_${sub.employeeName}_${sub.id.substring(0, 8)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        (html2pdf() as any).set(opt).from(element).save();
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="space-y-6">
            {/* Template Container (Hidden) */}
            <div className="hidden">
                {submissions.map(sub => (
                    <GMCSubmissionPdfTemplate key={sub.id} sub={sub} />
                ))}
            </div>

            {/* Header with Export */}
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-primary-text flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-accent" />
                    GMC Submissions
                </h3>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}>
                        {showAdvancedFilters ? <X className="h-4 w-4 mr-1" /> : <Filter className="h-4 w-4 mr-1" />}
                        {showAdvancedFilters ? 'Hide Filters' : 'More Filters'}
                    </Button>
                    <Button onClick={handleExportExcel} isLoading={isExporting} size="sm">
                        <Download className="h-4 w-4 mr-1" /> Download Excel
                    </Button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="space-y-4">
                <div className="flex flex-col lg:flex-row gap-4 items-center bg-white p-4 rounded-2xl border border-border shadow-sm">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                        <input
                            type="text"
                            placeholder="Search by name..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setPage(1);
                            }}
                            className="form-input !pl-10 w-full"
                        />
                    </div>
                    
                    <div className="flex flex-wrap gap-4 w-full lg:w-auto">
                        <div className="relative flex-1 min-w-[200px]">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                            <select
                                value={selectedCompany}
                                onChange={(e) => {
                                    setSelectedCompany(e.target.value);
                                    setPage(1);
                                }}
                                className="form-input !pl-10 w-full"
                            >
                                <option value="">All Companies</option>
                                {companies.map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="relative flex-1 min-w-[200px]">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                            <select
                                value={selectedSite}
                                onChange={(e) => {
                                    setSelectedSite(e.target.value);
                                    setPage(1);
                                }}
                                className="form-input !pl-10 w-full"
                            >
                                <option value="">All Sites</option>
                                {sites.map(s => (
                                    <option key={s.id} value={s.name}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Advanced Filters */}
                {showAdvancedFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-50/50 p-6 rounded-2xl border border-border border-dashed shadow-inner animate-in slide-in-from-top-2 duration-200">
                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-widest font-black text-muted flex items-center gap-1.5">
                                <Heart className="h-3 w-3" /> Marital Status
                            </label>
                            <select
                                value={selectedMaritalStatus}
                                onChange={(e) => {
                                    setSelectedMaritalStatus(e.target.value);
                                    setPage(1);
                                }}
                                className="form-input w-full"
                            >
                                <option value="">All Statuses</option>
                                <option value="Single">Single</option>
                                <option value="Married">Married</option>
                                <option value="Divorced">Divorced</option>
                                <option value="Widowed">Widowed</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-widest font-black text-muted flex items-center gap-1.5">
                                <User className="h-3 w-3" /> Age Range
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    placeholder="Min"
                                    value={minAge}
                                    onChange={(e) => {
                                        setMinAge(e.target.value);
                                        setPage(1);
                                    }}
                                    className="form-input w-full"
                                />
                                <span className="text-muted">–</span>
                                <input
                                    type="number"
                                    placeholder="Max"
                                    value={maxAge}
                                    onChange={(e) => {
                                        setMaxAge(e.target.value);
                                        setPage(1);
                                    }}
                                    className="form-input w-full"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-widest font-black text-muted flex items-center gap-1.5">
                                <CalendarIcon className="h-3 w-3" /> Submitted From
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    setPage(1);
                                }}
                                className="form-input w-full"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-widest font-black text-muted flex items-center gap-1.5">
                                <CalendarIcon className="h-3 w-3" /> Submitted To
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => {
                                    setEndDate(e.target.value);
                                    setPage(1);
                                }}
                                className="form-input w-full"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-page">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-bold text-muted uppercase tracking-wider">Employee</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-muted uppercase tracking-wider">Company</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-muted uppercase tracking-wider">Site</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-muted uppercase tracking-wider">Insurance Plan</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-muted uppercase tracking-wider">Submission Date</th>
                            <th className="px-6 py-4 text-right text-xs font-bold text-muted uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {isLoading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-muted">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
                                        <span>Loading submissions...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : submissions.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-muted italic">
                                    No GMC submissions found matching your criteria.
                                </td>
                            </tr>
                        ) : (
                            submissions.map((sub) => (
                                <tr key={sub.id} className="hover:bg-page/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-accent-light flex items-center justify-center text-accent font-black text-lg">
                                                {sub.employeeName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-black text-primary-text leading-tight">{sub.employeeName}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <p className="text-sm font-bold text-primary-text">{sub.companyName}</p>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <p className="text-sm font-bold text-primary-text">{sub.siteName}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-100">
                                            {sub.planName}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-bold text-muted">{format(new Date(sub.updatedAt), 'MMM dd, yyyy')}</p>
                                        <p className="text-[10px] text-muted tracking-tight font-medium uppercase mt-0.5">{format(new Date(sub.updatedAt), 'hh:mm a')}</p>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Button 
                                            variant="secondary" 
                                            size="sm" 
                                            className="!rounded-xl group shadow-none"
                                            onClick={() => handleDownloadPdf(sub)}
                                        >
                                            <Download className="h-4 w-4 mr-2 text-accent group-hover:scale-110 transition-transform" />
                                            <span className="font-bold">PDF</span>
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-border shadow-sm">
                <p className="text-xs text-muted font-bold uppercase tracking-widest">
                    Showing <span className="text-primary-text">{submissions.length > 0 ? (page - 1) * limit + 1 : 0}</span> to <span className="text-primary-text">{Math.min(page * limit, total)}</span> of <span className="text-primary-text">{total}</span> entries
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1 || isLoading}
                        className="!p-2 shadow-none !rounded-xl"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-1">
                        {[...Array(totalPages)].map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setPage(i + 1)}
                                className={`h-9 w-9 rounded-xl text-sm font-black transition-all ${
                                    page === i + 1
                                        ? 'bg-accent text-white shadow-lg shadow-accent/20'
                                        : 'text-muted hover:bg-page hover:text-primary-text'
                                }`}
                                disabled={isLoading}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages || isLoading}
                        className="!p-2 shadow-none !rounded-xl"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default GMCSubmissionsTable;
