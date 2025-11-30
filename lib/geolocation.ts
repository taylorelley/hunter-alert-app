import { Geolocation, Position, PositionOptions } from '@capacitor/geolocation';

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

export async function checkPermissions(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location === 'granted') {
      return 'granted';
    }
    if (status.location === 'denied') {
      return 'denied';
    }
    return 'prompt';
  } catch (error) {
    console.error('Error checking geolocation permissions:', error);
    return 'denied';
  }
}

export async function requestPermissions(): Promise<'granted' | 'denied'> {
  try {
    const status = await Geolocation.requestPermissions();
    return status.location === 'granted' ? 'granted' : 'denied';
  } catch (error) {
    console.error('Error requesting geolocation permissions:', error);
    return 'denied';
  }
}

export async function getCurrentPosition(
  options: PositionOptions = DEFAULT_OPTIONS,
): Promise<Coordinates> {
  try {
    // Check permissions first
    const permission = await checkPermissions();
    if (permission === 'prompt') {
      const requested = await requestPermissions();
      if (requested === 'denied') {
        throw new Error('Location permission denied');
      }
    } else if (permission === 'denied') {
      throw new Error('Location permission denied');
    }

    // Get current position
    const position: Position = await Geolocation.getCurrentPosition(options);

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
    };
  } catch (error) {
    console.error('Error getting current position:', error);
    throw error;
  }
}

export async function watchPosition(
  callback: (coords: Coordinates) => void,
  errorCallback?: (error: Error) => void,
  options: PositionOptions = DEFAULT_OPTIONS,
): Promise<string> {
  try {
    // Check permissions first
    const permission = await checkPermissions();
    if (permission === 'prompt') {
      const requested = await requestPermissions();
      if (requested === 'denied') {
        throw new Error('Location permission denied');
      }
    } else if (permission === 'denied') {
      throw new Error('Location permission denied');
    }

    // Watch position
    const watchId = await Geolocation.watchPosition(options, (position, error) => {
      if (error) {
        console.error('Error watching position:', error);
        if (errorCallback) {
          errorCallback(new Error(error.message || 'Unknown geolocation error'));
        }
        return;
      }

      if (position) {
        callback({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
        });
      }
    });

    return watchId;
  } catch (error) {
    console.error('Error setting up position watch:', error);
    throw error;
  }
}

export async function clearWatch(watchId: string): Promise<void> {
  try {
    await Geolocation.clearWatch({ id: watchId });
  } catch (error) {
    console.error('Error clearing position watch:', error);
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Check if coordinates are within a geofence
 */
export function isWithinGeofence(
  currentLat: number,
  currentLon: number,
  fenceLat: number,
  fenceLon: number,
  radiusMeters: number,
): boolean {
  const distance = calculateDistance(currentLat, currentLon, fenceLat, fenceLon);
  return distance <= radiusMeters;
}
