'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface EndSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionData: {
    dispensed: number;
    transactions: number;
    sold: number;
    totalUnits: number;
    lowStock: number;
    expired: number;
    outOfStock: number;
    expiring: number;
    totalAlerts: number;
    dispenseCount: number;
    saleCount: number;
    durationMinutes: number;
    sessionStart: string;
    sessionEnd: string;
    sessionStartTime?: Date;
  };
  isLoading: boolean;
  onConfirm: () => void;
}

export default function EndSessionModal({
  isOpen,
  onClose,
  sessionData,
  isLoading,
  onConfirm,
}: EndSessionModalProps) {
  // ── Live elapsed seconds since session started ─────────────────────────
  const computeElapsed = useCallback(() => {
    const startTime = sessionData.sessionStartTime instanceof Date
      ? sessionData.sessionStartTime
      : new Date(Date.now() - (sessionData.durationMinutes || 0) * 60_000);
    return Math.max(0, Math.floor((Date.now() - startTime.getTime()) / 1000));
  }, [sessionData.sessionStartTime, sessionData.durationMinutes]);

  const [elapsedSeconds, setElapsedSeconds] = useState(() => computeElapsed());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setElapsedSeconds(computeElapsed());
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOpen, computeElapsed]);

  if (!isOpen) return null;

  const hours = Math.floor(elapsedSeconds / 3600);
  const mins  = Math.floor((elapsedSeconds % 3600) / 60);
  const secs  = elapsedSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  const hasData = sessionData.transactions > 0 || sessionData.durationMinutes > 0 || (sessionData.sessionStartTime instanceof Date);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">

        {/* Header */}
        <div className="relative bg-linear-to-r from-blue-600 to-blue-700 px-6 py-6">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="absolute top-4 right-4 text-white/80 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-xl leading-none disabled:opacity-50"
          >
            ×
          </button>
          <h3 className="text-xl font-bold text-white">Session Summary</h3>
          <p className="text-sm text-blue-100 mt-1">Complete session details</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>

          {/* Live Duration Counter */}
          <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">⏱️ Session Duration</p>
            <div className="flex items-baseline gap-2">
              {[
                { val: hours, label: 'h' },
                { val: mins,  label: 'm' },
                { val: secs,  label: 's' },
              ].map(({ val, label }, i) => (
                <div key={label} className="flex items-baseline gap-1">
                  {i > 0 && <span className="text-2xl font-light text-blue-300">:</span>}
                  <div className="text-center">
                    <p className="text-4xl font-black text-blue-700 tabular-nums">{pad(val)}</p>
                    <p className="text-xs font-semibold text-blue-600 mt-1">{label}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-blue-500 mt-3 font-medium">Live counter • Updating in real-time</p>
          </div>

          {/* Session Timing */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
              <p className="text-[10px] font-semibold text-indigo-700 uppercase mb-1">Started</p>
              <p className="text-xs font-semibold text-indigo-900 truncate">{sessionData.sessionStart || 'N/A'}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
              <p className="text-[10px] font-semibold text-purple-700 uppercase mb-1">Ending Now</p>
              <p className="text-xs font-semibold text-purple-900 truncate">{sessionData.sessionEnd || 'N/A'}</p>
            </div>
          </div>

          {/* Transaction Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-linear-to-br from-cyan-50 to-blue-50 rounded-lg p-3 border border-cyan-200">
              <p className="text-[10px] font-semibold text-cyan-700 uppercase mb-2">Dispensed</p>
              <p className="text-2xl font-black text-cyan-700">{hasData ? sessionData.dispensed : '—'}</p>
              <p className="text-[10px] text-cyan-600 mt-1">units</p>
            </div>
            <div className="bg-linear-to-br from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
              <p className="text-[10px] font-semibold text-green-700 uppercase mb-2">Sales</p>
              <p className="text-2xl font-black text-green-700">{hasData ? sessionData.sold : '—'}</p>
              <p className="text-[10px] text-green-600 mt-1">units</p>
            </div>
          </div>

          {/* Detailed Transaction Breakdown */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">📊 Transaction Details</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total Transactions',     val: sessionData.transactions },
                { label: 'Total Units',    val: sessionData.totalUnits },
                { label: 'Dispense Transactions', val: sessionData.dispenseCount },
                { label: 'Sales Transactions',    val: sessionData.saleCount },
              ].map(({ label, val }) => (
                <div key={label} className="bg-white rounded-lg p-2.5 border border-slate-200">
                  <p className="text-[10px] text-slate-600 font-semibold uppercase mb-1">{label}</p>
                  <p className="text-xl font-black text-slate-900">{hasData ? val : '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory Alerts */}
          {hasData && sessionData.totalAlerts > 0 && (
            <div className="bg-red-50 rounded-lg p-4 border border-red-200 space-y-2">
              <p className="text-xs font-semibold text-red-700 uppercase mb-2">⚠️ Inventory Alerts</p>
              <div className="space-y-1.5 text-xs text-red-700">
                {sessionData.outOfStock > 0 && (
                  <p className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full" />
                    {sessionData.outOfStock} item{sessionData.outOfStock !== 1 ? 's' : ''} out of stock
                  </p>
                )}
                {sessionData.expired > 0 && (
                  <p className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full" />
                    {sessionData.expired} expired item{sessionData.expired !== 1 ? 's' : ''}
                  </p>
                )}
                {sessionData.lowStock > 0 && (
                  <p className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-orange-500 rounded-full" />
                    {sessionData.lowStock} item{sessionData.lowStock !== 1 ? 's' : ''} low in stock
                  </p>
                )}
                {sessionData.expiring > 0 && (
                  <p className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-amber-500 rounded-full" />
                    {sessionData.expiring} item{sessionData.expiring !== 1 ? 's' : ''} expiring soon
                  </p>
                )}
              </div>
            </div>
          )}

          {!hasData && (
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <p className="text-xs text-amber-700 font-semibold">ℹ️ No Activity</p>
              <p className="text-xs text-amber-600 mt-1">No transactions recorded during this session.</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-white hover:bg-gray-100 text-gray-900 text-sm font-semibold rounded-lg border border-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
          >
            {isLoading ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Ending...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                End Session
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}