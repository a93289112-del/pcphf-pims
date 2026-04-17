// lib/services/activity-logs.ts
// Complete activity logging service for the pharmacy management system

import { database } from './firebase';
import { ref, push, set, update, onValue } from 'firebase/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityType =
  | 'admin_login'
  | 'admin_logout'
  | 'staff_login'
  | 'staff_logout'
  | 'password_changed'
  | 'stock_deducted'
  | 'stock_adjusted'
  | 'medicine_dispensed'
  | 'medicine_sold'
  | 'staff_created'
  | 'staff_disabled'
  | 'session_ended'
  | 'session_started'
  | 'medicine_restocked';

export interface ActivityLogDetails {
  medicineId?: string;
  medicineName?: string;
  quantity?: number;
  unitType?: string;
  patientName?: string;
  patientId?: string;
  dispensId?: string;
  saleId?: string;
  unitPrice?: number;
  subtotal?: number;
  previousValue?: number | string;
  newValue?: number | string;
  reason?: string;
  // For session_ended activity type
  sessionStartTime?: string;
  sessionEndTime?: string;
  sessionDurationMinutes?: number;
  totalUnitsDispensed?: number;
  totalSalesTransactions?: number;
  totalDispenseTransactions?: number;
  totalTransactions?: number;
  lowStockCount?: number;
  expiredCount?: number;
  outOfStockCount?: number;
  totalCriticalAlerts?: number;
  sessionSummary?: string;
  detailedBreakdown?: string;
  [key: string]: unknown;
}

export interface ActivityLog {
  id: string;
  type: ActivityType;
  staffId: string;
  staffEmail: string;
  staffName?: string;
  action: string;
  details?: ActivityLogDetails;
  timestamp: string;
  isActive?: boolean;
  userRole?: 'admin' | 'staff';
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Recursively remove undefined values from an object so Firebase
 * doesn't throw "Cannot serialize undefined" errors.
 */
export function removeUndefinedProperties<T extends Record<string, unknown>>(obj: T): T {
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === undefined) continue;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      clean[key] = removeUndefinedProperties(val as Record<string, unknown>);
    } else {
      clean[key] = val;
    }
  }
  return clean as T;
}

// ─── Core logging function ────────────────────────────────────────────────────

/**
 * Write a single activity log entry to the global `activityLogs` node.
 *
 * The path is intentionally at the root level (not under a user's path)
 * so the admin dashboard can read all staff activity in one place.
 */
export async function logActivity(
  type: ActivityType,
  staffId: string,
  staffEmail: string,
  action: string,
  details?: ActivityLogDetails,
  staffName?: string,
  userRole?: 'admin' | 'staff',
): Promise<void> {
  try {
    const logsRef = ref(database, 'activityLogs');
    const newLogRef = push(logsRef);

    const logEntry = removeUndefinedProperties({
      type,
      staffId,
      staffEmail,
      staffName: staffName ?? staffEmail,
      action,
      details: details ?? {},
      timestamp: new Date().toISOString(),
      isActive: false,
      userRole,
    });

    await set(newLogRef, logEntry);
    console.log('[activity-logs] Successfully logged activity:', {
      type,
      staffEmail,
      action: action.substring(0, 50),
      timestamp: logEntry.timestamp,
    });
  } catch (err) {
    // Never throw from a logging call — we don't want logging failures
    // to break the main operation (dispensing, selling, etc.)
    console.error('[activity-logs] Failed to write log:', {
      error: err instanceof Error ? err.message : String(err),
      type,
      staffEmail,
      action: action.substring(0, 50),
    });
  }
}

// ─── Staff active status ──────────────────────────────────────────────────────

/**
 * Update the `isActive` flag on the user's profile node.
 * Staff logs their own isActive flag, admins read all logs to see who is online.
 */
export async function updateStaffActiveStatus(
  staffId: string,
  isActive: boolean,
): Promise<void> {
  try {
    const userRef = ref(database, `users/${staffId}`);
    await update(userRef, {
      isActive,
      lastActivityTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[activity-logs] Failed to update staff active status:', err);
  }
}

// ─── Subscription helpers ─────────────────────────────────────────────────────

/**
 * Subscribe to ALL activity logs (newest first).
 * Used by the admin System Notifications page.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToActivityLogs(
  callback: (logs: ActivityLog[]) => void,
): () => void {
  const logsRef = ref(database, 'activityLogs');

  const unsub = onValue(
    logsRef,
    (snap) => {
      if (!snap.exists()) {
        console.log('[activity-logs] subscribeToActivityLogs: No logs found in database');
        callback([]);
        return;
      }
      const raw = snap.val() as Record<string, Omit<ActivityLog, 'id'>>;
      const logs: ActivityLog[] = Object.entries(raw)
        .map(([id, v]) => ({ id, ...v }))
        // Newest first
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      console.log('[activity-logs] subscribeToActivityLogs: Received', logs.length, 'logs');
      callback(logs);
    },
    (err) => {
      console.error('[activity-logs] subscribeToActivityLogs error:', err);
      callback([]);
    },
  );

  return unsub;
}

/**
 * Subscribe to activity logs for a specific staff member.
 * Useful for per-staff dashboards.
 */
export function subscribeToStaffActivityLogs(
  staffId: string,
  callback: (logs: ActivityLog[]) => void,
): () => void {
  const logsRef = ref(database, 'activityLogs');

  const unsub = onValue(
    logsRef,
    (snap) => {
      if (!snap.exists()) {
        callback([]);
        return;
      }
      const raw = snap.val() as Record<string, Omit<ActivityLog, 'id'>>;
      const logs: ActivityLog[] = Object.entries(raw)
        .map(([id, v]) => ({ id, ...v }))
        .filter((log) => log.staffId === staffId)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      callback(logs);
    },
    (err) => {
      console.error('[activity-logs] subscribeToStaffActivityLogs error:', err);
      callback([]);
    },
  );

  return unsub;
}

/**
 * Subscribe to activity logs filtered by type.
 * e.g. subscribeToActivityLogsByType('medicine_dispensed', cb)
 */
export function subscribeToActivityLogsByType(
  type: ActivityType,
  callback: (logs: ActivityLog[]) => void,
): () => void {
  const logsRef = ref(database, 'activityLogs');

  const unsub = onValue(
    logsRef,
    (snap) => {
      if (!snap.exists()) {
        callback([]);
        return;
      }
      const raw = snap.val() as Record<string, Omit<ActivityLog, 'id'>>;
      const logs: ActivityLog[] = Object.entries(raw)
        .map(([id, v]) => ({ id, ...v }))
        .filter((log) => log.type === type)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      callback(logs);
    },
    (err) => {
      console.error('[activity-logs] subscribeToActivityLogsByType error:', err);
      callback([]);
    },
  );

  return unsub;
}