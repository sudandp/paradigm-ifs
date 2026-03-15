import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import Logo from './ui/Logo';
import { checkRequiredPermissions, requestAllPermissions } from '../utils/permissionUtils';
import { ShieldCheck, AlertCircle, Settings } from 'lucide-react';

interface PermissionsPrimerProps {
  onComplete: () => void;
}

const PermissionsPrimer: React.FC<PermissionsPrimerProps> = ({ onComplete }) => {
  const [isChecking, setIsChecking] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [missingPermissions, setMissingPermissions] = useState<string[]>([]);

  const verifyPermissions = async () => {
    setIsChecking(true);
    const { allGranted, missing } = await checkRequiredPermissions();
    setMissingPermissions(missing);
    setIsChecking(false);
    
    if (allGranted) {
      onComplete();
    }
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      onComplete();
      return;
    }
    verifyPermissions();
  }, [onComplete]);

  const handleStartSetup = async () => {
    setIsRequesting(true);
    await requestAllPermissions();
    setIsRequesting(false);
    await verifyPermissions();
  };

  const handleOpenSettings = () => {
    // Open system settings for the app
    const permissions = (window as any).plugins?.permissions;
    if (permissions) {
      permissions.openSettings();
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
        <div className="animate-pulse mb-8">
          <Logo className="h-16" />
        </div>
        <div className="text-gray-500 font-medium">Verifying security requirements...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full border border-gray-100">
        <div className="mb-6 flex justify-center">
          {missingPermissions.length > 0 ? (
            <div className="bg-amber-50 p-4 rounded-full">
               <ShieldCheck className="h-12 w-12 text-amber-600" />
            </div>
          ) : (
            <div className="bg-emerald-50 p-4 rounded-full">
               <ShieldCheck className="h-12 w-12 text-emerald-600" />
            </div>
          )}
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {isRequesting ? 'Setting up...' : 'Permissions Required'}
        </h2>
        
        <p className="text-gray-600 text-sm mb-8">
          To provide a seamless experience, Paradigm IFS requires access to the following 
          services to ensure your high-standard facility management.
        </p>

        {missingPermissions.length > 0 && !isRequesting && (
          <div className="mb-8 text-left space-y-2">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Required Categories:</div>
            {missingPermissions.map((p) => (
              <div key={p} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 p-2 rounded-lg">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                {p}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleStartSetup}
            disabled={isRequesting}
            className={`w-full py-4 rounded-2xl font-bold transition-all shadow-lg ${
              isRequesting 
                ? 'bg-gray-100 text-gray-400' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 shadow-emerald-200'
            }`}
          >
            {isRequesting ? 'Please respond to pop-ups...' : 'Grant All Permissions'}
          </button>

          {missingPermissions.length > 0 && !isRequesting && (
            <button
              onClick={handleOpenSettings}
              className="w-full py-4 rounded-2xl font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <Settings className="h-5 w-5" />
              Open App Settings
            </button>
          )}
        </div>

        <p className="text-[10px] text-gray-400 mt-6 leading-relaxed">
          Your data is encrypted and used only for operational purposes. 
          By proceeding, you agree to our security policies.
        </p>
      </div>
    </div>
  );
};

export default PermissionsPrimer;
