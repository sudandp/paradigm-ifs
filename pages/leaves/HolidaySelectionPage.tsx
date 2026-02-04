import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { api } from '../../services/api';
import { UserHoliday, AttendanceSettings } from '../../types';
import { HOLIDAY_SELECTION_POOL } from '../../utils/constants';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import { ArrowLeft, AlertTriangle, Check, Calendar } from 'lucide-react';

const HolidaySelectionPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [userHolidays, setUserHolidays] = useState<UserHoliday[]>([]);
    const [activeHolidayPool, setActiveHolidayPool] = useState<{ name: string; date: string }[]>([]);
    const [isSavingHolidays, setIsSavingHolidays] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const currentYear = new Date().getFullYear();

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            setIsLoading(true);
            try {
                // Fetch Settings to determine pool
                const settings = await api.getAttendanceSettings();
                
                // Map User Role to Staff Category (office, field, site)
                let staffCategory: keyof AttendanceSettings = 'field';
                // Using the updated logic from LeaveDashboard
                if (['admin', 'hr', 'finance', 'developer', 'management', 'office_staff', 'back_office_staff', 'bd'].includes(user.role)) {
                    staffCategory = 'office';
                } else if (['site_manager', 'site_supervisor'].includes(user.role)) {
                    staffCategory = 'site';
                } else {
                    staffCategory = 'field';
                }

                const userRules = settings[staffCategory];
                
                // Redirect if not enabled
                if (!userRules.enableCustomHolidays) {
                     navigate('/leaves/dashboard');
                     return;
                }

                setActiveHolidayPool(userRules.holidayPool || HOLIDAY_SELECTION_POOL);
                
                const selections = await api.getUserHolidays(user.id);
                setUserHolidays(selections);

            } catch (error) {
                console.error("Failed to load holiday data", error);
                setToast({ message: "Failed to load configuration.", type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [user, navigate]);

    const handleHolidaySelect = (holidayName: string, holidayDate: string) => {
        const isSelected = userHolidays.some(h => h.holidayName === holidayName);
        if (isSelected) {
            setUserHolidays(userHolidays.filter(h => h.holidayName !== holidayName));
        } else {
            if (userHolidays.length >= 5) {
                setToast({ message: 'You can only select up to 5 holidays.', type: 'error' });
                return;
            }
            const newHoliday: UserHoliday = {
                id: `temp-${Date.now()}`,
                userId: user!.id,
                holidayName,
                holidayDate: `${currentYear}${holidayDate}`,
                year: currentYear
            };
            setUserHolidays([...userHolidays, newHoliday]);
        }
    };

    const saveHolidays = async () => {
        if (userHolidays.length !== 5) {
            setToast({ message: 'Please select exactly 5 holidays.', type: 'error' });
            return;
        }
        setIsSavingHolidays(true);
        try {
            await api.saveUserHolidays(user!.id, userHolidays);
            setToast({ message: 'Holidays saved successfully!', type: 'success' });
            // Navigate back after a short delay to show success
            setTimeout(() => {
                navigate('/leaves/dashboard');
            }, 1000);
        } catch (error) {
            setToast({ message: 'Failed to save holidays.', type: 'error' });
            setIsSavingHolidays(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#022c22] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#022c22] text-white p-4 pb-24 md:p-8">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
            
            <div className="max-w-2xl mx-auto space-y-6">
                {/* Header Section */}
                <div>
                    <button 
                        onClick={() => navigate('/leaves/dashboard')} 
                        className="mb-6 inline-flex items-center px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all font-medium text-sm border border-emerald-500/20"
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
                    </button>

                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 hidden md:block">
                             <Calendar className="h-8 w-8 text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-2">Select Your Holidays</h1>
                            <p className="text-emerald-100/60 leading-relaxed">Pick exactly 5 holidays from the list below to complete your annual leave plan.</p>
                        </div>
                    </div>
                </div>

                {/* Progress Card */}
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 sticky top-4 z-10 shadow-xl">
                    <div className="flex items-center gap-3 mb-3">
                        {userHolidays.length === 5 ? (
                            <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                                <Check className="h-5 w-5 text-white" />
                            </div>
                        ) : (
                            <div className="h-8 w-8 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center shrink-0">
                                <span className="text-amber-500 font-bold text-sm">{userHolidays.length}</span>
                            </div>
                        )}
                        <p className={`text-sm font-medium ${userHolidays.length === 5 ? 'text-emerald-400' : 'text-emerald-100'}`}>
                            {userHolidays.length === 5 
                                ? "You have selected 5 of 5 holidays." 
                                : `You have selected ${userHolidays.length} of 5 holidays.`}
                        </p>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-500 ease-out ${userHolidays.length === 5 ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'bg-amber-400'}`}
                            style={{ width: `${(userHolidays.length / 5) * 100}%` }}
                        />
                    </div>
                </div>

                {/* Scrollable Holiday List */}
                <div className="space-y-3">
                    {activeHolidayPool.map((h, i) => {
                        const isSelected = userHolidays.some(uh => uh.holidayName === h.name);
                        return (
                            <button
                                key={i}
                                onClick={() => handleHolidaySelect(h.name, h.date)}
                                className={`w-full relative overflow-hidden group flex items-center justify-between p-4 md:p-5 rounded-xl border transition-all duration-300 text-left
                                    ${isSelected 
                                        ? 'bg-emerald-600 border-emerald-500 shadow-lg shadow-emerald-900/20 translate-x-1' 
                                        : 'bg-[#06392c] border-emerald-500/10 hover:border-emerald-500/30 hover:bg-[#0a4536]'
                                    }
                                `}
                            >
                                {/* Background glow effect for selected item */}
                                {isSelected && <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-transparent pointer-events-none" />}
                                
                                <div className="relative z-10">
                                    <p className={`font-bold text-base md:text-lg mb-1 transition-colors ${isSelected ? 'text-white' : 'text-emerald-50 group-hover:text-white'}`}>
                                        {h.name}
                                    </p>
                                    <p className={`text-xs md:text-sm transition-colors ${isSelected ? 'text-emerald-100' : 'text-emerald-400/60'}`}>
                                        {new Date(`${currentYear}${h.date}`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </p>
                                </div>
                                <div className={`
                                    w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 shrink-0 ml-4
                                    ${isSelected 
                                        ? 'bg-white border-white scale-110' 
                                        : 'bg-transparent border-emerald-500/30 group-hover:border-emerald-500/60'
                                    }
                                `}>
                                    {isSelected && <Check className="h-4 w-4 text-emerald-600 stroke-[3]" />}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Floating Bottom Action Bar */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#022c22] via-[#022c22] to-transparent z-20">
                    <div className="max-w-2xl mx-auto">
                        <Button 
                            onClick={saveHolidays} 
                            isLoading={isSavingHolidays}
                            disabled={userHolidays.length !== 5}
                            className={`w-full py-4 text-lg font-bold shadow-xl transition-all duration-300 rounded-xl
                                ${userHolidays.length === 5 
                                    ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-900/50 hover:shadow-emerald-900/70 hover:-translate-y-1' 
                                    : 'bg-gray-800 text-gray-400 cursor-not-allowed border border-gray-700'
                                }
                            `}
                        >
                            {userHolidays.length === 5 ? 'Confirm Selection' : `${5 - userHolidays.length} more to select`}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HolidaySelectionPage;
