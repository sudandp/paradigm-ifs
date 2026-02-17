import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { ClipboardList, IndianRupee } from 'lucide-react';
import SiteAttendanceTracker from '../billing/SiteAttendanceTracker';
import SiteFinanceTracker from './SiteFinanceTracker';

const FinanceModule: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    
    // Determine active tab based on query param or default
    const queryParams = new URLSearchParams(location.search);
    const initialTab = queryParams.get('tab') || 'attendance';
    const [activeTab, setActiveTab] = useState<string>(initialTab);

    useEffect(() => {
        const tab = queryParams.get('tab') || 'attendance';
        setActiveTab(tab);
    }, [location.search]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        navigate(`/finance?tab=${tab}`, { replace: true });
    };

    return (
        <div className="p-4 md:p-6 space-y-6">
            <AdminPageHeader title="Tracker" />
            
            <div className="border-b border-border">
                <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                    <button 
                        onClick={() => handleTabChange('attendance')} 
                        className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                            activeTab === 'attendance' 
                                ? 'border-accent text-accent-dark' 
                                : 'border-transparent text-muted hover:text-accent-dark hover:border-accent'
                        }`}
                    >
                        <ClipboardList className="h-4 w-4" />
                        Attendance Tracker
                    </button>
                    <button 
                        onClick={() => handleTabChange('site')} 
                        className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                            activeTab === 'site' 
                                ? 'border-accent text-accent-dark' 
                                : 'border-transparent text-muted hover:text-accent-dark hover:border-accent'
                        }`}
                    >
                        <IndianRupee className="h-4 w-4" />
                        Monthly Invoice Tracker
                    </button>
                </nav>
            </div>

            <div className="mt-6">
                {activeTab === 'attendance' ? <SiteAttendanceTracker /> : <SiteFinanceTracker />}
            </div>
        </div>
    );
};

export default FinanceModule;
