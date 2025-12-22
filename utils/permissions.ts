import { useState } from 'react';

export type PermissionState = 'granted' | 'prompt' | 'denied';

/**
 * Checks the status of a given permission using the Permissions API.
 * @param name The name of the permission to check.
 * @returns The current state of the permission.
 */
export const checkPermission = async (name: 'geolocation' | 'camera'): Promise<PermissionState> => {
  // --- NATIVE MOBILE IMPLEMENTATION ---
  // If using Capacitor/Cordova, you would check permissions using the native plugins here.
  // Example for Capacitor:
  //
  // import { Geolocation } from '@capacitor/geolocation';
  // const status = await Geolocation.checkPermissions();
  // return status.location; // 'granted', 'prompt', 'denied'
  //
  try {
    const result = await navigator.permissions.query({ name });
    return result.state; // 'granted', 'prompt', 'denied'
  } catch (error) {
    console.error(`Permission query for '${name}' failed`, error);
    // Fallback for browsers that don't support query, assume we need to prompt.
    return 'prompt';
  }
};

/**
 * A hook to manage a permission state and provide a function to request it.
 * @param name The name of the permission to manage.
 * @returns An object with the permission status and a function to request it.
 */
export const usePermission = (name: 'geolocation' | 'camera') => {
  const [status, setStatus] = useState<PermissionState>('prompt');

  const request = async (): Promise<boolean> => {
    // --- NATIVE MOBILE IMPLEMENTATION ---
    // Request permission using native plugins here if applicable.
    //
    try {
      let granted = false;
      if (name === 'camera') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); // Immediately stop the stream
        granted = true;
      } else if (name === 'geolocation') {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        });
        granted = true;
      }
      
      if (granted) {
          setStatus('granted');
          return true;
      } else {
          // This path might not be hit if getCurrentPosition rejects, but as a fallback:
          const currentStatus = await checkPermission(name);
          setStatus(currentStatus);
          return currentStatus === 'granted';
      }

    } catch (error) {
      // User denied the permission prompt.
      setStatus('denied');
      return false;
    }
  };
  
  // Check the initial status of the permission on hook mount.
  useState(() => {
      checkPermission(name).then(setStatus);
  });

  return { status, request };
};