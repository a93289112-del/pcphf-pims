/**
 * Consistent timezone handling for the entire application
 * Uses Asia/Manila (UTC+8) timezone for Philippines-based clinic
 * 
 * This ensures:
 * - Dates are stored consistently in UTC
 * - Dates are displayed consistently in Asia/Manila timezone
 * - No timezone ambiguity or mismatches
 */

/**
 * Get current date-time as ISO string (UTC) with timezone info
 * Use this when recording dispensing, sales, or any timestamp
 */
export function getCurrentDateISO(): string {
    return new Date().toISOString();
}

/**
 * Get current date-time in Asia/Manila timezone
 * Returns object with date components for easy access
 */
export function getCurrentDateInManilaTimezone(): {
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
    seconds: number;
    date: Date;
} {
    const now = new Date();
    // Format in Manila timezone and parse back
    const manilaFormatter = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Manila',
    });

    const parts = manilaFormatter.formatToParts(now);
    const dateObj: Record<string, string> = {};
    parts.forEach(({ type, value }) => {
        dateObj[type] = value;
    });

    return {
        year: parseInt(dateObj.year),
        month: parseInt(dateObj.month),
        day: parseInt(dateObj.day),
        hours: parseInt(dateObj.hour),
        minutes: parseInt(dateObj.minute),
        seconds: parseInt(dateObj.second),
        date: now,
    };
}

/**
 * Format ISO date string to display in Asia/Manila timezone
 * Use this for all date displays in the UI
 */
export function formatDateInManilaTimezone(
    isoString: string,
    options: {
        includeTime?: boolean;
        format?: '12-hour' | '24-hour';
    } = {}
): string {
    const { includeTime = true, format = '12-hour' } = options;

    try {
        const date = new Date(isoString);

        const formatter = new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            ...(includeTime && {
                hour: '2-digit',
                minute: '2-digit',
                hour12: format === '12-hour',
            }),
            timeZone: 'Asia/Manila',
        });

        return formatter.format(date);
    } catch {
        return isoString;
    }
}

/**
 * Format ISO date string for short display (date only)
 */
export function formatDateShortInManilaTimezone(isoString: string): string {
    return formatDateInManilaTimezone(isoString, { includeTime: false });
}

/**
 * Check if a date string is in the future (compared to current time in Manila timezone)
 */
export function isFutureDate(isoString: string): boolean {
    try {
        const date = new Date(isoString);
        const now = new Date();
        return date > now;
    } catch {
        return false;
    }
}

/**
 * Check if a date string is in the past (compared to current time in Manila timezone)
 */
export function isPastDate(isoString: string): boolean {
    try {
        const date = new Date(isoString);
        const now = new Date();
        return date < now;
    } catch {
        return false;
    }
}

/**
 * Get the date string for today in Manila timezone (YYYY-MM-DD format)
 */
export function getTodayDateStringInManilaTimezone(): string {
    const today = getCurrentDateInManilaTimezone();
    return `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
}

/**
 * Compare two ISO date strings (returns -1, 0, or 1)
 * Useful for sorting
 */
export function compareDates(isoString1: string, isoString2: string): number {
    try {
        const date1 = new Date(isoString1);
        const date2 = new Date(isoString2);
        return date1.getTime() - date2.getTime();
    } catch {
        return 0;
    }
}
