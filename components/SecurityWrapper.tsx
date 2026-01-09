import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSecurityCheck } from '../hooks/useSecurityCheck';
import SecurityWarningModal from '../components/ui/SecurityWarningModal';
import { api } from '../services/api';
import { isAdmin } from '../utils/auth';

interface SecurityWrapperProps {
    children: React.ReactNode;
}

/**
 * Security wrapper component that monitors for developer mode and location spoofing
 * AFTER user has logged in. Admin and developer roles are exempt from these checks.
 */
const SecurityWrapper: React.FC<SecurityWrapperProps> = ({ children }) => {
    const { user } = useAuthStore();
    const securityCheck = useSecurityCheck();
    const [securityAlertSent, setSecurityAlertSent] = useState(false);

    // Check if current user is exempt from security checks (admin/developer)
    const isExemptFromSecurityChecks = user && (isAdmin(user.role) || user.role === 'developer');

    // Monitor security issues and send alerts (only for non-exempt users)
    useEffect(() => {
        if (user && !isExemptFromSecurityChecks && !securityCheck.isSecure && !securityAlertSent) {
            const violationType = securityCheck.developerModeEnabled
                ? 'developer_mode'
                : 'location_spoofing';

            // Send alert to reporting manager
            api.sendSecurityAlert(user.id, user.name, violationType, undefined)
                .catch(err => console.error('Failed to send security alert:', err));

            setSecurityAlertSent(true);
        }
    }, [user, securityCheck, securityAlertSent, isExemptFromSecurityChecks]);

    // If security issues detected for non-exempt users, show warning modal
    if (user && !isExemptFromSecurityChecks && !securityCheck.isSecure) {
        return <SecurityWarningModal issues={securityCheck.issues} />;
    }

    // Otherwise, render children normally
    return <>{children}</>;
};

export default SecurityWrapper;
