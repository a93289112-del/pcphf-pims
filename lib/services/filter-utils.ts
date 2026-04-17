/**
 * ─── SHARED FILTER UTILITIES ─────────────────────────────────────────────────
 * Provides consistent, precise date range calculations for filters across dashboard
 * and medicine-dispensing-sales-monitor pages
 */

// ─── Filter Types ─────────────────────────────────────────────────────────────
export type FilterType = 'monthly' | 'quarterly' | 'annual' | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
}

// ─── Quarter Constants ────────────────────────────────────────────────────────
export const QUARTER_MONTHS: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', [number, number]> = {
  Q1: [0, 2],
  Q2: [3, 5],
  Q3: [6, 8],
  Q4: [9, 11],
};

export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
export type QuarterType = typeof QUARTERS[number];

// ─── Precise Date Range Calculations ───────────────────────────────────────────
/**
 * Gets precise date range for a given filter type
 * - Monthly: 1st to last day of the month, 00:00 to 23:59:59
 * - Quarterly: 1st day of start month to last day of end month, 00:00 to 23:59:59
 * - Annual: January 1st to December 31st, 00:00 to 23:59:59
 */
export function getDateRange(
  filterType: FilterType,
  selectedMonth?: string, // 'YYYY-MM' format
  selectedQuarter?: QuarterType,
  selectedYear?: number,
  startDate?: string,
  endDate?: string,
): DateRange {
  if (filterType === 'monthly' && selectedMonth) {
    const [year, month] = selectedMonth.split('-').map(Number);
    return {
      start: new Date(year, month - 1, 1, 0, 0, 0),
      end: new Date(year, month, 0, 23, 59, 59),
    };
  }

  if (filterType === 'quarterly' && selectedQuarter && selectedYear) {
    const [startMonth, endMonth] = QUARTER_MONTHS[selectedQuarter];
    return {
      start: new Date(selectedYear, startMonth, 1, 0, 0, 0),
      end: new Date(selectedYear, endMonth + 1, 0, 23, 59, 59),
    };
  }

  if (filterType === 'annual' && selectedYear) {
    return {
      start: new Date(selectedYear, 0, 1, 0, 0, 0),
      end: new Date(selectedYear, 11, 31, 23, 59, 59),
    };
  }

  if (filterType === 'custom' && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return {
      start: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0),
      end: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59),
    };
  }

  // Fallback to current month
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };
}

/**
 * Gets the previous period's date range for year-over-year or period-over-period comparisons
 */
export function getPreviousDateRange(
  filterType: FilterType,
  selectedMonth?: string,
  selectedQuarter?: QuarterType,
  selectedYear?: number,
): DateRange {
  if (filterType === 'monthly' && selectedMonth) {
    const [year, month] = selectedMonth.split('-').map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return {
      start: new Date(prevYear, prevMonth - 1, 1, 0, 0, 0),
      end: new Date(prevYear, prevMonth, 0, 23, 59, 59),
    };
  }

  if (filterType === 'quarterly' && selectedQuarter && selectedYear) {
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
    const currentIndex = quarters.indexOf(selectedQuarter);
    const prevIndex = currentIndex === 0 ? 3 : currentIndex - 1;
    const prevQuarter = quarters[prevIndex];
    const prevYear = currentIndex === 0 ? selectedYear - 1 : selectedYear;

    const [startMonth, endMonth] = QUARTER_MONTHS[prevQuarter];
    return {
      start: new Date(prevYear, startMonth, 1, 0, 0, 0),
      end: new Date(prevYear, endMonth + 1, 0, 23, 59, 59),
    };
  }

  if (filterType === 'annual' && selectedYear) {
    return {
      start: new Date(selectedYear - 1, 0, 1, 0, 0, 0),
      end: new Date(selectedYear - 1, 11, 31, 23, 59, 59),
    };
  }

  // Fallback to previous month
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return {
    start: new Date(prevYear, prevMonth, 1, 0, 0, 0),
    end: new Date(prevYear, prevMonth + 1, 0, 23, 59, 59),
  };
}

/**
 * Filters transactions by date range (inclusive on both ends)
 */
export function filterTransactionsByDateRange(
  transactions: Array<{ date: string }>,
  start: Date,
  end: Date,
): Array<{ date: string }> {
  return transactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate >= start && txDate <= end;
  });
}

/**
 * Gets array of available months up to current month
 */
export function getAvailableMonths(count: number = 12): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i);
    months.unshift(d.toISOString().slice(0, 7));
  }
  return months;
}

/**
 * Gets array of available years
 */
export function getAvailableYears(count: number = 5): number[] {
  const now = new Date();
  const years: number[] = [];
  for (let i = 0; i < count; i++) {
    years.push(now.getFullYear() - i);
  }
  return years;
}

/**
 * Formats a month string for display
 */
export function formatMonth(monthStr: string): string {
  try {
    const date = new Date(monthStr + '-01');
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  } catch {
    return monthStr;
  }
}

/**
 * Formats a quarter and year for display
 */
export function formatQuarter(quarter: QuarterType, year: number): string {
  return `${quarter} ${year}`;
}

/**
 * Gets quarter from month number (1-12)
 */
export function getQuarterFromMonth(month: number): QuarterType {
  if (month <= 3) return 'Q1';
  if (month <= 6) return 'Q2';
  if (month <= 9) return 'Q3';
  return 'Q4';
}
