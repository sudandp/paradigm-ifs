import { Geolocation } from '@capacitor/geolocation';

// Utility functions for geofencing and reverse geocoding.
//
// calculateDistanceMeters: Returns the distance in meters between two latitude
// and longitude points using the Haversine formula.  This is used to
// determine whether a user is inside a defined geofence.
//
// reverseGeocode: Performs a best‑effort reverse geocoding lookup of a
// latitude/longitude coordinate to a human readable address.  This uses the
// public Nominatim (OpenStreetMap) API.  If the API call fails or returns no
// address, the fallback is to return the raw coordinates rounded to 4
// decimal places.  Note that Nominatim has usage policies (including rate
// limits).  For production use you may want to proxy these requests or use
// a paid geocoding service.

/**
 * Calculate the great‑circle distance between two points on the Earth's
 * surface specified by latitude/longitude.  Uses the Haversine formula.
 *
 * @param lat1 Latitude of point 1 in degrees
 * @param lon1 Longitude of point 1 in degrees
 * @param lat2 Latitude of point 2 in degrees
 * @param lon2 Longitude of point 2 in degrees
 * @returns Distance between the points in meters
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
 * Reverse geocode a latitude/longitude into a human readable address using
 * Nominatim (OpenStreetMap) API.  If the request fails, returns the
 * coordinates as a string.  The `zoom` parameter controls the level of
 * detail returned (16 = street level).
 *
 * @param lat Latitude in degrees
 * @param lon Longitude in degrees
 * @returns Display name or formatted address string
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const fallback = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`;
    const res = await fetch(url);
    if (!res.ok) return fallback;
    const data = await res.json();
    // Prefer the display_name if present; otherwise build from address
    if (data.display_name) {
      return data.display_name as string;
    }
    if (data.address) {
      const { road, suburb, city, village, town, state, country } = data.address;
      return [road, suburb, city || village || town, state, country]
        .filter(Boolean)
        .join(', ');
    }
    return fallback;
  } catch (err) {
    console.warn('Reverse geocode failed:', err);
    return fallback;
  }
}

/**
 * Attempt to obtain a high‑accuracy geolocation fix using Capacitor's native
 * Geolocation plugin.  This utility watches the device's position and returns
 * the first reading with an accuracy at or below a specified threshold, or the
 * best reading after a timeout.  If geolocation is unavailable or permission 
 * is denied, the promise rejects with an error.
 * 
 * IMPORTANT: This function will trigger Android's native permission dialog if
 * permission has not been granted yet. This is the correct behavior for Android apps.
 *
 * Usage:
 * const position = await getPrecisePosition();
 * const { latitude, longitude, accuracy } = position.coords;
 *
 * Note: On mobile devices, this can yield GPS readings with accuracies around 
 * 5–50 meters. The caller should handle cases where accuracy remains high 
 * (i.e. unreliable) by prompting the user or retrying later.
 *
 * @param accuracyThreshold Desired accuracy in meters.  Default 50.
 * @param timeoutMs Maximum time to wait for a suitable fix.  Default 10000ms.
 * @returns A GeolocationPosition with the best available accuracy.
 */
export async function getPrecisePosition(accuracyThreshold: number = 50, timeoutMs: number = 10000): Promise<GeolocationPosition> {
  // First check and request permissions using Capacitor
  const permission = await Geolocation.checkPermissions();
  
  if (permission.location !== 'granted') {
    const requestResult = await Geolocation.requestPermissions();
    if (requestResult.location !== 'granted') {
      throw new Error('Location permission denied');
    }
  }

  return new Promise(async (resolve, reject) => {
    let bestPos: GeolocationPosition | null = null;
    let watchId: string | null = null;

    // Set up a overall timeout to return whatever we have
    const timer = setTimeout(async () => {
      if (watchId) {
        await Geolocation.clearWatch({ id: watchId });
      }

      if (bestPos) {
        console.log('getPrecisePosition: Timeout reached, returning best position found:', bestPos.coords.accuracy);
        resolve(bestPos);
      } else {
        // Fallback: If watch yielded nothing, try a one-shot getCurrentPosition
        try {
          console.log('getPrecisePosition: Watch yielded nothing, trying one-shot getCurrentPosition (High Accuracy)');
          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 30000
          });
          resolve(pos as unknown as GeolocationPosition);
        } catch (err) {
          try {
            console.log('getPrecisePosition: High accuracy failed, trying low accuracy fallback');
            const pos = await Geolocation.getCurrentPosition({
              enableHighAccuracy: false,
              timeout: 5000,
              maximumAge: 60000
            });
            resolve(pos as unknown as GeolocationPosition);
          } catch (finalErr) {
            reject(new Error('Unable to acquire any position after multiple attempts'));
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
            // Don't reject yet, let the timer handle the fallback
            return;
          }

          if (position) {
            const pos = position as unknown as GeolocationPosition;
            // Keep track of the best (lowest accuracy) position
            if (!bestPos || (pos.coords.accuracy && pos.coords.accuracy < (bestPos.coords.accuracy || Infinity))) {
              bestPos = pos;
            }
            // If the accuracy meets our threshold, clear the watch and resolve immediately
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
      // Wait for timer to try fallback
    }
  });
}