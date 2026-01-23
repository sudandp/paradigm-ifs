import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Calculate the distance in meters between two coordinates using the Haversine formula.
 */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Perform a reverse geocode lookup of a coordinate to a human-readable address.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const fallback = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`;
    const res = await fetch(url);
    if (!res.ok) return fallback;
    const data = await res.json();
    if (data.address) {
      const { road, suburb, city, village, town, state, country } = data.address;
      // Prioritize a concise address: Road, Suburb, and City/Village/Town
      const shortAddress = [road, suburb, city || village || town]
        .filter(Boolean)
        .join(', ');
      
      if (shortAddress) return shortAddress;
    }
    
    if (data.display_name) {
      return data.display_name as string;
    }
    return fallback;
  } catch (err) {
    console.warn('Reverse geocode failed:', err);
    return fallback;
  }
}

/**
 * Attempt to obtain a high‑accuracy geolocation fix with multi-stage fallbacks.
 * Skips Capacitor permission checks on web to avoid "Not implemented" errors.
 */
export async function getPrecisePosition(accuracyThreshold: number = 50, timeoutMs: number = 10000): Promise<GeolocationPosition> {
  // Accessing permissions via Capacitor is only necessary/supported on native platforms (iOS/Android).
  if (Capacitor.isNativePlatform()) {
    try {
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted') {
        const requestResult = await Geolocation.requestPermissions();
        if (requestResult.location !== 'granted') {
          throw new Error('Location permission denied');
        }
      }
    } catch (err) {
      console.warn('Capacitor checkPermissions not available:', err);
    }
  }

  return new Promise(async (resolve, reject) => {
    let bestPos: GeolocationPosition | null = null;
    let watchId: string | null = null;

    const timer = setTimeout(async () => {
      if (watchId) {
        await Geolocation.clearWatch({ id: watchId });
      }

      if (bestPos) {
        resolve(bestPos);
      } else {
        try {
          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 30000
          });
          resolve(pos as unknown as GeolocationPosition);
        } catch (err) {
          try {
            const pos = await Geolocation.getCurrentPosition({
              enableHighAccuracy: false,
              timeout: 5000,
              maximumAge: 60000
            });
            resolve(pos as unknown as GeolocationPosition);
          } catch (finalErr) {
            reject(new Error('Unable to acquire location fix. Please ensure GPS is on.'));
          }
        }
      }
    }, timeoutMs);

    try {
      watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0
        },
        (position, err) => {
          if (err) {
            console.warn('watchPosition error:', err);
            return;
          }

          if (position) {
            const pos = position as unknown as GeolocationPosition;
            if (!bestPos || (pos.coords.accuracy && pos.coords.accuracy < (bestPos.coords.accuracy || Infinity))) {
              bestPos = pos;
            }
            if (pos.coords.accuracy && pos.coords.accuracy <= accuracyThreshold) {
              clearTimeout(timer);
              if (watchId) {
                Geolocation.clearWatch({ id: watchId });
              }
              resolve(pos);
            }
          }
        }
      );
    } catch (err) {
      console.error('Failed to start watchPosition:', err);
    }
  });
}