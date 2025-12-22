import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import { LogIn, LogOut } from 'lucide-react';

const AttendanceActionPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { toggleCheckInStatus, isCheckedIn } = useAuthStore();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Determine action from URL
    const isCheckIn = location.pathname.includes('check-in');
    const action = isCheckIn ? 'Check In' : 'Check Out';
    const Icon = isCheckIn ? LogIn : LogOut;
    const iconBgColor = isCheckIn ? 'bg-emerald-100' : 'bg-red-100';
    const iconColor = isCheckIn ? 'text-emerald-600' : 'text-red-600';

    const handleConfirm = async () => {
        setIsSubmitting(true);
        const { success, message } = await toggleCheckInStatus();
        setToast({ message, type: success ? 'success' : 'error' });
        setIsSubmitting(false);

        if (success) {
            // Wait a moment to show the success toast, then navigate back
            setTimeout(() => {
                navigate('/profile', { replace: true });
            }, 1500);
        }
    };

    const handleCancel = () => {
        navigate(-1);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

            <div className="w-full max-w-md bg-card rounded-2xl shadow-card p-8 text-center relative z-10">
                <div className="flex justify-center mb-6">
                    <div className={`p-4 rounded-full ${iconBgColor}`}>
                        <Icon className={`h-10 w-10 ${iconColor}`} />
                    </div>
                </div>

                <h1 className="text-2xl font-bold text-primary-text mb-2">{action}</h1>
                <p className="text-muted mb-8">
                    Are you sure you want to {action.toLowerCase()}?
                </p>

                <div className="flex flex-col gap-3">
                    <Button
                        onClick={handleConfirm}
                        variant={isCheckIn ? "primary" : "danger"}
                        className="w-full !py-3 !text-lg shadow-lg"
                        isLoading={isSubmitting}
                    >
                        Yes, {action}
                    </Button>
                    <Button
                        onClick={handleCancel}
                        variant="secondary"
                        className="w-full !py-3"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default AttendanceActionPage;
