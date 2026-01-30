
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { format, differenceInYears } from 'date-fns';
import { 
    ArrowLeft, Image as ImageIcon, User, Building2, MapPin, 
    Calendar, Users, Phone, Heart, Plus, Trash2, CheckCircle2,
    Download, Printer, FileText, ChevronRight, ShieldCheck
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Checkbox from '../../components/ui/Checkbox';
import Logo from '../../components/ui/Logo';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { api } from '../../services/api';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import html2pdf from 'html2pdf.js';

const GMC_RATES = [
    { minAge: 0, maxAge: 17, rate: 120 },
    { minAge: 18, maxAge: 35, rate: 200 },
    { minAge: 36, maxAge: 45, rate: 225 },
    { minAge: 46, maxAge: 55, rate: 345 },
    { minAge: 56, maxAge: 60, rate: 560 },
    { minAge: 61, maxAge: 65, rate: 730 },
];

const validationSchema = yup.object({
    employeeName: yup.string().required('Employee name is required'),
    employeeId: yup.string().optional(),
    dateOfJoining: yup.string().required('Date of joining is required'),
    designation: yup.string().required('Designation is required'),
    companyName: yup.string().required('Company name is required'),
    siteName: yup.string().required('Site name is required'),
    dob: yup.string().required('Date of birth is required'),
    gender: yup.string().oneOf(['Male', 'Female', 'Other']).required('Gender is required'),
    contactNumber: yup.string().required('Contact number is required').matches(/^[0-9]{10}$/, 'Must be a 10-digit number'),
    maritalStatus: yup.string().oneOf(['Single', 'Married', 'Divorced', 'Widowed']).required('Marital status is required'),
    spouseName: yup.string().when('maritalStatus', {
        is: 'Married',
        then: schema => schema.required('Spouse name is required'),
        otherwise: schema => schema.optional()
    }),
    spouseDob: yup.string().when('maritalStatus', {
        is: 'Married',
        then: schema => schema.required('Spouse DOB is required'),
        otherwise: schema => schema.optional()
    }),
    spouseGender: yup.string().when('maritalStatus', {
        is: 'Married',
        then: schema => schema.oneOf(['Male', 'Female']).required('Spouse gender is required'),
        otherwise: schema => schema.optional()
    }),
    spouseContact: yup.string().when('maritalStatus', {
        is: 'Married',
        then: schema => schema.required('Spouse contact is required').matches(/^[0-9]{10}$/, 'Must be a 10-digit number'),
        otherwise: schema => schema.optional()
    }),
    fatherName: yup.string().when('maritalStatus', {
        is: 'Single',
        then: schema => schema.required('Father\'s name is required'),
        otherwise: schema => schema.optional()
    }),
    fatherDob: yup.string().when('maritalStatus', {
        is: 'Single',
        then: schema => schema.required('Father\'s DOB is required'),
        otherwise: schema => schema.optional()
    }),
    fatherGender: yup.string().when('maritalStatus', {
        is: 'Single',
        then: schema => schema.oneOf(['Male', 'Female']).required('Father\'s gender is required'),
        otherwise: schema => schema.optional()
    }),
    motherName: yup.string().when('maritalStatus', {
        is: 'Single',
        then: schema => schema.required('Mother\'s name is required'),
        otherwise: schema => schema.optional()
    }),
    motherDob: yup.string().when('maritalStatus', {
        is: 'Single',
        then: schema => schema.required('Mother\'s DOB is required'),
        otherwise: schema => schema.optional()
    }),
    motherGender: yup.string().when('maritalStatus', {
        is: 'Single',
        then: schema => schema.oneOf(['Male', 'Female']).required('Mother\'s gender is required'),
        otherwise: schema => schema.optional()
    }),
    children: yup.array().of(
        yup.object({
            name: yup.string().required('Child name is required'),
            dob: yup.string().required('Child DOB is required'),
            gender: yup.string().oneOf(['Male', 'Female', 'Other']).required('Child gender is required'),
        })
    ).max(2, 'Only 2 children allowed').optional(),
    acknowledged: yup.boolean().oneOf([true], 'You must acknowledge the plan to continue').required()
});

type GMCFormData = yup.InferType<typeof validationSchema>;

const GMCForm: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [submissionData, setSubmissionData] = useState<any>(null);
    const [sites, setSites] = useState<any[]>([]);
    const [companies, setCompanies] = useState<any[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const isMobile = useMediaQuery('(max-width: 768px)');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [entitiesData, groupsData] = await Promise.all([
                    api.getEntities(),
                    api.getGroups()
                ]);
                setSites(entitiesData);
                setCompanies(groupsData);
            } catch (error) {
                console.error('Failed to fetch sites/companies:', error);
            } finally {
                setIsLoadingData(false);
            }
        };
        fetchData();
    }, []);

    const { register, control, handleSubmit, watch, trigger, setValue, formState: { errors } } = useForm<GMCFormData>({
        resolver: yupResolver(validationSchema) as any,
        defaultValues: {
            maritalStatus: 'Single',
            children: [],
            acknowledged: false,
            fatherGender: 'Male',
            motherGender: 'Female'
        }
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: 'children'
    });

    const watchDob = watch('dob');
    const watchGender = watch('gender');
    const watchMaritalStatus = watch('maritalStatus');
    const watchChildren = watch('children');

    useEffect(() => {
        if (watchMaritalStatus === 'Married' && watchGender) {
            if (watchGender === 'Male') {
                setValue('spouseGender', 'Female');
            } else if (watchGender === 'Female') {
                setValue('spouseGender', 'Male');
            }
        }
    }, [watchGender, watchMaritalStatus, setValue]);

    const employeeAge = useMemo(() => {
        if (!watchDob) return null;
        return differenceInYears(new Date(), new Date(watchDob));
    }, [watchDob]);

    const insurancePlan = useMemo(() => {
        if (employeeAge === null) return null;
        const tier = GMC_RATES.find(r => employeeAge >= r.minAge && employeeAge <= r.maxAge);
        return tier || null;
    }, [employeeAge]);

    const handleNextStep = async () => {
        let fieldsToValidate: any[] = [];
        if (step === 1) {
            fieldsToValidate = ['employeeName', 'employeeId', 'dateOfJoining', 'designation', 'companyName', 'siteName', 'dob', 'gender', 'contactNumber'];
        } else if (step === 2) {
            fieldsToValidate = ['maritalStatus'];
            if (watchMaritalStatus === 'Single') {
                fieldsToValidate.push('fatherName', 'fatherDob', 'fatherGender', 'motherName', 'motherDob', 'motherGender');
            }
            if (watchMaritalStatus === 'Married') {
                fieldsToValidate.push('spouseName', 'spouseDob', 'spouseGender', 'spouseContact');
            }
            if (watchChildren && watchChildren.length > 0) {
                watchChildren.forEach((_, index) => {
                    fieldsToValidate.push(`children.${index}.name`, `children.${index}.dob`, `children.${index}.gender`);
                });
            }
        }

        const isValid = await trigger(fieldsToValidate as any);
        if (isValid) {
            setStep(step + 1);
        }
    };

    const onSubmit = async (data: GMCFormData) => {
        setIsSubmitting(true);
        try {
            // Helper to convert empty strings to null to avoid DB errors (e.g. invalid date format)
            const sanitizeData = (obj: any): any => {
                if (obj === null || typeof obj !== 'object') return obj;
                if (Array.isArray(obj)) return obj.map(sanitizeData);
                
                const sanitized: any = {};
                for (const [key, value] of Object.entries(obj)) {
                    sanitized[key] = value === '' ? null : sanitizeData(value);
                }
                return sanitized;
            };

            const finalData = {
                ...sanitizeData(data),
                employeeId: data.employeeId || `TEMP_${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
                plan_name: insurancePlan ? `${insurancePlan.minAge}-${insurancePlan.maxAge} Tier` : 'N/A',
                premium_amount: insurancePlan ? insurancePlan.rate : 0
            };
            
            await api.submitGmcPublicForm(finalData);
            setSubmissionData(finalData);
            setIsSuccess(true);
        } catch (error) {
            console.error('Failed to submit GMC form', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const downloadPdf = () => {
        const element = document.getElementById('gmc-preview-content');
        if (!element) return;

        const opt = {
            margin: 10,
            filename: `GMC_Form_${submissionData?.employeeName}_${format(new Date(), 'yyyyMMdd')}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        (html2pdf() as any).set(opt).from(element).save();
    };

    if (isSuccess) {
        return (
            <div className={`min-h-screen flex flex-col transition-colors duration-500 ${isMobile ? 'bg-[#041b0f]' : 'bg-white'}`}>
                <div className={`w-full flex-grow flex flex-col animate-fade-in ${isMobile ? '!bg-[#041b0f]' : 'bg-white'}`}>
                    <div className={`border-b border-border ${isMobile ? '!bg-transparent !border-white/10' : 'bg-white'}`}>
                        <div className="w-full p-8 text-center">
                            <div className="flex justify-center mb-6">
                                <div className="p-4 bg-accent-light rounded-full ring-8 ring-accent-light/50">
                                    <CheckCircle2 className="h-16 w-16 text-accent" />
                                </div>
                            </div>
                            <h1 className={`text-3xl font-bold mb-4 ${isMobile ? 'text-white' : 'text-primary-text'}`}>Submission Successful!</h1>
                            <p className={`${isMobile ? 'text-gray-400' : 'text-muted'} mb-0`}>
                                Thank you for submitting your GMC enrollment form. We have recorded your details and insurance plan choice.
                            </p>
                        </div>
                    </div>

                    <div className="w-full p-8 space-y-6">
                        <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-2xl mx-auto">
                            <Button
                                onClick={downloadPdf}
                                className="flex-1 sm:flex-initial sm:px-10 flex items-center justify-center gap-3 h-14 !rounded-2xl !text-base shadow-lg shadow-accent/20"
                            >
                                <Download className="h-5 w-5" />
                                Download PDF Receipt
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => navigate('/auth/login')}
                                className="flex-1 sm:flex-initial sm:px-10 flex items-center justify-center gap-3 h-14 !rounded-2xl !text-base"
                            >
                                <ArrowLeft className="h-5 w-5" />
                                Back to Login
                            </Button>
                        </div>
                    </div>

                    {/* Hidden PDF content moved off-screen for capture */}
                    <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
                        <div id="gmc-preview-content" className="p-12 text-left bg-white text-black" style={{ width: '210mm', minHeight: '297mm' }}>
                            <div className="flex justify-between items-start mb-10 border-b-4 border-accent pb-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-accent rounded-xl">
                                        <Logo className="h-12 text-white invert" />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl font-black uppercase tracking-tight">Paradigm Services</h1>
                                        <p className="text-[10px] text-accent font-bold uppercase tracking-[0.3em]">Corporate Health Services</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <h2 className="text-xl font-bold text-gray-900 mb-1">GMC ENROLLMENT RECORD</h2>
                                    <p className="text-sm font-semibold text-gray-500">Date: {format(new Date(), 'dd MMM yyyy')}</p>
                                    <p className="text-xs text-gray-400 font-mono">REF: GMC-{Math.random().toString(36).substring(7).toUpperCase()}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-12 mb-10">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                        <User className="h-4 w-4 text-accent" />
                                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Employee Profile</h3>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Full Name</span><span className="text-sm font-bold text-gray-800">{submissionData?.employeeName}</span></div>
                                        <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Employee ID</span><span className="text-sm font-bold text-gray-800">{submissionData?.employeeId}</span></div>
                                        <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Designation</span><span className="text-sm font-bold text-gray-800">{submissionData?.designation}</span></div>
                                        <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Joining Date</span><span className="text-sm font-bold text-gray-800">{submissionData?.dateOfJoining}</span></div>
                                        <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Company</span><span className="text-sm font-bold text-gray-800">{submissionData?.companyName}</span></div>
                                        <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Work Site</span><span className="text-sm font-bold text-gray-800">{submissionData?.siteName}</span></div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                        <Users className="h-4 w-4 text-accent" />
                                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Family Structure</h3>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Marital Status</span><span className="text-sm font-bold text-gray-800">{submissionData?.maritalStatus}</span></div>
                                        
                                        {submissionData?.maritalStatus === 'Single' && (
                                            <>
                                                <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Father</span><span className="text-sm font-bold text-gray-800">{submissionData?.fatherName} ({submissionData?.fatherGender})</span></div>
                                                <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Mother</span><span className="text-sm font-bold text-gray-800">{submissionData?.motherName} ({submissionData?.motherGender})</span></div>
                                            </>
                                        )}
                                        
                                        {submissionData?.maritalStatus === 'Married' && (
                                            <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Spouse</span><span className="text-sm font-bold text-gray-800">{submissionData?.spouseName} ({submissionData?.spouseGender})</span></div>
                                        )}
                                        <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">No. of Children</span><span className="text-sm font-bold text-gray-800">{submissionData?.children?.length || 0}</span></div>
                                    </div>
                                </div>
                            </div>

                            {submissionData?.children && submissionData.children.length > 0 && (
                                <div className="mb-10">
                                    <div className="flex items-center gap-2 border-b border-gray-100 pb-2 mb-4">
                                        <Users className="h-4 w-4 text-accent" />
                                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Children Details</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        {submissionData.children.map((child: any, idx: number) => (
                                            <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                                <p className="text-xs font-bold text-gray-800 mb-1">{child.name}</p>
                                                <p className="text-[10px] text-gray-500">{child.gender} • DOB: {child.dob}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="p-8 bg-accent/5 rounded-2xl border-2 border-accent/10 mb-12 relative overflow-hidden">
                                <ShieldCheck className="absolute -right-6 -bottom-6 h-32 w-32 text-accent/10 transform -rotate-12" />
                                <div className="relative z-10 flex justify-between items-center">
                                    <div>
                                        <h3 className="text-[10px] font-black text-accent uppercase tracking-[0.2em] mb-2">Approved Insurance Policy</h3>
                                        <p className="text-2xl font-black text-gray-900">{submissionData?.plan_name}</p>
                                        <p className="text-xs text-gray-500 mt-1 font-medium">Group Medical Cover • Age Based Tier</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Monthly Premium</p>
                                        <p className="text-4xl font-black text-accent">₹{submissionData?.premium_amount}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-24 pt-16 border-t border-dashed border-gray-200">
                                <div className="text-center">
                                    <div className="h-16 flex items-end justify-center border-b border-gray-300 mb-3 italic text-gray-400 text-sm">
                                        Signed Electronically
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-900">Employee Signature</p>
                                    <p className="text-[9px] text-gray-400 font-medium mt-1">{submissionData?.employeeName}</p>
                                </div>
                                <div className="text-center">
                                    <div className="h-16 flex items-end justify-center border-b border-gray-300 mb-3">
                                        <div className="p-2 border border-accent/20 rounded-md bg-accent/5 rotate-[-2deg]">
                                            <Logo className="h-6 opacity-40 invert grayscale" />
                                        </div>
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-900">Authorized Signatory</p>
                                    <p className="text-[9px] text-gray-400 font-medium mt-1">Paradigm Services HR</p>
                                </div>
                            </div>

                            <div className="mt-20 text-center">
                                <p className="text-[8px] text-gray-300 uppercase tracking-[0.5em]">System Generated Receipt • No physical signature required</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className={`min-h-screen flex flex-col transition-colors duration-500 ${isMobile ? 'bg-[#041b0f]' : 'bg-white'}`}>
            <div className={`w-full flex-grow flex flex-col animate-fade-in ${isMobile ? '!bg-[#041b0f]' : 'bg-white'}`}>
                <header className={`border-b border-border bg-white relative ${isMobile ? '!bg-transparent !border-white/10' : ''}`}>
                    <div className="w-full p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        {/* Navigation on the left */}
                        <div className="flex items-center justify-between md:justify-start w-full md:w-auto">
                            <Button 
                                variant="secondary"
                                size="sm"
                                onClick={() => step === 1 ? navigate('/public/forms') : setStep(step - 1)}
                                className={`!rounded-xl ${isMobile ? '!bg-white/10 !border-white/20 !text-white' : ''}`}
                            >
                                <ArrowLeft className="h-5 w-5 mr-1" />
                                {step === 1 ? 'Exit' : 'Prev'}
                            </Button>

                            {/* Mobile-only centered logo placeholder to maintain spacing if needed, but we'll use absolute centering */}
                            <div className="md:hidden invisible">
                                <Button size="sm" variant="secondary" className="opacity-0 pointer-events-none">Exit</Button>
                            </div>
                        </div>

                        {/* Absolutely centered logo */}
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 mt-[-12px] md:mt-0">
                            <Logo className="h-8 md:h-10" />
                        </div>
                        
                        {/* Stepper on the right */}
                        <div className="flex items-center justify-center md:justify-end gap-2 overflow-x-auto no-scrollbar scroll-smooth w-full md:w-auto">
                            {[1, 2, 3].map((s) => (
                                <React.Fragment key={s}>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                            step === s 
                                                ? 'bg-accent text-white shadow-lg ring-4 ring-accent-light' 
                                                : step > s 
                                                    ? 'bg-accent text-white' 
                                                    : 'bg-page text-muted border border-border'
                                        }`}>
                                            {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
                                        </div>
                                        <span className={`text-xs font-bold whitespace-nowrap ${step === s ? 'text-primary-text' : 'text-muted'}`}>
                                            {s === 1 ? 'Identity' : s === 2 ? 'Family' : 'Review'}
                                        </span>
                                    </div>
                                    {s < 3 && <ChevronRight className="h-4 w-4 text-border" />}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </header>

                <div className="flex-grow">
                    <div className="w-full p-6 md:p-10">
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-12">
                        {step === 1 && (
                            <div className="space-y-8 animate-fade-in">
                                <div>
                                    <h2 className={`text-2xl font-bold mb-2 ${isMobile ? 'text-white' : 'text-primary-text'}`}>Identity Details</h2>
                                    <p className={`${isMobile ? 'text-gray-400' : 'text-muted'} text-sm`}>Please provide your official employment and personal information.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                    <Input
                                        label="Full Name of Employee"
                                        placeholder="As per salary documents"
                                        registration={register('employeeName')}
                                        error={errors.employeeName?.message}
                                        className={isMobile ? 'public-form-input' : ''}
                                        labelClassName={isMobile ? 'public-form-label' : ''}
                                    />
                                    <Input
                                        label="Employee ID"
                                        placeholder="Refer Payslip (Leave blank for temp ID)"
                                        registration={register('employeeId')}
                                        error={errors.employeeId?.message}
                                        className={isMobile ? 'public-form-input' : ''}
                                        labelClassName={isMobile ? 'public-form-label' : ''}
                                    />
                                    <Input
                                        type="date"
                                        label="Date of Joining"
                                        registration={register('dateOfJoining')}
                                        error={errors.dateOfJoining?.message}
                                        className={isMobile ? 'public-form-input' : ''}
                                        labelClassName={isMobile ? 'public-form-label' : ''}
                                    />
                                    <Input
                                        label="Employee Designation"
                                        placeholder="As per pay slip"
                                        registration={register('designation')}
                                        error={errors.designation?.message}
                                        className={isMobile ? 'public-form-input' : ''}
                                        labelClassName={isMobile ? 'public-form-label' : ''}
                                    />
                                     <Select
                                         label="Company/Organization"
                                         registration={register('companyName')}
                                         error={errors.companyName?.message}
                                         className={isMobile ? 'public-form-input' : ''}
                                         labelClassName={isMobile ? 'public-form-label !mb-2' : ''}
                                     >
                                         <option value="">Select company</option>
                                         {companies.map(c => (
                                             <option key={c.id} value={c.name}>{c.name}</option>
                                         ))}
                                     </Select>
                                     <Select
                                         label="Current Site/Project"
                                         registration={register('siteName')}
                                         error={errors.siteName?.message}
                                         className={isMobile ? 'public-form-input' : ''}
                                         labelClassName={isMobile ? 'public-form-label !mb-2' : ''}
                                     >
                                         <option value="">Select site</option>
                                         {sites.map(s => (
                                             <option key={s.id} value={s.name}>{s.name}</option>
                                         ))}
                                     </Select>
                                    <div className="space-y-2">
                                        <label className={`text-sm font-semibold block mb-2 ${isMobile ? 'text-white/60 text-[10px] uppercase tracking-widest' : 'text-primary-text'}`}>Gender</label>
                                        <Controller
                                            name="gender"
                                            control={control}
                                            render={({ field }) => (
                                                <div className={`flex gap-2 p-1 border rounded-xl ${isMobile ? 'bg-white/5 border-white/10' : 'bg-page border-border'}`}>
                                                    {['Male', 'Female', 'Other'].map(option => (
                                                        <button
                                                            key={option}
                                                            type="button"
                                                            onClick={() => field.onChange(option)}
                                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all ${
                                                                field.value === option
                                                                    ? (isMobile ? 'bg-accent text-white shadow-lg' : 'bg-white text-accent shadow-sm')
                                                                    : (isMobile ? 'text-gray-500 hover:text-white' : 'text-muted hover:text-primary-text')
                                                            }`}
                                                        >
                                                            {option}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        />
                                        {errors.gender && <p className="text-xs text-red-500 mt-1">{errors.gender.message}</p>}
                                    </div>
                                    <Input
                                        type="date"
                                        label="Date of Birth"
                                        registration={register('dob')}
                                        error={errors.dob?.message}
                                        className={isMobile ? 'public-form-input' : ''}
                                        labelClassName={isMobile ? 'public-form-label' : ''}
                                    />
                                    <Input
                                        label="Contact Number"
                                        placeholder="10 digit mobile"
                                        registration={register('contactNumber')}
                                        error={errors.contactNumber?.message}
                                        maxLength={10}
                                        className={isMobile ? 'public-form-input' : ''}
                                        labelClassName={isMobile ? 'public-form-label' : ''}
                                    />
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-8 animate-fade-in">
                                <div>
                                    <h2 className={`text-2xl font-bold mb-2 ${isMobile ? 'text-white' : 'text-primary-text'}`}>Family & Marital Structure</h2>
                                    <p className={`${isMobile ? 'text-gray-400' : 'text-muted'} text-sm`}>Update your marital status and declare eligible family members.</p>
                                </div>

                                <div className="space-y-8">
                                    <div className="space-y-3">
                                        <label className={`text-sm font-semibold ${isMobile ? 'text-white/60 text-[10px] uppercase tracking-widest' : 'text-primary-text'}`}>What is your current Marital Status?</label>
                                        <Controller
                                            name="maritalStatus"
                                            control={control}
                                            render={({ field }) => (
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    {['Single', 'Married', 'Divorced', 'Widowed'].map(option => (
                                                        <button
                                                            key={option}
                                                            type="button"
                                                            onClick={() => field.onChange(option)}
                                                            className={`py-3 px-4 rounded-xl border-2 text-sm font-bold transition-all ${
                                                                field.value === option
                                                                    ? (isMobile ? 'bg-accent/20 border-accent text-white' : 'bg-accent-light border-accent text-accent')
                                                                    : (isMobile ? 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20' : 'bg-white border-border text-muted hover:border-gray-300')
                                                            }`}
                                                        >
                                                            {option}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        />
                                    </div>

                                    {watchMaritalStatus === 'Single' && (
                                        <div className="space-y-8 animate-slide-up">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Users className="h-5 w-5 text-accent" />
                                                <h3 className={`font-bold ${isMobile ? 'text-white' : 'text-primary-text'}`}>Parental Information</h3>
                                            </div>
                                            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-2xl border ${isMobile ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-border'}`}>
                                                <div className="space-y-6">
                                                    <h4 className={`text-xs font-black uppercase tracking-widest ${isMobile ? 'text-accent' : 'text-accent'}`}>Father Details</h4>
                                                    <Input
                                                        label="Father's Full Name"
                                                        placeholder="As per documents"
                                                        registration={register('fatherName')}
                                                        error={errors.fatherName?.message}
                                                        className={isMobile ? 'public-form-input' : ''}
                                                        labelClassName={isMobile ? 'public-form-label' : ''}
                                                    />
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <Input
                                                            type="date"
                                                            label="Father's DOB"
                                                            registration={register('fatherDob')}
                                                            error={errors.fatherDob?.message}
                                                            className={isMobile ? 'public-form-input' : ''}
                                                            labelClassName={isMobile ? 'public-form-label' : ''}
                                                        />
                                                        <div className="space-y-2">
                                                            <label className={`text-[10px] font-black uppercase tracking-widest ${isMobile ? 'text-white/60' : 'text-muted'}`}>Gender</label>
                                                            <Controller
                                                                name="fatherGender"
                                                                control={control}
                                                                render={({ field }) => (
                                                                    <select 
                                                                        {...field}
                                                                        className={`w-full h-10 px-3 rounded-xl border text-sm font-bold ${isMobile ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-border text-primary-text'}`}
                                                                    >
                                                                        <option value="Male">Male</option>
                                                                        <option value="Female">Female</option>
                                                                    </select>
                                                                )}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="space-y-6">
                                                    <h4 className={`text-xs font-black uppercase tracking-widest ${isMobile ? 'text-accent' : 'text-accent'}`}>Mother Details</h4>
                                                    <Input
                                                        label="Mother's Full Name"
                                                        placeholder="As per documents"
                                                        registration={register('motherName')}
                                                        error={errors.motherName?.message}
                                                        className={isMobile ? 'public-form-input' : ''}
                                                        labelClassName={isMobile ? 'public-form-label' : ''}
                                                    />
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <Input
                                                            type="date"
                                                            label="Mother's DOB"
                                                            registration={register('motherDob')}
                                                            error={errors.motherDob?.message}
                                                            className={isMobile ? 'public-form-input' : ''}
                                                            labelClassName={isMobile ? 'public-form-label' : ''}
                                                        />
                                                        <div className="space-y-2">
                                                            <label className={`text-[10px] font-black uppercase tracking-widest ${isMobile ? 'text-white/60' : 'text-muted'}`}>Gender</label>
                                                            <Controller
                                                                name="motherGender"
                                                                control={control}
                                                                render={({ field }) => (
                                                                    <select 
                                                                        {...field}
                                                                        className={`w-full h-10 px-3 rounded-xl border text-sm font-bold ${isMobile ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-border text-primary-text'}`}
                                                                    >
                                                                        <option value="Female">Female</option>
                                                                        <option value="Male">Male</option>
                                                                    </select>
                                                                )}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {watchMaritalStatus === 'Married' && (
                                        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-2xl border animate-slide-up ${isMobile ? 'bg-accent/10 border-accent/20' : 'bg-accent-light/30 border-accent/10'}`}>
                                            <div className="md:col-span-2">
                                                <h4 className={`text-xs font-black uppercase tracking-widest mb-4 ${isMobile ? 'text-accent' : 'text-accent'}`}>Spouse Information</h4>
                                            </div>
                                            <Input
                                                label="Spouse Name"
                                                placeholder="Husband/Wife full name"
                                                registration={register('spouseName')}
                                                error={errors.spouseName?.message}
                                                className={isMobile ? 'public-form-input' : ''}
                                                labelClassName={isMobile ? 'public-form-label' : ''}
                                            />
                                            <Input
                                                label="Spouse Contact"
                                                placeholder="10 digit number"
                                                registration={register('spouseContact')}
                                                error={errors.spouseContact?.message}
                                                maxLength={10}
                                                className={isMobile ? 'public-form-input' : ''}
                                                labelClassName={isMobile ? 'public-form-label' : ''}
                                            />
                                            <Input
                                                type="date"
                                                label="Spouse DOB"
                                                registration={register('spouseDob')}
                                                error={errors.spouseDob?.message}
                                                className={isMobile ? 'public-form-input' : ''}
                                                labelClassName={isMobile ? 'public-form-label' : ''}
                                            />
                                            <div className="space-y-2">
                                                <label className={`text-sm font-semibold block mb-2 ${isMobile ? 'text-white/60 text-[10px] uppercase tracking-widest' : 'text-primary-text'}`}>Spouse Gender</label>
                                                <Controller
                                                    name="spouseGender"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <select 
                                                            {...field}
                                                            className={`w-full h-12 px-4 rounded-xl border-2 text-sm font-bold transition-all ${isMobile ? 'bg-white/5 border-white/10 text-white shadow-lg' : 'bg-white border-border text-primary-text'}`}
                                                        >
                                                            <option value="Male">Male</option>
                                                            <option value="Female">Female</option>
                                                        </select>
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {(watchMaritalStatus === 'Married' || watchMaritalStatus === 'Divorced' || watchMaritalStatus === 'Widowed') && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h3 className={`font-bold ${isMobile ? 'text-white' : 'text-primary-text'}`}>Children Information</h3>
                                                    <p className="text-xs text-muted">You can add up to 2 children.</p>
                                                </div>
                                                {fields.length < 2 && (
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => append({ name: '', dob: '', gender: 'Male' })}
                                                        className={`!rounded-xl ${isMobile ? '!bg-white/10 !border-white/20 !text-white hover:!bg-white/20' : ''}`}
                                                    >
                                                        <Plus className="h-4 w-4 mr-2" /> Add Child
                                                    </Button>
                                                )}
                                            </div>

                                            {fields.length === 0 ? (
                                                <div className={`py-10 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-muted gap-2 ${isMobile ? 'border-white/10' : 'border-border'}`}>
                                                    <Users className="h-8 w-8 opacity-20" />
                                                    <p className="text-sm font-medium">No children declared yet</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-4">
                                                    {fields.map((field, index) => (
                                                        <div key={field.id} className={`p-6 border rounded-2xl shadow-sm relative group transition-all ${isMobile ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white border-border hover:bg-page/30'}`}>
                                                            <button
                                                                type="button"
                                                                onClick={() => remove(index)}
                                                                className={`absolute top-4 right-4 p-2 rounded-full transition-all ${isMobile ? 'text-gray-500 hover:text-red-400 hover:bg-red-400/10' : 'text-muted hover:text-red-500 hover:bg-red-50'}`}
                                                            >
                                                                <Trash2 className="h-5 w-5" />
                                                            </button>
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                                <Input
                                                                    label={`Child Name`}
                                                                    registration={register(`children.${index}.name` as const)}
                                                                    error={errors.children?.[index]?.name?.message}
                                                                    className={isMobile ? 'public-form-input' : ''}
                                                                    labelClassName={isMobile ? 'public-form-label' : ''}
                                                                />
                                                                <Input
                                                                    type="date"
                                                                    label="Date of Birth"
                                                                    registration={register(`children.${index}.dob` as const)}
                                                                    error={errors.children?.[index]?.dob?.message}
                                                                    className={isMobile ? 'public-form-input' : ''}
                                                                    labelClassName={isMobile ? 'public-form-label' : ''}
                                                                />
                                                                <div className="space-y-2">
                                                                    <label className={`text-sm font-semibold block mb-2 ${isMobile ? 'text-white/60 text-[10px] uppercase tracking-widest' : 'text-primary-text'}`}>Gender</label>
                                                                    <Controller
                                                                        name={`children.${index}.gender` as const}
                                                                        control={control}
                                                                        render={({ field }) => (
                                                                            <select 
                                                                                {...field}
                                                                                className={`w-full h-10 px-3 rounded-xl border text-sm font-bold ${isMobile ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-border text-primary-text'}`}
                                                                            >
                                                                                <option value="Male">Male</option>
                                                                                <option value="Female">Female</option>
                                                                            </select>
                                                                        )}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-8 animate-fade-in">
                                <div>
                                    <h2 className={`text-2xl font-bold mb-2 ${isMobile ? 'text-white' : 'text-primary-text'}`}>Plan Recommendation</h2>
                                    <p className={`${isMobile ? 'text-gray-400' : 'text-muted'} text-sm`}>Your customized insurance tier based on verified records.</p>
                                </div>

                                {insurancePlan ? (
                                    <div className="p-8 bg-gradient-to-br from-accent to-accent-dark rounded-3xl text-white shadow-xl shadow-accent/20 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden group">
                                        <div className="absolute -right-10 -bottom-10 opacity-10 transform rotate-12 group-hover:scale-110 transition-transform duration-700">
                                            <ShieldCheck className="h-64 w-64" />
                                        </div>
                                        <div className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shrink-0">
                                            <Heart className="h-12 w-12 text-white fill-white/20" />
                                        </div>
                                        <div className="flex-1 text-center md:text-left z-10">
                                            <h3 className="text-white/70 font-bold text-xs uppercase tracking-widest mb-1">Recommended Policy</h3>
                                            <p className="text-3xl font-black">{insurancePlan.minAge}-{insurancePlan.maxAge} Tier</p>
                                            <p className="text-white/80 text-sm mt-1">GMC Cover for Age {employeeAge}</p>
                                        </div>
                                        <div className="w-full md:w-auto text-center md:text-right md:pl-10 md:border-l border-white/20 z-10">
                                            <p className="text-white/70 font-bold text-xs uppercase mb-1">Monthly Premium</p>
                                            <p className="text-4xl font-black">₹{insurancePlan.rate}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-10 bg-rose-50 rounded-3xl border-2 border-dashed border-rose-200 text-center flex flex-col items-center gap-4">
                                        <div className="p-4 bg-rose-100 rounded-full">
                                            <ImageIcon className="h-10 w-10 text-rose-500" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-rose-900 text-lg">Incomplete Data</h3>
                                            <p className="text-rose-500 text-sm">Please return to Step 1 and provide a valid Date of Birth.</p>
                                        </div>
                                        <Button variant="secondary" size="sm" onClick={() => setStep(1)}>Fix Now</Button>
                                    </div>
                                )}

                                <div className="space-y-6">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-accent" />
                                        <h3 className={`font-bold ${isMobile ? 'text-white' : 'text-primary-text'}`}>Declarations & Consent</h3>
                                    </div>
                                    
                                    <div className={`border rounded-2xl p-6 h-48 overflow-y-auto space-y-4 text-sm leading-relaxed thin-scrollbar ${isMobile ? 'bg-white/5 border-white/10 text-gray-400' : 'bg-page border-border text-muted'}`}>
                                        <div className="flex gap-3">
                                            <div className="w-5 h-5 rounded-full bg-accent-light text-accent flex items-center justify-center shrink-0 font-bold text-[10px]">1</div>
                                            <p>I authorize <strong>Paradigm Services</strong> to enroll me and my declared family members (Spouse/Children) in the Group Medical Cover (GMC) policy.</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="w-5 h-5 rounded-full bg-accent-light text-accent flex items-center justify-center shrink-0 font-bold text-[10px]">2</div>
                                            <p>I agree to the monthly premium deduction from my salary based on the age-based tier calculation displayed above.</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="w-5 h-5 rounded-full bg-accent-light text-accent flex items-center justify-center shrink-0 font-bold text-[10px]">3</div>
                                            <p>I understand that medical claims and settlements are subject to insurers' verification of the relationship and age documents declared here.</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="w-5 h-5 rounded-full bg-accent-light text-accent flex items-center justify-center shrink-0 font-bold text-[10px]">4</div>
                                            <p>All declarations made are truthful; any discrepancies found may lead to policy cancellation and corporate disciplinary action.</p>
                                        </div>
                                    </div>

                                    <div className={`p-4 border rounded-xl shadow-sm ${isMobile ? 'bg-white/5 border-white/10' : 'bg-white border-border'}`}>
                                        <Controller
                                            name="acknowledged"
                                            control={control}
                                            render={({ field }) => (
                                                <Checkbox
                                                    id="acknowledged"
                                                    label="I verify my declarations and agree to the GMC enrollment terms."
                                                    labelClassName={`text-sm font-bold ${isMobile ? 'text-white' : 'text-primary-text'}`}
                                                    checked={field.value}
                                                    onChange={field.onChange}
                                                    inputClassName={isMobile ? 'text-accent border-white/20 bg-black/40 rounded' : ''}
                                                />
                                            )}
                                        />
                                        {errors.acknowledged && <p className="text-xs text-red-500 font-bold mt-2 ml-7">{errors.acknowledged.message}</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className={`flex flex-col sm:flex-row justify-end gap-4 pt-10 border-t ${isMobile ? 'border-white/10' : 'border-border'}`}>
                            {step > 1 && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => setStep(step - 1)}
                                    className={`sm:w-32 h-12 !rounded-2xl !shadow-none ${isMobile ? '!bg-white/10 !border-white/20 !text-white hover:!bg-white/20' : '!bg-white'}`}
                                    disabled={isSubmitting}
                                >
                                    Back
                                </Button>
                            )}
                            <Button
                                type={step === 3 ? "submit" : "button"}
                                onClick={step === 3 ? undefined : handleNextStep}
                                className="w-full sm:w-64 h-12 !rounded-2xl !text-base !font-bold !shadow-lg shadow-accent/20"
                                isLoading={isSubmitting}
                            >
                                {step === 3 ? 'Confirm & Secure Enrollment' : 'Continue to Next Step'}
                                <ChevronRight className="h-5 w-5 ml-2" />
                            </Button>
                        </div>
                    </form>
                </div>

                <footer className={`border-t flex flex-col md:flex-row items-center justify-between text-[10px] md:text-xs font-bold uppercase tracking-widest ${
                    isMobile 
                        ? 'bg-black/20 border-white/10 text-gray-500' 
                        : 'bg-gray-50/50 border-border text-muted'
                }`}>
                    <div className="w-full p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-accent" />
                            <span>Secure SSL encrypted connection</span>
                        </div>
                        <span>&copy; {new Date().getFullYear()} Paradigm Services</span>
                    </div>
                </footer>
            </div>
        </div>
    </div>

    <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                .thin-scrollbar::-webkit-scrollbar { width: 4px; }
                .thin-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .thin-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scale-in { from { transform: scale(0.98); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
                .animate-scale-in { animation: scale-in 0.3s ease-out forwards; }
                .animate-slide-up { animation: slide-up 0.4s ease-out forwards; }
                @keyframes slide-up { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            `}</style>
        </>
    );
};

export default GMCForm;
