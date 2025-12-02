export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function validateGeofenceParams(params: {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}): string | null {
  const trimmedName = params.name.trim();
  if (!trimmedName) return 'Geofence name is required';
  if (Number.isNaN(params.latitude) || params.latitude < -90 || params.latitude > 90)
    return 'Latitude must be between -90 and 90';
  if (Number.isNaN(params.longitude) || params.longitude < -180 || params.longitude > 180)
    return 'Longitude must be between -180 and 180';
  if (!Number.isFinite(params.radiusMeters) || params.radiusMeters <= 0 || params.radiusMeters > 100000)
    return 'Radius must be between 1 and 100000 meters';
  return null;
}
