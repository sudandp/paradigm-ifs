import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { api } from '../../services/api';
import type { OrganizationGroup, Entity, Company, RegistrationType, Organization, SiteConfiguration, UploadedFile } from '../../types';
import { Plus, Save, Edit, Trash2, Building, ChevronRight, Upload, Download, Eye, CheckCircle, AlertCircle, Search, ClipboardList, Settings, Calculator, Users, Badge, HeartPulse, Archive, Wrench, Shirt, FileText, CalendarDays, BarChart, Mail, Sun, UserX, IndianRupee, ChevronLeft, HelpCircle, Loader2 } from 'lucide-react';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import EntityForm from '../../components/hr/EntityForm';
// FIX: Changed to a named import as SiteConfigurationForm is not a default export.
import { SiteConfigurationForm } from '../../components/hr/SiteConfigurationForm';
import Modal from '../../components/ui/Modal';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { useUiSettingsStore } from '../../store/uiSettingsStore';
import TemplateInstructionsModal from '../../components/hr/TemplateInstructionsModal';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import PlaceholderView from '../../components/ui/PlaceholderView';

// Import all the new placeholder components
import CostingResourceConfig from '../../components/hr/CostingResourceConfig';
import BackofficeHeadsConfig from '../../components/hr/BackofficeHeadsConfig';
import StaffDesignationConfig from '../../components/hr/StaffDesignationConfig';
import { GmcPolicyConfig } from '../../components/hr/GmcPolicyConfig';
import AssetConfig from '../../components/hr/AssetConfig';
import ToolsListConfig from '../../components/hr/ToolsListConfig';
import AttendanceFormatConfig from '../../components/hr/AttendanceFormatConfig';
import AttendanceOverviewConfig from '../../components/hr/AttendanceOverviewConfig';
import DailyAttendanceConfig from '../../components/hr/DailyAttendanceConfig';
import NotificationTemplateConfig from '../../components/hr/NotificationTemplateConfig';
import OnboardRejectReasonConfig from '../../components/hr/OnboardRejectReasonConfig';
import SalaryTemplateConfig from '../../components/hr/SalaryTemplateConfig';
import SalaryLineItemConfig from '../../components/hr/SalaryLineItemConfig';


// Helper to convert array of objects to CSV string
const toCSV = (data: Record<string, any>[], columns: string[]): string => {
    const header = columns.join(',');
    const rows = data.map(row =>
        columns.map(col => {
            const val = row[col] === null || row[col] === undefined ? '' : String(row[col]);
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        }).join(',')
    );
    return [header, ...rows].join('\n');
};

// Helper to parse CSV string into array of objects
const fromCSV = (csvText: string): Record<string, string>[] => {
    const lines = csvText.trim().replace(/\r/g, '').split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const row: Record<string, string> = {};
        // Regex for CSV parsing, handles quoted fields containing commas.
        const values = lines[i].match(/(?<=,|^)(?:"(?:[^"]|"")*"|[^,]*)/g) || [];

        headers.forEach((header, index) => {
            let value = (values[index] || '').trim();
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.substring(1, value.length - 1).replace(/""/g, '"');
            }
            row[header] = value;
        });
        rows.push(row);
    }
    return rows;
};


const entityCsvColumns = [
    'Group Id', 'Group Name', 'Company Id', 'Company Name', 'Entity Id', 'Entity Name', 'Organization Id', 'Location', 'Registered Address',
    'Registration Type', 'Registration Number', 'GST Number', 'PAN Number', 'Email', 'E Shram Number',
    'Shop and Establishment Code', 'EPFO Code', 'ESIC Code', 'PSARA License Number', 'PSARA Valid Till'
];

const siteConfigCsvColumns = [
    'Organization Id', 'Organization Name', 'Location', 'Entity Id', 'Billing Name', 'Registered Address',
    'GST Number', 'PAN Number', 'Email 1', 'Email 2', 'Email 3', 'E Shram Number', 'Shop and Establishment Code',
    'Key Account Manager', 'Site Area (Sq Ft)', 'Project Type', 'Apartment Count', 'Agreement Details', 'Site Operations'
];

