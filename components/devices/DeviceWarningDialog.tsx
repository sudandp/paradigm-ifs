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
      <div className="device-warning-bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>
      
      <div className="device-warning-card animate-fade-in-scale">
        <div className="device-warning-header">
          <div className={`device-warning-icon-wrapper status-${status}`}>
            <AlertTriangle size={32} />
          </div>
          <h1 className="device-warning-title">{message.title}</h1>
        </div>
        
        <div className="device-warning-content">
          <div className="device-info-hero">
            <div className="device-type-icon">
              {deviceType === 'web' ? <Monitor size={24} /> : <Smartphone size={24} />}
            </div>
            <div className="device-info-text">
              <span className="device-label">Current Device</span>
              <p className="device-name" title={deviceName}>
                {deviceName.length > 40 ? `${deviceName.substring(0, 37)}...` : deviceName}
              </p>
              <span className="device-type-tag">
                {deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} Session
              </span>
            </div>
          </div>
          
          <p className="device-warning-description">{message.description}</p>
          
          <div className="device-active-section">
            <div className="section-header">
              <h3>Active {deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} Devices</h3>
              <span className="limit-indicator">
                {existingDevices.filter(d => d.deviceType === deviceType).length} / {limits[deviceType as keyof typeof limits]}
              </span>
            </div>
            
            {loadingDevices ? (
              <div className="loading-state">
                <div className="spinner-small" />
                <span>Syncing devices...</span>
              </div>
            ) : existingDevices.filter(d => d.deviceType === deviceType).length > 0 ? (
              <div className="device-grid-mini">
                {existingDevices.filter(d => d.deviceType === deviceType).map(device => (
                  <div key={device.id} className="device-card-mini">
                    <div className="device-card-header">
                      <div className="device-card-icon">
                        {deviceType === 'web' ? <Monitor size={20} /> : <Smartphone size={20} />}
                      </div>
                      <div className="device-card-info">
                        <span className="device-card-name" title={device.deviceName}>
                          {device.deviceName.length > 30 ? `${device.deviceName.substring(0, 27)}...` : device.deviceName}
                        </span>
                        <div className="device-card-meta">
                          <span className="device-meta-tag status-active">Active</span>
                        </div>
                      </div>
                    </div>
                    <div className="device-card-actions">
                      <button 
                        onClick={() => handleRemoveDevice(device.id)}
                        className="device-action-btn delete"
                        title="Remove Device"
                      >
                        <Trash2 size={14} />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>


            ) : (
              <div className="empty-state-mini">
                <p>No other active {deviceType} devices.</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="device-warning-footer">
          {message.showRequestButton && (
            <button
              className="action-button-primary"
              onClick={onRequestAccess}
              disabled={isRequestingAccess}
            >
              {isRequestingAccess ? (
                <>
                  <div className="spinner-small" />
                  <span>Requesting...</span>
                </>
              ) : (
                <>
                  <Send size={18} />
                  <span>{message.actionText}</span>
                </>
              )}
            </button>
          )}
          
          <button
            className="action-button-secondary"
            onClick={onLogout}
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceWarningDialog;
