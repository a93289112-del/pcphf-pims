/**
 * ─── INVENTORY SUMMARY SERVICE ────────────────────────────────────────────────
 * Provides comprehensive inventory statistics and analytics
 * Used for staff dashboards and inventory reports
 */

import { type Medicine, type FirebaseTransaction } from '@/lib/types';
import { getEffectiveStock } from './stock-management';

// ─── Summary Interfaces ───────────────────────────────────────────────────────

export interface InventorySummary {
  // Stock Overview
  totalMedicines: number;
  totalStockUnits: number;
  totalStockValue: number;
  avgStockPerMedicine: number;

  // Transaction History
  totalUnitsDispensed: number;
  totalUnitsSold: number;
  totalUnitsAdjusted: number;
  netUnitsRemoved: number;
  totalTransactions: number;

  // Stock Status
  lowStockCount: number;
  outOfStockCount: number;
  expiringCount: number;
  expiredCount: number;
  inStockCount: number;
  criticalCount: number;

  // Time-based Metrics
  dispensingRate: number; // units per day (if data available)
  salesRate: number; // units per day (if data available)
  estimatedDaysSupply: number; // estimated days of supply based on consumption

  // Categories
  stockByCategory: Record<string, number>;
  valueByCategory: Record<string, number>;
}

export interface MedicineInventoryStatus {
  id: string;
  name: string;
  baseName?: string;
  category: string;
  strength?: string;
  currentStock: number;
  minStock: number;
  maxRecommended?: number;
  status: 'inStock' | 'low' | 'out' | 'expired' | 'expiring' | 'critical';
  unitCost: number;
  totalValue: number;
  expirationDate?: string;
  daysToExpiry?: number;
  dispensedQty: number;
  soldQty: number;
  adjustedQty: number;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getTodayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function checkExpired(expirationDate?: string): boolean {
  if (!expirationDate) return false;
  return parseLocalDate(expirationDate) < getTodayMidnight();
}

function checkExpiringSoon(expirationDate?: string): boolean {
  if (!expirationDate) return false;
  const expDate = parseLocalDate(expirationDate);
  const today = getTodayMidnight();
  const days = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return days >= 0 && days <= 30;
}

function getDaysToExpiry(expirationDate?: string): number | undefined {
  if (!expirationDate) return undefined;
  const expDate = parseLocalDate(expirationDate);
  const today = getTodayMidnight();
  const days = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return days >= 0 ? days : undefined;
}

function getMedicineStatus(medicine: Medicine): 'inStock' | 'low' | 'out' | 'expired' | 'expiring' | 'critical' {
  const stock = getEffectiveStock(medicine);
  const minStock = medicine.minStock ?? 0;
  if (checkExpired(medicine.expirationDate)) return 'expired';
  const isExpiring = checkExpiringSoon(medicine.expirationDate);
  const isLowStock = minStock > 0 && stock <= minStock;
  if (isExpiring && isLowStock) return 'critical';
  if (isExpiring) return 'expiring';
  if (stock === 0) return 'out';
  if (isLowStock) return 'low';
  return 'inStock';
}

function parseTransactionDate(dateValue: string | number): Date {
  // Handle numeric timestamps (milliseconds since epoch)
  if (typeof dateValue === 'number') {
    return new Date(dateValue);
  }

  // Handle ISO format or YYYY-MM-DD format
  if (typeof dateValue === 'string') {
    // Try to parse as ISO format first (with or without time)
    if (dateValue.includes('T') || dateValue.includes('Z')) {
      return new Date(dateValue);
    }

    // Parse as local date string (YYYY-MM-DD)
    if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return parseLocalDate(dateValue);
    }

    // Fallback to Date constructor
    return new Date(dateValue);
  }

  return new Date();
}

// ─── Main Summary Calculation ─────────────────────────────────────────────────

