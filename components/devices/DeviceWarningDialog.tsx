/**
 * Device Warning Dialog
 * 
 * Full-screen blocking dialog shown when a user attempts to access the app
 * from an unauthorized device. Provides options to request access or logout.
 */

import React from 'react';
import { AlertTriangle, LogOut, Send } from 'lucide-react';
import './DeviceWarningDialog.css';

interface DeviceWarningDialogProps {
  deviceName: string;
  deviceType: string;
  status: 'not_found' | 'pending' | 'revoked';
  onRequestAccess: () => void;
  onLogout: () => void;
  isRequestingAccess?: boolean;
  limits?: { web: number; android: number; ios: number };
}

const DeviceWarningDialog: React.FC<DeviceWarningDialogProps> = ({
  deviceName,
  deviceType,
  status,
  onRequestAccess,
  onLogout,
  isRequestingAccess = false,
  limits = { web: 1, android: 1, ios: 1 },
}) => {
  const getMessage = () => {
    switch (status) {
      case 'not_found':
        return {
          title: 'Device Not Registered',
          description: 'This device is not registered for your account. Please request access to use this device.',
          actionText: 'Request Access',
          showRequestButton: true,
        };
      case 'pending':
        return {
          title: 'Approval Pending',
          description: 'Your request to use this device is pending approval from the administrator. You will be notified once your request is reviewed.',
          actionText: 'Waiting for Approval',
          showRequestButton: false,
        };
      case 'revoked':
        return {
          title: 'Device Access Revoked',
          description: 'Access from this device has been revoked. Please contact your administrator for more information.',
          actionText: 'Contact Administrator',
          showRequestButton: false,
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
          <p className="device-warning-device-name">{deviceName}</p>
          <p className="device-warning-device-type">
            {deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} Device
          </p>
        </div>
        
        <p className="device-warning-description">{message.description}</p>
        
        <div className="device-warning-info-box">
          <h3>Device Limit Policy</h3>
          <ul>
            <li>Each user can register up to <strong>{limits.web} Web</strong> device{limits.web > 1 ? 's' : ''}</li>
            <li>Each user can register up to <strong>{limits.android} Android</strong> device{limits.android > 1 ? 's' : ''}</li>
            <li>Each user can register up to <strong>{limits.ios} iOS</strong> device{limits.ios > 1 ? 's' : ''}</li>
          </ul>
          <p className="device-warning-info-note">
            To add additional devices, you must request approval from your administrator.
          </p>
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
