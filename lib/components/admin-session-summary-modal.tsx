'use client';

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

interface AdminSessionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  // null while the hook is loading — the modal shows a spinner in that case
  sessionData: ActivityLogDetails | null;
  staffName: string;
  sessionEndTime: string;
}

export default function AdminSessionSummaryModal({
  isOpen,
  onClose,
  sessionData,
  staffName,
  sessionEndTime,
}: AdminSessionSummaryModalProps) {
  if (!isOpen) return null;

  // ── Loading state ────────────────────────────────────────────────────────
  if (!sessionData) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
          <div className="relative bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-6">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/80 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-xl leading-none"
              aria-label="Close modal"
            >
              ×
            </button>
            <h3 className="text-xl font-bold text-white">Staff Session Summary</h3>
            <p className="text-sm text-purple-100 mt-1">👤 {staffName}</p>
          </div>
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Loading session data…</p>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-white hover:bg-gray-100 text-gray-900 text-sm font-semibold rounded-lg border border-gray-200 transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const durationMinutes = sessionData.sessionDurationMinutes ?? 0;
  const durationHours   = Math.floor(durationMinutes / 60);
  const durationMins    = durationMinutes % 60;

  const unitsDispensed  = sessionData.totalUnitsDispensed ?? 0;
  const unitsSold       = sessionData.totalUnitsSold ?? 0;
  const unitsMovement   = sessionData.totalUnitsMovement ?? unitsDispensed + unitsSold;

  const dispenseCount      = sessionData.totalDispenseTransactions ?? 0;
  const saleCount          = sessionData.totalSalesTransactions ?? 0;
  const totalTransactions  = sessionData.totalTransactions ?? dispenseCount + saleCount;

  const totalRevenue           = sessionData.totalRevenue ?? 0;
  const totalAmountPaid        = sessionData.totalAmountPaid ?? 0;
  const averageTransactionValue = sessionData.averageTransactionValue ?? 0;

  const lowStock           = sessionData.lowStockCount ?? 0;
  const expired            = sessionData.expiredCount ?? 0;
  const outOfStock         = sessionData.outOfStockCount ?? 0;
  const totalCriticalAlerts =
    sessionData.totalCriticalAlerts ?? lowStock + expired + outOfStock;

  const formatTime = (isoString?: string): string => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleString('en-PH', {
        dateStyle: 'long',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  };

  const sessionStartFormatted = formatTime(sessionData.sessionStartTime);
  const sessionEndFormatted   = formatTime(sessionData.sessionEndTime ?? sessionEndTime);

  const hasData = durationMinutes > 0 || totalTransactions > 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">

        {/* Header */}
        <div className="relative bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-xl leading-none"
            aria-label="Close modal"
          >
            ×
          </button>
          <div>
            <h3 className="text-xl font-bold text-white">Staff Session Summary</h3>
            <p className="text-sm text-purple-100 mt-1">👤 {staffName}</p>
          </div>
        </div>

        {/* Content */}
        <div
          className="px-6 py-5 space-y-4 overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 220px)' }}
        >

          {/* Duration */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-200">
            <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-3">
              ⏱️ Session Duration
            </p>
            {hasData ? (
              <>
                <div className="flex items-baseline gap-2">
                  <div className="text-center">
                    <p className="text-4xl font-black text-purple-700">
                      {String(durationHours).padStart(2, '0')}
                    </p>
                    <p className="text-xs font-semibold text-purple-600 mt-1">h</p>
                  </div>
                  <p className="text-2xl font-light text-purple-300">:</p>
                  <div className="text-center">
                    <p className="text-4xl font-black text-purple-700">
                      {String(durationMins).padStart(2, '0')}
                    </p>
                    <p className="text-xs font-semibold text-purple-600 mt-1">m</p>
                  </div>
                </div>
                <p className="text-[11px] text-purple-500 mt-3 font-medium">
                  Based on Firebase session timestamps
                </p>
              </>
            ) : (
              <p className="text-sm text-purple-500 font-medium">No data available</p>
            )}
          </div>

          {/* Timing */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
              <p className="text-[10px] font-semibold text-indigo-700 uppercase mb-1">Start Time</p>
              <p className="text-xs font-semibold text-indigo-900 break-words">
                {hasData ? sessionStartFormatted : 'N/A'}
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
              <p className="text-[10px] font-semibold text-purple-700 uppercase mb-1">End Time</p>
              <p className="text-xs font-semibold text-purple-900 break-words">
                {hasData ? sessionEndFormatted : 'N/A'}
              </p>
            </div>
          </div>

          {/* Transaction breakdown */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              📊 Transaction Breakdown
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border border-blue-200 bg-gradient-to-br from-blue-50">
                <p className="text-[10px] text-blue-700 font-semibold uppercase mb-1">Dispense Transaction</p>
                <p className="text-2xl font-black text-blue-700">{hasData ? dispenseCount : '—'}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-green-200 bg-gradient-to-br from-green-50">
                <p className="text-[10px] text-green-700 font-semibold uppercase mb-1">Sales Transaction</p>
                <p className="text-2xl font-black text-green-700">{hasData ? saleCount : '—'}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-purple-200 bg-gradient-to-br from-purple-50">
                <p className="text-[10px] text-purple-700 font-semibold uppercase mb-1">Total Transactions</p>
                <p className="text-2xl font-black text-purple-700">{hasData ? totalTransactions : '—'}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-300 bg-gradient-to-br from-slate-100">
                <p className="text-[10px] text-slate-700 font-semibold uppercase mb-1">Total Units</p>
                <p className="text-2xl font-black text-slate-700">{hasData ? unitsMovement : '—'}</p>
              </div>
            </div>
          </div>

          {/* Units breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-lg p-3 border border-cyan-200">
              <p className="text-[10px] font-semibold text-cyan-700 uppercase mb-2">Units Dispensed</p>
              <p className="text-2xl font-black text-cyan-700">{hasData ? unitsDispensed : '—'}</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
              <p className="text-[10px] font-semibold text-green-700 uppercase mb-2">Units Sold</p>
              <p className="text-2xl font-black text-green-700">{hasData ? unitsSold : '—'}</p>
            </div>
          </div>

          {/* Financial summary */}
          {hasData && (totalRevenue > 0 || saleCount > 0) && (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-4 border border-emerald-200 space-y-3">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-3">
                💰 Financial Summary
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[9px] text-emerald-600 font-semibold uppercase mb-1">Total Revenue</p>
                  <p className="text-lg font-black text-emerald-700">
                    ₱{totalRevenue.toLocaleString('en-PH', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-teal-600 font-semibold uppercase mb-1">Amount Paid</p>
                  <p className="text-lg font-black text-teal-700">
                    ₱{totalAmountPaid.toLocaleString('en-PH', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>
              {averageTransactionValue > 0 && (
                <div className="pt-2 border-t border-emerald-200">
                  <p className="text-[9px] text-emerald-600 font-semibold uppercase mb-1">
                    Avg per Transaction
                  </p>
                  <p className="text-base font-bold text-emerald-700">
                    ₱{averageTransactionValue.toLocaleString('en-PH', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Inventory alerts */}
          {hasData && totalCriticalAlerts > 0 && (
            <div className="bg-red-50 rounded-lg p-4 border border-red-200 space-y-2">
              <p className="text-xs font-semibold text-red-700 uppercase mb-2">⚠️ Inventory Alerts</p>
              <div className="space-y-1.5 text-xs text-red-700">
                {outOfStock > 0 && (
                  <p className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full" />
                    {outOfStock} item{outOfStock !== 1 ? 's' : ''} out of stock
                  </p>
                )}
                {expired > 0 && (
                  <p className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full" />
                    {expired} expired item{expired !== 1 ? 's' : ''}
                  </p>
                )}
                {lowStock > 0 && (
                  <p className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-orange-500 rounded-full" />
                    {lowStock} item{lowStock !== 1 ? 's' : ''} low in stock
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Session summary text */}
          {hasData && sessionData.sessionSummary && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-xs font-semibold text-blue-700 uppercase mb-2">📝 Session Summary</p>
              <p className="text-xs text-blue-800 leading-relaxed">{sessionData.sessionSummary}</p>
            </div>
          )}

          {/* No data */}
          {!hasData && (
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 text-center">
              <p className="text-sm text-amber-700 font-semibold">ℹ️ No Session Data</p>
              <p className="text-xs text-amber-600 mt-1">
                No transaction or activity data available for this session in the database.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-white hover:bg-gray-100 text-gray-900 text-sm font-semibold rounded-lg border border-gray-200 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}