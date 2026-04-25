// lib/hooks/useAdminSessionData.ts
//
// Fetches a staff session from Firebase (`sessions/{staffId}/{sessionId}`)
// and returns data shaped as ActivityLogDetails — the exact type the
// AdminSessionSummaryModal expects.
//
// KEY FIX: When the admin clicks "View" on a session_started log, we only
// have the session START time from the activity log. We must look up the
// matching session_ended log (or use now) to get the real end time, then
// use that full window to query sales + dispensings.

import { useEffect, useState } from 'react';
import { database } from '@/lib/services/firebase';
import { ref, get } from 'firebase/database';
import { calculateAccurateSessionSummary } from '@/lib/services/session-summary';
import { subscribeToActivityLogs } from '@/lib/services/activity-logs';

// ─── ActivityLogDetails ────────────────────────────────────────────────────
// Mirrors the interface in admin-session-summary-modal.tsx exactly.

export interface ActivityLogDetails {
  sessionStartTime?: string;
  sessionEndTime?: string;
  sessionDurationMinutes?: number;
  sessionSummary?: string;

  totalUnitsDispensed?: number;
  totalUnitsSold?: number;
  totalUnitsMovement?: number;

  totalDispenseTransactions?: number;
  totalSalesTransactions?: number;
  totalTransactions?: number;

  totalRevenue?: number;
  totalAmountPaid?: number;
  averageTransactionValue?: number;

  lowStockCount?: number;
  expiredCount?: number;
  outOfStockCount?: number;
  totalCriticalAlerts?: number;
}

// ─── Hook return type ──────────────────────────────────────────────────────

export interface UseAdminSessionDataResult {
  data: ActivityLogDetails | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

// ─── Raw Firebase session shape ────────────────────────────────────────────

interface RawSession {
  userId?: string;
  startTime?: string;
  starttime?: string;   // legacy lowercase variant
  endTime?: string;
  endtime?: string;     // legacy lowercase variant
  isActive?: boolean;
  notes?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function calcDurationMinutes(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end   = new Date(endIso).getTime();
  return Math.max(0, Math.round((end - start) / 60_000));
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useAdminSessionData(
  staffId: string | null,
  sessionId: string | null,
): UseAdminSessionDataResult {
  const [data,      setData]      = useState<ActivityLogDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [fetchKey,  setFetchKey]  = useState(0);

  const refetch = () => setFetchKey((k) => k + 1);

  useEffect(() => {
    if (!staffId || !sessionId) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        // ── 1. Fetch the session record from sessions/{staffId}/{sessionId} ──
        const sessionRef = ref(database, `sessions/${staffId}/${sessionId}`);
        const snap       = await get(sessionRef);

        if (cancelled) return;

        let startTime: string;
        let endTime: string | null = null;
        let isActive               = false;

        if (snap.exists()) {
          const raw = snap.val() as RawSession;
          startTime = raw.startTime ?? raw.starttime ?? new Date().toISOString();
          endTime   = raw.endTime   ?? raw.endtime   ?? null;
          isActive  = raw.isActive  ?? false;
        } else {
          // Session node missing — fall back to a wide window.
          // The activity log timestamp (passed as sessionId fallback) is the
          // start; use now as the end so we capture everything.
          console.warn(
            `[useAdminSessionData] No session node at sessions/${staffId}/${sessionId}`,
          );
          startTime = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
          endTime   = null;
          isActive  = false;
        }

        // ── 2. If session is still active, end = now.
        //    If ended but endTime is missing, find it from activity logs. ────
        if (isActive || !endTime) {
          if (isActive) {
            // Session currently open — use now so we include all transactions so far
            endTime = new Date().toISOString();
          } else {
            // Session was ended but endTime wasn't recorded on the session node.
            // Find the matching session_ended activity log for this staff member
            // whose timestamp is >= startTime.
            endTime = await findSessionEndTime(staffId!, startTime);
          }
        }

        // ── 3. Build the query window ─────────────────────────────────────
        const sessionStart = new Date(startTime);
        // +60 s buffer to catch any transactions written just after end
        const sessionEnd   = new Date(new Date(endTime).getTime() + 60_000);

        console.log('[useAdminSessionData] Querying window:', {
          staffId,
          sessionId,
          startTime,
          endTime,
          windowMs: sessionEnd.getTime() - sessionStart.getTime(),
        });

        // ── 4. Calculate summary from actual sales + dispensings records ───
        // getUserPath('sales') → userData/{uid}/sales  (user-scoped)
        // getUserPath('dispensings') → dispensings      (global, filtered by userId)
        // session-summary.ts already uses getUserPath internally, so we just
        // pass staffId and the time window.
        const summary = await calculateAccurateSessionSummary(
          staffId!,
          sessionStart,
          sessionEnd,
        );

        if (cancelled) return;

        console.log('[useAdminSessionData] Summary result:', summary);

        // ── 5. Map to flat ActivityLogDetails shape ────────────────────────
        const result: ActivityLogDetails = {
          sessionStartTime:       startTime,
          sessionEndTime:         endTime,
          sessionDurationMinutes: calcDurationMinutes(startTime, endTime),

          totalDispenseTransactions: summary.totalDispenseTransactions,
          totalSalesTransactions:    summary.totalSalesTransactions,
          totalTransactions:         summary.totalTransactions,

          totalUnitsDispensed: summary.totalUnitsDispensed,
          totalUnitsSold:      summary.totalUnitsSold,
          totalUnitsMovement:  summary.totalUnitsMovement,

          totalRevenue:            summary.totalRevenue,
          totalAmountPaid:         summary.totalAmountPaid,
          averageTransactionValue: summary.averageTransactionValue,

          // Inventory alerts not computed by session-summary
          lowStockCount:       undefined,
          expiredCount:        undefined,
          outOfStockCount:     undefined,
          totalCriticalAlerts: undefined,
        };

        setData(result);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load session data';
          console.error('[useAdminSessionData]', msg, err);
          setError(msg);
          setData(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, sessionId, fetchKey]);

  return { data, isLoading, error, refetch };
}

// ─── Find session end time from activity logs ──────────────────────────────
//
// When a session node exists but has no endTime, we look in activityLogs for
// a session_ended event by this staff member that occurred after startTime.
// Returns now() as fallback if none is found (active or unrecorded session).

async function findSessionEndTime(staffId: string, startTime: string): Promise<string> {
  return new Promise((resolve) => {
    const startMs = new Date(startTime).getTime();

    // One-shot read — we don't need a live subscription here
    const unsubscribe = subscribeToActivityLogs((logs) => {
      unsubscribe();

      const endLog = logs
        .filter(
          (l) =>
            l.staffId === staffId &&
            l.type    === 'session_ended' &&
            new Date(l.timestamp).getTime() >= startMs,
        )
        // Take the earliest session_ended after startTime
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];

      if (endLog) {
        console.log('[useAdminSessionData] Found session_ended log at', endLog.timestamp);
        resolve(endLog.timestamp);
      } else {
        // No end log found — session may still be active or end wasn't logged
        console.warn('[useAdminSessionData] No session_ended log found, using now()');
        resolve(new Date().toISOString());
      }
    });
  });
}