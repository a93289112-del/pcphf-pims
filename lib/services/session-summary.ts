// lib/services/session-summary.ts
// Accurately calculate staff session summary from actual POS sales and dispense records

import { database, getUserPath } from './firebase';
import { ref, get } from 'firebase/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionSalesItem {
  medicineId: string;
  medicineName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  unit?: string;
  category?: string;
}

export interface Sale {
  id: string;
  date: string;
  phDate: string;
  total: number;
  amountPaid: number;
  change: number;
  paymentMethod: string;
  itemCount: number;
  items: SessionSalesItem[];
  createdAt: string;
  userId: string;
}

export interface DispenseRecord {
  id: string;
  patientName: string;
  date: string;
  items: Array<{
    medicineId: string;
    medicineName: string;
    quantity: number;
    unit?: string;
  }>;
  createdAt: string;
  userId: string;
}

export interface MedicineBreakdownEntry {
  sold: number;
  dispensed: number;
  total: number;
  revenue: number;
}

export interface AccurateSessionSummary {
  // Sales data
  totalSalesTransactions: number;
  totalUnitsSold: number;
  totalRevenue: number;
  totalAmountPaid: number;
  totalChange: number;
  averageTransactionValue: number;

  // Dispense data
  totalDispenseTransactions: number;
  totalUnitsDispensed: number;

  // Combined
  totalTransactions: number;
  totalUnitsMovement: number;

  // Breakdown by medicine
  medicineBreakdown: Record<string, MedicineBreakdownEntry>;
}

// ─── Raw Firebase shapes ───────────────────────────────────────────────────────

interface RawSaleItem {
  medicineId?: string;
  medicineName?: string;
  quantity?: number;
  unitPrice?: number;
  subtotal?: number;
  unit?: string;
  category?: string;
}

interface RawSaleRecord {
  // POS page writes both createdAt and date with the same ISO value
  createdAt?: string;
  date?: string;
  total?: number;
  amountPaid?: number;
  change?: number;
  userId?: string;
  items?: RawSaleItem[] | Record<string, RawSaleItem>;
}

interface RawDispenseItem {
  medicineId?: string;
  medicineName?: string;
  quantity?: number;
  unit?: string;
  unitType?: string;
}

