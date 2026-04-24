// lib/services/session-management.ts
// Session management service for tracking transactions from zero per session

import { database } from './firebase';
import { ref, push, set, update, get, query, orderByChild, limitToLast, onValue } from 'firebase/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionTransaction {
  medicineId: string;
  medicineName: string;
  quantity: number;
  type: 'dispense' | 'sale' | 'adjustment';
  timestamp: string;
  referenceId?: string; // Dispense ID or Sale ID
  unitType?: string;
  patientName?: string;
}

export interface SessionSummary {
  dispensedCount: number;
  salesCount: number;
  adjustmentCount: number;
  totalTransactions: number;
  totalUnitsDispensed: number;
  totalUnitsSold: number;
  totalUnitsAdjusted: number;
  totalUnitsMovement: number;
  sessionTransactions: SessionTransaction[];
}

export interface Session {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string;
  isActive: boolean;
  summary: SessionSummary;
  notes?: string;
}

// ─── Raw Firebase Data Type ───────────────────────────────────────────────────

/**
 * Raw session data shape as stored in Firebase.
 * Handles both camelCase and legacy lowercase field names.
 */
interface RawSessionData {
  id?: string;
  userId: string;
  startTime?: string;
  starttime?: string; // legacy
  endTime?: string;
  endtime?: string;   // legacy
  isActive?: boolean;
  notes?: string;
  summary?: {
    dispensedCount?: number;
    salesCount?: number;
    adjustmentCount?: number;
    totalTransactions?: number;
    totalUnitsDispensed?: number;
    totalUnitsSold?: number;
    totalUnitsAdjusted?: number;
    totalUnitsMovement?: number;
    sessionTransactions?: SessionTransaction[];
  };
}

// ─── Session Start ─────────────────────────────────────────────────────────────

/**
 * Start a new session for a user. This creates a new session record in Firebase
 * with all counters initialized to zero.
 */
