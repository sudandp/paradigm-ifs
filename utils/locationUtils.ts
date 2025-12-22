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
 * Attempt to obtain a high‑accuracy geolocation fix.  This utility watches
 * the device's position and returns the first reading with an accuracy at or
 * below a specified threshold, or the best reading after a timeout.  If
 * geolocation is unavailable or no position is obtained, the promise
 * rejects with an error.  The default threshold is 30 meters and the
 * default timeout is 15 seconds.
 *
 * Usage:
 * const position = await getPrecisePosition();
 * const { latitude, longitude, accuracy } = position.coords;
 *
 * Note: Browsers may ignore the high accuracy flag on desktop devices and
 * fallback to coarse IP‑based positioning.  On mobile, this can yield GPS
 * readings with accuracies around 5–50 meters.  The caller should handle
 * cases where accuracy remains high (i.e. unreliable) by prompting the
 * user or retrying later.
 *
 * @param accuracyThreshold Desired accuracy in meters.  Default 30.
 * @param timeoutMs Maximum time to wait for a suitable fix.  Default 15000ms.
 * @returns A GeolocationPosition with the best available accuracy.
 */
export function getPrecisePosition(accuracyThreshold: number = 50, timeoutMs: number = 10000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      return reject(new Error('Geolocation is not supported by this browser.'));
    }
    let bestPos: GeolocationPosition | null = null;
    // Set up a timeout to end the watch after the specified period
    const timer = setTimeout(() => {
      if (bestPos) {
        navigator.geolocation.clearWatch(watchId);
        resolve(bestPos);
      } else {
        navigator.geolocation.clearWatch(watchId);
        reject(new Error('Unable to acquire a precise position within the timeout period'));
      }
    }, timeoutMs);
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Keep track of the best (lowest accuracy) position
        if (!bestPos || pos.coords.accuracy < bestPos.coords.accuracy) {
          bestPos = pos;
        }
        // If the accuracy meets our threshold, clear the watch and resolve immediately
        if (pos.coords.accuracy <= accuracyThreshold) {
          clearTimeout(timer);
          navigator.geolocation.clearWatch(watchId);
          resolve(pos);
        }
      },
      (err) => {
        clearTimeout(timer);
        navigator.geolocation.clearWatch(watchId);
        reject(err);
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  });
}