'use client';

import { useState, useEffect } from 'react';
import { Session, startSession, endSession, onActiveSessionChange } from '@/lib/services/session-management';

interface SessionControlProps {
  userId: string;
  staffName?: string;
  onSessionStart?: (session: Session) => void;
  onSessionEnd?: (session: Session) => void;
}

export default function SessionControl({
  userId,
  staffName,
  onSessionStart,
  onSessionEnd,
}: SessionControlProps) {
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for active session changes
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = onActiveSessionChange(userId, (session) => {
      setActiveSession(session);
    });

    return () => unsubscribe();
  }, [userId]);

  const handleStartSession = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const session = await startSession(userId, staffName);
      setActiveSession(session);
      onSessionStart?.(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;

    try {
      setIsLoading(true);
      setError(null);
      const endedSession = await endSession(userId, activeSession.id);
      setActiveSession(null);
      setShowSummary(true);
      onSessionEnd?.(endedSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end session');
    } finally {
      setIsLoading(false);
    }
  };

  if (!userId) return null;

  return (
    <>
      <div className="flex items-center gap-2">
        {!activeSession ? (
          <button
            onClick={handleStartSession}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-semibold rounded-lg transition-all shadow-sm hover:shadow-md"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            <span className="hidden sm:inline">Start</span>
            <span className="sm:hidden">New</span>
          </button>
        ) : (
          <button
            onClick={handleEndSession}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-semibold rounded-lg transition-all shadow-sm hover:shadow-md"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            <span className="hidden sm:inline">End</span>
            <span className="sm:hidden">Stop</span>
          </button>
        )}

        {activeSession && (
          <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <div className="text-xs font-semibold text-emerald-700 tabular-nums">
              {activeSession.summary.totalTransactions} TX
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-600 font-medium mt-2">{error}</div>
      )}

      {showSummary && activeSession && (
        <SessionSummaryModal
          session={activeSession}
          onClose={() => setShowSummary(false)}
        />
      )}
    </>
  );
}

// ─── Session Summary Modal ────────────────────────────────────────────────────

function SessionSummaryModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const formatTime = (iso: string) => new Date(iso).toLocaleString('en-PH', { timeStyle: 'short' });
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'long' });

  const duration = session.endTime
    ? Math.floor((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000)
    : 0;
  const durationHours = Math.floor(duration / 60);
  const durationMins = duration % 60;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Session Complete</h3>
              <p className="text-sm text-emerald-100 mt-1">📊 Transaction Summary</p>
            </div>
            <button
              onClick={onClose}
              className="text-emerald-100 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-xl"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Duration */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-3">⏱️ Duration</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-emerald-700">{String(durationHours).padStart(2, '0')}</p>
              <p className="text-sm text-emerald-600">h</p>
              <p className="text-3xl font-black text-emerald-700">{String(durationMins).padStart(2, '0')}</p>
              <p className="text-sm text-emerald-600">m</p>
            </div>
            <p className="text-[11px] text-emerald-500 mt-2">
              {formatDate(session.startTime)} • {formatTime(session.startTime)} - {formatTime(session.endTime || '')}
            </p>
          </div>

          {/* Transaction Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Dispensed</p>
              <p className="text-2xl font-black text-blue-700 mt-1">{session.summary.dispensedCount}</p>
              <p className="text-[10px] text-blue-500 mt-1">{session.summary.totalUnitsDispensed} units</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Sales</p>
              <p className="text-2xl font-black text-green-700 mt-1">{session.summary.salesCount}</p>
              <p className="text-[10px] text-green-500 mt-1">{session.summary.totalUnitsSold} units</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Adjustments</p>
              <p className="text-2xl font-black text-purple-700 mt-1">{session.summary.adjustmentCount}</p>
              <p className="text-[10px] text-purple-500 mt-1">{Math.abs(session.summary.totalUnitsAdjusted)} units</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Total</p>
              <p className="text-2xl font-black text-slate-700 mt-1">{session.summary.totalTransactions}</p>
              <p className="text-[10px] text-slate-500 mt-1">transactions</p>
            </div>
          </div>

          {/* Total Movement */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">📦 Total Movement</p>
            <p className="text-3xl font-black text-amber-700">{session.summary.totalUnitsMovement}</p>
            <p className="text-xs text-amber-600 mt-1">units moved in/out of inventory</p>
          </div>

          {/* Transactions List */}
          {session.summary.sessionTransactions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">📝 Transactions</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {session.summary.sessionTransactions.map((tx, idx) => (
                  <div key={idx} className="text-xs bg-slate-50 border border-slate-200 rounded p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{tx.medicineName}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {tx.quantity} {tx.unitType || tx.type}
                          {tx.patientName && ` • ${tx.patientName}`}
                        </p>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap ${
                        tx.type === 'dispense' ? 'bg-blue-100 text-blue-700' :
                        tx.type === 'sale' ? 'bg-green-100 text-green-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {tx.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
