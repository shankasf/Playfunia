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
  const [hoursStr, minutes] = time.split(':');
  const hours = Number(hoursStr);
  if (!Number.isFinite(hours)) return time;
  const date = new Date();
  date.setHours(hours, Number(minutes) || 0, 0, 0);
  return date.toLocaleTimeString('en-US', {
    timeZone: ET_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
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
 * Format birth date (month, day, year) in ET
 */
export function formatBirthDate(value?: string | null): string {
  if (!value) return 'Birth date not provided';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Birth date not provided';
  }
  return date.toLocaleDateString('en-US', {
    timeZone: ET_TIMEZONE,
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
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: ET_TIMEZONE }));
  return etDate.toISOString().split('T')[0];
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
