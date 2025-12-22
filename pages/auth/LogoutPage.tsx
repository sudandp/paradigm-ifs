import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import Button from '../../components/ui/Button';
import { LogOut, ArrowLeft } from 'lucide-react';

const LogoutPage: React.FC = () => {
    const navigate = useNavigate();
    const { logout } = useAuthStore();

    const handleConfirmLogout = async () => {
        await logout();
        navigate('/auth/login', { replace: true });
    };

    const handleCancel = () => {
        navigate(-1);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
            {/* Background is handled globally by index.html (#041b0f) */}

            <div className="w-full max-w-md bg-card rounded-2xl shadow-card p-8 text-center relative z-10">
                <div className="flex justify-center mb-6">
                    <div className="p-4 rounded-full bg-red-100">
                        <LogOut className="h-10 w-10 text-red-600" />
                    </div>
                </div>

                <h1 className="text-2xl font-bold text-primary-text mb-2">Log Out</h1>
                <p className="text-muted mb-8">
                    Are you sure you want to log out? You will need to sign in again to access your account.
                </p>

                <div className="flex flex-col gap-3">
                    <Button
                        onClick={handleConfirmLogout}
                        variant="danger"
                        className="w-full !py-3 !text-lg shadow-lg shadow-red-100"
                    >
                        Yes, Log Out
                    </Button>
                    <Button
                        onClick={handleCancel}
                        variant="secondary"
                        className="w-full !py-3"
                    >
                        Cancel
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default LogoutPage;