export async function startSession(userId: string, staffName?: string): Promise<Session> {
  try {
    const sessionsRef = ref(database, `sessions/${userId}`);
    const newSessionRef = push(sessionsRef);
    const sessionId = newSessionRef.key;

    if (!sessionId) throw new Error('Failed to generate session ID');

    const now = new Date().toISOString();
    const newSession: Session = {
      id: sessionId,
      userId,
      startTime: now,
      isActive: true,
      summary: {
        dispensedCount: 0,
        salesCount: 0,
        adjustmentCount: 0,
        totalTransactions: 0,
        totalUnitsDispensed: 0,
        totalUnitsSold: 0,
        totalUnitsAdjusted: 0,
        totalUnitsMovement: 0,
        sessionTransactions: [],
      },
      notes: staffName ? `Session started by ${staffName}` : undefined,
    };

    await set(newSessionRef, newSession);
    return newSession;
  } catch (error) {
    console.error('Error starting session:', error);
    throw new Error(`Failed to start session: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ─── Record Transaction ────────────────────────────────────────────────────────

/**
 * Record a transaction in the current active session.
 * Increments appropriate counters based on transaction type.
 */
export async function recordSessionTransaction(
  userId: string,
  sessionId: string,
  transaction: SessionTransaction,
): Promise<void> {
  try {
    const sessionRef = ref(database, `sessions/${userId}/${sessionId}`);
    const sessionSnapshot = await get(sessionRef);

    if (!sessionSnapshot.exists()) {
      throw new Error('Session not found');
    }

    const session = sessionSnapshot.val() as Session;

    // Add transaction to array (ensure sessionTransactions is always an array)
    const currentTransactions = Array.isArray(session.summary.sessionTransactions)
      ? session.summary.sessionTransactions
      : [];
    const updatedTransactions = [...currentTransactions, transaction];

    // Update counters
    const updatedSummary: SessionSummary = {
      ...session.summary,
      sessionTransactions: updatedTransactions,
      totalTransactions: session.summary.totalTransactions + 1,
    };

    if (transaction.type === 'dispense') {
      updatedSummary.dispensedCount += 1;
      updatedSummary.totalUnitsDispensed += transaction.quantity;
      updatedSummary.totalUnitsMovement += transaction.quantity;
    } else if (transaction.type === 'sale') {
      updatedSummary.salesCount += 1;
      updatedSummary.totalUnitsSold += transaction.quantity;
      updatedSummary.totalUnitsMovement += transaction.quantity;
    } else if (transaction.type === 'adjustment') {
      updatedSummary.adjustmentCount += 1;
      updatedSummary.totalUnitsAdjusted += transaction.quantity;
    }

    await update(sessionRef, { summary: updatedSummary });
  } catch (error) {
    console.error('Error recording session transaction:', error);
    throw new Error(`Failed to record transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ─── Normalize Session Data ───────────────────────────────────────────────────

/**
 * Normalize session data from Firebase to ensure consistent field names.
 * Handles both camelCase and lowercase variants.
 */
function normalizeSession(id: string, sessionData: RawSessionData): Session {
  return {
    id: sessionData.id ?? id,
    userId: sessionData.userId,
    // Handle both startTime and starttime (legacy data)
    startTime: sessionData.startTime ?? sessionData.starttime ?? new Date().toISOString(),
    // Handle both endTime and endtime (legacy data)
    endTime: sessionData.endTime ?? sessionData.endtime,
    isActive: sessionData.isActive ?? true,
    summary: {
      dispensedCount: sessionData.summary?.dispensedCount ?? 0,
      salesCount: sessionData.summary?.salesCount ?? 0,
      adjustmentCount: sessionData.summary?.adjustmentCount ?? 0,
      totalTransactions: sessionData.summary?.totalTransactions ?? 0,
      totalUnitsDispensed: sessionData.summary?.totalUnitsDispensed ?? 0,
      totalUnitsSold: sessionData.summary?.totalUnitsSold ?? 0,
      totalUnitsAdjusted: sessionData.summary?.totalUnitsAdjusted ?? 0,
      totalUnitsMovement: sessionData.summary?.totalUnitsMovement ?? 0,
      sessionTransactions: Array.isArray(sessionData.summary?.sessionTransactions)
        ? sessionData.summary.sessionTransactions
        : [],
    },
    notes: sessionData.notes,
  };
}

// ─── Get Active Session ─────────────────────────────────────────────────────────

/**
 * Retrieve the current active session for a user.
 */
export async function getActiveSession(userId: string): Promise<Session | null> {
  try {
    const sessionsRef = ref(database, `sessions/${userId}`);
    const snapshot = await get(query(sessionsRef, orderByChild('isActive'), limitToLast(1)));

    if (!snapshot.exists()) return null;

    const sessions = snapshot.val() as Record<string, RawSessionData>;
    const sessionArray = Object.entries(sessions)
      .map(([id, sessionData]) => normalizeSession(id, sessionData))
      .filter((s) => s && s.isActive);

    return sessionArray.length > 0 ? sessionArray[0] : null;
  } catch (error) {
    console.error('Error getting active session:', error);
    return null;
  }
}

// ─── End Session ───────────────────────────────────────────────────────────────

/**
 * End the current active session. This marks the session as inactive,
 * records the end time, and prevents further transactions from being added.
 */
export async function endSession(userId: string, sessionId: string, notes?: string): Promise<Session> {
  try {
    const sessionRef = ref(database, `sessions/${userId}/${sessionId}`);
    const sessionSnapshot = await get(sessionRef);

    if (!sessionSnapshot.exists()) {
      throw new Error('Session not found');
    }

    const session = sessionSnapshot.val() as Session;
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      isActive: false,
      endTime: now,
    };

    if (notes) {
      updates.notes = notes;
    }

    await update(sessionRef, updates);

    return {
      ...session,
      isActive: false,
      endTime: now,
      notes: notes || session.notes,
    };
  } catch (error) {
    console.error('Error ending session:', error);
    throw new Error(`Failed to end session: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ─── Listen to Active Session ──────────────────────────────────────────────────

/**
 * Real-time listener for the current active session.
 * Useful for updating UI with live transaction counts.
 */
export function onActiveSessionChange(
  userId: string,
  callback: (session: Session | null) => void,
): () => void {
  try {
    const sessionsRef = ref(database, `sessions/${userId}`);

    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      const sessions = snapshot.val() as Record<string, RawSessionData>;
      const sessionArray = Object.entries(sessions)
        .map(([id, sessionData]) => normalizeSession(id, sessionData))
        .filter((s) => s && s.isActive);

      if (sessionArray.length === 0) {
        callback(null);
      } else {
        // Return the most recently started active session
        const sorted = sessionArray.sort(
          (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
        );
        callback(sorted[0]);
      }
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up active session listener:', error);
    return () => {};
  }
}

// ─── Get Session History ──────────────────────────────────────────────────────

/**
 * Retrieve all sessions for a user, optionally filtered by date range.
 */
export async function getUserSessions(
  userId: string,
  filters?: { startDate?: string; endDate?: string },
): Promise<Session[]> {
  try {
    const sessionsRef = ref(database, `sessions/${userId}`);
    const snapshot = await get(sessionsRef);

    if (!snapshot.exists()) return [];

    let sessions = Object.entries(snapshot.val() as Record<string, RawSessionData>).map(
      ([id, sessionData]) => normalizeSession(id, sessionData),
    );

    if (filters?.startDate) {
      const startDate = new Date(filters.startDate).getTime();
      sessions = sessions.filter((s) => new Date(s.startTime).getTime() >= startDate);
    }

    if (filters?.endDate) {
      const endDate = new Date(filters.endDate).getTime();
      sessions = sessions.filter((s) => {
        const sessionEnd = s.endTime ? new Date(s.endTime).getTime() : Date.now();
        return sessionEnd <= endDate;
      });
    }

    return sessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  } catch (error) {
    console.error('Error retrieving user sessions:', error);
    return [];
  }
}

// ─── Get Session Details ──────────────────────────────────────────────────────

/**
 * Retrieve detailed information about a specific session.
 */
export async function getSessionDetails(userId: string, sessionId: string): Promise<Session | null> {
  try {
    const sessionRef = ref(database, `sessions/${userId}/${sessionId}`);
    const snapshot = await get(sessionRef);

    if (!snapshot.exists()) return null;

    return snapshot.val() as Session;
  } catch (error) {
    console.error('Error retrieving session details:', error);
    return null;
  }
}

// ─── Reset Session Transactions ────────────────────────────────────────────────

/**
 * Clear all transactions from a session while keeping the session open.
 * Useful for session snapshots or mid-session resets.
 */
export async function resetSessionTransactions(userId: string, sessionId: string): Promise<void> {
  try {
    const sessionRef = ref(database, `sessions/${userId}/${sessionId}`);
    const emptySessionSummary: SessionSummary = {
      dispensedCount: 0,
      salesCount: 0,
      adjustmentCount: 0,
      totalTransactions: 0,
      totalUnitsDispensed: 0,
      totalUnitsSold: 0,
      totalUnitsAdjusted: 0,
      totalUnitsMovement: 0,
      sessionTransactions: [],
    };

    await update(sessionRef, { summary: emptySessionSummary });
  } catch (error) {
    console.error('Error resetting session transactions:', error);
    throw new Error(
      `Failed to reset session transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}