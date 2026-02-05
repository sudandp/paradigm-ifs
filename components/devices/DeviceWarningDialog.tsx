/**
 * Device Warning Dialog
 * 
 * Full-screen blocking dialog shown when a user attempts to access the app
 * from an unauthorized device. Provides options to request access or logout.
 */

import React, { useEffect, useState } from 'react';
import { AlertTriangle, LogOut, Send, Trash2, Smartphone, Monitor } from 'lucide-react';
import { getUserDevices, revokeDevice } from '../../services/deviceService';
import { UserDevice } from '../../types';
import './DeviceWarningDialog.css';

interface DeviceWarningDialogProps {
  userId: string;
  deviceName: string;
  deviceType: string;
  status: 'not_found' | 'pending' | 'revoked' | 'limit_reached';
  onRequestAccess: () => void;
  onLogout: () => void;
  isRequestingAccess?: boolean;
  limits?: { web: number; android: number; ios: number };
}

const DeviceWarningDialog: React.FC<DeviceWarningDialogProps> = ({
  userId,
  deviceName,
  deviceType,
  status,
  onRequestAccess,
  onLogout,
  isRequestingAccess = false,
  limits = { web: 1, android: 1, ios: 1 },
}) => {
  const [existingDevices, setExistingDevices] = useState<UserDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  useEffect(() => {
    if (status === 'limit_reached' || status === 'not_found' || status === 'pending') {
      loadUserDevices();
    }
  }, [userId, status]);

  const loadUserDevices = async () => {
    try {
      setLoadingDevices(true);
      const devices = await getUserDevices(userId);
      setExistingDevices(devices.filter(d => d.status === 'active'));
    } catch (e) {
      console.error('Error loading devices in dialog:', e);
    } finally {
      setLoadingDevices(false);
    }
  };

  const handleRemoveDevice = async (id: string) => {
    if (!window.confirm('Remove this device and free up a slot?')) return;
    try {
      await revokeDevice(id);
      await loadUserDevices();
    } catch (e) {
      alert('Failed to remove device');
    }
  };
  const getMessage = () => {
    switch (status) {
      case 'not_found':
        return {
          title: 'Device Not Registered',
          description: 'This device is not registered for your account. Please check your registered devices or request access.',
          actionText: 'Request Access',
          showRequestButton: true,
        };
      case 'limit_reached':
        return {
          title: 'Device Limit Reached',
          description: `You have reached your limit for ${deviceType} devices. You must remove an old device below to register this one.`,
          actionText: 'Try Again',
          showRequestButton: true,
        };
      case 'pending':
        return {
          title: 'Approval Pending',
          description: 'Your request to use this device is pending approval from the administrator.',
          actionText: 'Waiting for Approval',
          showRequestButton: false,
        };
      case 'revoked':
        return {
          title: 'Device Access Revoked',
          description: 'Access from this device has been revoked. You can request access again if this was a mistake.',
          actionText: 'Request Access',
          showRequestButton: true,
        };
      default:
        return {
          title: 'Unauthorized Device',
          description: 'You cannot access the application from this device.',
          actionText: '',
          showRequestButton: false,
        };
    }
  };

  const message = getMessage();

  return (
    <div className="device-warning-overlay">
      <div className="device-warning-dialog">
        <div className="device-warning-icon">
          <AlertTriangle size={64} color="#f59e0b" />
        </div>
        
        <h1 className="device-warning-title">{message.title}</h1>
        
        <div className="device-warning-device-info">
          <p className="device-warning-device-name" title={deviceName}>
            {deviceName.length > 50 ? `${deviceName.substring(0, 47)}...` : deviceName}
          </p>
          <p className="device-warning-device-type">
            {deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} Device
          </p>
        </div>
        
        <p className="device-warning-description">{message.description}</p>
        
        <div className="device-warning-info-box">
          <h3>Your Active {deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} Devices</h3>
          {loadingDevices ? (
            <p className="text-sm text-gray-500 py-2 text-center">Loading devices...</p>
          ) : existingDevices.filter(d => d.deviceType === deviceType).length > 0 ? (
            <div className="device-list-mini">
              {existingDevices.filter(d => d.deviceType === deviceType).map(device => (
                <div key={device.id} className="device-item-mini">
                  <div className="device-item-info">
                    <span className="device-item-name" title={device.deviceName}>
                      {device.deviceName.length > 30 ? `${device.deviceName.substring(0, 27)}...` : device.deviceName}
                    </span>
                  </div>
                  <button 
                    onClick={() => handleRemoveDevice(device.id)}
                    className="device-remove-btn"
                    title="Remove Device"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-2 text-center">No other active {deviceType} devices found.</p>
          )}
          
          <div className="device-policy-summary">
            <span>Limit: <strong>{limits[deviceType as keyof typeof limits]} {deviceType}</strong> device{(limits[deviceType as keyof typeof limits] || 1) > 1 ? 's' : ''}</span>
          </div>
        </div>
        
        <div className="device-warning-actions">
          {message.showRequestButton && (
            <button
              className="device-warning-button device-warning-button-primary"
              onClick={onRequestAccess}
              disabled={isRequestingAccess}
            >
              {isRequestingAccess ? (
                <>
                  <div className="spinner-small" />
                  Sending Request...
                </>
              ) : (
                <>
                  <Send size={20} />
                  {message.actionText}
                </>
              )}
            </button>
          )}
          
          <button
            className="device-warning-button device-warning-button-secondary"
            onClick={onLogout}
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceWarningDialog;
