import React, { useState, useEffect } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import Logo from './ui/Logo';
import Button from './ui/Button';

interface PermissionsPrimerProps {
  onComplete: () => void;
}

type PermissionStatus = 'prompt' | 'granted' | 'denied';

const PermissionsPrimer: React.FC<PermissionsPrimerProps> = ({ onComplete }) => {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>('prompt');
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>('prompt');
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allPermissionsGranted = locationStatus === 'granted' && cameraStatus === 'granted';

  useEffect(() => {
    // If not on mobile, or if all permissions are already granted, complete immediately.
    if (!isMobile || allPermissionsGranted) {
      onComplete();
    }
  }, [isMobile, allPermissionsGranted, onComplete]);

  const requestPermissions = async () => {
    setIsRequesting(true);
    setError(null);

    // --- NATIVE MOBILE IMPLEMENTATION ---
    // If using Capacitor/Cordova, the permission checks and requests
    // should be done here using the native plugins. For example:
    //
    // For Capacitor:
    // import { Camera, CameraResultType } from '@capacitor/camera';
    // import { Geolocation } from '@capacitor/geolocation';
    //
    // const checkPermissions = async () => {
    //   const camPerms = await Camera.checkPermissions();
    //   const locPerms = await Geolocation.checkPermissions();
    //   setCameraStatus(camPerms.camera);
    //   setLocationStatus(locPerms.location);
    // };
    //
    // const requestNativePermissions = async () => {
    //   const camResult = await Camera.requestPermissions();
    //   setCameraStatus(camResult.camera);
    //
    //   const locResult = await Geolocation.requestPermissions();
    //   setLocationStatus(locResult.location);
    //
    //   if(camResult.camera === 'granted' && locResult.location === 'granted') {
    //      onComplete();
    //   } else {
    //      setError('Please grant all permissions to continue.');
    //   }
    // }
    //
    // We will use standard browser APIs as a fallback for web/PWA context.

    try {
      // 1. Request Camera Permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraStatus('granted');
        // Stop the track immediately after permission is granted
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        setCameraStatus('denied');
        throw new Error('Camera permission was denied.');
      }

      // 2. Request Location Permission
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            () => {
              setLocationStatus('granted');
              resolve(true);
            },
            () => {
              setLocationStatus('denied');
              reject(new Error('Location permission was denied.'));
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        });
      } catch (err) {
        throw new Error('Location permission was denied.');
      }
      
      // If both permissions are granted, complete
      onComplete();

    } catch (err: any) {
      setError(err.message || 'Permissions are required to use this app.');
    } finally {
      setIsRequesting(false);
    }
  };

  if (!isMobile) {
    return null; // Don't render anything on desktop
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4 text-center">
      <div className="splash-logo">
        <Logo className="h-16 mb-8" />
      </div>
      <div className="max-w-md">
        <h1 className="text-2xl font-bold mb-4">Permissions Required</h1>
        <p className="text-gray-600 mb-8">
          To ensure the best experience and enable features like location-based check-ins and photo uploads,
          we need access to your device's Camera and Location.
        </p>

        <div className="space-y-4 mb-8">
          <div className={`p-4 rounded-lg border ${locationStatus === 'granted' ? 'bg-green-100 border-green-300' : 'bg-gray-100 border-gray-300'}`}>
            <p className="font-semibold">Location Access</p>
            <p className="text-sm">{locationStatus === 'granted' ? 'Permission Granted' : 'Needed for check-in/out'}</p>
          </div>
          <div className={`p-4 rounded-lg border ${cameraStatus === 'granted' ? 'bg-green-100 border-green-300' : 'bg-gray-100 border-gray-300'}`}>
            <p className="font-semibold">Camera Access</p>
            <p className="text-sm">{cameraStatus === 'granted' ? 'Permission Granted' : 'Needed for identity verification'}</p>
          </div>
        </div>

        <Button onClick={requestPermissions} disabled={isRequesting}>
          {isRequesting ? 'Requesting...' : 'Grant Permissions'}
        </Button>

        {error && <p className="text-red-500 mt-4">{error}</p>}
        
        <p className="text-xs text-gray-500 mt-8">
          You can manage these permissions in your device settings at any time.
        </p>
      </div>
    </div>
  );
};

export default PermissionsPrimer;
