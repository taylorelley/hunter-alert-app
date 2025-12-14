export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// E.164 format: +[country code][number] (e.g., +15551234567)
// Allows 7-15 digits after the country code
export const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

// More lenient phone regex for common formats
// Allows optional country code, parentheses, spaces, dashes
export const PHONE_REGEX_LENIENT = /^(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function isValidPhone(phone: string, strict: boolean = false): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return false;

  if (strict) {
    // Strict E.164 format validation
    return PHONE_REGEX.test(trimmed);
  } else {
    // Lenient validation for common formats
    return PHONE_REGEX_LENIENT.test(trimmed);
  }
}

export function normalizePhone(phone: string): string {
  // Remove all non-digit characters except leading +
  const cleaned = phone.trim().replace(/[^\d+]/g, '');

  // If no country code, assume US (+1)
  if (!cleaned.startsWith('+')) {
    // Remove leading 1 only if input has 11 digits (US country code + 10-digit number)
    const digits = cleaned.length === 11 && cleaned.startsWith('1')
      ? cleaned.slice(1)
      : cleaned;
    return `+1${digits}`;
  }

  return cleaned;
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