const triggerDownload = (data: BlobPart, fileName: string) => {
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const NameInputModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
    title: string;
    label: string;
    initialName?: string;
}> = ({ isOpen, onClose, onSave, title, label, initialName = '' }) => {
    const [name, setName] = useState(initialName);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) setName(initialName);
    }, [isOpen, initialName]);

    const handleSave = () => {
        if (!name.trim()) {
            setError('Name cannot be empty.');
            return;
        }
        onSave(name);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
            <div className="bg-card rounded-xl shadow-card p-6 w-full max-w-md m-4" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold">{title}</h3>
                <div className="mt-4">
                    <Input label={label} id="name-input" value={name} onChange={e => { setName(e.target.value); setError(''); }} error={error} />
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <Button onClick={onClose} variant="secondary">Cancel</Button>
                    <Button onClick={handleSave}>Save</Button>
                </div>
            </div>
        </div>
    );
};

const subcategories = [
    { key: 'client_structure', label: 'Client Structure', icon: ClipboardList },
    { key: 'site_configuration', label: 'Site Configuration', icon: Settings },
    { key: 'costing_resource', label: 'Costing & Resource', icon: Calculator },
    { key: 'backoffice_heads', label: 'Back Office & ID Series', icon: Users },
    { key: 'staff_designation', label: 'Staff Designation', icon: Badge },
    { key: 'gmc_policy', label: 'GMC Policy', icon: HeartPulse },
    { key: 'asset', label: 'Asset Management', icon: Archive },
    { key: 'tools_list', label: 'Tools List', icon: Wrench },
    { key: 'attendance_format', label: 'Attendance Format', icon: CalendarDays },
    { key: 'attendance_overview', label: 'Attendance Overview', icon: BarChart },
    { key: 'notification_template', label: 'Notification & Mail', icon: Mail },
    { key: 'onboard_reject_reason', label: 'Onboarding Rejection Reasons', icon: UserX },
    { key: 'salary_template', label: 'Salary Breakup', icon: IndianRupee },
    { key: 'salary_line_item', label: 'Salary Line Item', icon: IndianRupee },
];

