/**
 * Unified stock management service for Dispense and POS modules
 * Ensures consistent stock deduction logic across both features
 */

import { database, getUserPath } from './firebase';
import { ref, get, update, push, set } from 'firebase/database';
import { type Medicine, type MedicineBatch, type FirebaseTransaction as TransactionData, type TransactionType } from '../types';

interface DeductStockParams {
  medicineId: string;
  quantity: number;
  type: TransactionType;
  referenceId?: string; // dispense_id or sale_id
  userId?: string;
  notes?: string;
  unitPrice?: number; // selling price for sales
}

interface DeductStockResult {
  success: boolean;
  newStock: number;
  totalCost?: number;
  totalPieces?: number;
  error?: string;
}

/**
 * Gets the effective current stock of a medicine
 */
export function getEffectiveStock(medicine: Medicine): number {
  if (medicine.quantity !== undefined) return medicine.quantity;
  return Math.max(medicine.stockPerUnit ?? 0, medicine.stockPerPieces ?? 0);
}

/**
 * Unified stock deduction function used by both Dispense and POS
 * Atomically updates medicine stock and logs transaction
 */
export async function deductStock(
  params: DeductStockParams
): Promise<DeductStockResult> {
  const { medicineId, quantity, type, referenceId, userId, notes, unitPrice } = params;

  try {
    // Fetch current medicine data (now using global shared inventory)
    const medRef = ref(database, getUserPath(userId, `medicines/${medicineId}`));
    const medSnapshot = await get(medRef);

    if (!medSnapshot.exists()) {
      return { success: false, newStock: 0, error: 'Medicine not found' };
    }

    const medicine = medSnapshot.val() as Medicine;
    const currentStock = getEffectiveStock(medicine);

    // Validate sufficient stock
    if (currentStock < quantity) {
      return {
        success: false,
        newStock: currentStock,
        error: `Insufficient stock. Available: ${currentStock}, Requested: ${quantity}`,
      };
    }

    // Calculate new stock
    const newStock = Math.max(0, currentStock - quantity);
    const unitCost = medicine.unitCost || 0;
    const ppu = medicine.piecesPerUnit;

    // Prepare updates for medicine
    const updates: Record<string, number | undefined> = {
      stockPerUnit: newStock,
      totalCost: newStock * unitCost,
      ...(ppu !== undefined ? { 
        totalPieces: newStock * ppu,
        stockPerPieces: newStock * ppu 
      } : {}),
    };

    if (medicine.quantity !== undefined) {
      updates['quantity'] = newStock;
    }
    if (medicine.stockPerPieces !== undefined && ppu !== undefined) {
      updates['stockPerPieces'] = newStock * ppu;
    } else if (medicine.stockPerPieces !== undefined && ppu === undefined) {
      // If no ppu, stockPerPieces is likely same as stockPerUnit/quantity
      updates['stockPerPieces'] = newStock;
    }

    // Execute: update medicine stock
    await update(medRef, updates);

    // Log transaction (for audit trail)
    const transactionData: TransactionData = {
      date: new Date().toISOString(),
      type,
      medicineId,
      quantity,
      previousStock: currentStock,
      newStock,
      unitCost,
    };

    if (referenceId) transactionData.referenceId = referenceId;
    if (userId) transactionData.userId = userId;
    if (notes) transactionData.notes = notes;
    if (unitPrice !== undefined) transactionData.unitPrice = unitPrice;

    // Log transaction to global transactions log (shared across all staff)
    // userId is still tracked for audit trail purposes
    await set(push(ref(database, getUserPath(userId, 'transactions'))), transactionData);

    return {
      success: true,
      newStock,
      totalCost: newStock * unitCost,
      totalPieces: ppu !== undefined ? newStock * ppu : undefined,
    };
  } catch (error) {
    console.error('Error deducting stock:', error);
    return {
      success: false,
      newStock: 0,
      error: `Failed to deduct stock: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Batch deduct stock for multiple items (used in POS checkout)
 * Uses FEFO (First Expired, First Out) logic for batch-aware inventory
 * Attempts to deduct all items; returns detailed results
 */
export async function deductStockBatch(
  items: Array<Omit<DeductStockParams, 'referenceId'> & { referenceId?: string }>,
  referenceId: string
): Promise<{
  success: boolean;
  results: DeductStockResult[];
  error?: string;
}> {
  const results: DeductStockResult[] = [];

  for (const item of items) {
    // Use FEFO deduction for batch-aware inventory
    const result = await deductStockFEFO({
      ...item,
      referenceId,
    });
    results.push(result);

    if (!result.success) {
      // On first failure, return error
      return {
        success: false,
        results,
        error: `Failed to deduct item: ${result.error}`,
      };
    }
  }

  return { success: true, results };
}

/**
 * Helper: Get stock availability status
 */
export function getStockStatus(
  medicine: Medicine,
  minStock: number = 0
): { status: 'in' | 'low' | 'out'; label: string } {
  const stock = getEffectiveStock(medicine);
  if (stock === 0) return { status: 'out', label: 'Out of Stock' };
  if (minStock > 0 && stock <= minStock) return { status: 'low', label: 'Low Stock' };
  return { status: 'in', label: 'In Stock' };
}

/**
 * FEFO (First Expired, First Out) Deduction
 * Deducts stock from the batch with the earliest expiration date first
 * Removes batches when quantity reaches 0
 */
export async function deductStockFEFO(
  params: DeductStockParams
): Promise<DeductStockResult> {
  const { medicineId, quantity, type, referenceId, userId, notes, unitPrice } = params;

  try {
    const medRef = ref(database, getUserPath(userId, `medicines/${medicineId}`));
    const medSnapshot = await get(medRef);

    if (!medSnapshot.exists()) {
      return { success: false, newStock: 0, error: 'Medicine not found' };
    }

    const medicine = medSnapshot.val() as Medicine & { batches?: Record<string, MedicineBatch> };
    const currentStock = getEffectiveStock(medicine);

    // Validate sufficient stock
    if (currentStock < quantity) {
      return {
        success: false,
        newStock: currentStock,
        error: `Insufficient stock. Available: ${currentStock}, Requested: ${quantity}`,
      };
    }

    // If no batches exist, fall back to simple deduction
    if (!medicine.batches || Object.keys(medicine.batches).length === 0) {
      console.log(`⚠️ No batches found for medicine ${medicineId} - Using simple deduction (NOT FEFO)`);
      return deductStock(params);
    }

    console.log(`🔵 Using FEFO deduction for medicine ${medicineId}:`, {
      quantity,
      batchCount: Object.keys(medicine.batches).length,
      batches: medicine.batches,
    });

    // Sort batches by expiration date (FEFO)
    const batchEntries = Object.entries(medicine.batches);
    const sortedBatches = batchEntries.sort(([, batchA], [, batchB]) => {
      const dateA = new Date(batchA.expirationDate).getTime();
      const dateB = new Date(batchB.expirationDate).getTime();
      return dateA - dateB;
    });

    console.log(`📅 FEFO sorted batches:`, sortedBatches.map(([id, b]) => ({
      batchId: id,
      qty: b.quantity,
      expiration: b.expirationDate,
    })));

    let remainingQty = quantity;
    const updates: Record<string, unknown> = {};
    const medicinesBasePath = getUserPath(userId, 'medicines');

    // Deduct from batches in FEFO order
    for (const [batchId, batch] of sortedBatches) {
      if (remainingQty <= 0) break;

      if (batch.quantity >= remainingQty) {
        // This batch has enough to cover remaining quantity
        const newBatchQty = batch.quantity - remainingQty;
        if (newBatchQty > 0) {
          updates[`${medicinesBasePath}/${medicineId}/batches/${batchId}/quantity`] = newBatchQty;
        } else {
          // Remove batch if quantity reaches 0
          updates[`${medicinesBasePath}/${medicineId}/batches/${batchId}`] = null;
        }
        remainingQty = 0;
      } else {
        // Use entire batch and continue to next batch
        remainingQty -= batch.quantity;
        // Remove batch when depleted
        updates[`${medicinesBasePath}/${medicineId}/batches/${batchId}`] = null;
      }
    }

    // Calculate new total quantity and earliest expiration
    const newStock = currentStock - quantity;
    const unitCost = medicine.unitCost || 0;
    const ppu = medicine.piecesPerUnit;

    updates[`${medicinesBasePath}/${medicineId}/quantity`] = newStock;
    updates[`${medicinesBasePath}/${medicineId}/stockPerUnit`] = newStock;
    updates[`${medicinesBasePath}/${medicineId}/totalCost`] = newStock * unitCost;

    if (ppu !== undefined) {
      updates[`${medicinesBasePath}/${medicineId}/totalPieces`] = newStock * ppu;
      updates[`${medicinesBasePath}/${medicineId}/stockPerPieces`] = newStock * ppu;
    }

    // Recalculate earliest expiration from remaining batches
    const remainingBatches = sortedBatches
      .filter(([batchId]) => updates[`${medicinesBasePath}/${medicineId}/batches/${batchId}`] !== null)
      .map(([, batch]) => batch);

    if (remainingBatches.length > 0) {
      const earliestExpiration = remainingBatches.reduce((earliest, batch) => {
        const batchDate = new Date(batch.expirationDate);
        return batchDate < earliest ? batchDate : earliest;
      }, new Date(remainingBatches[0].expirationDate));
      
      // Format as YYYY-MM-DD to match stock adjustment format for consistency
      const normalizedDate = earliestExpiration.toISOString().split('T')[0];
      updates[`${medicinesBasePath}/${medicineId}/expirationDate`] = normalizedDate;
      
      console.log(`🔵 After FEFO deduction - Medicine ${medicineId}:`, {
        remainingBatches: remainingBatches.length,
        newExpirationDate: normalizedDate,
        deductedQuantity: quantity,
        newStock,
      });
    } else {
      // No batches left - clear expiration date
      updates[`${medicinesBasePath}/${medicineId}/expirationDate`] = null;
      console.log(`🟡 No batches remaining - Clearing expiration for medicine ${medicineId}`);
    }

    // Execute update using root database reference with absolute paths
    await update(ref(database), updates);

    // Log transaction
    const transactionData: TransactionData = {
      date: new Date().toISOString(),
      type,
      medicineId,
      quantity,
      previousStock: currentStock,
      newStock,
      unitCost,
    };

    if (referenceId) transactionData.referenceId = referenceId;
    if (userId) transactionData.userId = userId;
    if (notes) transactionData.notes = notes;
    if (unitPrice !== undefined) transactionData.unitPrice = unitPrice;

    await set(push(ref(database, getUserPath(userId, 'transactions'))), transactionData);

    return {
      success: true,
      newStock,
      totalCost: newStock * unitCost,
      totalPieces: ppu !== undefined ? newStock * ppu : undefined,
    };
  } catch (error) {
    console.error('Error deducting stock with FEFO:', error);
    return {
      success: false,
      newStock: 0,
      error: `Failed to deduct stock: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check for expired or expiring batches (within 30 days)
 */
export function getExpirationAlerts(
  medicine: Medicine & { batches?: Record<string, MedicineBatch> }
): { expired: MedicineBatch[]; expiring: MedicineBatch[] } {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const expired: MedicineBatch[] = [];
  const expiring: MedicineBatch[] = [];

  if (!medicine.batches) return { expired, expiring };

  Object.values(medicine.batches).forEach((batch) => {
    const expiryDate = new Date(batch.expirationDate);
    if (expiryDate < now) {
      expired.push(batch);
    } else if (expiryDate <= thirtyDaysFromNow) {
      expiring.push(batch);
    }
  });

  return { expired, expiring };
}

/**
 * Recalculate and get the earliest expiration date from batches
 * Returns null if no batches exist
 */
export function getEarliestExpirationFromBatches(
  batches?: Record<string, MedicineBatch>
): string | null {
  if (!batches || Object.keys(batches).length === 0) return null;
  
  const expirationDates = Object.values(batches).map(b => b.expirationDate);
  if (expirationDates.length === 0) return null;
  
  const earliest = expirationDates.reduce((min, current) => {
    return new Date(current) < new Date(min) ? current : min;
  });
  
  return earliest;
}

/**
 * Get the true earliest expiration from a medicine (considering both batches AND legacy expirationDate)
 * This is useful for card display and FIFO compatibility
 */
export function getTrueEarliestExpiration(medicine: Medicine): string | undefined {
  const allExpirations: string[] = [];
  
  // Include batches' expirations
  if (medicine.batches && typeof medicine.batches === 'object') {
    Object.values(medicine.batches).forEach((batch: MedicineBatch) => {
      if (batch?.expirationDate && typeof batch.expirationDate === 'string') {
        allExpirations.push(batch.expirationDate);
      }
    });
  }
  
  // Include medicine's expirationDate (legacy data or current record)
  if (medicine.expirationDate && typeof medicine.expirationDate === 'string') {
    // Add it if not already included
    if (!allExpirations.includes(medicine.expirationDate)) {
      allExpirations.push(medicine.expirationDate);
    }
  }
  
  if (allExpirations.length === 0) {
    console.warn('⚠️ No expiration dates found for medicine:', medicine.id, medicine.name);
    return undefined;
  }
  
  // Find earliest
  const earliest = allExpirations.reduce((min, current) => {
    return new Date(current) < new Date(min) ? current : min;
  });
  
  console.log(`📅 getTrueEarliestExpiration for ${medicine.name}:`, {
    allExpirations,
    earliest,
    batchCount: medicine.batches ? Object.keys(medicine.batches).length : 0,
  });
  
  return earliest;
}
