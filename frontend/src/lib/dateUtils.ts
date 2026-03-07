/**
 * Date formatting utilities with Eastern Time (ET) timezone
 */

const ET_TIMEZONE = 'America/New_York';

/**
 * Format a date string or Date object to display date in ET
 */
export function formatDate(value?: string | Date | null): string {
  if (!value) return '--';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '--';
  }
  return date.toLocaleDateString('en-US', {
    timeZone: ET_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date with weekday in ET
 */
export function formatDateWithWeekday(value?: string | Date | null): string {
  if (!value) return '--';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '--';
  }
  return date.toLocaleDateString('en-US', {
    timeZone: ET_TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format time string (HH:mm) to display time in ET
 */
export function formatTime(time: string): string {
  const [hoursStr, minutesStr] = time.split(':');
  let hours = Number(hoursStr);
  if (!Number.isFinite(hours)) return time;
  // Handle 24:00 as midnight
  if (hours === 24) hours = 0;
  const mins = (minutesStr || '0').padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${mins} ${period}`;
}

/**
 * Format a date to show month and year only in ET
 */
export function formatMonthYear(value?: string | Date | null): string {
  if (!value) return '--';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '--';
  }
  return date.toLocaleDateString('en-US', {
    timeZone: ET_TIMEZONE,
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format a datetime to full display in ET
 */
export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '--';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '--';
  }
  return date.toLocaleString('en-US', {
    timeZone: ET_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format birth date (month, day, year) without timezone conversion.
 * Birth dates are date-only values and should not shift based on timezone.
 */
export function formatBirthDate(value?: string | null): string {
  if (!value) return 'Birth date not provided';

  // Extract just the date portion to avoid timezone shifts
  // e.g., "2026-01-10T00:00:00.000Z" -> "2026-01-10"
  const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    // Create date using local time (noon to avoid any edge cases)
    const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // Fallback for other formats - use UTC to avoid timezone shift
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Birth date not provided';
  }
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get current date in ET timezone as ISO date string (YYYY-MM-DD)
 */
export function getCurrentDateET(): string {
  const now = new Date();
  // Use Intl formatter to get YYYY-MM-DD directly in ET without double-conversion
  return now.toLocaleDateString('en-CA', { timeZone: ET_TIMEZONE });
}

/**
 * Get current datetime in ET timezone
 */
export function getCurrentDateTimeET(): Date {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: ET_TIMEZONE }));
}

/**
 * Format a Date object's weekday in ET
 */
export function formatWeekday(date: Date): string {
  return date.toLocaleDateString('en-US', {
    timeZone: ET_TIMEZONE,
    weekday: 'short',
  });
}

/**
 * Format a Date object's day number in ET
 */
export function formatDayNumber(date: Date): number {
  const etDateStr = date.toLocaleDateString('en-US', {
    timeZone: ET_TIMEZONE,
    day: 'numeric',
  });
  return parseInt(etDateStr, 10);
}

/**
 * Convert a date string (ISO, YYYY-MM-DD, etc.) to YYYY-MM-DD for <input type="date">.
 * Avoids timezone shifts by extracting the date portion directly from the string.
 */
export function toDateInputValue(value?: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dateMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
