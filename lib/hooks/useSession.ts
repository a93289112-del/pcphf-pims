// lib/hooks/useSession.ts
// Custom hook for managing session state and recording transactions.
//
// SESSION SOURCE OF TRUTH
// -----------------------
// The sidebar tracks sessions via `subscribeToActivityLogs` (the global
// `activityLogs` node), logging `session_started` / `session_ended` events.
// Previously this hook listened to `sessions/{userId}` (a separate Firebase
// node), creating two independent systems that could desync — causing
// `hasActiveSession` to return `true` on the dispense page while the sidebar
// showed no active session (or vice versa).
//
// Fix: this hook now derives `hasActiveSession` from the SAME activity-log
// subscription the sidebar uses, so both components always agree on whether a
// session is open. The `activeSession` / `recordDispense` / etc. helpers that
// write to `sessions/{userId}` are kept intact for transaction recording.

import { useEffect, useState, useCallback } from 'react';
import {
  Session,
  onActiveSessionChange,
  recordSessionTransaction,
  SessionTransaction,
} from '@/lib/services/session-management';
import { subscribeToActivityLogs } from '@/lib/services/activity-logs';

interface UseSessionOptions {
  userId?: string;
  enabled?: boolean;
}

export function useSession(options: UseSessionOptions = {}) {
  const { userId, enabled = true } = options;

  // ── activeSession: used for recording transactions (sessions/{userId}) ──
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  // ── hasActiveSession: derived from activity logs — matches the sidebar ──
  // This is the flag that gates dispensing. By reading from the same source
  // as the sidebar we guarantee they never disagree.
  const [hasActiveSession, setHasActiveSession] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  // ── 1. Keep activeSession in sync (for transaction recording) ──
  useEffect(() => {
    if (!userId || !enabled) return;

    const unsubscribe = onActiveSessionChange(userId, (session) => {
      setActiveSession(session);
    });

    return () => unsubscribe();
  }, [userId, enabled]);

  // ── 2. Derive hasActiveSession from activity logs (matches sidebar) ──
  useEffect(() => {
    if (!userId || !enabled) {
      setHasActiveSession(false);
      return;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const unsubscribe = subscribeToActivityLogs((logs) => {
      // Mirror the exact same filter the sidebar uses
      const todaySessionEvents = logs
        .filter((log) => {
          const isThisUser =
            log.staffId === userId;
          const isToday = new Date(log.timestamp) >= todayStart;
          const isSessionEvent =
            log.type === 'session_started' || log.type === 'session_ended';
          return isThisUser && isToday && isSessionEvent;
        })
        // Oldest → newest so the last element is the most recent event
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

      const lastEvent = todaySessionEvents[todaySessionEvents.length - 1];

      if (!lastEvent || lastEvent.type === 'session_ended') {
        setHasActiveSession(false);
      } else {
        // lastEvent.type === 'session_started'
        setHasActiveSession(true);
      }
    });

    return () => unsubscribe();
  }, [userId, enabled]);

  // ── Record a transaction in the active session ──
  const recordTransaction = useCallback(
    async (transaction: Omit<SessionTransaction, 'timestamp'>) => {
      if (!userId || !activeSession) {
        console.warn('[useSession] No active session to record transaction');
        return false;
      }

      try {
        setIsLoading(true);
        const fullTransaction: SessionTransaction = {
          ...transaction,
          timestamp: new Date().toISOString(),
        };
        await recordSessionTransaction(userId, activeSession.id, fullTransaction);
        return true;
      } catch (error) {
        console.error('[useSession] Failed to record transaction:', error);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [userId, activeSession],
  );

  // ── Quick record helpers ──
  const recordDispense = useCallback(
    async (
      medicineName: string,
      medicineId: string,
      quantity: number,
      unitType?: string,
      patientName?: string,
    ) => {
      return recordTransaction({
        medicineId,
        medicineName,
        quantity,
        type: 'dispense',
        unitType,
        patientName,
      });
    },
    [recordTransaction],
  );

  const recordSale = useCallback(
    async (
      medicineName: string,
      medicineId: string,
      quantity: number,
      unitType?: string,
    ) => {
      return recordTransaction({
        medicineId,
        medicineName,
        quantity,
        type: 'sale',
        unitType,
      });
    },
    [recordTransaction],
  );

  const recordAdjustment = useCallback(
    async (
      medicineName: string,
      medicineId: string,
      quantity: number,
      reason?: string,
    ) => {
      return recordTransaction({
        medicineId,
        medicineName,
        quantity,
        type: 'adjustment',
        patientName: reason,
      });
    },
    [recordTransaction],
  );

  return {
    activeSession,
    isLoading,
    recordTransaction,
    recordDispense,
    recordSale,
    recordAdjustment,
    // ↓ Single source of truth — always agrees with the sidebar
    hasActiveSession,
  };
}