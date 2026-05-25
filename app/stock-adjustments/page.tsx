'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useSidebar } from '@/lib/contexts/sidebar-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, onValue, push, update, remove, get } from 'firebase/database';
import Link from 'next/link';
import BackButton from '@/lib/components/back-button';
import ConfirmationModal from '@/lib/components/confirmation-modal';
import { type StockStatus, getMedicineOverallStatus, statusDisplay } from '@/lib/services/inventory-status';
import Processing from '@/lib/components/processing';
import { logActivity } from '@/lib/services/activity-logs';
import { type FirebaseTransaction } from '@/lib/types';
import { formatDateInManilaTimezone } from '@/lib/utils/date-timezone';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatNumberWithCommas = (value: string) => {
  if (!value) return '';
  const numStr = value.replace(/,/g, '');
  if (!numStr || isNaN(Number(numStr))) return value;
  const parts = numStr.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
};

function getInputUnitLabel(medicine: Medicine): string {
  if (medicine.unitConversion) {
    const converted =
      (medicine.unitConversion.customUnitName || medicine.unitConversion.conversionUnit || '').trim();
    if (converted) return converted;
  }
  return (medicine.unit || medicine.category || '').trim() || 'Unit';
}

function getOriginalUnitLabel(medicine: Medicine): string | null {
  if (!medicine.unitConversion) return null;
  return (medicine.originalUnit || medicine.unit || '').trim() || null;
}

function getConversionFactor(medicine: Medicine): number {
  return medicine.unitConversion?.conversionFactor ?? 1;
}

function getCurrentStock(medicine: Medicine): number {
  return medicine.quantity ?? medicine.stockPerUnit ?? 0;
}

function normalizeMedicineForStatus(medicine: Medicine): Medicine {
  const stock = getCurrentStock(medicine);
  return {
    ...medicine,
    quantity: stock,
    stockPerUnit: stock,
    stockPerPieces: stock,
    totalPieces: stock,
    unitConversion: null,
    piecesPerUnit: undefined,
    containerQuantity: undefined,
  };
}

