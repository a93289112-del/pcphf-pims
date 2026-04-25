'use client';

import { ActivityLogDetails } from '@/lib/services/activity-logs';

interface StockAdjustmentSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  adjustmentData: ActivityLogDetails | null;
  staffName: string;
  timestamp: string;
}

export default function StockAdjustmentSummaryModal({
  isOpen,
  onClose,
  adjustmentData,
  staffName,
  timestamp,
}: StockAdjustmentSummaryModalProps) {
  if (!isOpen) return null;

  // ── Loading state ────────────────────────────────────────────────────────
  if (!adjustmentData) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
          <div className="relative bg-gradient-to-r from-orange-600 to-amber-600 px-6 py-6">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/80 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-xl leading-none"
              aria-label="Close modal"
            >
              ×
            </button>
            <h3 className="text-xl font-bold text-white">Stock Adjustment Details</h3>
            <p className="text-sm text-orange-100 mt-1">👤 {staffName}</p>
          </div>
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Loading adjustment data…</p>
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
  const medicineName = adjustmentData.medicineName ?? 'Unknown Medicine';
  const previousValue = adjustmentData.previousValue ?? 0;
  const newValue = adjustmentData.newValue ?? 0;
  const quantity = adjustmentData.quantity ?? Math.abs(Number(newValue) - Number(previousValue));
  const reason = adjustmentData.reason ?? 'Manual adjustment';
  const unitType = adjustmentData.unitType ?? 'units';

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

  const adjustmentDirection = Number(newValue) > Number(previousValue) ? 'increase' : 'decrease';
  const isIncrease = adjustmentDirection === 'increase';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">

        {/* Header */}
        <div className="relative bg-gradient-to-r from-orange-600 to-amber-600 px-6 py-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-xl leading-none"
            aria-label="Close modal"
          >
            ×
          </button>
          <div>
            <h3 className="text-xl font-bold text-white">Stock Adjustment Details</h3>
            <p className="text-sm text-orange-100 mt-1">👤 {staffName}</p>
          </div>
        </div>

        {/* Content */}
        <div
          className="px-6 py-5 space-y-4 overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 220px)' }}
        >

          {/* Medicine Name */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              💊 Medicine
            </p>
            <p className="text-lg font-bold text-slate-900">{medicineName}</p>
          </div>

          {/* Stock Change */}
          <div className={`rounded-xl p-4 border ${
            isIncrease
              ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200'
              : 'bg-gradient-to-br from-red-50 to-rose-50 border-red-200'
          }`}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{
              color: isIncrease ? '#047857' : '#dc2626'
            }}>
              {isIncrease ? '📈 Stock Increase' : '📉 Stock Decrease'}
            </p>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <p className="text-xs font-semibold" style={{ color: isIncrease ? '#059669' : '#991b1b' }}>Before</p>
                <p className="text-3xl font-black" style={{ color: isIncrease ? '#059669' : '#991b1b' }}>
                  {Number(previousValue).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center justify-center w-12 h-12 rounded-lg" style={{
                backgroundColor: isIncrease ? '#dcfce7' : '#fee2e2'
              }}>
                <span className="text-2xl font-bold" style={{ color: isIncrease ? '#16a34a' : '#dc2626' }}>
                  {isIncrease ? '+' : '−'}
                </span>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold" style={{ color: isIncrease ? '#059669' : '#991b1b' }}>After</p>
                <p className="text-3xl font-black" style={{ color: isIncrease ? '#059669' : '#991b1b' }}>
                  {Number(newValue).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-current border-opacity-20 text-center">
              <p className="text-sm font-bold" style={{ color: isIncrease ? '#059669' : '#991b1b' }}>
                {isIncrease ? '+' : '−'}{quantity.toLocaleString()} {unitType}
              </p>
            </div>
          </div>

          {/* Reason */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="text-[10px] font-semibold text-slate-700 uppercase mb-1">Reason</p>
            <p className="text-sm font-semibold text-slate-900">{reason}</p>
          </div>

          {/* Timestamp */}
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <p className="text-[10px] font-semibold text-blue-700 uppercase mb-1">⏱️ Adjustment Time</p>
            <p className="text-xs font-semibold text-blue-900 break-words">
              {formatTime(timestamp)}
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-900 text-sm font-semibold rounded-lg border border-slate-200 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