interface RawDispenseRecord {
  // Dispense page writes `date`, NOT `createdAt`
  createdAt?: string;
  date?: string;
  userId?: string;
  items?: RawDispenseItem[] | Record<string, RawDispenseItem>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_SUMMARY: AccurateSessionSummary = {
  totalSalesTransactions: 0,
  totalUnitsSold: 0,
  totalRevenue: 0,
  totalAmountPaid: 0,
  totalChange: 0,
  averageTransactionValue: 0,
  totalDispenseTransactions: 0,
  totalUnitsDispensed: 0,
  totalTransactions: 0,
  totalUnitsMovement: 0,
  medicineBreakdown: {},
};

function ensureBreakdown(
  breakdown: Record<string, MedicineBreakdownEntry>,
  name: string,
): MedicineBreakdownEntry {
  if (!breakdown[name]) {
    breakdown[name] = { sold: 0, dispensed: 0, total: 0, revenue: 0 };
  }
  return breakdown[name];
}

/**
 * Resolve the timestamp from a record that may use either `createdAt` or `date`.
 * Returns null if neither field is present or parseable.
 */
function resolveTimestamp(record: RawSaleRecord | RawDispenseRecord): Date | null {
  const raw = record.createdAt ?? record.date;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Normalise items — Firebase stores arrays as either a real JS array
 * or as an object with numeric string keys ("0", "1", …).
 */
function normaliseItems<T>(
  items: T[] | Record<string, T> | undefined,
): T[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  return Object.values(items);
}

// ─── Calculate Accurate Session Summary ───────────────────────────────────────

/**
 * Calculate an accurate session summary from actual POS sales and dispense records.
 * Filters by sessionStartTime and sessionEndTime.
 *
 * Sales path  : userData/{userId}/sales   (user-scoped — matches POS write path)
 * Dispense path: dispensings              (global — matches dispense write path)
 *
 * Timestamp field handling:
 *   Sales     → `createdAt` (primary) or `date` (fallback)
 *   Dispensings → `date` (primary) or `createdAt` (fallback)
 */
export async function calculateAccurateSessionSummary(
  userId: string,
  sessionStartTime: Date,
  sessionEndTime: Date,
): Promise<AccurateSessionSummary> {
  try {
    console.log('[session-summary] Fetching for userId:', userId);
    console.log('[session-summary] Window:', sessionStartTime.toISOString(), '→', sessionEndTime.toISOString());

    const salesPath     = getUserPath(userId, 'sales');
    const dispensePath  = getUserPath(userId, 'dispensings');

    console.log('[session-summary] Sales path:', salesPath);
    console.log('[session-summary] Dispense path:', dispensePath);

    const [salesSnapshot, dispenseSnapshot] = await Promise.all([
      get(ref(database, salesPath)),
      get(ref(database, dispensePath)),
    ]);

    const summary: AccurateSessionSummary = {
      ...EMPTY_SUMMARY,
      medicineBreakdown: {},
    };

    // ── Process sales ─────────────────────────────────────────────────────────
    if (salesSnapshot.exists()) {
      const salesData = salesSnapshot.val() as Record<string, RawSaleRecord>;
      const allSales  = Object.values(salesData);

      console.log('[session-summary] Total sales records found:', allSales.length);

      for (const saleRecord of allSales) {
        const saleTime = resolveTimestamp(saleRecord);

        if (!saleTime) {
          console.warn('[session-summary] Sale record missing timestamp, skipping');
          continue;
        }

        // Filter by userId if present (skip records from other staff)
        if (saleRecord.userId && saleRecord.userId !== userId) continue;

        if (saleTime < sessionStartTime || saleTime > sessionEndTime) continue;

        summary.totalSalesTransactions += 1;
        summary.totalRevenue           += saleRecord.total      ?? 0;
        summary.totalAmountPaid        += saleRecord.amountPaid ?? 0;
        summary.totalChange            += saleRecord.change     ?? 0;

        const items = normaliseItems(saleRecord.items);
        for (const item of items) {
          const qty  = item.quantity ?? 0;
          const name = item.medicineName ?? 'Unknown';

          summary.totalUnitsSold    += qty;
          summary.totalUnitsMovement += qty;

          const entry = ensureBreakdown(summary.medicineBreakdown, name);
          entry.sold    += qty;
          entry.total   += qty;
          entry.revenue += item.subtotal ?? 0;
        }
      }
    } else {
      console.warn('[session-summary] No sales snapshot at path:', salesPath);
    }

    // ── Process dispenses ─────────────────────────────────────────────────────
    if (dispenseSnapshot.exists()) {
      const dispenseData = dispenseSnapshot.val() as Record<string, RawDispenseRecord>;
      const allDispenses = Object.values(dispenseData);

      console.log('[session-summary] Total dispense records found:', allDispenses.length);

      for (const dispenseRecord of allDispenses) {
        const dispenseTime = resolveTimestamp(dispenseRecord);

        if (!dispenseTime) {
          console.warn('[session-summary] Dispense record missing timestamp, skipping');
          continue;
        }

        // Filter by userId — dispense records are global so this is essential
        if (dispenseRecord.userId && dispenseRecord.userId !== userId) continue;

        if (dispenseTime < sessionStartTime || dispenseTime > sessionEndTime) continue;

        summary.totalDispenseTransactions += 1;

        const items = normaliseItems(dispenseRecord.items);
        for (const item of items) {
          const qty  = item.quantity ?? 0;
          const name = item.medicineName ?? 'Unknown';

          summary.totalUnitsDispensed  += qty;
          summary.totalUnitsMovement   += qty;

          const entry = ensureBreakdown(summary.medicineBreakdown, name);
          entry.dispensed += qty;
          entry.total     += qty;
        }
      }
    } else {
      console.warn('[session-summary] No dispense snapshot at path:', dispensePath);
    }

    // ── Derived fields ────────────────────────────────────────────────────────
    summary.totalTransactions =
      summary.totalSalesTransactions + summary.totalDispenseTransactions;

    summary.averageTransactionValue =
      summary.totalSalesTransactions > 0
        ? summary.totalRevenue / summary.totalSalesTransactions
        : 0;

    console.log('[session-summary] Final summary:', {
      sales:     summary.totalSalesTransactions,
      dispenses: summary.totalDispenseTransactions,
      unitsSold: summary.totalUnitsSold,
      unitsDispensed: summary.totalUnitsDispensed,
      revenue:   summary.totalRevenue,
    });

    return summary;
  } catch (error) {
    console.error('[session-summary] Error calculating session summary:', error);
    return { ...EMPTY_SUMMARY, medicineBreakdown: {} };
  }
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

/** Format as Philippine Peso */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

/** Format integer with comma separator */
export function formatNumber(num: number): string {
  return Math.floor(num).toLocaleString();
}