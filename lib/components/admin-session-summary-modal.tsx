'use client';

import { ActivityLogDetails } from '@/lib/services/activity-logs';

interface AdminSessionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionData: ActivityLogDetails;
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
  if (!isOpen || !sessionData) return null;

  // Extract session data with safe fallbacks
  const durationMinutes = sessionData.sessionDurationMinutes || 0;
  const durationHours = Math.floor(durationMinutes / 60);
  const durationMins = durationMinutes % 60;

  const dispensed = sessionData.totalUnitsDispensed || 0;
  const sold = sessionData.totalSalesTransactions || 0;
  const dispenseCount = sessionData.totalDispenseTransactions || 0;
  const saleCount = sessionData.totalSalesTransactions || 0;
  const totalTransactions = sessionData.totalTransactions || (dispenseCount + saleCount);
  const totalUnits = (dispensed + sold) || sessionData.totalUnitsDispensed || 0;

  const lowStock = sessionData.lowStockCount || 0;
  const expired = sessionData.expiredCount || 0;
  const outOfStock = sessionData.outOfStockCount || 0;
  const totalCriticalAlerts = sessionData.totalCriticalAlerts || (lowStock + expired + outOfStock);

  // Format timestamps from ISO strings
  const formatTime = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });
    } catch {
      return isoString;
    }
  };

  const sessionStartFormatted = formatTime(sessionData.sessionStartTime);
  const sessionEndFormatted = formatTime(sessionData.sessionEndTime || sessionEndTime);

  // Determine if we have data
  const hasData = durationMinutes > 0 || totalTransactions > 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">

        {/* Modal header - Modern gradient */}
        <div className="relative bg-linear-to-r from-purple-600 to-purple-700 px-6 py-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-xl leading-none"
          >
            ×
          </button>
          <div>
            <h3 className="text-xl font-bold text-white">Staff Session Summary</h3>
            <p className="text-sm text-purple-100 mt-1">👤 {staffName}</p>
          </div>
        </div>

        {/* Session Summary - Comprehensive */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>

          {/* Duration Section */}
          <div className="bg-linear-to-br from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-200">
            <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-3">⏱️ Session Duration</p>
            {hasData ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <div className="text-center">
                      <p className="text-4xl font-black text-purple-700">{String(durationHours).padStart(2, '0')}</p>
                      <p className="text-xs font-semibold text-purple-600 mt-1">h</p>
                    </div>
                    <p className="text-2xl font-light text-purple-300">:</p>
                    <div className="text-center">
                      <p className="text-4xl font-black text-purple-700">{String(durationMins).padStart(2, '0')}</p>
                      <p className="text-xs font-semibold text-purple-600 mt-1">m</p>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-purple-500 mt-3 font-medium">Based on Firebase session timestamps</p>
              </>
            ) : (
              <p className="text-sm text-purple-500 font-medium">No data available</p>
            )}
          </div>

          {/* Session Timing Details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
              <p className="text-[10px] font-semibold text-indigo-700 uppercase mb-1">Start Time</p>
              <p className="text-xs font-semibold text-indigo-900 wrap-break-word">{hasData ? sessionStartFormatted : 'N/A'}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
              <p className="text-[10px] font-semibold text-purple-700 uppercase mb-1">End Time</p>
              <p className="text-xs font-semibold text-purple-900 wrap-break-word">{hasData ? sessionEndFormatted : 'N/A'}</p>
            </div>
          </div>

          {/* Transaction Stats - Comprehensive Grid */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">📊 Transaction Breakdown</p>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border border-blue-200 bg-linear-to-br from-blue-50">
                <p className="text-[10px] text-blue-700 font-semibold uppercase mb-1">Dispense Txns</p>
                <p className="text-2xl font-black text-blue-700">{hasData ? dispenseCount : '—'}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-green-200 bg-linear-to-br from-green-50">
                <p className="text-[10px] text-green-700 font-semibold uppercase mb-1">Sales Txns</p>
                <p className="text-2xl font-black text-green-700">{hasData ? saleCount : '—'}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-purple-200 bg-linear-to-br from-purple-50">
                <p className="text-[10px] text-purple-700 font-semibold uppercase mb-1">Total Txns</p>
                <p className="text-2xl font-black text-purple-700">{hasData ? totalTransactions : '—'}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-300 bg-linear-to-br from-slate-100">
                <p className="text-[10px] text-slate-700 font-semibold uppercase mb-1">Total Units</p>
                <p className="text-2xl font-black text-slate-700">{hasData ? totalUnits : '—'}</p>
              </div>
            </div>
          </div>

          {/* Units Breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-linear-to-br from-cyan-50 to-blue-50 rounded-lg p-3 border border-cyan-200">
              <p className="text-[10px] font-semibold text-cyan-700 uppercase mb-2">Units Dispensed</p>
              <p className="text-2xl font-black text-cyan-700">{hasData ? dispensed : '—'}</p>
            </div>
            <div className="bg-linear-to-br from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
              <p className="text-[10px] font-semibold text-green-700 uppercase mb-2">Units Sold</p>
              <p className="text-2xl font-black text-green-700">{hasData ? sold : '—'}</p>
            </div>
          </div>

          {/* Inventory Status */}
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

          {/* Session Summary Text */}
          {hasData && sessionData.sessionSummary && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-xs font-semibold text-blue-700 uppercase mb-2">📝 Session Summary</p>
              <p className="text-xs text-blue-800 leading-relaxed">{sessionData.sessionSummary}</p>
            </div>
          )}

          {/* No Data Message */}
          {!hasData && (
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 text-center">
              <p className="text-sm text-amber-700 font-semibold">ℹ️ No Session Data</p>
              <p className="text-xs text-amber-600 mt-1">No transaction or activity data available for this session in the database.</p>
            </div>
          )}

        </div>

        {/* Actions */}
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