export function calculateInventorySummary(
  medicines: Medicine[],
  transactions: FirebaseTransaction[] = [],
  dateRangeStart?: Date,
  dateRangeEnd?: Date,
): InventorySummary {
  // Safety check for undefined or invalid medicines array
  const validMedicines = Array.isArray(medicines) ? medicines : [];

  // Filter transactions by date range if provided
  const filteredTx = dateRangeStart && dateRangeEnd
    ? transactions.filter(tx => {
      const txDate = parseTransactionDate(tx.date);
      return txDate >= dateRangeStart && txDate <= dateRangeEnd;
    })
    : transactions;

  // When date filter is active, only include medicines that have transactions in that range
  const medicinesWithTransactions = new Set<string>();
  filteredTx.forEach(tx => medicinesWithTransactions.add(tx.medicineId));

  const medsToInclude = (dateRangeStart && dateRangeEnd)
    ? validMedicines.filter(med => medicinesWithTransactions.has(med.id))
    : validMedicines;

  // Calculate stock overview
  let totalStockUnits = 0;
  let totalStockValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let expiringCount = 0;
  let expiredCount = 0;
  let inStockCount = 0;
  let criticalCount = 0;

  const stockByCategory: Record<string, number> = {};
  const valueByCategory: Record<string, number> = {};

  medsToInclude.forEach((med) => {
    const stock = getEffectiveStock(med);
    const cost = med.unitCost ?? 0;
    const value = stock * cost;
    const status = getMedicineStatus(med);

    totalStockUnits += stock;
    totalStockValue += value;

    if (status === 'critical') criticalCount += 1;
    if (status === 'low') lowStockCount += 1;
    if (status === 'out') outOfStockCount += 1;
    if (status === 'expiring') expiringCount += 1;
    if (status === 'expired') expiredCount += 1;
    if (status === 'inStock') inStockCount += 1;

    // By category
    const cat = med.category || 'Uncategorized';
    stockByCategory[cat] = (stockByCategory[cat] ?? 0) + stock;
    valueByCategory[cat] = (valueByCategory[cat] ?? 0) + value;
  });

  // Calculate transaction metrics
  let totalUnitsDispensed = 0;
  let totalUnitsSold = 0;
  let totalUnitsAdjusted = 0;

  filteredTx.forEach((tx) => {
    if (tx.type === 'dispense') totalUnitsDispensed += tx.quantity;
    if (tx.type === 'sale') totalUnitsSold += tx.quantity;
    if (tx.type === 'adjustment') totalUnitsAdjusted += tx.quantity;
  });

  const netUnitsRemoved = totalUnitsDispensed + totalUnitsSold;

  // Calculate consumption rates
  let dispensingRate = 0;
  let salesRate = 0;
  let estimatedDaysSupply = 0;

  if (dateRangeStart && dateRangeEnd && transactions.length > 0) {
    const daysDiff = Math.max(1, Math.floor((dateRangeEnd.getTime() - dateRangeStart.getTime()) / (1000 * 60 * 60 * 24)));
    dispensingRate = totalUnitsDispensed / daysDiff;
    salesRate = totalUnitsSold / daysDiff;

    const totalConsumptionRate = dispensingRate + salesRate;
    estimatedDaysSupply = totalConsumptionRate > 0
      ? Math.round((totalStockUnits / totalConsumptionRate) * 10) / 10
      : 0;
  }

  return {
    totalMedicines: medsToInclude.length,
    totalStockUnits,
    totalStockValue,
    avgStockPerMedicine: medsToInclude.length > 0 ? totalStockUnits / medsToInclude.length : 0,
    totalUnitsDispensed,
    totalUnitsSold,
    totalUnitsAdjusted,
    netUnitsRemoved,
    totalTransactions: filteredTx.length,
    lowStockCount,
    outOfStockCount,
    expiringCount,
    expiredCount,
    inStockCount,
    criticalCount,
    dispensingRate,
    salesRate,
    estimatedDaysSupply,
    stockByCategory,
    valueByCategory,
  };
}

// ─── Detailed Medicine Status List ────────────────────────────────────────────