function formatDateTime(iso: string): string {
  return formatDateInManilaTimezone(iso, { includeTime: true, format: '12-hour' });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function phpFmt(n: number) {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getTodayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format a YYYY-MM-DD string for display (e.g. "May 5, 2029"). */
function formatDateStr(dateStr: string): string {
  // Parse as local date to avoid timezone shifting
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

type MedicineStatus = 'out' | 'expired' | 'expiring' | 'low' | 'urgent' | 'in';

function getMedicineStatusForFilter(medicine: Medicine): MedicineStatus {
  const stock = getCurrentStock(medicine);
  const minStock = medicine.minStock ?? 0;
  const exp = medicine.expirationDate ? parseLocalDate(medicine.expirationDate) : null;
  const today = getTodayMidnight();

  if (stock === 0) return 'out';
  if (exp && exp < today) return 'expired';

  const isLowStock = minStock > 0 && stock <= minStock;
  let isExpiringSoon = false;
  if (exp) {
    const days = Math.floor((exp.getTime() - today.getTime()) / 86400000);
    if (days <= 30) isExpiringSoon = true;
  }

  if (isLowStock && isExpiringSoon) return 'urgent';
  if (isExpiringSoon) return 'expiring';
  if (isLowStock) return 'low';

  return 'in';
}

interface StatusCounts {
  urgent: number;
  all: number;
  in: number;
  low: number;
  expiring: number;
  expired: number;
  out: number;
}

function computeStatusCounts(medicines: Medicine[]): StatusCounts {
  let urgent = 0, inStock = 0, low = 0, expiring = 0, expired = 0, out = 0;
  for (const m of medicines) {
    const status = getMedicineStatusForFilter(m);
    if (status === 'urgent') urgent++;
    else if (status === 'in') inStock++;
    else if (status === 'low') low++;
    else if (status === 'expiring') expiring++;
    else if (status === 'expired') expired++;
    else if (status === 'out') out++;
  }
  return { urgent, all: medicines.length, in: inStock, low, expiring, expired, out };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnitConversion {
  packagingUnit?: string;
  conversionUnit?: string;
  conversionFactor?: number;
  customUnitName?: string;
}

interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

interface Medicine {
  id: string;
  name: string;
  baseName?: string;
  brandModel?: string;
  unit?: string;
  category: string;
  originalUnit?: string;
  brand: string;
  image: string;
  description: string;
  quantity?: number;
  stockPerUnit?: number;
  stockPerPieces?: number;
  piecesPerUnit?: number;
  totalPieces?: number;
  containerQuantity?: number;
  unitConversion?: UnitConversion | null;
  pricePerUnit?: number;
  pricePerPieces?: number;
  unitCost?: number;
  sellingPrice?: number;
  minStock?: number;
  expirationDate?: string;
  batches?: Record<string, MedicineBatch>;
  createdAt: string;
  strength?: string;
  strengths?: string[] | null;
  prescriptionRequired?: boolean;
}

interface StockAdjustment {
  id: string;
  medicineId: string;
  quantity: number;
  stockType?: 'unit' | 'pieces';
  expirationDate?: string;
  /** The expiration date that was in place BEFORE this adjustment. */
  prevExpirationDate?: string;
  timestamp: string;
  stockBefore?: number;
  stockAfter?: number;
  source?: 'manual' | 'duplicate_restock';
  note?: string;
  type?: 'stock' | 'expiration' | 'both' | 'minstock' | 'price';
  minStock?: number;
  unitCost?: number;
  sellingPrice?: number;
  priceAdjustment?: boolean;
  prevUnitCost?: number;
  newUnitCost?: number;
  prevSellingPrice?: number;
  newSellingPrice?: number;
}

type MedicineRecord = Omit<Medicine, 'id'>;
type StockAdjustmentRecord = Omit<StockAdjustment, 'id' | 'medicineId'>;

// ---------------------------------------------------------------------------
// Helper: get action label + badge style for a history row
// ---------------------------------------------------------------------------

function getAdjustmentActionMeta(adjustment: StockAdjustment): {
  badge: string;
  badgeClass: string;
  summary: string;
} {
  const isPositive = adjustment.quantity > 0;
  const isZero = adjustment.quantity === 0;
  const isExpiryOnly = isZero && !!adjustment.expirationDate;
  const isMinStockOnly = adjustment.type === 'minstock';
  const isPriceOnly = adjustment.type === 'price';

  if (isPriceOnly) {
    return {
      badge: 'ADJUSTED PRICE',
      badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200',
      summary: '',
    };
  }
  if (isMinStockOnly) {
    return {
      badge: 'ADJUSTED MIN STOCK',
      badgeClass: 'bg-teal-50 text-teal-700 border border-teal-200',
      summary: '',
    };
  }
  if (isExpiryOnly) {
    return {
      badge: 'ADJUSTED EXPIRATION',
      badgeClass: 'bg-orange-50 text-orange-700 border border-orange-200',
      summary: '',
    };
  }
  if (isPositive) {
    return {
      badge: 'STOCK ADDED',
      badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      summary: '',
    };
  }
  return {
    badge: 'STOCK REMOVED',
    badgeClass: 'bg-red-50 text-red-700 border border-red-200',
    summary: '',
  };
}

function buildActionDescription(
  adjustment: StockAdjustment,
  medicineName: string,
  inputUnitLabel: string,
): string {
  const isZero = adjustment.quantity === 0;
  const isExpiryOnly = isZero && !!adjustment.expirationDate;
  const isMinStockOnly = adjustment.type === 'minstock';
  const isPriceOnly = adjustment.type === 'price';

  if (isPriceOnly) {
    const parts: string[] = [];
    if (adjustment.prevUnitCost !== undefined && adjustment.newUnitCost !== undefined) {
      parts.push(`Unit cost ₱${adjustment.prevUnitCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })} → ₱${adjustment.newUnitCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
    }
    if (adjustment.prevSellingPrice !== undefined && adjustment.newSellingPrice !== undefined) {
      parts.push(`Selling ₱${adjustment.prevSellingPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })} → ₱${adjustment.newSellingPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
    }
    return `Adjusted prices: ${medicineName}${parts.length ? ' — ' + parts.join(', ') : ''}`;
  }

  if (isMinStockOnly) {
    const prev = adjustment.stockBefore ?? '—';
    const next = adjustment.minStock ?? '—';
    return `Adjusted minimum stock: ${medicineName} — ${prev} → ${next}`;
  }

  if (isExpiryOnly) {
    const dateStr = adjustment.expirationDate
      ? new Date(adjustment.expirationDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
    return `Adjusted expiration: ${medicineName} — set to ${dateStr}`;
  }

  const sign = adjustment.quantity > 0 ? '+' : '';
  const before = adjustment.stockBefore ?? '—';
  const after = adjustment.stockAfter ?? '—';
  return `Adjusted stock: ${medicineName} — ${before} → ${after} (${sign}${adjustment.quantity} ${inputUnitLabel})`;
}

// ---------------------------------------------------------------------------
// Arrow icon helper
// ---------------------------------------------------------------------------

function Arrow({ color = 'text-slate-400' }: { color?: string }) {
  return (
    <svg className={`w-5 h-5 ${color} shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// History Detail Modal (replaces slide-over)
// ---------------------------------------------------------------------------

function HistoryDetailPanel({
  adjustment,
  medicineName,
  inputUnitLabel,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  isEditing,
  editData,
  setEditData,
  onSaveEdit,
  onCancelEdit,
  index,
  total,
}: {
  adjustment: StockAdjustment | null;
  medicineName: string;
  inputUnitLabel: string;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isEditing: boolean;
  editData: { quantity: string; expirationDate: string };
  setEditData: (d: { quantity: string; expirationDate: string }) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  index: number;
  total: number;
}) {
  if (!adjustment) return null;

  const isPositive = adjustment.quantity > 0;
  const isZero = adjustment.quantity === 0;
  const isExpiryOnly = isZero && !!adjustment.expirationDate;
  const isMinStock = adjustment.type === 'minstock';
  const isPrice = adjustment.type === 'price';
  const hasSnapshot = adjustment.stockAfter !== undefined;
  const netSign = isPositive ? '+' : '';

  const meta = getAdjustmentActionMeta(adjustment);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        onClick={onClose}
      />

      {/* Centered modal wrapper */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col pointer-events-auto transition-all duration-300 ease-out ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-6'
            }`}
        >

          {/* ── Modal Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-md tracking-wider">
                RECORD #{total - index}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${meta.badgeClass}`}>
                {meta.badge}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0 ml-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Medicine sub-header */}
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 shrink-0">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Medicine</p>
            <p className="text-base font-black text-slate-900 truncate">{medicineName}</p>
          </div>

          {/* ── Scrollable Body ── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* Timestamp */}
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold text-slate-700">{formatDateTime(adjustment.timestamp)}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-400 text-xs font-medium">{timeAgo(adjustment.timestamp)}</span>
            </div>

            {/* ════ STOCK CHANGE — before / after ════ */}
            {!isExpiryOnly && !isZero && !isMinStock && !isPrice && (
              <div className={`rounded-2xl overflow-hidden border-2 ${isPositive ? 'border-emerald-200' : 'border-red-200'}`}>
                {/* Colored header bar */}
                <div className={`px-4 py-2.5 flex items-center gap-2 ${isPositive ? 'bg-emerald-600' : 'bg-red-600'}`}>
                  <svg className="w-4 h-4 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    {isPositive
                      ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      : <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />}
                  </svg>
                  <span className="text-white text-xs font-black uppercase tracking-widest">
                    {isPositive ? 'Stock Added' : 'Stock Removed'}
                  </span>
                  <span className="ml-auto text-white font-black text-lg">{netSign}{adjustment.quantity} {inputUnitLabel}</span>
                </div>

                {hasSnapshot ? (
                  <div className="grid grid-cols-3 bg-white">
                    <div className="flex flex-col items-center justify-center py-5 px-3 border-r border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">BEFORE</p>
                      <p className="text-3xl font-black text-slate-500">{adjustment.stockBefore ?? '—'}</p>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">{inputUnitLabel}</p>
                    </div>
                    <div className="flex flex-col items-center justify-center py-5 px-2 gap-2">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isPositive ? 'bg-emerald-100' : 'bg-red-100'}`}>
                        <Arrow color={isPositive ? 'text-emerald-600' : 'text-red-600'} />
                      </div>
                      <span className={`text-xs font-black px-2 py-0.5 rounded-full ${isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {netSign}{adjustment.quantity}
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center py-5 px-3 border-l border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">AFTER</p>
                      <p className={`text-3xl font-black ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                        {adjustment.stockAfter ?? '—'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">{inputUnitLabel}</p>
                    </div>
                  </div>
                ) : (
                  <p className="px-4 py-3 bg-white text-sm text-slate-400 italic">No stock snapshot available for this entry.</p>
                )}
              </div>
            )}

            {/* ════ EXPIRY ONLY ════ */}
            {isExpiryOnly && (
              <div className="rounded-2xl overflow-hidden border-2 border-orange-200">
                <div className="px-4 py-2.5 flex items-center gap-2 bg-orange-500">
                  <svg className="w-4 h-4 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-white text-xs font-black uppercase tracking-widest">Expiration Date Updated</span>
                </div>
                <div className="grid grid-cols-3 bg-white">
                  {/* PREVIOUS */}
                  <div className="flex flex-col items-center justify-center py-5 px-3 border-r border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">PREVIOUS</p>
                    {adjustment.prevExpirationDate ? (
                      <>
                        <p className="text-sm font-bold text-slate-700 text-center leading-snug">
                          {formatDateStr(adjustment.prevExpirationDate)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-slate-400 text-center italic">Not recorded</p>
                    )}
                  </div>
                  {/* Arrow */}
                  <div className="flex items-center justify-center py-5 px-2">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center bg-orange-100">
                      <Arrow color="text-orange-600" />
                    </div>
                  </div>
                  {/* NEW DATE */}
                  <div className="flex flex-col items-center justify-center py-5 px-3 border-l border-slate-100">
                    <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-2">NEW DATE</p>
                    <p className="text-sm font-black text-orange-700 text-center leading-snug">
                      {adjustment.expirationDate
                        ? formatDateStr(adjustment.expirationDate)
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ════ MIN STOCK ════ */}
            {isMinStock && (
              <div className="rounded-2xl overflow-hidden border-2 border-teal-200">
                <div className="px-4 py-2.5 flex items-center gap-2 bg-teal-600">
                  <svg className="w-4 h-4 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="text-white text-xs font-black uppercase tracking-widest">Minimum Stock Updated</span>
                </div>
                <div className="grid grid-cols-3 bg-white">
                  <div className="flex flex-col items-center justify-center py-5 px-3 border-r border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">PREVIOUS</p>
                    <p className="text-3xl font-black text-slate-500">{adjustment.stockBefore ?? '—'}</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-1">min units</p>
                  </div>
                  <div className="flex flex-col items-center justify-center py-5 px-2 gap-2">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center bg-teal-100">
                      <Arrow color="text-teal-600" />
                    </div>
                    {adjustment.minStock !== undefined && adjustment.stockBefore !== undefined && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${(adjustment.minStock as number) > (adjustment.stockBefore as number)
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-teal-100 text-teal-700'
                        }`}>
                        {(adjustment.minStock as number) > (adjustment.stockBefore as number) ? '▲' : '▼'}{' '}
                        {Math.abs((adjustment.minStock as number) - (adjustment.stockBefore as number))}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-center justify-center py-5 px-3 border-l border-slate-100">
                    <p className="text-[9px] font-black text-teal-600 uppercase tracking-widest mb-2">NEW MIN</p>
                    <p className="text-3xl font-black text-teal-700">{adjustment.minStock ?? '—'}</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-1">min units</p>
                  </div>
                </div>
              </div>
            )}

            {/* ════ PRICE ════ */}
            {isPrice && (
              <div className="rounded-2xl overflow-hidden border-2 border-rose-200">
                <div className="px-4 py-2.5 flex items-center gap-2 bg-rose-600">
                  <svg className="w-4 h-4 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-white text-xs font-black uppercase tracking-widest">Price Adjustment</span>
                </div>
                <div className="bg-white divide-y divide-slate-100">
                  {adjustment.prevUnitCost !== undefined && adjustment.newUnitCost !== undefined && (
                    <div className="px-5 py-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Unit Cost</p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-50 rounded-xl py-3 text-center border border-slate-200">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Previous</p>
                          <p className="text-xl font-black text-slate-500">₱{phpFmt(adjustment.prevUnitCost)}</p>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                          <Arrow />
                          {adjustment.newUnitCost !== adjustment.prevUnitCost && (
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${adjustment.newUnitCost > adjustment.prevUnitCost ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                              }`}>
                              {adjustment.newUnitCost > adjustment.prevUnitCost ? '▲' : '▼'} ₱{phpFmt(Math.abs(adjustment.newUnitCost - adjustment.prevUnitCost))}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 bg-rose-50 rounded-xl py-3 text-center border border-rose-200">
                          <p className="text-[9px] font-bold text-rose-500 uppercase tracking-wide mb-1">New</p>
                          <p className="text-xl font-black text-rose-700">₱{phpFmt(adjustment.newUnitCost)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {adjustment.prevSellingPrice !== undefined && adjustment.newSellingPrice !== undefined && (
                    <div className="px-5 py-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Selling Price</p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-50 rounded-xl py-3 text-center border border-slate-200">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Previous</p>
                          <p className="text-xl font-black text-slate-500">₱{phpFmt(adjustment.prevSellingPrice)}</p>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                          <Arrow />
                          {adjustment.newSellingPrice !== adjustment.prevSellingPrice && (
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${adjustment.newSellingPrice > adjustment.prevSellingPrice ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                              }`}>
                              {adjustment.newSellingPrice > adjustment.prevSellingPrice ? '▲' : '▼'} ₱{phpFmt(Math.abs(adjustment.newSellingPrice - adjustment.prevSellingPrice))}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 bg-rose-50 rounded-xl py-3 text-center border border-rose-200">
                          <p className="text-[9px] font-bold text-rose-500 uppercase tracking-wide mb-1">New</p>
                          <p className="text-xl font-black text-rose-700">₱{phpFmt(adjustment.newSellingPrice)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Expiry also set (type = 'both') */}
            {!isExpiryOnly && adjustment.expirationDate && (
              <div className="flex items-center gap-3 p-3.5 bg-orange-50 border border-orange-200 rounded-xl">
                <svg className="w-4 h-4 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div>
                  <p className="text-[10px] font-black text-orange-600 uppercase tracking-wide">Expiry Also Set</p>
                  <p className="font-bold text-slate-800 text-sm">
                    {formatDateStr(adjustment.expirationDate)}
                  </p>
                  {adjustment.prevExpirationDate && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Previously: {formatDateStr(adjustment.prevExpirationDate)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Note */}
            {adjustment.note && (
              <div className="flex items-start gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <svg className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-1">Note</p>
                  <p className="text-sm text-slate-600 italic leading-relaxed">{adjustment.note}</p>
                </div>
              </div>
            )}

            {/* Inline edit form */}
            {isEditing && (
              <div className="space-y-3 bg-blue-50 border-2 border-blue-100 rounded-xl p-4">
                <p className="text-sm font-black text-blue-700 uppercase tracking-wide">Edit Adjustment</p>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Quantity ({inputUnitLabel})
                  </label>
                  <input
                    type="number"
                    value={editData.quantity}
                    onChange={(e) => setEditData({ ...editData, quantity: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white"
                    placeholder={`e.g. +2 or -1 ${inputUnitLabel}`}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Expiration Date (optional)
                  </label>
                  <input
                    type="date"
                    value={editData.expirationDate}
                    onChange={(e) => setEditData({ ...editData, expirationDate: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={onSaveEdit}
                    className="flex-1 px-3 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all">
                    Save Changes
                  </button>
                  <button onClick={onCancelEdit}
                    className="flex-1 px-3 py-2.5 text-sm font-bold bg-white text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Modal Footer ── */}
          {!isEditing && (
            <div className="border-t border-slate-100 px-6 py-4 flex gap-3 shrink-0 bg-slate-50 rounded-b-2xl">
              <button
                onClick={onEdit}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-blue-600 bg-white border-2 border-blue-200 rounded-xl hover:bg-blue-50 hover:border-blue-400 transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
              <button
                onClick={onDelete}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-red-600 bg-white border-2 border-red-200 rounded-xl hover:bg-red-50 hover:border-red-400 transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function StockAdjustmentsPage() {
  const { user, role, loading, staffName, adminName } = useAuth();
  const { } = useSidebar();
  const router = useRouter();
  const searchParams = useSearchParams();

  type StatusFilterTab = 'urgent' | 'all' | 'in' | 'low' | 'expiring' | 'expired' | 'out';
  const [statusFilter, setStatusFilter] = useState<StatusFilterTab>('all');

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMedicineId, setSelectedMedicineId] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [minStockValue, setMinStockValue] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'stock' | 'expiration' | 'both' | 'minstock' | 'price'>('stock');
  const [unitCostValue, setUnitCostValue] = useState('');
  const [sellingPriceValue, setSellingPriceValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [history, setHistory] = useState<StockAdjustment[]>([]);
  const [originalStock, setOriginalStock] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ quantity: string; expirationDate: string }>({ quantity: '', expirationDate: '' });

  const [historyFilter, setHistoryFilter] = useState<'all' | 'stock' | 'expiry' | 'minstock' | 'price'>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyExpanded, setHistoryExpanded] = useState(true);

  // Modal state
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [detailAdjustment, setDetailAdjustment] = useState<StockAdjustment | null>(null);
  const [detailIndex, setDetailIndex] = useState(0);

  const [isDeleteAdjustmentConfirmOpen, setIsDeleteAdjustmentConfirmOpen] = useState(false);
  const [pendingDeleteAdjustmentId, setPendingDeleteAdjustmentId] = useState<string | null>(null);
  const [isDeleteMedicineConfirmOpen, setIsDeleteMedicineConfirmOpen] = useState(false);
  const [pendingDeleteMedicineId, setPendingDeleteMedicineId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingMedicine, setIsDeletingMedicine] = useState(false);
  const [isDeletingAdjustment, setIsDeletingAdjustment] = useState(false);
  const [isUpdatingAdjustment, setIsUpdatingAdjustment] = useState(false);
  const [isAdjustmentConfirmOpen, setIsAdjustmentConfirmOpen] = useState(false);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(t);
  }, [notification]);

  // ── Firebase: load medicines ──────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!user) return;
    const medicinesPath = getUserPath(user.uid, 'medicines');
    const unsubscribe = onValue(ref(database, medicinesPath), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data as Record<string, MedicineRecord>).map(([id, v]) => {
          const canonicalStock = v.quantity ?? v.stockPerUnit ?? 0;
          return {
            id,
            name: v.name,
            baseName: v.baseName,
            brandModel: v.brandModel,
            unit: v.unit || '',
            category: v.category || '',
            originalUnit: v.originalUnit || '',
            brand: v.brand || '',
            image: v.image || '',
            description: v.description || '',
            quantity: canonicalStock,
            stockPerUnit: canonicalStock,
            stockPerPieces: canonicalStock,
            piecesPerUnit: v.piecesPerUnit,
            totalPieces: canonicalStock,
            containerQuantity: v.containerQuantity,
            unitConversion: v.unitConversion ?? null,
            pricePerUnit: v.pricePerUnit ?? v.unitCost ?? 0,
            pricePerPieces: v.pricePerPieces ?? v.sellingPrice ?? 0,
            unitCost: v.unitCost ?? v.pricePerUnit ?? 0,
            sellingPrice: v.sellingPrice ?? v.pricePerPieces ?? 0,
            minStock: v.minStock ?? 0,
            expirationDate: v.expirationDate || '',
            createdAt: v.createdAt || new Date().toISOString(),
            strength: v.strength,
            strengths: v.strengths,
            prescriptionRequired: v.prescriptionRequired,
          };
        });
        setMedicines(list);
      } else {
        setMedicines([]);
      }
    });
    return () => unsubscribe();
  }, [user, loading, router]);

  // ── Auto-select medicine from URL parameter ───────────────────────────────
  useEffect(() => {
    const medicineParam = searchParams.get('medicine');
    if (medicineParam && medicines.length > 0) {
      const medicine = medicines.find((m) => m.id === medicineParam);
      if (medicine) setSelectedMedicineId(medicineParam);
    }
  }, [medicines, searchParams]);

  // ── Load adjustment history ───────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!selectedMedicineId || !user) return;
    try {
      const historyPath = getUserPath(user.uid, `stockAdjustments/${selectedMedicineId}`);
      const snap = await get(ref(database, historyPath));
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.entries(data as Record<string, StockAdjustmentRecord>).map(([key, value]) => ({
          id: key, medicineId: selectedMedicineId, ...value,
        }));
        setHistory(list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        setHistory([]);
      }

      const transactionsPath = getUserPath(user.uid, 'transactions');
      const transSnap = await get(ref(database, transactionsPath));
      if (transSnap.exists()) {
        const transData = transSnap.val() as Record<string, FirebaseTransaction>;
        const firstTx = Object.values(transData)
          .filter(t => t.medicineId === selectedMedicineId)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        if (firstTx) {
          setOriginalStock(firstTx.previousStock === 0 ? firstTx.quantity : firstTx.previousStock);
        } else {
          setOriginalStock(null);
        }
      } else {
        setOriginalStock(null);
      }
    } catch {
      setHistory([]);
      setOriginalStock(null);
    }
  }, [selectedMedicineId, user]);

  useEffect(() => {
    if (selectedMedicineId) {
      loadHistory();
      const med = medicines.find((m) => m.id === selectedMedicineId);
      if (med) {
        setMinStockValue(String(med.minStock || 0));
        setUnitCostValue(String(med.pricePerUnit ?? med.unitCost ?? 0));
        setSellingPriceValue(String(med.pricePerPieces ?? med.sellingPrice ?? 0));
      }
    }
  }, [selectedMedicineId, loadHistory, medicines]);

  // ── Auto-clear panel when selected medicine is deleted ────────────────────
  useEffect(() => {
    if (!selectedMedicineId) return;
    const stillExists = medicines.some((m) => m.id === selectedMedicineId);
    if (!stillExists) {
      setSelectedMedicineId('');
      setQuantityInput('');
      setExpirationDate('');
      setMinStockValue('');
      setUnitCostValue('');
      setSellingPriceValue('');
      setHistory([]);
      setEditingId(null);
      setEditData({ quantity: '', expirationDate: '' });
      setHistoryFilter('all');
      setHistoryDateFrom('');
      setHistoryDateTo('');
      setDetailPanelOpen(false);
      setDetailAdjustment(null);
    }
  }, [medicines, selectedMedicineId]);

  const selectedMedicine = medicines.find((m) => m.id === selectedMedicineId);
  const inputUnitLabel = selectedMedicine ? getInputUnitLabel(selectedMedicine) : 'Unit';
  const originalUnitLabel = selectedMedicine ? getOriginalUnitLabel(selectedMedicine) : null;
  const conversionFactor = selectedMedicine ? getConversionFactor(selectedMedicine) : 1;
  const hasConversion = conversionFactor > 1 && !!selectedMedicine?.unitConversion;
  const currentStock = selectedMedicine ? getCurrentStock(selectedMedicine) : 0;
  const inputQty = Number(quantityInput) || 0;
  const newStock = currentStock + inputQty;

  // ── Filtered history ──────────────────────────────────────────────────────
  const filteredHistory = useMemo(() => {
    return history.filter((a) => {
      if (historyFilter === 'stock' && a.quantity === 0) return false;
      if (historyFilter === 'expiry' && !(a.quantity === 0 && a.expirationDate)) return false;
      if (historyFilter === 'minstock' && a.type !== 'minstock') return false;
      if (historyFilter === 'price' && a.type !== 'price') return false;

      if (historyDateFrom || historyDateTo) {
        const ts = new Date(a.timestamp);
        const tsDate = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate());
        if (historyDateFrom) {
          const [fy, fm, fd] = historyDateFrom.split('-').map(Number);
          if (tsDate < new Date(fy, fm - 1, fd)) return false;
        }
        if (historyDateTo) {
          const [ty, tm, td] = historyDateTo.split('-').map(Number);
          if (tsDate > new Date(ty, tm - 1, td)) return false;
        }
      }
      return true;
    });
  }, [history, historyFilter, historyDateFrom, historyDateTo]);

  const totalAdded = history.filter(a => a.quantity > 0).reduce((s, a) => s + a.quantity, 0);
  const totalRemoved = history.filter(a => a.quantity < 0).reduce((s, a) => s + Math.abs(a.quantity), 0);
  const expiryUpdates = history.filter(a => a.quantity === 0 && a.expirationDate).length;
  const minStockUpdates = history.filter(a => a.type === 'minstock').length;
  const priceUpdates = history.filter(a => a.type === 'price').length;

  const statusCounts = computeStatusCounts(medicines);

  const filteredMedicines = medicines.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.category.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    const status = getMedicineStatusForFilter(m);
    return status === statusFilter;
  });

  // ── Open detail modal ─────────────────────────────────────────────────────
  const openDetail = (adjustment: StockAdjustment, idx: number) => {
    setDetailAdjustment(adjustment);
    setDetailIndex(idx);
    setEditingId(null);
    setEditData({ quantity: '', expirationDate: '' });
    setDetailPanelOpen(true);
  };

  const closeDetail = () => {
    setDetailPanelOpen(false);
    setEditingId(null);
    setEditData({ quantity: '', expirationDate: '' });
  };

  // ── Execute adjustment ────────────────────────────────────────────────────
  const executeAdjustment = async () => {
    if (!selectedMedicineId || !selectedMedicine || !user) return;

    if (adjustmentType === 'stock' || adjustmentType === 'both') {
      if (!quantityInput || quantityInput === '0') return;
    }
    if ((adjustmentType === 'expiration' || adjustmentType === 'both') && !expirationDate) return;
    if (adjustmentType === 'minstock') {
      if (minStockValue === '' || isNaN(Number(minStockValue)) || Number(minStockValue) < 0) return;
    }
    if (adjustmentType === 'price') {
      if (
        (unitCostValue === '' || isNaN(Number(unitCostValue)) || Number(unitCostValue) < 0) &&
        (sellingPriceValue === '' || isNaN(Number(sellingPriceValue)) || Number(sellingPriceValue) < 0)
      ) return;
    }

    setIsSubmitting(true);
    setIsAdjustmentConfirmOpen(false);

    try {
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {};

      const medicinePath = getUserPath(user.uid, `medicines/${selectedMedicineId}`);
      const snap = await get(ref(database, medicinePath));
      if (!snap.exists()) throw new Error('Medicine not found');
      const liveMed = snap.val() as {
        quantity?: number;
        stockPerUnit?: number;
        unitCost?: number;
        sellingPrice?: number;
        expirationDate?: string;
        unitConversion?: { conversionFactor?: number } | null;
        piecesPerUnit?: number;
        [key: string]: unknown;
      };

      const liveStock = liveMed.quantity ?? liveMed.stockPerUnit ?? 0;
      const liveUnitCost = liveMed.unitCost ?? 0;
      // Capture the current expiration date BEFORE any changes are written
      const prevExpirationDate: string | null = liveMed.expirationDate ?? null;

      if (adjustmentType === 'stock' || adjustmentType === 'both') {
        const newStockValue = liveStock + inputQty;
        updates[`${medicinePath}/quantity`] = newStockValue;
        updates[`${medicinePath}/stockPerUnit`] = newStockValue;

        const effectiveUnitCost = unitCostValue !== '' ? Number(unitCostValue) : liveUnitCost;
        updates[`${medicinePath}/totalCost`] = newStockValue * effectiveUnitCost;
        updates[`${medicinePath}/totalPieces`] = newStockValue;

        const transactionsPath = getUserPath(user.uid, 'transactions');
        const transRef = push(ref(database, transactionsPath));
        updates[`${transactionsPath}/${transRef.key}`] = {
          date: now,
          type: 'adjustment',
          medicineId: selectedMedicineId,
          quantity: inputQty,
          previousStock: liveStock,
          newStock: newStockValue,
          unitCost: liveUnitCost,
          notes: `Stock adjusted manually: ${adjustmentType}`,
        };

        if (inputQty > 0) {
          let batchExpiration = null;
          if (expirationDate) {
            batchExpiration = expirationDate;
          } else if (liveMed.expirationDate) {
            batchExpiration = liveMed.expirationDate;
          }

          if (batchExpiration) {
            const batchId = `batch_${Date.now()}`;
            updates[`${medicinePath}/batches/${batchId}`] = {
              quantity: inputQty,
              expirationDate: batchExpiration,
              createdAt: now,
            };

            const allExpirations: string[] = [];
            if (liveMed.batches && typeof liveMed.batches === 'object') {
              Object.values(liveMed.batches).forEach((batch: Record<string, unknown>) => {
                if (batch?.expirationDate && typeof batch.expirationDate === 'string') {
                  allExpirations.push(batch.expirationDate);
                }
              });
            }
            if (liveMed.expirationDate && typeof liveMed.expirationDate === 'string' && !allExpirations.includes(liveMed.expirationDate)) {
              allExpirations.push(liveMed.expirationDate);
            }
            if (batchExpiration && typeof batchExpiration === 'string') {
              allExpirations.push(batchExpiration);
            }

            if (allExpirations.length > 0) {
              const sortedDates: string[] = allExpirations.sort((a, b) => new Date(a).getTime() - new Date(b).getTime()) as string[];
              const earliestExp: string = sortedDates[0];
              const normalizedDate = new Date(earliestExp).toISOString().split('T')[0];
              updates[`${medicinePath}/expirationDate`] = normalizedDate;
            }
          }
        }
      }

      if (adjustmentType === 'expiration' || adjustmentType === 'both') {
        if (adjustmentType === 'expiration') {
          updates[`${medicinePath}/expirationDate`] = expirationDate;
        }
      }

      if (adjustmentType === 'minstock') {
        updates[`${medicinePath}/minStock`] = Number(minStockValue);
      }

      if (adjustmentType === 'price') {
        if (unitCostValue !== '') updates[`${medicinePath}/unitCost`] = Number(unitCostValue);
        if (sellingPriceValue !== '') updates[`${medicinePath}/sellingPrice`] = Number(sellingPriceValue);
      }

      updates[`${medicinePath}/updatedAt`] = now;

      const stockAdjustmentsPath = getUserPath(user.uid, `stockAdjustments/${selectedMedicineId}`);
      const adjustmentRef = push(ref(database, stockAdjustmentsPath));

      // ── Build the adjustment record ──────────────────────────────────────
      // prevExpirationDate is stored for every adjustment type that touches
      // the expiration date (expiration, both) AND for stock adjustments that
      // happen to set a new expiration (so the "Expiry Also Set" pill can show
      // the before/after context). For other types it is null and omitted.
      const involvesExpiry =
        adjustmentType === 'expiration' ||
        adjustmentType === 'both' ||
        (adjustmentType === 'stock' && !!expirationDate);

      updates[`${stockAdjustmentsPath}/${adjustmentRef.key}`] = {
        type: adjustmentType,
        quantity: (adjustmentType === 'stock' || adjustmentType === 'both') ? inputQty : 0,
        expirationDate: (adjustmentType === 'stock' || adjustmentType === 'expiration' || adjustmentType === 'both') && expirationDate ? expirationDate : null,
        // Store the previous expiration so history can show before → after
        prevExpirationDate: involvesExpiry && prevExpirationDate ? prevExpirationDate : null,
        minStock: adjustmentType === 'minstock' ? Number(minStockValue) : null,
        unitCost: adjustmentType === 'price' ? (unitCostValue !== '' ? Number(unitCostValue) : liveMed.unitCost) : null,
        sellingPrice: adjustmentType === 'price' ? (sellingPriceValue !== '' ? Number(sellingPriceValue) : liveMed.sellingPrice) : null,
        stockBefore: liveStock,
        stockAfter: (adjustmentType === 'stock' || adjustmentType === 'both') ? liveStock + inputQty : null,
        timestamp: now,
        note: `Manual adjustment: ${adjustmentType}`,
      };

      await update(ref(database), updates);

      if ((adjustmentType === 'stock' || adjustmentType === 'both') && user) {
        const medicineName = selectedMedicine?.baseName || selectedMedicine?.name || 'Unknown';
        const newStockValue = liveStock + inputQty;
        await logActivity(
          'stock_adjusted', user.uid, user.email || '',
          `Adjusted stock: ${medicineName} — ${liveStock} → ${newStockValue} (${inputQty > 0 ? '+' : ''}${inputQty} ${inputUnitLabel})`,
          { medicineId: selectedMedicineId, medicineName, quantity: Math.abs(inputQty), previousValue: liveStock, newValue: newStockValue, reason: 'Stock adjustment' },
          staffName || adminName || user.email || undefined, role || undefined,
        );
      }

      if ((adjustmentType === 'expiration' || adjustmentType === 'both') && expirationDate && user) {
        const medicineName = selectedMedicine?.baseName || selectedMedicine?.name || 'Unknown';
        const oldExpirationDate = selectedMedicine?.expirationDate || 'Not set';
        const newExpirationDateFormatted = new Date(expirationDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        await logActivity(
          'stock_adjusted', user.uid, user.email || '',
          `Adjusted expiration: ${medicineName} — ${oldExpirationDate} → ${newExpirationDateFormatted}`,
          { medicineId: selectedMedicineId, medicineName, previousValue: oldExpirationDate, newValue: newExpirationDateFormatted, reason: 'Expiration date adjustment' },
          staffName || adminName || user.email || undefined, role || undefined,
        );
      }

      if (adjustmentType === 'minstock' && user) {
        const medicineName = selectedMedicine?.baseName || selectedMedicine?.name || 'Unknown';
        const oldMinStock = selectedMedicine?.minStock || 0;
        await logActivity(
          'stock_adjusted', user.uid, user.email || '',
          `Adjusted minimum stock: ${medicineName} — ${oldMinStock} → ${minStockValue}`,
          { medicineId: selectedMedicineId, medicineName, previousValue: oldMinStock, newValue: Number(minStockValue), reason: 'Minimum stock adjustment' },
          staffName || adminName || user.email || undefined, role || undefined,
        );
      }

      if (adjustmentType === 'price' && user) {
        const medicineName = selectedMedicine?.baseName || selectedMedicine?.name || 'Unknown';
        const oldUnitCost = selectedMedicine?.unitCost || 0;
        const oldSellingPrice = selectedMedicine?.sellingPrice || 0;
        const newUnitCost = unitCostValue !== '' ? Number(unitCostValue) : oldUnitCost;
        const newSellingPrice = sellingPriceValue !== '' ? Number(sellingPriceValue) : oldSellingPrice;
        let description = `Adjusted prices: ${medicineName} — `;
        if (unitCostValue !== '') description += `Unit cost ₱${oldUnitCost} → ₱${newUnitCost}`;
        if (sellingPriceValue !== '') description += (unitCostValue !== '' ? ', ' : '') + `Selling ₱${oldSellingPrice} → ₱${newSellingPrice}`;
        await logActivity(
          'stock_adjusted', user.uid, user.email || '', description,
          { medicineId: selectedMedicineId, medicineName, unitCostPrev: oldUnitCost, unitCostNew: newUnitCost, sellingPricePrev: oldSellingPrice, sellingPriceNew: newSellingPrice, reason: 'Price adjustment' },
          staffName || adminName || user.email || undefined, role || undefined,
        );
      }

      setQuantityInput('');
      setExpirationDate('');
      setUnitCostValue('');
      setSellingPriceValue('');
      setAdjustmentType('stock');
      await loadHistory();
      setIsSubmitting(false);
      setNotification({ message: 'Adjustment applied successfully!', type: 'success' });
    } catch (err) {
      console.error('Failed to apply adjustment:', err);
      setIsSubmitting(false);
      setNotification({ message: 'Failed to apply adjustment.', type: 'error' });
    }
  };

  // ── Delete adjustment ─────────────────────────────────────────────────────
  const handleDeleteAdjustment = (id: string) => {
    setPendingDeleteAdjustmentId(id);
    setIsDeleteAdjustmentConfirmOpen(true);
  };

  const executeDeleteAdjustment = async () => {
    if (!pendingDeleteAdjustmentId || !user) return;
    setIsDeleteAdjustmentConfirmOpen(false);
    setIsDeletingAdjustment(true);
    closeDetail();
    setTimeout(async () => {
      try {
        setIsDeleting(true);
        const historyPath = getUserPath(user.uid, `stockAdjustments/${selectedMedicineId}/${pendingDeleteAdjustmentId}`);
        await remove(ref(database, historyPath));
        await loadHistory();
        setPendingDeleteAdjustmentId(null);
        setTimeout(() => { setIsDeleting(false); setIsDeletingAdjustment(false); }, 2000);
      } catch {
        setIsDeleting(false); setIsDeletingAdjustment(false); setPendingDeleteAdjustmentId(null);
      }
    }, 100);
  };

  // ── Delete medicine ───────────────────────────────────────────────────────
  const handleDeleteMedicine = () => {
    if (!selectedMedicineId) return;
    setPendingDeleteMedicineId(selectedMedicineId);
    setIsDeleteMedicineConfirmOpen(true);
  };

  const executeDeleteMedicine = async () => {
    if (!pendingDeleteMedicineId || !user) return;
    const idToDelete = pendingDeleteMedicineId;
    setIsDeleteMedicineConfirmOpen(false);
    setPendingDeleteMedicineId(null);
    setSelectedMedicineId('');
    setMedicines((prev) => prev.filter((m) => m.id !== idToDelete));
    setQuantityInput('');
    setExpirationDate('');
    setMinStockValue('');
    setUnitCostValue('');
    setSellingPriceValue('');
    setHistory([]);
    setEditingId(null);
    setEditData({ quantity: '', expirationDate: '' });
    setHistoryFilter('all');
    setHistoryDateFrom('');
    setHistoryDateTo('');
    setDetailPanelOpen(false);
    setDetailAdjustment(null);
    setIsDeletingMedicine(true);
    setIsDeleting(true);

    try {
      await remove(ref(database, getUserPath(user.uid, `medicines/${idToDelete}`)));
      await remove(ref(database, getUserPath(user.uid, `stockAdjustments/${idToDelete}`)));
      const transPath = getUserPath(user.uid, 'transactions');
      const transSnap = await get(ref(database, transPath));
      if (transSnap.exists()) {
        const transData = transSnap.val() as Record<string, FirebaseTransaction>;
        for (const [tid, tData] of Object.entries(transData)) {
          if (tData.medicineId === idToDelete) {
            await remove(ref(database, `${transPath}/${tid}`));
          }
        }
      }
    } catch {
      // silent
    } finally {
      setIsDeleting(false);
      setIsDeletingMedicine(false);
    }
  };

  // ── Update adjustment ─────────────────────────────────────────────────────
  const handleUpdateAdjustment = async (adjustmentId: string) => {
    if (!editData.quantity || isNaN(Number(editData.quantity)) || !user) return;
    setIsUpdatingAdjustment(true);
    setTimeout(async () => {
      try {
        const payload: Partial<StockAdjustment> = { quantity: Number(editData.quantity) };
        if (editData.expirationDate) payload.expirationDate = editData.expirationDate;
        const historyPath = getUserPath(user.uid, `stockAdjustments/${selectedMedicineId}/${adjustmentId}`);
        await update(ref(database, historyPath), payload);
        setEditingId(null);
        setEditData({ quantity: '', expirationDate: '' });
        await loadHistory();
        setTimeout(() => setIsUpdatingAdjustment(false), 2000);
      } catch { setIsUpdatingAdjustment(false); }
    }, 100);
  };

  const getConfirmMessage = () => {
    if (adjustmentType === 'minstock') return `Update minimum stock to ${minStockValue} for "${selectedMedicine?.name}"?`;
    if (adjustmentType === 'expiration') return `Update expiration date for "${selectedMedicine?.name}"?`;
    if (adjustmentType === 'both') return `Adjust stock and expiration for "${selectedMedicine?.name}"?`;
    if (adjustmentType === 'price') return `Update prices for "${selectedMedicine?.name}"? Unit cost: ₱${unitCostValue || '—'}, Selling price: ₱${sellingPriceValue || '—'}`;
    return `Adjust stock by ${inputQty > 0 ? '+' : ''}${inputQty} ${inputUnitLabel} for "${selectedMedicine?.name}"?`;
  };

  const hasDateFilter = historyDateFrom || historyDateTo;
  const clearDateFilter = () => { setHistoryDateFrom(''); setHistoryDateTo(''); };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-all duration-300">

      {isDeletingMedicine && <Processing message="Deleting medicine..." />}
      {isDeletingAdjustment && <Processing message="Deleting adjustment..." />}
      {isUpdatingAdjustment && <Processing message="Updating adjustment..." />}
      {isSubmitting && <Processing message="Processing adjustment..." />}

      <ConfirmationModal
        isOpen={isDeleteMedicineConfirmOpen}
        title="Delete Medicine"
        message={`Are you sure you want to delete "${selectedMedicine?.name}"? This will remove the medicine and all adjustment records.`}
        confirmText="Delete Medicine" cancelText="Cancel"
        isDangerous={true} isLoading={isDeleting}
        onConfirm={executeDeleteMedicine}
        onCancel={() => { setIsDeleteMedicineConfirmOpen(false); setPendingDeleteMedicineId(null); }}
      />
      <ConfirmationModal
        isOpen={isDeleteAdjustmentConfirmOpen}
        title="Delete Adjustment"
        message="Are you sure you want to delete this adjustment?"
        confirmText="Delete" cancelText="Cancel"
        isDangerous={true} isLoading={isDeleting}
        onConfirm={executeDeleteAdjustment}
        onCancel={() => { setIsDeleteAdjustmentConfirmOpen(false); setPendingDeleteAdjustmentId(null); }}
      />
      <ConfirmationModal
        isOpen={isAdjustmentConfirmOpen}
        title="Confirm Stock Adjustment"
        message={getConfirmMessage()}
        confirmText="Apply Adjustment" cancelText="Cancel"
        isDangerous={false} isLoading={false}
        onConfirm={executeAdjustment}
        onCancel={() => setIsAdjustmentConfirmOpen(false)}
      />

      {/* ── Detail modal ──────────────────────────────────────────────────── */}
      <HistoryDetailPanel
        adjustment={detailAdjustment}
        medicineName={selectedMedicine?.name || ''}
        inputUnitLabel={inputUnitLabel}
        isOpen={detailPanelOpen}
        onClose={closeDetail}
        onEdit={() => {
          if (!detailAdjustment) return;
          setEditingId(detailAdjustment.id);
          setEditData({ quantity: String(detailAdjustment.quantity), expirationDate: detailAdjustment.expirationDate || '' });
        }}
        onDelete={() => {
          if (!detailAdjustment) return;
          handleDeleteAdjustment(detailAdjustment.id);
        }}
        isEditing={editingId === detailAdjustment?.id}
        editData={editData}
        setEditData={setEditData}
        onSaveEdit={() => detailAdjustment && handleUpdateAdjustment(detailAdjustment.id)}
        onCancelEdit={() => { setEditingId(null); setEditData({ quantity: '', expirationDate: '' }); }}
        index={detailIndex}
        total={filteredHistory.length}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 sm:mb-10 gap-4">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mb-2">Stock Adjustments</h1>
            <p className="text-sm sm:text-base text-slate-600">Manage inventory levels with complete audit trail</p>
          </div>
          <BackButton href="/medicines" label="Back to Medicines" position="right" />
        </div>

        {/* ── STATUS FILTER SECTION ──────────────────────────────────────── */}
        <div className="surface-card surface-card-hover p-4 sm:p-5 mb-6 sm:mb-8 border-2 border-slate-200 rounded-2xl">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Filter by Status</h3>
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-1.5 min-w-max">
              {(['urgent', 'all', 'in', 'low', 'expiring', 'expired', 'out'] as const).map((tab) => {
                const count = statusCounts[tab];
                const isActive = statusFilter === tab;
                const tabLabels: Record<string, string> = { urgent: 'Urgent', all: 'All', in: 'In Stock', low: 'Low', expiring: 'Expiring', expired: 'Expired', out: 'Out' };
                const tabColors: Record<string, { active: string; inactive: string }> = {
                  urgent: { active: 'bg-red-600 text-white border-red-600', inactive: 'bg-white text-slate-700 border-slate-200 hover:border-red-300' },
                  all: { active: 'bg-slate-900 text-white border-slate-900', inactive: 'bg-white text-slate-700 border-slate-200 hover:border-slate-300' },
                  in: { active: 'bg-emerald-600 text-white border-emerald-600', inactive: 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300' },
                  low: { active: 'bg-yellow-500 text-white border-yellow-500', inactive: 'bg-white text-slate-700 border-slate-200 hover:border-yellow-300' },
                  expiring: { active: 'bg-orange-500 text-white border-orange-500', inactive: 'bg-white text-slate-700 border-slate-200 hover:border-orange-300' },
                  expired: { active: 'bg-red-700 text-white border-red-700', inactive: 'bg-white text-slate-700 border-slate-200 hover:border-red-300' },
                  out: { active: 'bg-slate-600 text-white border-slate-600', inactive: 'bg-white text-slate-700 border-slate-200 hover:border-slate-300' },
                };
                const colors = tabColors[tab];
                return (
                  <button key={tab} onClick={() => setStatusFilter(tab)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${isActive ? colors.active + ' shadow-sm' : colors.inactive}`}>
                    <span>{tabLabels[tab]}</span>
                    <span className={`ml-1.5 ${isActive ? 'font-bold' : 'font-medium'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 mb-6 sm:mb-8">

          {/* ── LEFT: Medicine list ──────────────────────────────────────── */}
          <div className="lg:col-span-5">
            <div className="surface-card surface-card-hover p-4 sm:p-5 sticky top-24 h-[calc(100vh-8rem)] flex flex-col transition-all">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-3">Select Medicine</h2>
              <input
                type="text"
                placeholder="Search medicine..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm mb-3 text-slate-900"
              />

              <div className="space-y-2 overflow-y-auto flex-1 pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                {filteredMedicines.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No medicines found</p>
                ) : (
                  filteredMedicines.map((medicine) => {
                    const cardStock = getCurrentStock(medicine);
                    const normalizedMed = normalizeMedicineForStatus(medicine);
                    const medicineStatus = getMedicineOverallStatus(normalizedMed);

                    let statusKey: StockStatus = 'in';
                    if (medicineStatus.expired) statusKey = 'expired';
                    else if (medicineStatus.expiring) statusKey = 'expiring';
                    else if (medicineStatus.out) statusKey = 'out';
                    else if (medicineStatus.low) statusKey = 'low';
                    const statusInfo = statusDisplay(statusKey);

                    const cardUnitLabel = getInputUnitLabel(medicine);
                    const cardOrigLabel = getOriginalUnitLabel(medicine);
                    const cardFactor = getConversionFactor(medicine);
                    const cardHasConv = cardFactor > 1 && !!medicine.unitConversion;

                    return (
                      <div key={medicine.id} className="relative group">
                        <button
                          onClick={() => setSelectedMedicineId(medicine.id)}
                          className={`w-full text-left p-3 rounded-xl border-2 transition-all ${selectedMedicineId === medicine.id
                            ? 'border-blue-500 bg-blue-50 shadow-md'
                            : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                            }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="font-bold text-slate-900 text-sm flex-1 break-words leading-tight">{medicine.name}</p>
                            <span className={`text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap shrink-0 ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 truncate mt-0.5">{medicine.brand}</p>

                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium">
                              {cardUnitLabel}
                            </span>
                            {cardHasConv && cardOrigLabel && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                (orig: {cardOrigLabel}, ×{cardFactor})
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                            <div className="bg-slate-50 p-1.5 rounded-lg">
                              <p className="text-slate-600 font-medium text-[10px] truncate" title={cardUnitLabel}>{cardUnitLabel}</p>
                              <p className={`font-bold text-sm ${medicineStatus.out || medicineStatus.expired ? 'text-red-500' : medicineStatus.low || medicineStatus.expiring ? 'text-amber-500' : 'text-green-600'}`}>
                                {cardStock}
                              </p>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded-lg">
                              <p className="text-slate-600 font-medium text-[10px]">Min</p>
                              <p className="font-bold text-sm text-slate-700">{medicine.minStock || 0}</p>
                            </div>
                          </div>
                        </button>

                        <Link
                          href={`/inventory?highlight=${medicine.id}`}
                          title="View & highlight in Inventory"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 bg-white border border-blue-200 text-blue-600 text-[10px] font-bold rounded-lg shadow-sm hover:bg-blue-50 hover:border-blue-400 z-10"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Inventory
                        </Link>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Adjustment form ───────────────────────────────────── */}
          <div className="lg:col-span-7">
            {selectedMedicineId ? (
              <div className="surface-card surface-card-hover p-6 sm:p-8 transition-all">

                <div className="mb-6 pb-6 border-b-2 border-slate-200">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 break-words">{selectedMedicine?.name}</h2>
                  <p className="text-sm text-slate-600 mt-2">{selectedMedicine?.brand} • {selectedMedicine?.category}</p>
                </div>

                {/* Medicine info header */}
                <div className="bg-linear-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-2xl p-5 sm:p-6 mb-6">
                  <div className="flex items-start justify-between mb-4 gap-3">
                    <div className="grid grid-cols-2 gap-4 flex-1">
                      <div>
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Min Stock</p>
                        <p className="font-bold text-slate-900 text-base">{selectedMedicine?.minStock || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1 truncate" title={inputUnitLabel}>
                          Stock ({inputUnitLabel})
                        </p>
                        <p className={`text-3xl font-black ${(() => {
                          const ns = normalizeMedicineForStatus(selectedMedicine!);
                          const s = getMedicineOverallStatus(ns);
                          return s.out || s.expired ? 'text-red-600' : s.low || s.expiring ? 'text-amber-500' : 'text-green-600';
                        })()}`}>
                          {currentStock}
                        </p>
                        {hasConversion && originalUnitLabel && (
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            ÷{conversionFactor} = {(currentStock / conversionFactor).toFixed(
                              (currentStock / conversionFactor) % 1 === 0 ? 0 : 2
                            )} {originalUnitLabel}
                          </p>
                        )}
                      </div>
                    </div>

                    <Link
                      href={`/inventory?highlight=${selectedMedicineId}`}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-white border-2 border-blue-300 text-blue-700 text-xs font-bold rounded-xl shadow-sm hover:bg-blue-50 hover:border-blue-500 transition-all whitespace-nowrap"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      View in Inventory
                    </Link>
                  </div>

                  {hasConversion && originalUnitLabel && (
                    <div className="mb-4 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-blue-700 bg-white border border-blue-200 px-2.5 py-1 rounded-lg">
                        1 {originalUnitLabel} = {conversionFactor} {inputUnitLabel}
                      </span>
                      <span className="text-xs text-slate-500">
                        Stock is tracked in <span className="font-bold text-slate-700">{inputUnitLabel}</span>
                        {' '}— enter quantities in <span className="font-bold text-slate-700">{inputUnitLabel}</span>
                      </span>
                    </div>
                  )}

                  <div className="pt-4 border-t border-blue-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Min Stock</p>
                      <p className="font-semibold text-slate-900 text-sm">{selectedMedicine?.minStock || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Unit Cost</p>
                      <p className="font-semibold text-slate-900 text-sm">
                        ₱{(selectedMedicine?.pricePerUnit ?? selectedMedicine?.unitCost ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Selling Price</p>
                      <p className="font-semibold text-slate-900 text-sm">
                        ₱{(selectedMedicine?.pricePerPieces ?? selectedMedicine?.sellingPrice ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    {selectedMedicine?.expirationDate && (
                      <div>
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Expiration Date</p>
                        <p className="font-semibold text-slate-900 text-sm">
                          {new Date(selectedMedicine.expirationDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Adjustment fields */}
                <div className="space-y-5">
                  <div>
                    <label className="text-base font-bold text-slate-900 block mb-3">Adjustment Type</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {[
                        { key: 'stock', label: 'Stock Only', activeClass: 'bg-blue-600 text-white border-blue-600', inactiveClass: 'bg-white text-slate-900 border-slate-200 hover:border-blue-400 hover:bg-blue-50' },
                        { key: 'expiration', label: 'Expiration', activeClass: 'bg-orange-600 text-white border-orange-600', inactiveClass: 'bg-white text-slate-900 border-slate-200 hover:border-orange-400 hover:bg-orange-50' },
                        { key: 'both', label: 'Both', activeClass: 'bg-purple-600 text-white border-purple-600', inactiveClass: 'bg-white text-slate-900 border-slate-200 hover:border-purple-400 hover:bg-purple-50' },
                        { key: 'minstock', label: 'Min Stock', activeClass: 'bg-teal-600 text-white border-teal-600', inactiveClass: 'bg-white text-slate-900 border-slate-200 hover:border-teal-400 hover:bg-teal-50' },
                        { key: 'price', label: 'Price', activeClass: 'bg-rose-600 text-white border-rose-600', inactiveClass: 'bg-white text-slate-900 border-slate-200 hover:border-rose-400 hover:bg-rose-50' },
                      ].map(({ key, label, activeClass, inactiveClass }) => (
                        <button key={key} type="button"
                          onClick={() => setAdjustmentType(key as typeof adjustmentType)}
                          className={`px-4 py-3 text-sm font-bold rounded-xl border-2 transition-all shadow-md ${adjustmentType === key ? activeClass : inactiveClass}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(adjustmentType === 'stock' || adjustmentType === 'both') && (
                    <div>
                      <label className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
                        Quantity
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">{inputUnitLabel}</span>
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatNumberWithCommas(quantityInput)}
                        onChange={(e) => setQuantityInput(e.target.value.replace(/,/g, ''))}
                        placeholder={`e.g. +10 or -5 ${inputUnitLabel}`}
                        className="w-full px-4 py-3 text-base border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm text-slate-900"
                      />
                      {quantityInput && !isNaN(inputQty) && inputQty !== 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium flex items-center gap-1.5">
                            <span className="text-slate-500">New total:</span>
                            <span className={`font-bold ${newStock < 0 ? 'text-red-600' : 'text-green-600'}`}>{newStock} {inputUnitLabel}</span>
                            {newStock < 0 && <span className="text-red-500 text-[10px] font-bold">— cannot go below 0</span>}
                          </p>
                          {hasConversion && originalUnitLabel && newStock >= 0 && (
                            <p className="text-xs text-slate-400 font-medium">
                              = {(newStock / conversionFactor).toFixed((newStock / conversionFactor) % 1 === 0 ? 0 : 2)} {originalUnitLabel}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(adjustmentType === 'expiration' || adjustmentType === 'both') && (
                    <div>
                      <label className="block text-base font-bold text-slate-900 mb-2">
                        Expiration Date{' '}
                        {adjustmentType === 'both' && <span className="text-slate-400 font-normal text-sm">(optional)</span>}
                      </label>
                      {selectedMedicine?.expirationDate && (
                        <p className="text-xs text-slate-500 mb-2">
                          Current expiration:{' '}
                          <span className="font-semibold text-slate-700">
                            {formatDateStr(selectedMedicine.expirationDate)}
                          </span>
                        </p>
                      )}
                      <input
                        type="date"
                        value={expirationDate}
                        onChange={(e) => setExpirationDate(e.target.value)}
                        className="w-full px-4 py-3 text-base border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white shadow-sm text-slate-900"
                      />
                    </div>
                  )}

                  {adjustmentType === 'minstock' && (
                    <div>
                      <label className="block text-base font-bold text-slate-900 mb-2">New Minimum Stock</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatNumberWithCommas(minStockValue)}
                        onChange={(e) => setMinStockValue(e.target.value.replace(/,/g, ''))}
                        placeholder="e.g. 10"
                        className="w-full px-4 py-3 text-base border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white shadow-sm text-slate-900"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Current minimum: <span className="font-semibold text-slate-700">{selectedMedicine?.minStock || 0}</span>.{' '}
                        Stock shows as &quot;Low&quot; when it falls at or below this value.
                      </p>
                    </div>
                  )}

                  {adjustmentType === 'price' && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex-wrap">
                        <span className="text-xs font-bold text-rose-700 uppercase tracking-wide">Current:</span>
                        <span className="text-xs text-slate-600">
                          Unit Cost: <span className="font-bold text-slate-900">₱{(selectedMedicine?.pricePerUnit ?? selectedMedicine?.unitCost ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-600">
                          Selling Price: <span className="font-bold text-slate-900">₱{(selectedMedicine?.pricePerPieces ?? selectedMedicine?.sellingPrice ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        </span>
                      </div>
                      <div>
                        <label className="block text-base font-bold text-slate-900 mb-2">
                          New Unit Cost <span className="ml-2 text-xs font-normal text-slate-400">(leave blank to keep current)</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm select-none pointer-events-none">₱</span>
                          <input
                            type="text" inputMode="decimal"
                            value={formatNumberWithCommas(unitCostValue)}
                            onChange={(e) => setUnitCostValue(e.target.value.replace(/,/g, ''))}
                            placeholder={String(selectedMedicine?.pricePerUnit ?? selectedMedicine?.unitCost ?? 0)}
                            className="w-full pl-8 pr-4 py-3 text-base border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-white shadow-sm text-slate-900"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-base font-bold text-slate-900 mb-2">
                          New Selling Price <span className="ml-2 text-xs font-normal text-slate-400">(leave blank to keep current)</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm select-none pointer-events-none">₱</span>
                          <input
                            type="text" inputMode="decimal"
                            value={formatNumberWithCommas(sellingPriceValue)}
                            onChange={(e) => setSellingPriceValue(e.target.value.replace(/,/g, ''))}
                            placeholder={String(selectedMedicine?.pricePerPieces ?? selectedMedicine?.sellingPrice ?? 0)}
                            className="w-full pl-8 pr-4 py-3 text-base border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-white shadow-sm text-slate-900"
                          />
                        </div>
                      </div>
                      {(unitCostValue || sellingPriceValue) && (
                        <div className="flex flex-wrap gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                          {unitCostValue && (
                            <span className="flex items-center gap-1.5">
                              <span className="text-slate-500">Unit Cost:</span>
                              <span className="font-black text-rose-600">₱{Number(unitCostValue).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                            </span>
                          )}
                          {unitCostValue && sellingPriceValue && <span className="text-slate-300">·</span>}
                          {sellingPriceValue && (
                            <span className="flex items-center gap-1.5">
                              <span className="text-slate-500">Selling Price:</span>
                              <span className="font-black text-rose-600">₱{Number(sellingPriceValue).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-5 mt-5 border-t border-slate-200">
                  <button
                    onClick={handleDeleteMedicine}
                    className="px-5 py-3 text-sm font-bold bg-white border-2 border-red-300 text-red-700 rounded-xl hover:bg-red-50 hover:border-red-400 transition-all shadow-sm"
                  >
                    Delete Medicine
                  </button>
                  <button
                    onClick={() => setIsAdjustmentConfirmOpen(true)}
                    disabled={isSubmitting}
                    className="flex-1 px-5 py-3 text-base font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                  >
                    Confirm Adjustment
                  </button>
                </div>
              </div>
            ) : (
              <div className="surface-card h-full min-h-100 flex items-center justify-center transition-all">
                <div className="text-center">
                  <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-5">
                    <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-xl text-slate-600 font-semibold">Select a medicine to adjust stock</p>
                  <p className="text-sm text-slate-400 mt-2">Choose a medicine from the list on the left</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            ADJUSTMENT HISTORY — TABLE LAYOUT
        ══════════════════════════════════════════════════════════════════ */}
        {selectedMedicineId && (
          <div className="surface-card surface-card-hover transition-all overflow-hidden">

            {/* Header */}
            <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setHistoryExpanded(p => !p)}
                    className="flex items-center gap-2 group"
                  >
                    <div className={`w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center transition-transform ${historyExpanded ? '' : '-rotate-90'}`}>
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Adjustment History
                    </h2>
                  </button>
                  <span className="text-sm font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    {history.length}
                  </span>
                </div>

                <Link
                  href={`/inventory?highlight=${selectedMedicineId}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View in Inventory
                </Link>
              </div>

              {/* Summary stats */}
              {history.length > 0 && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Original Stock', value: originalStock !== null ? `${originalStock}` : '—', sub: 'at addition', color: 'text-slate-900', bg: 'bg-slate-50 border-slate-200' },
                    { label: 'Total Added', value: `+${totalAdded}`, sub: inputUnitLabel, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
                    { label: 'Total Removed', value: `-${totalRemoved}`, sub: inputUnitLabel, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
                    { label: 'Expiry Updates', value: String(expiryUpdates), sub: 'date changes', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
                  ].map(({ label, value, sub, color, bg }) => (
                    <div key={label} className={`border rounded-xl px-3 py-2.5 ${bg}`}>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
                      <p className={`text-xl font-black ${color}`}>{value}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{sub}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Filters */}
            {historyExpanded && history.length > 0 && (
              <div className="px-5 sm:px-6 py-3 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="flex gap-1.5 flex-wrap shrink-0">
                  {([
                    { key: 'all', label: 'All', count: history.length },
                    { key: 'stock', label: 'Stock', count: history.filter(a => a.quantity !== 0).length },
                    { key: 'expiry', label: 'Expiry', count: expiryUpdates },
                    { key: 'minstock', label: 'Min Stock', count: minStockUpdates },
                    { key: 'price', label: 'Price', count: priceUpdates },
                  ] as const).map(({ key, label, count }) => (
                    <button
                      key={key}
                      onClick={() => setHistoryFilter(key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${historyFilter === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {label}
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${historyFilter === key ? 'bg-white/20 text-white' : 'bg-white text-slate-500'}`}>{count}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <input type="date" value={historyDateFrom} onChange={(e) => setHistoryDateFrom(e.target.value)}
                      className="text-xs text-slate-700 bg-transparent focus:outline-none w-28" title="From date" />
                    <span className="text-slate-300 text-xs font-bold">→</span>
                    <input type="date" value={historyDateTo} min={historyDateFrom || undefined}
                      onChange={(e) => setHistoryDateTo(e.target.value)}
                      className="text-xs text-slate-700 bg-transparent focus:outline-none w-28" title="To date" />
                  </div>
                  {hasDateFilter && (
                    <button onClick={clearDateFilter}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── TABLE ─────────────────────────────────────────────────── */}
            {historyExpanded && (
              <div>
                {history.length === 0 ? (
                  <div className="text-center py-12 px-5">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">No adjustments yet</p>
                    <p className="text-slate-400 text-xs mt-1">Use the form above to record your first adjustment</p>
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="text-center py-10 px-5">
                    <p className="text-slate-500 text-sm font-medium">No results for this filter</p>
                    <button onClick={() => { setHistoryFilter('all'); clearDateFilter(); }}
                      className="mt-2 text-xs text-blue-600 hover:underline font-medium">
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left px-5 sm:px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest w-10">#</th>
                          <th className="text-left px-2 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Action</th>
                          <th className="text-left px-2 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Date</th>
                          <th className="px-4 sm:px-6 py-3 w-24"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredHistory.map((adjustment, idx) => {
                          const meta = getAdjustmentActionMeta(adjustment);
                          const description = buildActionDescription(adjustment, selectedMedicine?.name || '', inputUnitLabel);
                          const isViewing = detailAdjustment?.id === adjustment.id && detailPanelOpen;

                          return (
                            <tr
                              key={adjustment.id}
                              className={`group transition-colors ${isViewing ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                            >
                              {/* Seq # */}
                              <td className="px-5 sm:px-6 py-4">
                                <span className="text-[11px] font-black text-slate-300">
                                  {filteredHistory.length - idx}
                                </span>
                              </td>

                              {/* Action column */}
                              <td className="px-2 py-4">
                                <p className="text-sm text-slate-800 font-medium leading-snug mb-1.5">
                                  {description}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${meta.badgeClass}`}>
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    {meta.badge}
                                  </span>
                                  {adjustment.note && (
                                    <span className="text-[10px] text-slate-400 font-medium italic truncate max-w-xs">
                                      {adjustment.note}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Date column */}
                              <td className="px-2 py-4 whitespace-nowrap">
                                <p className="text-xs font-semibold text-slate-700">
                                  {new Date(adjustment.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                  {timeAgo(adjustment.timestamp)}
                                </p>
                              </td>

                              {/* View button */}
                              <td className="px-4 sm:px-6 py-4 text-right">
                                <button
                                  onClick={() => openDetail(adjustment, idx)}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${isViewing
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50'
                                    }`}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                  View
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Table footer */}
                    <div className="px-5 sm:px-6 py-3 border-t border-slate-100 flex items-center justify-between">
                      <p className="text-xs text-slate-400 font-medium">
                        {filteredHistory.length} record{filteredHistory.length !== 1 ? 's' : ''} · most recent first
                      </p>
                      {hasDateFilter && (
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                          Date filtered
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {notification && (
        <div className={`fixed top-5 right-5 z-100 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium animate-in slide-in-from-right duration-300 ${notification.type === 'success' ? 'bg-white border-emerald-200 text-emerald-800' : 'bg-white border-red-200 text-red-700'}`}>
          <span className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`} />
          {notification.message}
        </div>
      )}
    </div>
  );
}