import React, { useState, useEffect } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import Logo from './ui/Logo';

interface PermissionsPrimerProps {
  onComplete: () => void;
}

const PermissionsPrimer: React.FC<PermissionsPrimerProps> = ({ onComplete }) => {
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Only run on native platforms
    if (!Capacitor.isNativePlatform()) {
      onComplete();
      return;
    }

    const requestAllSequentially = async () => {
      try {
        // 1. Location
        const loc = await Geolocation.checkPermissions();
        if (loc.location !== 'granted') {
          await Geolocation.requestPermissions();
        }

        // 2. Camera
        const cam = await Camera.checkPermissions();
        if (cam.camera !== 'granted') {
          await Camera.requestPermissions();
        }

        // 3. Microphone (via web API as trigger)
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
        } catch (e) {
          console.warn("Microphone prompt skipped or denied", e);
        }

        // Note: For Calendar, Contacts, etc., Android often requests these 
        // when the specific API is called. We've declared them in the manifest.
        
      } catch (err) {
        console.error("Sequential permission request failed", err);
      } finally {
        setIsInitializing(false);
        onComplete();
      }
    };

    requestAllSequentially();
  }, [onComplete]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center animate-pulse">
      <div className="splash-logo mb-8">
        <Logo className="h-16" />
      </div>
      <div className="text-gray-500 font-medium">
        Setting up secure environment...
      </div>
      <p className="text-xs text-gray-400 mt-4">
        Please allow required permissions when prompted.
      </p>
    </div>
  );
};

export default PermissionsPrimer;
