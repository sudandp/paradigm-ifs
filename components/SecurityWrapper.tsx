import React, { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSecurityCheck } from '../hooks/useSecurityCheck';
import SecurityWarningModal from '../components/ui/SecurityWarningModal';
import { api } from '../services/api';
import { isAdmin } from '../utils/auth';
import { getCurrentDevice, registerDevice, getDeviceLimits } from '../services/deviceService';
import DeviceWarningDialog from './devices/DeviceWarningDialog';
import { DeviceType } from '../types';

interface SecurityWrapperProps {
    children: React.ReactNode;
}

/**
 * Security wrapper component that monitors for developer mode, location spoofing,
 * and UNREGISTERED/UNAUTHORIZED DEVICES after user has logged in.
 */
const SecurityWrapper: React.FC<SecurityWrapperProps> = ({ children }) => {
    const { user } = useAuthStore();
    const securityCheck = useSecurityCheck();
    const [securityAlertSent, setSecurityAlertSent] = useState(false);

    // Device validation state
    const [deviceStatus, setDeviceStatus] = useState<'authorized' | 'pending' | 'revoked' | 'limit_reached' | 'checking'>('checking');
    const [deviceInfo, setDeviceInfo] = useState<{ id: string, name: string, type: DeviceType } | null>(null);
    const [deviceMessage, setDeviceMessage] = useState('');
    const [limits, setLimits] = useState<{ web: number; android: number; ios: number }>({ web: 1, android: 1, ios: 1 });

    // Track which user.id we've already checked to prevent re-running on profile updates
    const lastCheckedUserId = useRef<string | null>(null);

    // Check if current user is exempt from security checks (admin/developer)
    // NOTE: We might want admins to also be subject to device limits, but for now keeping consistency
    // with existing security check pattern. However, device registration is beneficial for tracking.
    const isExemptFromSecurityChecks = user && (user.role === 'developer'); 

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

    // Perform Device Validation (memoized to avoid redundant calls)
    useEffect(() => {
        const checkDevice = async () => {
            if (!user) return;

            // Skip if we've already checked this user
            if (lastCheckedUserId.current === user.id) {
                return;
            }

            try {
                // Get current device details and limits
                const [{ deviceIdentifier, deviceType, deviceName, deviceInfo: dInfo }, devLimits] = await Promise.all([
                    getCurrentDevice(),
                    getDeviceLimits(user.role)
                ]);
                
                setLimits(devLimits);

                // For developers, we might just log but not block, or just standard register
                // Let's standard register everyone to ensure logs are kept
                const result = await registerDevice(
                    user.id,
                    user.role,
                    deviceIdentifier,
                    deviceType as DeviceType,
                    deviceName,
                    dInfo
                );

                if (result.success) {
                    setDeviceStatus('authorized');
                    // Mark this user as checked
                    lastCheckedUserId.current = user.id;
                } else {
                    // Registration failed or pending approval
                    // Order matters: check for specific errors before the generic requiresApproval flag
                    if (result.message.includes('revoked')) {
                        setDeviceStatus('revoked');
                        setDeviceInfo({ 
                           id: '', 
                           name: deviceName, 
                           type: deviceType as DeviceType 
                        });
                        setDeviceMessage(result.message);
                    } else if (result.message.includes('limit of')) {
                        setDeviceStatus('limit_reached');
                        setDeviceInfo({ 
                           id: '', 
                           name: deviceName, 
                           type: deviceType as DeviceType 
                        });
                        setDeviceMessage(result.message);
                    } else if (result.requiresApproval) {
                        setDeviceStatus('pending');
                        setDeviceInfo({ 
                            id: result.request?.id || '', 
                            name: deviceName, 
                            type: deviceType as DeviceType 
                        });
                        setDeviceMessage(result.message);
                    } else {
                        // Other error
                        setDeviceStatus('pending'); // Treat as pending/blocked
                        setDeviceMessage(result.message);
                    }
                }

            } catch (error) {
                console.error('Device validation failed:', error);
                // On error, we might want to fail open or closed?
                // Fail open for now to avoid locking out due to network glitch
                setDeviceStatus('authorized'); 
                lastCheckedUserId.current = user.id;
            }
        };

        checkDevice();
    }, [user?.id]); // Only depend on user.id, not full user object

    // 1. Check basic security (Dev mode / Location spoofing)
    if (user && !isExemptFromSecurityChecks && !securityCheck.isSecure) {
        return <SecurityWarningModal issues={securityCheck.issues} />;
    }

    // 2. Check Device Authorization
    if (user && deviceStatus !== 'authorized' && deviceStatus !== 'checking') {
        // If developer, maybe bypass?
        if (user.role === 'developer') return <>{children}</>;

        return (
            <DeviceWarningDialog 
                userId={user.id}
                status={deviceStatus as any}
                deviceName={deviceInfo?.name || 'Unknown Device'}
                deviceType={deviceInfo?.type || 'web'}
                limits={limits}
                customMessage={deviceMessage}
                onLogout={() => useAuthStore.getState().logout()}
                onRequestAccess={() => {
                     // Reload to check status again
                     window.location.reload();
                }}
            />
        );
    }
    
    // While checking device status...
    if (user && deviceStatus === 'checking' && user.role !== 'developer') {
         return (
             <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-50">
                 <div className="flex flex-col items-center">
                     <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
                     <p className="text-gray-500 font-medium">Verifying device...</p>
                 </div>
             </div>
         );
    }

    // Otherwise, render children normally
    return <>{children}</>;
};

export default SecurityWrapper;