const EntityManagement: React.FC = () => {
    const navigate = useNavigate();
    const [groups, setGroups] = useState<OrganizationGroup[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [siteConfigs, setSiteConfigs] = useState<SiteConfiguration[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [activeSubcategory, setActiveSubcategory] = useState<string>('client_structure');
    const importRef = useRef<HTMLInputElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewingClients, setViewingClients] = useState<{ companyName: string; clients: Entity[] } | null>(null);
    const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
    const isMobile = useMediaQuery('(max-width: 767px)');

    // Modals state
    const [entityFormState, setEntityFormState] = useState<{ isOpen: boolean; initialData: Entity | null; companyName: string }>({ isOpen: false, initialData: null, companyName: '' });
    const [nameModalState, setNameModalState] = useState<{
        isOpen: boolean;
        mode: 'add' | 'edit';
        type: 'group' | 'company';
        id?: string;
        groupId?: string;
        initialName?: string;
        title: string;
        label: string
    }>({ isOpen: false, mode: 'add', type: 'group', title: '', label: '' });
    const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; type: 'group' | 'company' | 'client'; id: string; name: string }>({ isOpen: false, type: 'group', id: '', name: '' });
    const [siteConfigForm, setSiteConfigForm] = useState<{ isOpen: boolean; org: Organization | null }>({ isOpen: false, org: null });

    const allClients = useMemo(() => {
        return groups.flatMap(g => g.companies.flatMap(c => c.entities.map(e => ({ ...e, companyName: c.name }))));
    }, [groups]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [structure, orgs, configs] = await Promise.all([
                    api.getOrganizationStructure(),
                    api.getOrganizations(),
                    api.getSiteConfigurations()
                ]);
                setGroups(structure);
                setOrganizations(orgs);
                setSiteConfigs(configs);
            } catch (error) {
                setToast({ message: "Failed to load data.", type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const filteredGroups = useMemo(() => {
        if (!searchTerm.trim()) {
            return groups;
        }
        const lower = searchTerm.toLowerCase();

        return groups.map(group => {
            if (group.name.toLowerCase().includes(lower)) {
                return group; // Group name matches, include whole group
            }

            const matchingCompanies = group.companies.map(company => {
                if (company.name.toLowerCase().includes(lower)) {
                    return company; // Company name matches, include whole company
                }

                const matchingEntities = company.entities.filter(entity =>
                    entity.name.toLowerCase().includes(lower)
                );

                if (matchingEntities.length > 0) {
                    return { ...company, entities: matchingEntities };
                }
                return null;
            }).filter(Boolean) as Company[];

            if (matchingCompanies.length > 0) {
                return { ...group, companies: matchingCompanies };
            }
            return null;
        }).filter(Boolean) as OrganizationGroup[];
    }, [groups, searchTerm]);

    const filteredOrganizations = useMemo(() => {
        if (!searchTerm.trim()) {
            return organizations;
        }
        const lower = searchTerm.toLowerCase();
        return organizations.filter(org => org.shortName.toLowerCase().includes(lower));
    }, [organizations, searchTerm]);


    const toggleExpand = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    const handleSaveAll = async () => {
        setIsLoading(true);
        try {
            await api.bulkSaveOrganizationStructure(groups);
            setToast({ message: 'All changes saved to database successfully.', type: 'success' });
        } catch (error) {
            console.error('Failed to save changes:', error);
            setToast({ message: 'Failed to save changes to database.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    // Client/Entity handlers
    const handleAddClient = (companyName: string) => setEntityFormState({ isOpen: true, initialData: null, companyName });
    const handleEditClient = (entity: Entity, companyName: string) => setEntityFormState({ isOpen: true, initialData: entity, companyName });
    const handleSaveClient = async (clientData: Entity) => {
        try {
            const company = groups.flatMap(g => g.companies).find(c => c.name === entityFormState.companyName);
            if (!company) throw new Error("Company not found");

            const savedClient = await api.saveEntity({ ...clientData, companyId: company.id });
            
            setGroups(prev => prev.map(group => ({
                ...group,
                companies: group.companies.map(c => {
                    if (c.id === company.id) {
                        const exists = c.entities.some(e => e.id === savedClient.id);
                        return {
                            ...c,
                            entities: exists 
                                ? c.entities.map(e => e.id === savedClient.id ? savedClient : e)
                                : [...c.entities, savedClient]
                        };
                    }
                    return c;
                })
            })));

            setToast({ message: clientData.id.startsWith('new_') ? 'Client added.' : 'Client updated.', type: 'success' });
            setEntityFormState({ isOpen: false, initialData: null, companyName: '' });
        } catch (error) {
            setToast({ message: 'Failed to save client.', type: 'error' });
        }
    };

    const handleDeleteClick = (type: 'group' | 'company' | 'client', id: string, name: string) => setDeleteModalState({ isOpen: true, type, id, name });

    const handleConfirmDelete = async () => {
        const { type, id, name } = deleteModalState;
        try {
            if (type === 'group') {
                await api.deleteOrganizationGroup(id);
                setGroups(prev => prev.filter(g => g.id !== id));
            } else if (type === 'company') {
                await api.deleteCompany(id);
                setGroups(prev => prev.map(group => ({
                    ...group,
                    companies: group.companies.filter(c => c.id !== id)
                })));
            } else if (type === 'client') {
                await api.deleteEntity(id);
                setGroups(prev => prev.map(group => ({
                    ...group,
                    companies: group.companies.map(company => ({
                        ...company,
                        entities: company.entities.filter(e => e.id !== id)
                    }))
                })));
            }
            setToast({ message: `${type.charAt(0).toUpperCase() + type.slice(1)} '${name}' deleted.`, type: 'success' });
        } catch (error) {
            setToast({ message: `Failed to delete ${type}.`, type: 'error' });
        }
        setDeleteModalState({ isOpen: false, type: 'group', id: '', name: '' });
    };

    const handleSaveName = async (name: string) => {
        const { mode, type, id, groupId } = nameModalState;
        try {
            if (mode === 'add') {
                if (type === 'group') {
                    const saved = await api.createOrganizationGroup({ id: `group_${Date.now()}`, name });
                    setGroups(prev => [...prev, { ...saved, companies: [], locations: [] }]);
                    setToast({ message: `Group '${name}' added.`, type: 'success' });
                } else if (type === 'company' && groupId) {
                    const saved = await api.createCompany({ id: `comp_${Date.now()}`, name, groupId });
                    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, companies: [...g.companies, { ...saved, entities: [] }] } : g));
                    setToast({ message: `Company '${name}' added.`, type: 'success' });
                }
            } else { // mode === 'edit'
                if (type === 'group' && id) {
                    await api.updateOrganizationGroup(id, { name });
                    setGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g));
                    setToast({ message: 'Group updated.', type: 'success' });
                } else if (type === 'company' && id && groupId) {
                    await api.updateCompany(id, { name });
                    setGroups(prev => prev.map(g =>
                        g.id === groupId
                            ? { ...g, companies: g.companies.map(c => c.id === id ? { ...c, name } : c) }
                            : g
                    ));
                    setToast({ message: 'Company updated.', type: 'success' });
                }
            }
        } catch (error) {
            setToast({ message: `Failed to ${mode} ${type}.`, type: 'error' });
        }
        setNameModalState({ isOpen: false, mode: 'add', type: 'group', title: '', label: '' }); // Reset and close
    };


    const handleExport = () => {
        let csvData: string;
        let fileName: string;
        let columns: string[];

        if (activeSubcategory === 'client_structure') {
            columns = entityCsvColumns;
            const flatData = groups.flatMap(group =>
                group.companies.flatMap(company =>
                    company.entities.map(entity => ({
                        'Group Id': group.id,
                        'Group Name': group.name,
                        'Company Id': company.id,
                        'Company Name': company.name,
                        'Entity Id': entity.id,
                        'Entity Name': entity.name,
                        'Organization Id': entity.organizationId || '',
                        'Location': entity.location || '',
                        'Registered Address': entity.registeredAddress || '',
                        'Registration Type': entity.registrationType || '',
                        'Registration Number': entity.registrationNumber || '',
                        'GST Number': entity.gstNumber || '',
                        'PAN Number': entity.panNumber || '',
                        'Email': entity.email || '',
                        'E Shram Number': entity.eShramNumber || '',
                        'Shop and Establishment Code': entity.shopAndEstablishmentCode || '',
                        'EPFO Code': entity.epfoCode || '',
                        'ESIC Code': entity.esicCode || '',
                        'PSARA License Number': entity.psaraLicenseNumber || '',
                        'PSARA Valid Till': entity.psaraValidTill || '',
                    }))
                )
            );
            csvData = toCSV(flatData, columns);
            fileName = 'client_structure_export.csv';
        } else if (activeSubcategory === 'site_configuration') {
            columns = siteConfigCsvColumns;
            const dataToExport = organizations.map(org => {
                const config = siteConfigs.find(c => c.organizationId === org.id);
                return {
                    'Organization Id': org.id,
                    'Organization Name': org.shortName,
                    'Location': config?.location || '',
                    'Entity Id': config?.entityId || '',
                    'Billing Name': config?.billingName || '',
                    'Registered Address': config?.registeredAddress || '',
                    'GST Number': config?.gstNumber || '',
                    'PAN Number': config?.panNumber || '',
                    'Email 1': config?.email1 || '',
                    'Email 2': config?.email2 || '',
                    'Email 3': config?.email3 || '',
                    'E Shram Number': config?.eShramNumber || '',
                    'Shop and Establishment Code': config?.shopAndEstablishmentCode || '',
                    'Key Account Manager': config?.keyAccountManager || '',
                    'Site Area (Sq Ft)': config?.siteAreaSqFt || '',
                    'Project Type': config?.projectType || '',
                    'Apartment Count': config?.apartmentCount || '',
                    'Agreement Details': JSON.stringify(config?.agreementDetails || {}),
                    'Site Operations': JSON.stringify(config?.siteOperations || {}),
                };
            });
            csvData = toCSV(dataToExport, columns);
            fileName = 'site_configuration_export.csv';
        } else {
            setToast({ message: `Export not implemented for this view.`, type: 'error' });
            return;
        }

        triggerDownload(csvData, fileName);
        setToast({ message: 'Data exported successfully.', type: 'success' });
    };

    const handleDownloadTemplate = () => {
        let columns: string[];
        let fileName: string;

        if (activeSubcategory === 'client_structure') {
            columns = entityCsvColumns;
            fileName = 'client_structure_template.csv';
        } else if (activeSubcategory === 'site_configuration') {
            columns = siteConfigCsvColumns;
            fileName = 'site_configuration_template.csv';
        } else {
            setToast({ message: `Template not available for this view.`, type: 'error' });
            return;
        }
        triggerDownload(columns.join(','), fileName);
    };

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                if (!text) throw new Error("File is empty.");

                const lines = text.trim().replace(/\r/g, '').split('\n');
                if (lines.length < 1) throw new Error("CSV file is empty.");
                const fileHeaders = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

                if (activeSubcategory === 'client_structure') {
                    if (fileHeaders.join(',') !== entityCsvColumns.join(',')) {
                        throw new Error(`Header mismatch. Please use the downloaded template.`);
                    }

                    const parsedData = fromCSV(text);
                    if (parsedData.length === 0) throw new Error("No data rows found.");

                    const newGroupsMap = new Map<string, { group: OrganizationGroup, companiesMap: Map<string, Company> }>();

                    for (const row of parsedData) {
                        const groupId = row['Group Id'] || row.GroupId;
                        const groupName = row['Group Name'] || row.GroupName;
                        const companyId = row['Company Id'] || row.CompanyId;
                        const companyName = row['Company Name'] || row.CompanyName;

                        if (!newGroupsMap.has(groupId)) {
                            newGroupsMap.set(groupId, {
                                group: { id: groupId, name: groupName, locations: [], companies: [] },
                                companiesMap: new Map<string, Company>()
                            });
                        }

                        const groupData = newGroupsMap.get(groupId)!;

                        if (!groupData.companiesMap.has(companyId)) {
                            groupData.companiesMap.set(companyId, { id: companyId, name: companyName, entities: [] });
                        }

                        const companyData = groupData.companiesMap.get(companyId)!;

                        const entity: Entity = {
                            id: row['Entity Id'] || row.EntityId,
                            name: row['Entity Name'] || row.EntityName,
                            organizationId: row['Organization Id'] || row.organizationId,
                            location: row['Location'] || row.Location,
                            registeredAddress: row['Registered Address'] || row.RegisteredAddress,
                            registrationType: (row['Registration Type'] || row.RegistrationType) as RegistrationType || '',
                            registrationNumber: row['Registration Number'] || row.RegistrationNumber,
                            gstNumber: row['GST Number'] || row.GSTNumber,
                            panNumber: row['PAN Number'] || row.PANNumber,
                            email: row['Email'] || row.Email,
                            eShramNumber: row['E Shram Number'] || row.EShramNumber,
                            shopAndEstablishmentCode: row['Shop and Establishment Code'] || row.ShopAndEstablishmentCode,
                            epfoCode: row['EPFO Code'] || row.EPFOCode,
                            esicCode: row['ESIC Code'] || row.ESICCode,
                            psaraLicenseNumber: row['PSARA License Number'] || row.PSARALicenseNumber,
                            psaraValidTill: row['PSARA Valid Till'] || row.PSARAValidTill,
                        };

                        companyData.entities.push(entity);
                    }

                    const newGroups: OrganizationGroup[] = Array.from(newGroupsMap.values()).map(gData => {
                        gData.group.companies = Array.from(gData.companiesMap.values());
                        return gData.group;
                    });

                    setGroups(newGroups);
                    setToast({ message: `Successfully imported ${parsedData.length} client records.`, type: 'success' });

                } else if (activeSubcategory === 'site_configuration') {
                    if (fileHeaders.join(',') !== siteConfigCsvColumns.join(',')) {
                        throw new Error(`Header mismatch. Please use the downloaded template.`);
                    }

                    const parsedData = fromCSV(text);
                    if (parsedData.length === 0) throw new Error("No data rows found.");

                    const newSiteConfigs = parsedData.map(row => {
                        return {
                            organizationId: row['Organization Id'] || row.organizationId,
                            location: row['Location'] || row.location,
                            entityId: row['Entity Id'] || row.entityId,
                            billingName: row['Billing Name'] || row.billingName,
                            registeredAddress: row['Registered Address'] || row.registeredAddress,
                            gstNumber: row['GST Number'] || row.gstNumber,
                            panNumber: row['PAN Number'] || row.panNumber,
                            email1: row['Email 1'] || row.email1,
                            email2: row['Email 2'] || row.email2,
                            email3: row['Email 3'] || row.email3,
                            eShramNumber: row['E Shram Number'] || row.eShramNumber,
                            shopAndEstablishmentCode: row['Shop and Establishment Code'] || row.shopAndEstablishmentCode,
                            keyAccountManager: row['Key Account Manager'] || row.keyAccountManager,
                            siteAreaSqFt: Number(row['Site Area (Sq Ft)'] || row.siteAreaSqFt) || null,
                            projectType: row['Project Type'] || row.projectType,
                            apartmentCount: Number(row['Apartment Count'] || row.apartmentCount) || null,
                            agreementDetails: JSON.parse(row['Agreement Details'] || row.agreementDetails || '{}'),
                            siteOperations: JSON.parse(row['Site Operations'] || row.siteOperations || '{}'),
                        } as SiteConfiguration;
                    });

                    setSiteConfigs(prev => {
                        const updated = [...prev];
                        newSiteConfigs.forEach(newConfig => {
                            const index = updated.findIndex(c => c.organizationId === newConfig.organizationId);
                            if (index > -1) updated[index] = newConfig;
                            else updated.push(newConfig);
                        });
                        return updated;
                    });
                    setToast({ message: `Successfully imported ${newSiteConfigs.length} site configurations.`, type: 'success' });
                } else {
                    setToast({ message: `Import not implemented for this view.`, type: 'error' });
                }
            } catch (error: any) {
                setToast({ message: error.message || 'Failed to import CSV.', type: 'error' });
            } finally {
                if (event.target) event.target.value = '';
            }
        };
        reader.readAsText(file);
    };


    const renderContent = () => {
        switch (activeSubcategory) {
            case 'client_structure':
                return (
                    <div className="border-0 shadow-none md:bg-card md:p-6 md:rounded-xl md:shadow-card">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                            <Button onClick={() => navigate('/hr/entity-management/add-group')} style={{ backgroundColor: '#006B3F', color: '#FFFFFF', borderColor: '#005632' }} className="border hover:opacity-90 text-white shadow-lg hover:shadow-xl transition-all duration-300"><Plus className="mr-2 h-4" />Add Group</Button>
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button type="button" variant="outline" onClick={handleDownloadTemplate} className="hover:bg-gray-100"><FileText className="mr-2 h-4 w-4" /> Template</Button>
                                <Button type="button" variant="outline" onClick={() => importRef.current?.click()} className="hover:bg-gray-100"><Upload className="mr-2 h-4 w-4" /> Import</Button>
                                <Button type="button" variant="outline" onClick={handleExport} className="hover:bg-gray-100"><Download className="mr-2 h-4 w-4" /> Export</Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {filteredGroups.map(group => (
                                <div key={group.id} className="border-b border-border">
                                    <div className="p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => toggleExpand(group.id)}><ChevronRight className={`h-5 w-5 transition-transform ${expanded[group.id] ? 'rotate-90' : ''}`} /></button>
                                            <Building className="h-5 w-5 text-muted" />
                                            <span className="font-semibold">{group.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button size="sm" className="!p-1.5" onClick={() => setNameModalState({ isOpen: true, mode: 'add', type: 'company', groupId: group.id, title: `Add Company to ${group.name}`, label: 'Company Name' })} title="Add Company">
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                            <Button variant="icon" onClick={() => setNameModalState({ isOpen: true, mode: 'edit', type: 'group', id: group.id, initialName: group.name, title: 'Edit Group Name', label: 'Group Name' })} title="Edit group name" className="p-2 hover:bg-blue-500/10 rounded-full transition-colors"><Edit className="h-5 w-5" /></Button>
                                            <Button variant="icon" onClick={() => handleDeleteClick('group', group.id, group.name)} title="Delete group" className="p-2 hover:bg-red-500/10 rounded-full transition-colors"><Trash2 className="h-5 w-5 text-red-500" /></Button>
                                        </div>
                                    </div>
                                    {expanded[group.id] && (
                                        <div className="pl-6 pr-3 pb-3 space-y-2">
                                            {group.companies.map(company => (
                                                <div key={company.id} className="border border-border rounded-lg">
                                                    <div className="p-2 flex items-center justify-between bg-card">
                                                        <div className="flex items-center gap-2">
                                                            <button onClick={() => toggleExpand(company.id)}><ChevronRight className={`h-5 w-5 transition-transform ${expanded[company.id] ? 'rotate-90' : ''}`} /></button>
                                                            <span>{company.name} ({company.entities.length} clients)</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Button variant="icon" size="sm" title={`View ${company.entities.length} clients`} onClick={() => setViewingClients({ companyName: company.name, clients: company.entities })}><Eye className="h-4 w-4" /></Button>
                                                            <Button variant="icon" size="sm" onClick={() => handleAddClient(company.name)} title="Add client"><Plus className="h-4 w-4" /></Button>
                                                            <Button variant="icon" onClick={() => setNameModalState({ isOpen: true, mode: 'edit', type: 'company', id: company.id, groupId: group.id, initialName: company.name, title: 'Edit Company Name', label: 'Company Name' })} title="Edit company name" className="p-2 hover:bg-blue-500/10 rounded-full transition-colors"><Edit className="h-5 w-5" /></Button>
                                                            <Button variant="icon" onClick={() => handleDeleteClick('company', company.id, company.name)} title="Delete company" className="p-2 hover:bg-red-500/10 rounded-full transition-colors"><Trash2 className="h-5 w-5 text-red-500" /></Button>
                                                        </div>
                                                    </div>
                                                    {expanded[company.id] && (
                                                        <div className="p-2">
                                                            {company.entities.map(client => (
                                                                <div key={client.id} className="p-2 flex items-center justify-between hover:bg-page rounded">
                                                                    <span>{client.name}</span>
                                                                    <div className="flex items-center gap-1">
                                                                        <Button variant="icon" onClick={() => handleEditClient(client, company.name)} className="p-2 hover:bg-blue-500/10 rounded-full transition-colors"><Edit className="h-5 w-5" /></Button>
                                                                        <Button variant="icon" onClick={() => handleDeleteClick('client', client.id, client.name)} className="p-2 hover:bg-red-500/10 rounded-full transition-colors"><Trash2 className="h-5 w-5 text-red-500" /></Button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'site_configuration':
                return (
                    <div className="border-0 shadow-none md:bg-card md:p-6 md:rounded-xl md:shadow-card">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                            <h4 className="text-lg font-semibold text-primary-text">Sites Configuration</h4>
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button type="button" variant="outline" onClick={handleDownloadTemplate}><FileText className="mr-2 h-4 w-4" /> Template</Button>
                                <Button type="button" variant="outline" onClick={() => importRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Import</Button>
                                <Button type="button" variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export</Button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-border responsive-table">
                                <thead className="bg-page">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Site Name</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Configuration Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border md:bg-card md:divide-y-0">
                                    {filteredOrganizations.map(org => {
                                        const config = siteConfigs.find(c => c.organizationId === org.id);
                                        const isConfigured = !!config && (!!config.billingName || !!config.keyAccountManager);
                                        return (
                                            <tr key={org.id}>
                                                <td data-label="Site Name" className="px-4 py-3 font-medium">
                                                    <div className="flex items-center gap-3">
                                                        <Building className="h-5 w-5 text-muted" />
                                                        <span>{org.shortName}</span>
                                                    </div>
                                                </td>
                                                <td data-label="Status" className="px-4 py-3">
                                                    {isConfigured ?
                                                        <span className="flex items-center text-green-600"><CheckCircle className="h-4 w-4 mr-1" /> Complete</span> :
                                                        <span className="flex items-center text-yellow-600"><AlertCircle className="h-4 w-4 mr-1" /> Incomplete</span>
                                                    }
                                                </td>
                                                <td data-label="Actions" className="px-4 py-3">
                                                    <Button size="sm" variant="outline" onClick={() => setSiteConfigForm({ isOpen: true, org })}>
                                                        <Eye className="mr-2 h-4 w-4" /> View / Edit
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            case 'costing_resource': return <CostingResourceConfig />;
            case 'backoffice_heads': return <BackofficeHeadsConfig />;
            case 'staff_designation': return <StaffDesignationConfig />;
            case 'gmc_policy': return <GmcPolicyConfig />;
            case 'asset': return <AssetConfig />;
            case 'tools_list': return <ToolsListConfig />;
            case 'attendance_format': return <AttendanceFormatConfig />;
            case 'attendance_overview': return <AttendanceOverviewConfig />;
            case 'daily_attendance': return <DailyAttendanceConfig />;
            case 'notification_template': return <NotificationTemplateConfig />;
            case 'onboard_reject_reason': return <OnboardRejectReasonConfig />;
            case 'salary_template': return <SalaryTemplateConfig />;
            case 'salary_line_item': return <SalaryLineItemConfig />;
            default:
                const activeItem = subcategories.find(sc => sc.key === activeSubcategory);
                return <PlaceholderView title={activeItem?.label || 'Configuration'} />;
        }
    };


    return (
        <div className="p-4 space-y-6">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
            <TemplateInstructionsModal isOpen={isInstructionsOpen} onClose={() => setIsInstructionsOpen(false)} />
            {entityFormState.isOpen && <EntityForm {...entityFormState} onClose={() => setEntityFormState(p => ({ ...p, isOpen: false }))} onSave={handleSaveClient} />}
            <NameInputModal
                isOpen={nameModalState.isOpen}
                onClose={() => setNameModalState({ isOpen: false, mode: 'add', type: 'group', title: '', label: '' })}
                onSave={handleSaveName}
                title={nameModalState.title}
                label={nameModalState.label}
                initialName={nameModalState.initialName}
            />
            <Modal isOpen={deleteModalState.isOpen} onClose={() => setDeleteModalState(p => ({ ...p, isOpen: false }))} onConfirm={handleConfirmDelete} title="Confirm Deletion">
                Are you sure you want to delete the {deleteModalState.type} "{deleteModalState.name}"? This action cannot be undone.
            </Modal>
            {siteConfigForm.isOpen && siteConfigForm.org && (
                <SiteConfigurationForm 
                    isOpen={siteConfigForm.isOpen} 
                    onClose={() => setSiteConfigForm({ isOpen: false, org: null })} 
                    onSave={async (orgId, data) => {
                        try {
                            await api.saveSiteConfiguration(orgId, data);
                            setSiteConfigs(prev => {
                                const index = prev.findIndex(c => c.organizationId === orgId);
                                if (index > -1) {
                                    const updated = [...prev];
                                    updated[index] = data;
                                    return updated;
                                }
                                return [...prev, data];
                            });
                            setToast({ message: 'Site configuration saved.', type: 'success' });
                            setSiteConfigForm({ isOpen: false, org: null });
                        } catch (error) {
                            setToast({ message: 'Failed to save site configuration.', type: 'error' });
                        }
                    }} 
                    organization={siteConfigForm.org} 
                    allClients={allClients} 
                    initialData={siteConfigs.find(c => c.organizationId === siteConfigForm.org?.id)} 
                />
            )}
            {viewingClients && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" onClick={() => setViewingClients(null)}>
                    <div className="bg-card rounded-xl shadow-card p-6 w-full max-w-md m-4 animate-fade-in-scale" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-primary-text mb-4">Clients in {viewingClients.companyName}</h3>
                        {viewingClients.clients.length > 0 ? (
                            <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                {viewingClients.clients.map(client => (
                                    <li key={client.id} className="text-sm p-2 bg-page rounded-md">{client.name}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-muted text-center py-4">No clients found for this company.</p>
                        )}
                        <div className="mt-6 text-right">
                            <Button onClick={() => setViewingClients(null)} variant="secondary">Close</Button>
                        </div>
                    </div>
                </div>
            )}


            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                <h2 className="text-2xl font-semibold text-primary-text">Client Management</h2>
                {!isMobile && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="outline" onClick={() => setIsInstructionsOpen(true)} className="hover:bg-gray-100"><HelpCircle className="mr-2 h-4 w-4" /> Help</Button>
                        <input type="file" ref={importRef} className="hidden" accept=".csv" onChange={handleImport} />
                        <Button onClick={handleSaveAll} style={{ backgroundColor: '#006B3F', color: '#FFFFFF', borderColor: '#005632' }} className="border hover:opacity-90 text-white shadow-lg hover:shadow-xl transition-all duration-300"><Save className="mr-2 h-4 w-4" /> Save All Changes</Button>
                    </div>
                )}
            </div>

            {isMobile && (
                <div className="flex flex-col gap-3 mb-4">
                    <Button onClick={handleSaveAll} style={{ backgroundColor: '#006B3F', color: '#FFFFFF', borderColor: '#005632' }} className="w-full justify-center border hover:opacity-90 text-white shadow-lg hover:shadow-xl transition-all duration-300"><Save className="mr-2 h-4 w-4" /> Save All Changes</Button>
                    <Button variant="outline" onClick={() => setIsInstructionsOpen(true)} className="w-full justify-center hover:bg-gray-100"><HelpCircle className="mr-2 h-4 w-4" /> Help</Button>
                    <input type="file" ref={importRef} className="hidden" accept=".csv" onChange={handleImport} />
                </div>
            )}

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
                <input
                    type="text"
                    placeholder="Search across all clients and sites..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="form-input !pl-10 w-full"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <nav className="md:col-span-1">
                    {isMobile ? (
                        <Select
                            label="Configuration Section"
                            id="hr-config-select"
                            value={activeSubcategory}
                            onChange={e => setActiveSubcategory(e.target.value)}
                        >
                            {subcategories.map(sc => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
                        </Select>
                    ) : (
                        <div className="space-y-1">
                            {subcategories.map(sc => (
                                <button
                                    key={sc.key}
                                    onClick={() => setActiveSubcategory(sc.key)}
                                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-left transition-colors ${activeSubcategory === sc.key
                                        ? 'text-white'
                                        : 'text-muted hover:bg-accent-light hover:text-accent-dark'
                                        }`}
                                    style={activeSubcategory === sc.key ? { backgroundColor: '#006B3F' } : {}}
                                >
                                    <sc.icon className="h-5 w-5" />
                                    <span>{sc.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </nav>
                <main className="md:col-span-3">
                    {isLoading ? <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto mt-16" /> : renderContent()}
                </main>
            </div>
        </div>
    );
};

export default EntityManagement;