export function getMedicineStatusList(
  medicines: Medicine[],
  transactions: FirebaseTransaction[] = [],
  dateRangeStart?: Date,
  dateRangeEnd?: Date,
): MedicineInventoryStatus[] {
  // Safety check for undefined or invalid medicines array
  const validMedicines = Array.isArray(medicines) ? medicines : [];

  // Filter transactions by date range if provided
  const filteredTx = dateRangeStart && dateRangeEnd
    ? transactions.filter(tx => {
      const txDate = parseTransactionDate(tx.date);
      return txDate >= dateRangeStart && txDate <= dateRangeEnd;
    })
    : transactions;

  const txByMedicine = new Map<string, { dispensed: number; sold: number; adjusted: number }>();

  filteredTx.forEach((tx) => {
    if (!txByMedicine.has(tx.medicineId)) {
      txByMedicine.set(tx.medicineId, { dispensed: 0, sold: 0, adjusted: 0 });
    }
    const record = txByMedicine.get(tx.medicineId)!;
    if (tx.type === 'dispense') record.dispensed += tx.quantity;
    else if (tx.type === 'sale') record.sold += tx.quantity;
    else if (tx.type === 'adjustment') record.adjusted += tx.quantity;
  });

  return validMedicines
    .filter((med) => {
      // When date filter is active, only show medicines with transactions in that range
      if (dateRangeStart && dateRangeEnd) {
        return txByMedicine.has(med.id);
      }
      // When no date filter, show all medicines
      return true;
    })
    .map((med) => {
      const stock = getEffectiveStock(med);
      const cost = med.unitCost ?? 0;
      const status = getMedicineStatus(med);
      const tx = txByMedicine.get(med.id) ?? { dispensed: 0, sold: 0, adjusted: 0 };

      return {
        id: med.id,
        name: med.name || 'Unknown',
        baseName: med.baseName,
        category: med.category || 'Uncategorized',
        strength: med.strength,
        currentStock: stock,
        minStock: med.minStock ?? 0,
        status,
        unitCost: cost,
        totalValue: stock * cost,
        expirationDate: med.expirationDate,
        daysToExpiry: getDaysToExpiry(med.expirationDate),
        dispensedQty: tx.dispensed,
        soldQty: tx.sold,
        adjustedQty: tx.adjusted,
      };
    });
}

// ─── Sorting & Filtering Helpers ──────────────────────────────────────────────

export function sortMedicinesByStatus(
  medicines: MedicineInventoryStatus[],
  order: 'critical' | 'all',
): MedicineInventoryStatus[] {
  const statusPriority: Record<string, number> = {
    expired: 0,
    expiring: 1,
    out: 2,
    low: 3,
    inStock: 4,
  };

  let sorted = [...medicines].sort(
    (a, b) => statusPriority[a.status] - statusPriority[b.status],
  );

  if (order === 'critical') {
    sorted = sorted.filter((m) => m.status !== 'inStock');
  }

  return sorted;
}

export function filterMedicinesByStatus(
  medicines: MedicineInventoryStatus[],
  status: 'all' | 'inStock' | 'low' | 'out' | 'expired' | 'expiring',
): MedicineInventoryStatus[] {
  // Safety check for undefined or invalid medicines array
  const validMedicines = Array.isArray(medicines) ? medicines : [];

  if (status === 'all') return validMedicines;
  return validMedicines.filter((m) => m.status === status);
}

// ─── Category Breakdown ───────────────────────────────────────────────────────

export interface CategoryBreakdown {
  category: string;
  medicineCount: number;
  totalStock: number;
  totalValue: number;
  avgUnitCost: number;
  criticalCount: number;
}

export function getCategoryBreakdown(
  medicines: MedicineInventoryStatus[],
): CategoryBreakdown[] {
  // Safety check for undefined or invalid medicines array
  const validMedicines = Array.isArray(medicines) ? medicines : [];

  const categoryMap = new Map<string, CategoryBreakdown>();

  validMedicines.forEach((med) => {
    if (!categoryMap.has(med.category)) {
      categoryMap.set(med.category, {
        category: med.category,
        medicineCount: 0,
        totalStock: 0,
        totalValue: 0,
        avgUnitCost: 0,
        criticalCount: 0,
      });
    }

    const cat = categoryMap.get(med.category)!;
    cat.medicineCount += 1;
    cat.totalStock += med.currentStock;
    cat.totalValue += med.totalValue;
    if (med.status !== 'inStock') cat.criticalCount += 1;
  });

  return Array.from(categoryMap.values()).map((cat) => ({
    ...cat,
    avgUnitCost: cat.medicineCount > 0
      ? validMedicines
        .filter((m) => m.category === cat.category)
        .reduce((sum, m) => sum + m.unitCost, 0) / cat.medicineCount
      : 0,
  }));
}
