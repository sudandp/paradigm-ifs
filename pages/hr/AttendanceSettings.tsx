



import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { Trash2, Plus, Settings, Calendar, Clock, LifeBuoy, Bell, Save, Monitor } from 'lucide-react';
import DatePicker from '../../components/ui/DatePicker';
import Toast from '../../components/ui/Toast';
import Checkbox from '../../components/ui/Checkbox';
import Select from '../../components/ui/Select';
import type { StaffAttendanceRules, AttendanceSettings, RecurringHolidayRule, Role } from '../../types';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { api } from '../../services/api';

const AttendanceSettings: React.FC = () => {
    const { attendance, officeHolidays, fieldHolidays, siteHolidays, recurringHolidays, addHoliday, removeHoliday, addRecurringHoliday, removeRecurringHoliday, updateAttendanceSettings: updateStore } = useSettingsStore();

    const [localAttendance, setLocalAttendance] = useState<AttendanceSettings>(attendance);
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [activeTab, setActiveTab] = useState<'office' | 'field' | 'site' | 'selections'>('office');
    const [newHolidayName, setNewHolidayName] = useState('');
    const [newHolidayDate, setNewHolidayDate] = useState('');
    const [newRecurringN, setNewRecurringN] = useState(3);
    const [newRecurringDay, setNewRecurringDay] = useState('Saturday');
    const [isTriggering, setIsTriggering] = useState(false);
    const [allRoles, setAllRoles] = useState<Role[]>([]);
    const [isLoadingRoles, setIsLoadingRoles] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        const fetchRoles = async () => {
            setIsLoadingRoles(true);
            try {
                const roles = await api.getAppRoles();
                setAllRoles(roles);
            } catch (error) {
                console.error('Failed to fetch roles:', error);
            } finally {
                setIsLoadingRoles(false);
            }
        };
        fetchRoles();
    }, []);

    useEffect(() => {
        setLocalAttendance(attendance);
    }, [attendance]);

    useEffect(() => {
        setIsDirty(JSON.stringify(localAttendance) !== JSON.stringify(attendance));
    }, [localAttendance, attendance]);

    // Load geofencing settings
    // No extra loading here, it's part of attendance settings

    const currentRules = activeTab === 'selections' ? localAttendance.office : localAttendance[activeTab as 'office' | 'field' | 'site'];
    const currentHolidays = activeTab === 'office' ? officeHolidays : activeTab === 'field' ? fieldHolidays : siteHolidays;

    const handleAddHoliday = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newHolidayName && newHolidayDate && activeTab !== 'selections') {
            if (currentHolidays.some(h => h.date === newHolidayDate)) {
                setToast({ message: 'A holiday for this date already exists.', type: 'error' });
                return;
            }
            try {
                await addHoliday(activeTab as 'office' | 'field' | 'site', { name: newHolidayName, date: newHolidayDate });
                setNewHolidayName('');
                setNewHolidayDate('');
                setToast({ message: 'Holiday added successfully.', type: 'success' });
            } catch (error) {
                setToast({ message: 'Failed to add holiday.', type: 'error' });
            }
        } else {
            setToast({ message: 'Please provide both a name and a date.', type: 'error' });
        }
    };

    const handleRemoveHoliday = async (id: string) => {
        if (activeTab !== 'selections') {
            try {
                await removeHoliday(activeTab as 'office' | 'field' | 'site', id);
                setToast({ message: 'Holiday removed successfully.', type: 'success' });
            } catch (error) {
                setToast({ message: 'Failed to remove holiday.', type: 'error' });
            }
        }
    };

    const handleSettingChange = (setting: keyof StaffAttendanceRules, value: any) => {
        if (activeTab === 'selections') return;
        setLocalAttendance(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab as 'office' | 'field' | 'site'],
                [setting]: value
            }
        }));
    };

    const handleTriggerMissedCheckouts = async () => {
        if (!window.confirm('This will record a manual check-out at 7:00 PM for all configured staff who haven\'t checked out today. Continue?')) {
            return;
        }

        setIsTriggering(true);
        try {
            const result = await api.triggerMissedCheckouts();
            setToast({ 
                message: `Successfully triggered missed check-outs for ${result.count} office staff.`, 
                type: 'success' 
            });
        } catch (error) {
            console.error('Failed to trigger missed check-outs:', error);
            setToast({ message: 'Failed to trigger missed check-outs. Please try again.', type: 'error' });
        } finally {
            setIsTriggering(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await api.saveAttendanceSettings(localAttendance);
            
            updateStore(localAttendance);
            setToast({ message: 'Settings saved successfully!', type: 'success' });
        } catch (error) {
            setToast({ message: 'Failed to save settings.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-4 border-0 shadow-none md:bg-card md:p-6 md:rounded-xl md:shadow-card w-full pb-40">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            <AdminPageHeader title="Attendance & Leave Rules">
                <Button onClick={handleSave} isLoading={isSaving} disabled={!isDirty} size="md" className="py-2 px-6">
                    <Save className="mr-2 h-4 w-4" /> Save Rules
                </Button>
            </AdminPageHeader>
            <p className="text-muted -mt-4 mb-6">Set company-wide rules for attendance and leave calculation.</p>


            <div className="mb-6 border-b border-border">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <button onClick={() => setActiveTab('office')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'office' ? 'border-accent text-accent-dark' : 'border-transparent text-muted hover:text-accent-dark hover:border-accent'}`}>
                        Office Staff
                    </button>
                    <button onClick={() => setActiveTab('field')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'field' ? 'border-accent text-accent-dark' : 'border-transparent text-muted hover:text-accent-dark hover:border-accent'}`}>
                        Field Staff
                    </button>
                    <button onClick={() => setActiveTab('site')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'site' ? 'border-accent text-accent-dark' : 'border-transparent text-muted hover:text-accent-dark hover:border-accent'}`}>
                        Site Staff
                    </button>
                    <button onClick={() => setActiveTab('selections')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'selections' ? 'border-accent text-accent-dark' : 'border-transparent text-muted hover:text-accent-dark hover:border-accent'}`}>
                        Staff Selections
                    </button>
                </nav>
            </div>

            {activeTab === 'office' && <p className="text-sm text-muted -mt-4 mb-4">These rules apply to Admin, HR, and Finance roles.</p>}
            {activeTab === 'field' && <p className="text-sm text-muted -mt-4 mb-4">These rules apply to Field Staff roles.</p>}
            {activeTab === 'site' && <p className="text-sm text-muted -mt-4 mb-4">These rules apply to Site Staff (e.g. Site Managers, Security Guards).</p>}
            {activeTab === 'selections' && <p className="text-sm text-muted -mt-4 mb-4">Select staff groups to include in automated actions like missed check-out triggers.</p>}


            <div className="space-y-6">
                {activeTab !== 'selections' && (
                <>
                <section>
                    <h3 className="text-lg font-semibold text-primary-text mb-4 flex items-center"><Clock className="mr-2 h-5 w-5 text-muted" />Work Hours</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <Input
                            label="Minimum Hours for Full Day"
                            id="minHoursFull"
                            type="number"
                            value={currentRules.minimumHoursFullDay}
                            onChange={(e) => handleSettingChange('minimumHoursFullDay', parseFloat(e.target.value) || 0)}
                        />
                        <Input
                            label="Minimum Hours for Half Day"
                            id="minHoursHalf"
                            type="number"
                            value={currentRules.minimumHoursHalfDay}
                            onChange={(e) => handleSettingChange('minimumHoursHalfDay', parseFloat(e.target.value) || 0)}
                        />
                    </div>
                </section>

                {/* Device Limits Section */}
                <section className="pt-6 border-t border-border">
                    <h3 className="text-lg font-semibold text-primary-text mb-4 flex items-center">
                        <Monitor className="mr-2 h-5 w-5 text-muted" />Device Limits
                    </h3>
                    <p className="text-sm text-muted mb-4">
                        Set the maximum number of devices an employee can use to access the application. 
                        Exceeding these limits will require admin/HR approval.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <Input
                            label="Web Sessions"
                            id="limitWeb"
                            type="number"
                            min="0"
                            value={currentRules.deviceLimits?.web ?? 1}
                            onChange={(e) => handleSettingChange('deviceLimits', { 
                                ...currentRules.deviceLimits, 
                                web: parseInt(e.target.value) || 0 
                            })}
                            description="Max allowed browsers"
                        />
                        <Input
                            label="Android Devices"
                            id="limitAndroid"
                            type="number"
                            min="0"
                            value={currentRules.deviceLimits?.android ?? 1}
                            onChange={(e) => handleSettingChange('deviceLimits', { 
                                ...currentRules.deviceLimits, 
                                android: parseInt(e.target.value) || 0 
                            })}
                        />
                        <Input
                            label="iOS Devices"
                            id="limitIos"
                            type="number"
                            min="0"
                            value={currentRules.deviceLimits?.ios ?? 1}
                            onChange={(e) => handleSettingChange('deviceLimits', { 
                                ...currentRules.deviceLimits, 
                                ios: parseInt(e.target.value) || 0 
                            })}
                        />
                    </div>
                </section>

                    {/* Fixed Office Hours - Not applicable for Field Staff */}
                    {activeTab !== 'field' && (
                    <section className="pt-6 border-t border-border">
                        <h3 className="text-lg font-semibold text-primary-text mb-4 flex items-center"><Clock className="mr-2 h-5 w-5 text-muted" />Fixed Office Hours</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
                            <Input
                                label="Check-in Start Time"
                                id="checkInTime"
                                type="time"
                                value={currentRules.fixedOfficeHours?.checkInTime || '09:00'}
                                onChange={(e) => handleSettingChange('fixedOfficeHours', { ...currentRules.fixedOfficeHours, checkInTime: e.target.value })}
                            />
                            <Input
                                label="Check-out End Time"
                                id="checkOutTime"
                                type="time"
                                value={currentRules.fixedOfficeHours?.checkOutTime || '18:00'}
                                onChange={(e) => handleSettingChange('fixedOfficeHours', { ...currentRules.fixedOfficeHours, checkOutTime: e.target.value })}
                            />
                            <Input
                                label="Min Daily Hours"
                                id="minDailyHours"
                                type="number"
                                value={currentRules.dailyWorkingHours?.min || 7}
                                onChange={(e) => handleSettingChange('dailyWorkingHours', { ...currentRules.dailyWorkingHours, min: parseFloat(e.target.value) || 7 })}
                            />
                            <Input
                                label="Max Daily Hours"
                                id="maxDailyHours"
                                type="number"
                                value={currentRules.dailyWorkingHours?.max || 9}
                                onChange={(e) => handleSettingChange('dailyWorkingHours', { ...currentRules.dailyWorkingHours, max: parseFloat(e.target.value) || 9 })}
                            />
                        </div>
                    </section>
                    )}

                    {/* Site & Travel Tracking - Only for Field Staff */}
                    {activeTab === 'field' && (
                    <section className="pt-6 border-t border-border">
                        <h3 className="text-lg font-semibold text-primary-text mb-4 flex items-center">
                            <Clock className="mr-2 h-5 w-5 text-muted" />
                            Site & Travel Time Tracking
                        </h3>
                        <div className="mb-4">
                            <Checkbox
                                id="enableSiteTimeTracking"
                                label="Enable Site/Travel Time Validation"
                                description="Track and validate the percentage of time field staff spend on-site vs traveling"
                                checked={currentRules.enableSiteTimeTracking || false}
                                onChange={(e) => handleSettingChange('enableSiteTimeTracking', e.target.checked)}
                            />
                        </div>
                        {currentRules.enableSiteTimeTracking && (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
                                    <Input
                                        label="Minimum Site Time (%)"
                                        id="minimumSitePercentage"
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={currentRules.minimumSitePercentage || 75}
                                        onChange={(e) => handleSettingChange('minimumSitePercentage', parseFloat(e.target.value) || 75)}
                                    />
                                    <Input
                                        label="Maximum Travel Time (%)"
                                        id="maximumTravelPercentage"
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={currentRules.maximumTravelPercentage || 25}
                                        onChange={(e) => handleSettingChange('maximumTravelPercentage', parseFloat(e.target.value) || 25)}
                                    />
                                </div>
                                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                    <p className="text-sm text-blue-400 mb-2">
                                        <strong>How it works:</strong>
                                    </p>
                                    <ul className="text-sm text-blue-400 space-y-1 list-disc list-inside">
                                        <li><strong>Site Time:</strong> Sum of all (check-out - check-in) durations at each site location</li>
                                        <li><strong>Travel Time:</strong> Time between sites (site checkout → next site check-in)</li>
                                        <li><strong>Example:</strong> 8 hrs total → 6 hrs on-site (75%) + 2 hrs travel (25%) = Present</li>
                                        <li><strong>Violation:</strong> If site time falls below {currentRules.minimumSitePercentage || 75}%, a violation is created and the reporting manager is notified</li>
                                        <li><strong>Grant Attendance:</strong> Manager acknowledgment of violation grants (P) Present status for the day</li>
                                    </ul>
                                </div>
                            </>
                        )}
                    </section>
                    )}


                    <section className="pt-6 border-t border-border">
                        <h3 className="text-lg font-semibold text-primary-text mb-4 flex items-center"><Clock className="mr-2 h-5 w-5 text-muted" />Break Tracking</h3>
                        <div className="space-y-4">
                            <Checkbox
                                id="enableBreakTracking"
                                label="Enable Break Tracking"
                                description="Allow employees to record lunch breaks. Working hours will exclude break time."
                                checked={currentRules.enableBreakTracking || false}
                                onChange={(e) => handleSettingChange('enableBreakTracking', e.target.checked)}
                            />
                            {currentRules.enableBreakTracking && (
                                <Input
                                    label="Standard Lunch Break Duration (minutes)"
                                    id="lunchBreakDuration"
                                    type="number"
                                    value={currentRules.lunchBreakDuration || 60}
                                    onChange={(e) => handleSettingChange('lunchBreakDuration', parseInt(e.target.value, 10) || 60)}
                                />
                            )}
                        </div>
                    </section>


                <section className="pt-6 border-t border-border">
                    <h3 className="text-lg font-semibold text-primary-text mb-4 flex items-center"><LifeBuoy className="mr-2 h-5 w-5 text-muted" />Leave Allocation</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <Input
                            label="Annual Earned Leaves"
                            id="annualEarnedLeaves"
                            type="number"
                            value={currentRules.annualEarnedLeaves}
                            onChange={(e) => handleSettingChange('annualEarnedLeaves', parseInt(e.target.value, 10) || 0)}
                            description="Base annual quota if dynamic accrual is disabled."
                        />
                        <Input
                            label="Annual Sick Leaves"
                            id="annualSickLeaves"
                            type="number"
                            value={currentRules.annualSickLeaves}
                            onChange={(e) => handleSettingChange('annualSickLeaves', parseInt(e.target.value, 10) || 0)}
                        />
                        <Input
                            label="Monthly Floating Holidays"
                            id="monthlyFloatingLeaves"
                            type="number"
                            value={currentRules.monthlyFloatingLeaves}
                            onChange={(e) => handleSettingChange('monthlyFloatingLeaves', parseInt(e.target.value, 10) || 0)}
                        />
                    </div>

                    <div className="mt-8 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                        <h4 className="text-sm font-semibold text-emerald-600 mb-4 flex items-center">
                            <Settings className="mr-2 h-4 w-4" /> Earned Leave Accrual Rule
                        </h4>
                        <div className="flex flex-col gap-4">
                            <Checkbox
                                id="enableAccrual"
                                label="Enable Dynamic Accrual"
                                description="Automatically calculate earned leave based on attendance history."
                                checked={!!currentRules.earnedLeaveAccrual}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        handleSettingChange('earnedLeaveAccrual', { daysRequired: 10, amountEarned: 0.5 });
                                    } else {
                                        handleSettingChange('earnedLeaveAccrual', undefined);
                                    }
                                }}
                            />
                            
                            {currentRules.earnedLeaveAccrual && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pl-8">
                                    <Input
                                        label="Days Required"
                                        type="number"
                                        value={currentRules.earnedLeaveAccrual.daysRequired}
                                        onChange={(e) => handleSettingChange('earnedLeaveAccrual', {
                                            ...currentRules.earnedLeaveAccrual,
                                            daysRequired: parseFloat(e.target.value) || 10
                                        })}
                                        description="Countable days (Worked + Holiday + Weekoff)"
                                    />
                                    <Input
                                        label="Leave Earned (Days)"
                                        type="number"
                                        step="0.1"
                                        value={currentRules.earnedLeaveAccrual.amountEarned}
                                        onChange={(e) => handleSettingChange('earnedLeaveAccrual', {
                                            ...currentRules.earnedLeaveAccrual,
                                            amountEarned: parseFloat(e.target.value) || 0.5
                                        })}
                                        description="Amount of leave granted per period"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
                        <Input
                            label="Annual Compensatory Off"
                            id="annualCompOffLeaves"
                            type="number"
                            value={currentRules.annualCompOffLeaves}
                            onChange={(e) => handleSettingChange('annualCompOffLeaves', parseInt(e.target.value, 10) || 0)}
                        />
                        <Input
                            label="Sick Leave Cert. After (Days)"
                            id="sickLeaveCertThreshold"
                            type="number"
                            value={currentRules.sickLeaveCertificateThreshold}
                            onChange={(e) => handleSettingChange('sickLeaveCertificateThreshold', parseInt(e.target.value, 10) || 0)}
                            title="Require a doctor's certificate if total sick leave taken exceeds this number of days."
                        />
                    </div>
                </section>

                <section className="pt-6 border-t border-border">
                    <h3 className="text-lg font-semibold text-primary-text mb-4 flex items-center"><Bell className="mr-2 h-5 w-5 text-muted" />Notifications</h3>
                    <Checkbox
                        id="attendance-notifications"
                        label="Enable Check-in/Check-out Notifications"
                        description="Send a notification to Site Managers, Ops Managers, and HR when a Field Staff checks in or out."
                        checked={currentRules.enableAttendanceNotifications}
                        onChange={(e) => handleSettingChange('enableAttendanceNotifications', e.target.checked)}
                    />
                </section>

                <section className="pt-6 border-t border-border">
                    <h3 className="text-lg font-semibold text-primary-text mb-4 flex items-center"><Settings className="mr-2 h-5 w-5 text-muted" />Geofencing Verification</h3>
                    <div className="space-y-4">
                        <Checkbox
                            id="geofencing-verification"
                            label="Enable Geofencing Verification"
                            description={
                                activeTab === 'office' 
                                    ? "Verify office staff are at PIFS Bangalore office (100m radius) during check-in/out. Violations are tracked and salary may be withheld."
                                    : activeTab === 'field'
                                        ? "Verify field staff are at their assigned location during check-in/out. Violations are tracked and salary may be withheld after exceeding the limit."
                                        : "Verify site staff are at their assigned site during check-in/out. Geofencing is strictly enforced."
                            }
                            checked={currentRules.geofencingEnabled}
                            onChange={(e) => handleSettingChange('geofencingEnabled', e.target.checked)}
                        />
                        <Input
                            label="Maximum Violations Per Month"
                            id="maxViolations"
                            type="number"
                            value={currentRules.maxViolationsPerMonth}
                            onChange={(e) => handleSettingChange('maxViolationsPerMonth', parseInt(e.target.value) || 3)}
                            title="After this many violations in a month, salary will be put on hold"
                        />
                    </div>
                </section>

                <section className="pt-6 border-t border-border">
                    <h3 className="text-lg font-semibold text-primary-text mb-4 flex items-center"><Calendar className="mr-2 h-5 w-5 text-muted" />Recurring Holidays</h3>
                    <div className="p-4 bg-page rounded-lg">
                        <h4 className="font-semibold mb-2">Add Recurring Holiday</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                            <Select label="Occurrence" value={newRecurringN} onChange={e => setNewRecurringN(parseInt(e.target.value))}>
                                <option value={1}>1st</option>
                                <option value={2}>2nd</option>
                                <option value={3}>3rd</option>
                                <option value={4}>4th</option>
                                <option value={5}>5th</option>
                            </Select>
                            <Select label="Day" value={newRecurringDay} onChange={e => setNewRecurringDay(e.target.value)}>
                                <option value="Monday">Monday</option>
                                <option value="Tuesday">Tuesday</option>
                                <option value="Wednesday">Wednesday</option>
                                <option value="Thursday">Thursday</option>
                                <option value="Friday">Friday</option>
                                <option value="Saturday">Saturday</option>
                                <option value="Sunday">Sunday</option>
                            </Select>
                            <Button 
                                type="button" 
                                onClick={async () => {
                                    try {
                                        await addRecurringHoliday({
                                            day: newRecurringDay as any,
                                            n: newRecurringN,
                                            type: activeTab as 'office' | 'field' | 'site'
                                        });
                                        setToast({ message: 'Recurring holiday added successfully.', type: 'success' });
                                    } catch (error) {
                                        setToast({ message: 'Failed to add recurring holiday.', type: 'error' });
                                    }
                                }} 
                                className="w-full sm:w-auto h-[46px] px-6 text-sm"
                            >
                                <Plus className="mr-2 h-4 w-4" /> Add Rule
                            </Button>
                        </div>
                    </div>
                    <div className="mt-4 space-y-2">
                        {recurringHolidays
                            .filter(rule => (rule.type || 'office') === activeTab)
                            .map((rule, index) => (
                                <div key={rule.id || index} className="flex justify-between items-start p-4 pr-6 border border-white/10 rounded-lg bg-white/5 mb-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-primary-text truncate">{rule.n === 1 ? '1st' : rule.n === 2 ? '2nd' : rule.n === 3 ? '3rd' : rule.n + 'th'} {rule.day}</p>
                                        <p className="text-sm text-muted">Repeats every month</p>
                                    </div>
                                    <div className="ml-4 shrink-0">
                                        <Button variant="icon" onClick={async () => {
                                            if (rule.id) {
                                                try {
                                                    await removeRecurringHoliday(rule.id);
                                                    setToast({ message: 'Recurring holiday removed successfully.', type: 'success' });
                                                } catch (error) {
                                                    setToast({ message: 'Failed to remove recurring holiday.', type: 'error' });
                                                }
                                            }
                                        }} className="p-2 hover:bg-red-500/10 rounded-full transition-colors">
                                            <Trash2 className="h-5 w-5 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        {recurringHolidays.filter(rule => (rule.type || 'office') === (activeTab as any)).length === 0 && (
                            <p className="text-center text-muted py-4">No recurring holidays configured.</p>
                        )}
                    </div>
                </section>

                <section className="pt-6 border-t border-border">
                    <h3 className="text-lg font-semibold text-primary-text mb-4 flex items-center"><Calendar className="mr-2 h-5 w-5 text-muted" />Holiday List</h3>
                    <div className="p-4 bg-page rounded-lg">
                        <h4 className="font-semibold mb-2">Add New Holiday</h4>
                        {activeTab === 'office' && currentRules.maxHolidaysPerCategory && (
                            <div className="mb-3 text-sm text-muted">
                                <span className="font-medium">Holidays: {currentHolidays.length} / {currentRules.maxHolidaysPerCategory || 12}</span>
                                {currentHolidays.length >= (currentRules.maxHolidaysPerCategory || 12) && (
                                    <span className="ml-2 text-red-500">Maximum limit reached</span>
                                )}
                            </div>
                        )}
                        <form onSubmit={handleAddHoliday} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                            <Input label="Holiday Name" id="holidayName" value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} />
                            <DatePicker label="Date" id="holidayDate" value={newHolidayDate} onChange={setNewHolidayDate} />
                            <Button 
                                type="submit" 
                                className="w-full sm:w-auto h-[46px] px-8 text-sm"
                                disabled={activeTab === 'office' && currentHolidays.length >= (currentRules.maxHolidaysPerCategory || 12)}
                            >
                                <Plus className="mr-2 h-4 w-4" /> Add
                            </Button>
                        </form>
                    </div>
                    <div className="mt-4 space-y-2">
                        {currentHolidays.length > 0 ? (
                            currentHolidays.map(holiday => (
                                <div key={holiday.id} className="flex justify-between items-start p-4 pr-6 border border-white/10 rounded-lg bg-white/5 mb-2">
                                    <div className="flex-1 min-w-0">
                                    <p className="font-medium text-primary-text truncate">{holiday.name}</p>
                                    <p className="text-sm text-muted">{new Date(holiday.date.replace(/-/g, '/')).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                </div>
                                <div className="ml-4 shrink-0">
                                    <Button variant="outline" size="sm" onClick={() => handleRemoveHoliday(holiday.id)} className="p-2 border-red-500/20 hover:bg-red-500/10 rounded-full transition-colors">
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-center text-muted py-4">No holidays added yet for {activeTab} staff.</p>
                    )}
                </div>
            </section>
            </>
            )}

                {/* Staff Selections Tab */}
                {(activeTab as string) === 'selections' && (
                <section className="space-y-8">
                    <div>
                        <h3 className="text-lg font-semibold text-primary-text mb-4 flex items-center"><Settings className="mr-2 h-5 w-5 text-muted" />Missed Check-out Configuration</h3>
                        
                        <div className="mb-8">
                            <h4 className="text-sm font-medium text-muted mb-3 uppercase tracking-wider">1. Select Active Categories</h4>
                            <p className="text-sm text-muted mb-4">Choose which staff categories should be included in the "Trigger Missed Check-outs" action.</p>
                            <div className="flex flex-wrap gap-6 p-4 bg-page rounded-lg border border-border/50">
                                <Checkbox
                                    id="cat-office"
                                    label="Office Staff"
                                    checked={localAttendance.missedCheckoutConfig?.enabledGroups?.includes('office') ?? true}
                                    onChange={(e) => {
                                        const current = localAttendance.missedCheckoutConfig?.enabledGroups || ['office'];
                                        const updated = e.target.checked 
                                            ? [...new Set([...current, 'office' as const])]
                                            : current.filter(g => g !== 'office');
                                        setLocalAttendance(prev => ({ 
                                            ...prev, 
                                            missedCheckoutConfig: { 
                                                ...(prev.missedCheckoutConfig || { enabledGroups: ['office'] }),
                                                enabledGroups: updated 
                                            } 
                                        }));
                                    }}
                                />
                                <Checkbox
                                    id="cat-field"
                                    label="Field Staff"
                                    checked={localAttendance.missedCheckoutConfig?.enabledGroups?.includes('field') ?? false}
                                    onChange={(e) => {
                                        const current = localAttendance.missedCheckoutConfig?.enabledGroups || ['office'];
                                        const updated = e.target.checked 
                                            ? [...new Set([...current, 'field' as const])]
                                            : current.filter(g => g !== 'field');
                                        setLocalAttendance(prev => ({ 
                                            ...prev, 
                                            missedCheckoutConfig: { 
                                                ...(prev.missedCheckoutConfig || { enabledGroups: ['office'] }),
                                                enabledGroups: updated 
                                            } 
                                        }));
                                    }}
                                />
                                <Checkbox
                                    id="cat-site"
                                    label="Site Staff"
                                    checked={localAttendance.missedCheckoutConfig?.enabledGroups?.includes('site') ?? false}
                                    onChange={(e) => {
                                        const current = localAttendance.missedCheckoutConfig?.enabledGroups || ['office'];
                                        const updated = e.target.checked 
                                            ? [...new Set([...current, 'site' as const])]
                                            : current.filter(g => g !== 'site');
                                        setLocalAttendance(prev => ({ 
                                            ...prev, 
                                            missedCheckoutConfig: { 
                                                ...(prev.missedCheckoutConfig || { enabledGroups: ['office'] }),
                                                enabledGroups: updated 
                                            } 
                                        }));
                                    }}
                                />
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-medium text-muted mb-3 uppercase tracking-wider">2. Manage Category Roles</h4>
                            <p className="text-sm text-muted mb-4">Assign individual roles to each category. Based on these selections, employees will be processed as Office, Field, or Site staff.</p>
                            
                            {isLoadingRoles ? (
                                <div className="p-8 text-center text-muted bg-page rounded-lg border border-border/50">
                                    <Clock className="animate-spin h-5 w-5 mx-auto mb-2 opacity-50" />
                                    Loading available roles...
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {(['office', 'field', 'site'] as const).map(group => {
                                        const groupRoles = localAttendance.missedCheckoutConfig?.roleMapping?.[group] || 
                                            (group === 'office' ? ['admin', 'hr', 'finance', 'developer'] : 
                                             group === 'field' ? ['field_staff', 'field_officer'] : 
                                             ['site_manager', 'security_guard', 'supervisor']);
                                        
                                        return (
                                            <div key={group} className="bg-page rounded-lg border border-border/50 flex flex-col h-full">
                                                <div className="p-3 border-b border-border/30 bg-white/5 flex justify-between items-center">
                                                    <span className="text-sm font-semibold uppercase tracking-tight">{group} Staff Roles</span>
                                                    <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">{groupRoles.length}</span>
                                                </div>
                                                <div className="p-3 flex-1 space-y-2 max-h-[300px] overflow-y-auto">
                                                    {groupRoles.map(roleId => {
                                                        const role = allRoles.find(r => r.id === roleId);
                                                        return (
                                                            <div key={roleId} className="flex items-center justify-between p-2 bg-white/5 rounded border border-border/10 group">
                                                                <span className="text-xs truncate" title={roleId}>{role?.displayName || roleId}</span>
                                                                <button 
                                                                    onClick={() => {
                                                                        const mapping = localAttendance.missedCheckoutConfig?.roleMapping || { office: ['admin', 'hr', 'finance', 'developer'], field: ['field_staff', 'field_officer'], site: ['site_manager', 'security_guard', 'supervisor'] };
                                                                        const updatedGroup = groupRoles.filter(r => r !== roleId);
                                                                        setLocalAttendance(prev => ({
                                                                            ...prev,
                                                                            missedCheckoutConfig: {
                                                                                ...(prev.missedCheckoutConfig || { enabledGroups: ['office'] }),
                                                                                roleMapping: { ...mapping, [group]: updatedGroup }
                                                                            }
                                                                        }));
                                                                    }}
                                                                    className="text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                    {groupRoles.length === 0 && (
                                                        <p className="text-[11px] text-muted text-center py-4 italic">No roles assigned</p>
                                                    )}
                                                </div>
                                                <div className="p-3 border-t border-border/30 bg-white/5">
                                                    <select 
                                                        className="w-full bg-transparent border border-border/50 rounded p-1 text-xs text-primary-text outline-none focus:border-primary/50"
                                                        value=""
                                                        onChange={(e) => {
                                                            if (!e.target.value) return;
                                                            const roleId = e.target.value;
                                                            const mapping = localAttendance.missedCheckoutConfig?.roleMapping || { office: ['admin', 'hr', 'finance', 'developer'], field: ['field_staff', 'field_officer'], site: ['site_manager', 'security_guard', 'supervisor'] };
                                                            const updatedGroup = [...new Set([...groupRoles, roleId])];
                                                            setLocalAttendance(prev => ({
                                                                ...prev,
                                                                missedCheckoutConfig: {
                                                                    ...(prev.missedCheckoutConfig || { enabledGroups: ['office'] }),
                                                                    roleMapping: { ...mapping, [group]: updatedGroup }
                                                                }
                                                            }));
                                                        }}
                                                    >
                                                        <option value="" disabled className="bg-page">Assign Role...</option>
                                                        {allRoles
                                                            .filter(r => !groupRoles.includes(r.id))
                                                            .map(role => (
                                                                <option key={role.id} value={role.id} className="bg-page">{role.displayName || role.id}</option>
                                                            ))}
                                                    </select>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                        <div className="pt-6 border-t border-border/50">
                            <h4 className="text-sm font-semibold text-primary-text mb-2">Automated Actions</h4>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mb-4">
                                <p className="text-xs text-emerald-500 font-medium flex items-center">
                                    <Clock className="h-3 w-3 mr-1.5" />
                                    Auto-Checkout Active
                                </p>
                                <p className="text-xs text-muted mt-1">
                                    The system automatically checks out eligible staff at your configured <strong>Check-out End Time</strong> (currently {localAttendance.office.fixedOfficeHours?.checkOutTime || '19:00'}).
                                    This check runs every 15 minutes. You can also use the button below to manually run the trigger immediately for testing or overrides.
                                </p>
                            </div>
                            <Button 
                                variant="outline" 
                                onClick={handleTriggerMissedCheckouts} 
                                isLoading={isTriggering}
                                className="border-red-500/30 hover:bg-red-500/10 text-red-400"
                                disabled={!localAttendance.missedCheckoutConfig?.enabledGroups?.length}
                            >
                                <Clock className="mr-2 h-4 w-4" /> Run Manual Trigger Now
                            </Button>
                        </div>
                    </section>
                    )}
            </div>
        </div>
    );
};

export default AttendanceSettings;