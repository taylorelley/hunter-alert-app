/**
 * Centralized date utilities for handling timezone-fragile date-only strings.
 *
 * All helpers consistently detect YYYY-MM-DD pattern and parse as local midnight
 * to prevent calendar day shifts across different timezones.
 */

/**
 * Parse a Date or date string to milliseconds, treating YYYY-MM-DD as local midnight.
 * Used for date calculations and comparisons.
 */
export function parseTripDateMs(value: Date | string): number {
  if (value instanceof Date) return value.getTime()
  // Treat YYYY-MM-DD as a local calendar day to avoid UTC shift
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`).getTime()
    : new Date(value).getTime()
}

/**
 * Parse a Date or date string to a Date object, treating YYYY-MM-DD as local midnight.
 * Used for date formatting and display.
 */
export function parseDate(value: Date | string): Date {
  if (value instanceof Date) return value
  // Detect YYYY-MM-DD format and parse as local midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`)
  }
  return new Date(value)
}

/**
 * Convert a Date or date string to ISO string format.
 * Normalizes YYYY-MM-DD strings to stable timestamp (local midnight) before conversion.
 * Used for storing dates in the database.
 */
export function toISOString(date: Date | string): string {
  if (typeof date === "string") {
    // Normalize YYYY-MM-DD to stable timestamp (local midnight)
    return /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T00:00:00`).toISOString()
      : date
  }
  return date.toISOString()
}
