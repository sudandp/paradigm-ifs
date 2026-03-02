import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { api } from '../../services/api';
import { FIXED_HOLIDAYS, HOLIDAY_SELECTION_POOL } from '../../utils/constants';
import { useDevice } from '../../hooks/useDevice';
import Button from '../../components/ui/Button';
import { Calendar as CalendarIcon, Check, ChevronLeft, Info, Loader2, Save } from 'lucide-react';
import Toast from '../../components/ui/Toast';
import HolidayCalendar from './HolidayCalendar';
import type { UserHoliday, Holiday, StaffAttendanceRules } from '../../types';

const HolidaySelectionPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const { attendance, officeHolidays, fieldHolidays, siteHolidays } = useSettingsStore();
    const { isMobile } = useDevice();
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [userHolidays, setUserHolidays] = useState<UserHoliday[]>([]);
    const [selectedHolidays, setSelectedHolidays] = useState<{ name: string; date: string }[]>([]);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const currentYear = new Date().getFullYear();
    const userRole = user?.role?.toLowerCase();
    const category = userRole?.includes('field') ? 'field' : userRole?.includes('site') ? 'site' : 'office';
    const rules = attendance[category as 'office' | 'field' | 'site'] as StaffAttendanceRules;
    
    const holidayPool = rules?.holidayPool || HOLIDAY_SELECTION_POOL;
    const maxEmployeeHolidays = 6;

    useEffect(() => {
        const fetchUserHolidays = async () => {
            if (!user?.id) return;
            setIsLoading(true);
            try {
                const holidays = await api.getUserHolidays(user.id);
                setUserHolidays(holidays);
                setSelectedHolidays(holidays.map(h => ({ name: h.holidayName, date: h.holidayDate })));
            } catch (error) {
                console.error('Failed to fetch user holidays:', error);
                setToast({ message: 'Failed to load your holiday selections.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserHolidays();
    }, [user?.id]);

    const toggleHoliday = (name: string, date: string) => {
        const isSelected = selectedHolidays.some(h => h.name === name);
        if (isSelected) {
            setSelectedHolidays(selectedHolidays.filter(h => h.name !== name));
        } else {
            if (selectedHolidays.length >= maxEmployeeHolidays) {
                setToast({ message: `You can only select up to ${maxEmployeeHolidays} holidays.`, type: 'error' });
                return;
            }
            setSelectedHolidays([...selectedHolidays, { name, date }]);
        }
    };

    const handleSave = async () => {
        if (selectedHolidays.length !== maxEmployeeHolidays) {
            setToast({ message: `Please select exactly ${maxEmployeeHolidays} holidays.`, type: 'error' });
            return;
        }

        if (!user?.id) return;

        setIsSaving(true);
        try {
            const holidaysToSave = selectedHolidays.map(h => ({
                holidayName: h.name,
                holidayDate: h.date.startsWith('-') ? `${currentYear}${h.date}` : h.date,
                year: currentYear
            }));
            await api.saveUserHolidays(user.id, holidaysToSave);
            setToast({ message: 'Holiday selection saved successfully!', type: 'success' });
            setTimeout(() => navigate('/leaves/dashboard'), 1500);
        } catch (error) {
            console.error('Failed to save holidays:', error);
            setToast({ message: 'Failed to save holiday selection.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-accent mb-4" />
                <p className="text-muted">Loading holiday pool...</p>
            </div>
        );
    }

    const storeHolidays = category === 'field' ? fieldHolidays : category === 'site' ? siteHolidays : officeHolidays;
    
    // Prepare holidays for calendar view
    const adminHolidays: Holiday[] = [
        ...FIXED_HOLIDAYS.map(fh => ({
            id: `fixed-${fh.date}`,
            name: fh.name,
            date: `${currentYear}-${fh.date}`,
            type: category as any
        })),
        ...storeHolidays.filter(h => !FIXED_HOLIDAYS.some(fh => fh.name === h.name))
    ];

    const calendarUserHolidays = selectedHolidays.map(h => ({
        id: `user-${h.name}`,
        holidayName: h.name,
        holidayDate: `${currentYear}${h.date}`, // Convert -MM-DD to YYYY-MM-DD
        userId: user?.id || '',
        year: currentYear
    }));

    return (
        <div className="p-4 md:p-6 pb-32">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
            
            <div className="flex items-center gap-4 mb-8">
            {isMobile && (
                <Button variant="secondary" size="md" onClick={() => navigate('/leaves/dashboard')} className="p-2 rounded-full h-10 w-10 flex items-center justify-center">
                    <ChevronLeft className="h-6 w-6" />
                </Button>
            )}
                <div>
                    <h1 className="text-2xl font-bold text-primary-text">Holiday Selection</h1>
                    <p className="text-muted">Pick your optional holidays for {currentYear}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Selection Section */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-card rounded-2xl p-6 shadow-card border border-border">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <CalendarIcon className="h-5 w-5 text-accent" />
                                Available Holidays
                            </h2>
                            <div className={`px-4 py-1 rounded-full text-sm font-medium ${selectedHolidays.length === maxEmployeeHolidays ? 'bg-emerald-500/10 text-emerald-500' : 'bg-accent/10 text-accent'}`}>
                                {selectedHolidays.length} / {maxEmployeeHolidays} Selected
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            {[...holidayPool].sort((a, b) => a.date.localeCompare(b.date)).map((holiday, index) => {
                                const isSelected = selectedHolidays.some(h => h.name === holiday.name);
                                const dateObj = new Date(`${currentYear}${holiday.date}`);
                                const formattedDate = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });

                                return (
                                    <button
                                        key={index}
                                        onClick={() => toggleHoliday(holiday.name, holiday.date)}
                                        className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 text-left ${
                                            isSelected 
                                            ? 'bg-accent/10 border-accent shadow-sm' 
                                            : 'bg-transparent border-border hover:border-accent/50 hover:bg-white/5'
                                        }`}
                                    >
                                        <div>
                                            <p className={`text-xl font-semibold ${isMobile ? 'text-white' : 'text-primary-text'}`}>{holiday.name}</p>
                                            <p className={`text-base font-bold ${isMobile ? 'text-white/70' : 'text-muted'} mt-1`}>{formattedDate}</p>
                                        </div>
                                        <div className={`h-6 w-6 rounded-full flex items-center justify-center border transition-colors ${
                                            isSelected 
                                            ? 'bg-accent border-accent text-white' 
                                            : 'border-border bg-card'
                                        }`}>
                                            {isSelected && <Check className="h-4 w-4" />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-border">
                            <p className="text-sm text-muted flex items-center gap-2">
                                <Info className="h-4 w-4" />
                                Please select exactly {maxEmployeeHolidays} holidays from the pool.
                            </p>
                            <Button 
                                onClick={handleSave} 
                                isLoading={isSaving} 
                                disabled={selectedHolidays.length !== maxEmployeeHolidays}
                                className="w-full md:w-auto px-12 py-3 shadow-lg shadow-accent/20"
                            >
                                <Save className="mr-2 h-5 w-5" />
                                Save Selection
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Preview Section */}
                <div className="space-y-6">
                    <div className="sticky top-6">
                        <h3 className="text-lg font-semibold mb-4 px-1">Calendar Preview</h3>
                        <HolidayCalendar 
                            adminHolidays={adminHolidays}
                            userSelectedHolidays={calendarUserHolidays}
                        />
                        <div className="mt-6 p-4 bg-accent/5 border border-accent/10 rounded-xl space-y-3">
                            <h4 className="text-sm font-semibold text-accent-dark">Legend</h4>
                            <div className="flex items-center gap-3 text-sm">
                                <div className="h-3 w-3 rounded-full bg-red-500"></div>
                                <span className="text-muted">Company Holiday</span>
                            </div>
                            <div className={`flex items-center gap-3 text-sm transition-opacity ${selectedHolidays.length > 0 ? 'opacity-100' : 'opacity-50'}`}>
                                <div className="h-3 w-3 rounded-full bg-emerald-500"></div>
                                <span className="text-muted">Your Selection</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HolidaySelectionPage;
