'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, onValue } from 'firebase/database';
import Link from 'next/link';

// ─── Interface — aligned with dispense page ────────────────────────────────────
interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

interface Medicine {
  id: string;
  name?: string;
  baseName?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  originalUnit?: string;
  brandModel?: string;
  countryOfOrigin?: string;
  unitCost?: number;
  totalCost?: number;
  strength?: string;
  strengths?: string[] | null;
  category?: string;
  brand?: string;
  image?: string;
  stockPerUnit?: number;
  stockPerPieces?: number;
  minStock?: number;
  expirationDate?: string;
  batches?: Record<string, MedicineBatch>; // FIFO batches with individual expirations
  prescriptionRequired?: boolean;
  createdAt: string;
  piecesPerUnit?: number;
  totalPieces?: number;
  containerQuantity?: number;
  unitConversion?: {
    packagingUnit?: string;
    conversionUnit?: string;
    conversionFactor?: number;
    customUnitName?: string;
  } | null;
}

type MedicineRecord = Omit<Medicine, 'id'>;

// ─── Helpers — mirrored from dispense page ─────────────────────────────────────
function getDisplayName(m: Medicine): string  { return m.baseName || m.name || '—'; }
function getDisplayBrand(m: Medicine): string { return m.brandModel || m.brand || '—'; }
function getCategory(m: Medicine): string     { return m.category || 'Unknown'; }
function getEffectiveStock(m: Medicine): number {
  return m.quantity ?? 0;
}
function getMinStock(m: Medicine): number { return m.minStock ?? 0; }

/**
 * Returns the conversion label shown on dispense cards, e.g. "100pcs / 40 Boxes".
 * Mirrors getConversionLabel() from the dispense page exactly.
 *   pcsPerUnit     = unitConversion.conversionFactor  (e.g. 100)
 *   containerQty   = containerQuantity                (e.g. 40 — kept in sync by stock-adjustments page)
 *   originalUnit   = originalUnit                     (e.g. "Boxes")
 */
function getConversionLabel(m: Medicine): string | null {
  const pcsPerUnit   = m.unitConversion?.conversionFactor;
  const containerQty = m.containerQuantity;
  const originalUnit = m.originalUnit;
  if (!pcsPerUnit || !containerQty || !originalUnit) return null;
  return `${pcsPerUnit}pcs / ${containerQty} ${originalUnit}`;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}
function getTodayMidnight(): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}
function getDaysUntilExpiry(expirationDate: string): number {
  return Math.floor(
    (parseLocalDate(expirationDate).getTime() - getTodayMidnight().getTime()) / 86400000
  );
}

function getExpiryMilestone(days: number): { label: string; chipCls: string } | null {
  if (days < 0)   return null;
  if (days === 0) return { label: 'Expires Today',    chipCls: 'bg-red-100 text-red-700 border-red-300' };
  if (days === 1) return { label: 'Expires Tomorrow', chipCls: 'bg-red-100 text-red-700 border-red-300' };
  if (days <= 7)  return { label: '1 week left',      chipCls: 'bg-orange-100 text-orange-700 border-orange-300' };
  if (days <= 30) return { label: '1 month left',     chipCls: 'bg-yellow-100 text-yellow-700 border-yellow-300' };
  return null;
}

// ─── Status ───────────────────────────────────────────────────────────────────
type FieldStatus = 'out' | 'expired' | 'urgent' | 'expiring' | 'low' | 'in';

function getMedicineStatus(m: Medicine): FieldStatus {
  const stock    = getEffectiveStock(m);
  const minStock = getMinStock(m);
  const exp      = m.expirationDate ? parseLocalDate(m.expirationDate) : null;
  const today    = getTodayMidnight();

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

interface MedicineFlags {
  status: FieldStatus;
  isOut: boolean; isExpired: boolean; isExpiring: boolean; isLow: boolean; isIn: boolean;
  isUrgent: boolean;
}

function getMedicineFlags(m: Medicine): MedicineFlags {
  const status = getMedicineStatus(m);
  return {
    status,
    isOut:      status === 'out',
    isExpired:  status === 'expired',
    isExpiring: status === 'expiring',
    isLow:      status === 'low',
    isIn:       status === 'in',
    isUrgent:   status === 'urgent',
  };
}

function getStatusBadge(status: FieldStatus): { label: string; classes: string } {
  switch (status) {
    case 'expired':  return { label: 'Expired',       classes: 'bg-red-100 text-red-700 border border-red-200' };
    case 'expiring': return { label: 'Expiring Soon', classes: 'bg-orange-100 text-orange-700 border border-orange-200' };
    case 'urgent':   return { label: 'Urgent Alert',  classes: 'bg-red-600 text-white border border-red-700 font-black animate-pulse' };
    case 'out':      return { label: 'Out of Stock',  classes: 'bg-slate-100 text-slate-700 border border-slate-200' };
    case 'low':      return { label: 'Low Stock',     classes: 'bg-yellow-100 text-yellow-700 border border-yellow-200' };
    case 'in':       return { label: 'In Stock',      classes: 'bg-emerald-100 text-emerald-700 border border-emerald-200' };
  }
}

interface StatusCounts { out: number; expired: number; expiring: number; low: number; in: number; urgent: number; }

function computeStatusCounts(medicines: Medicine[]): StatusCounts {
  let out = 0, expired = 0, expiring = 0, low = 0, inStock = 0, urgent = 0;
  for (const m of medicines) {
    const f = getMedicineFlags(m);
    if      (f.isOut)      out++;
    else if (f.isExpired)  expired++;
    else if (f.isUrgent)   urgent++;
    else if (f.isExpiring) expiring++;
    else if (f.isLow)      low++;
    else                   inStock++;
  }
  return { out, expired, expiring, low, in: inStock, urgent };
}

// ─── Minimalist SVG icon components ──────────────────────────────────────────
function IconUrgent({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
function IconAll({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
function IconInStock({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function IconLow({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
    </svg>
  );
}
function IconExpiring({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" />
    </svg>
  );
}
function IconExpired({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}
function IconOut({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}
function IconPlus({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" viewBox="0 0 24 24">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconArrow({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
function IconCalendar({ cls = 'w-3 h-3' }: { cls?: string }) {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconPackage({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

// ─── Tab config ───────────────────────────────────────────────────────────────
type FilterTab = 'urgent' | 'all' | 'in' | 'low' | 'expiring' | 'expired' | 'out';
const VALID_TABS: FilterTab[] = ['urgent', 'all', 'in', 'low', 'expiring', 'expired', 'out'];

const TABS = [
  { key: 'urgent'   as FilterTab, label: 'Urgent',   Icon: IconUrgent,   activeClass: 'bg-red-600 text-white border-red-600',        badgeClass: 'bg-red-400 text-white' },
  { key: 'all'      as FilterTab, label: 'All',      Icon: IconAll,      activeClass: 'bg-slate-900 text-white border-slate-900',     badgeClass: 'bg-slate-700 text-white' },
  { key: 'in'       as FilterTab, label: 'In Stock', Icon: IconInStock,  activeClass: 'bg-emerald-600 text-white border-emerald-600', badgeClass: 'bg-emerald-500 text-white' },
  { key: 'low'      as FilterTab, label: 'Low',      Icon: IconLow,      activeClass: 'bg-yellow-500 text-white border-yellow-500',   badgeClass: 'bg-yellow-400 text-slate-900' },
  { key: 'expiring' as FilterTab, label: 'Expiring', Icon: IconExpiring, activeClass: 'bg-orange-500 text-white border-orange-500',   badgeClass: 'bg-orange-400 text-white' },
  { key: 'expired'  as FilterTab, label: 'Expired',  Icon: IconExpired,  activeClass: 'bg-red-700 text-white border-red-700',         badgeClass: 'bg-red-500 text-white' },
  { key: 'out'      as FilterTab, label: 'Out',      Icon: IconOut,      activeClass: 'bg-slate-600 text-white border-slate-600',     badgeClass: 'bg-slate-500 text-white' },
];

// ─── Shared expiry display row ────────────────────────────────────────────────
function ExpiryRow({ expirationDate }: { expirationDate: string }) {
  const days      = getDaysUntilExpiry(expirationDate);
  const milestone = getExpiryMilestone(days);
  const dateLabel = parseLocalDate(expirationDate).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const dayColor = days <= 1 ? 'text-red-500' : days <= 7 ? 'text-orange-500' : 'text-yellow-600';

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      {milestone && (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${milestone.chipCls}`}>
          <IconCalendar />
          {milestone.label}
        </span>
      )}
      <span className="text-xs text-slate-500 inline-flex items-center gap-1">
        <IconCalendar />
        <span className="font-medium text-slate-700">{dateLabel}</span>
        {days >= 0
          ? <span className={`font-semibold ${dayColor}`}>· {days}d left</span>
          : <span className="text-red-500 font-semibold">· expired {Math.abs(days)}d ago</span>
        }
      </span>
    </div>
  );
}

// ─── Conversion label chip — shared between both card types ──────────────────
function ConversionChip({ medicine }: { medicine: Medicine }) {
  const label = getConversionLabel(medicine);
  if (!label) return null;
  return (
    <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
      {label}
    </span>
  );
}

// ─── Urgent Card ──────────────────────────────────────────────────────────────
function UrgentCard({ medicine }: { medicine: Medicine }) {
  const stock    = getEffectiveStock(medicine);
  const minStock = getMinStock(medicine);
  // When a unit conversion exists, getEffectiveStock() returns stockPerUnit which is in
  // the CONVERTED unit (Tablets/Pieces), NOT the container (Boxes). The container count
  // is already shown by ConversionChip, so use the converted unit label here to avoid
  // duplication like "4000 Boxes" alongside "100pcs / 40 Boxes".
  const hasConversion = !!(medicine.unitConversion?.conversionFactor && medicine.originalUnit);
  const unit = hasConversion
    ? ((medicine.unitConversion?.customUnitName || medicine.unitConversion?.conversionUnit || medicine.unit || medicine.category || 'units').trim())
    : (medicine.originalUnit || medicine.unit || medicine.category || 'units');

  return (
    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border-2 border-red-200 bg-linear-to-r from-red-50 to-orange-50 hover:shadow-md transition-all overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-linear-to-b from-red-500 to-orange-400 rounded-l-2xl" />
      <div className="pl-3 flex-1 min-w-0">

        {/* Name row */}
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Urgent
          </span>
          <p className="font-bold text-slate-900 text-sm truncate">{getDisplayName(medicine)}</p>
          {medicine.strength && (
            <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full">
              {medicine.strength}
            </span>
          )}
          {/* Conversion label — shown inline next to the name for immediate context */}
          <ConversionChip medicine={medicine} />
        </div>
        <p className="text-xs text-slate-500 mb-3">{getDisplayBrand(medicine)} · {getCategory(medicine)}</p>

        {/* Stock grid */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="rounded-lg px-3 py-2 border bg-orange-50 border-orange-200">
            <p className="text-[10px] text-slate-400 mb-0.5">Current Stock</p>
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-bold text-orange-700">{stock}</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">{unit}</span>
            </div>
            {minStock > 0 && <p className="text-[9px] text-slate-400 mt-0.5">min {minStock}</p>}
          </div>
          <div className="rounded-lg px-3 py-2 border bg-yellow-50 border-yellow-200">
            <p className="text-[10px] text-slate-400 mb-0.5">Needed to Min</p>
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-bold text-yellow-700">{Math.max(0, minStock - stock)}</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 border border-yellow-200">units</span>
            </div>
            <p className="text-[9px] text-slate-400 mt-0.5">to reach min</p>
          </div>
        </div>

        {medicine.expirationDate && <ExpiryRow expirationDate={medicine.expirationDate} />}
      </div>

      <div className="flex flex-row sm:flex-col gap-2 shrink-0 pl-3 sm:pl-0">
        <Link href={`/stock-adjustments?medicine=${medicine.id}`}
          className="inline-flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap">
          <IconPlus />
          Restock
        </Link>
        <Link href="/inventory"
          className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap">
          View <IconArrow />
        </Link>
      </div>
    </div>
  );
}

// ─── Standard notification card ───────────────────────────────────────────────
function MedicineNotificationCard({ medicine }: { medicine: Medicine }) {
  const flags    = getMedicineFlags(medicine);
  const badge    = getStatusBadge(flags.status);
  const stock    = getEffectiveStock(medicine);
  const minStock = getMinStock(medicine);
  // Same fix as UrgentCard: stockPerUnit is in converted units (Tablets), not containers (Boxes).
  const hasConversion = !!(medicine.unitConversion?.conversionFactor && medicine.originalUnit);
  const unit = hasConversion
    ? ((medicine.unitConversion?.customUnitName || medicine.unitConversion?.conversionUnit || medicine.unit || medicine.category || 'units').trim())
    : (medicine.originalUnit || medicine.unit || medicine.category || 'units');
  const daysUntilExpiry = medicine.expirationDate ? getDaysUntilExpiry(medicine.expirationDate) : null;
  const milestone = daysUntilExpiry !== null ? getExpiryMilestone(daysUntilExpiry) : null;

  const cardBorder =
    flags.status === 'expired'  ? 'border-red-200 bg-red-50/40' :
    flags.status === 'expiring' ? 'border-orange-200 bg-orange-50/40' :
    flags.status === 'out'      ? 'border-slate-200 bg-slate-50/40' :
    flags.status === 'low'      ? 'border-yellow-200 bg-yellow-50/40' :
                                  'border-emerald-200 bg-emerald-50/20';

  const barPct   = minStock > 0 ? Math.min((stock / minStock) * 100, 100) : null;
  const barColor =
    flags.status === 'out'      ? 'bg-slate-400' :
    flags.status === 'low'      ? 'bg-yellow-500' :
    flags.status === 'expiring' ? 'bg-orange-500' :
    flags.status === 'expired'  ? 'bg-red-400' :
    'bg-emerald-500';

  return (
    <div className={`flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 rounded-xl border ${cardBorder} hover:shadow-sm transition-all`}>
      <div className="flex-1 min-w-0">

        {/* Name + badges */}
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <p className="font-semibold text-slate-900 text-sm">{getDisplayName(medicine)}</p>
          {medicine.strength && (
            <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full">
              {medicine.strength}
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.classes}`}>{badge.label}</span>
          {flags.isUrgent && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
              <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
              Urgent
            </span>
          )}
          {milestone && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${milestone.chipCls}`}>
              <IconCalendar />
              {milestone.label}
            </span>
          )}
          {/* Conversion label — shown inline with other badges */}
          <ConversionChip medicine={medicine} />
        </div>

        <p className="text-xs text-slate-500 mb-3">{getDisplayBrand(medicine)} · {getCategory(medicine)}</p>

        {/* Stock numbers */}
        <div className="flex items-end gap-4 mb-2 flex-wrap">
          <div>
            <p className="text-[10px] text-slate-400 mb-0.5">Stock</p>
            <p className="text-xl font-black text-slate-900 leading-none">
              {stock}<span className="text-xs font-medium text-slate-400 ml-1">{unit}</span>
            </p>
          </div>
          {minStock > 0 && (
            <div>
              <p className="text-[10px] text-slate-400 mb-0.5">Min</p>
              <p className="text-lg font-bold text-slate-500 leading-none">{minStock}</p>
            </div>
          )}
          {medicine.piecesPerUnit && medicine.piecesPerUnit > 0 && (
            <div>
              <p className="text-[10px] text-slate-400 mb-0.5">Pcs/Unit</p>
              <p className="text-lg font-bold text-slate-500 leading-none">{medicine.piecesPerUnit}</p>
            </div>
          )}
        </div>

        {/* Stock bar */}
        {barPct !== null && (
          <div className="mb-3">
            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barPct}%` }} />
            </div>
            <p className="text-[9px] text-slate-400 mt-0.5">{barPct.toFixed(0)}% of minimum</p>
          </div>
        )}

        {/* Expiry row */}
        {medicine.expirationDate && <ExpiryRow expirationDate={medicine.expirationDate} />}
      </div>

      <div className="flex items-center gap-2 shrink-0 sm:mt-1">
        {(flags.isLow || flags.isOut || flags.isUrgent) && (
          <Link href={`/stock-adjustments?medicine=${medicine.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-black px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
            <IconPlus />
            Restock
          </Link>
        )}
        <Link href="/inventory"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
          View <IconArrow />
        </Link>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading,   setLoading]   = useState(true);

  const paramTab = searchParams.get('tab') as FilterTab | null;
  const [activeTab, setActiveTab] = useState<FilterTab>(
    paramTab && VALID_TABS.includes(paramTab) ? paramTab : 'urgent'
  );

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const medicinesPath = getUserPath(user.uid, 'medicines');
    return onValue(ref(database, medicinesPath), (snapshot) => {
      const data = snapshot.val();
      setMedicines(
        data
          ? Object.entries(data as Record<string, MedicineRecord>).map(([id, v]) => ({ id, ...v }))
          : []
      );
      setLoading(false);
    });
  }, [user]);

  const counts  = computeStatusCounts(medicines);
  const flagged = medicines.map((m) => ({ m, f: getMedicineFlags(m) }));

  const tabMedicines: Record<FilterTab, Medicine[]> = {
    urgent:   flagged.filter((x) => x.f.isUrgent).map((x) => x.m),
    all:      medicines,
    in:       flagged.filter((x) => x.f.isIn).map((x) => x.m),
    low:      flagged.filter((x) => x.f.isLow).map((x) => x.m),
    expiring: flagged.filter((x) => x.f.isExpiring).map((x) => x.m),
    expired:  flagged.filter((x) => x.f.isExpired).map((x) => x.m),
    out:      flagged.filter((x) => x.f.isOut).map((x) => x.m),
  };

  const tabCounts: Record<FilterTab, number> = {
    urgent:   counts.urgent,
    all:      medicines.length,
    in:       counts.in,
    low:      counts.low,
    expiring: counts.expiring,
    expired:  counts.expired,
    out:      counts.out,
  };

  const alertCount = counts.out + counts.expired + counts.expiring + counts.low;
  const displayed  = tabMedicines[activeTab];

  const summaryCards = [
    { tab: 'urgent'   as FilterTab, label: 'Urgent',        sub: 'Low + expiring',  count: counts.urgent,   activeBg: 'bg-red-50 border-red-300',        numCls: 'text-red-600',     lblCls: 'text-red-700' },
    { tab: 'in'       as FilterTab, label: 'In Stock',      sub: 'Available now',   count: counts.in,       activeBg: 'bg-emerald-50 border-emerald-200', numCls: 'text-emerald-600', lblCls: 'text-emerald-700' },
    { tab: 'low'      as FilterTab, label: 'Low Stock',     sub: 'Below minimum',   count: counts.low,      activeBg: 'bg-yellow-50 border-yellow-200',  numCls: 'text-yellow-600',  lblCls: 'text-yellow-700' },
    { tab: 'expiring' as FilterTab, label: 'Expiring Soon', sub: 'Within 30 days',  count: counts.expiring, activeBg: 'bg-orange-50 border-orange-200',  numCls: 'text-orange-600',  lblCls: 'text-orange-700' },
    { tab: 'expired'  as FilterTab, label: 'Expired',       sub: 'Past expiry',     count: counts.expired,  activeBg: 'bg-red-50 border-red-200',        numCls: 'text-red-600',     lblCls: 'text-red-700' },
    { tab: 'out'      as FilterTab, label: 'Out of Stock',  sub: 'Zero stock',      count: counts.out,      activeBg: 'bg-slate-100 border-slate-300',   numCls: 'text-slate-700',   lblCls: 'text-slate-800' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center transition-[margin] duration-300">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mb-2">Notifications</h1>
              <p className="text-sm sm:text-base text-slate-500">
                {alertCount > 0
                  ? `${alertCount} alert${alertCount !== 1 ? 's' : ''} require attention`
                  : 'All clear — no alerts'}
              </p>
            </div>
            {alertCount > 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl text-sm font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {alertCount} alert{alertCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* Urgent banner */}
        {tabMedicines.urgent.length > 0 && activeTab !== 'urgent' && (
          <button onClick={() => setActiveTab('urgent')}
            className="w-full mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl border-2 border-red-200 bg-linear-to-r from-red-50 to-orange-50 hover:from-red-100 hover:to-orange-100 transition-colors text-left">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center shrink-0 text-white">
                <IconUrgent cls="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-red-800 text-sm">
                  {tabMedicines.urgent.length} medicine{tabMedicines.urgent.length !== 1 ? 's are' : ' is'} low stock AND expiring soon
                </p>
                <p className="text-xs text-red-600 mt-0.5">Restock before they expire</p>
              </div>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 hover:bg-red-200 border border-red-200 px-3 py-1.5 rounded-lg transition-colors">
              View Urgent <IconArrow cls="w-3 h-3" />
            </span>
          </button>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {summaryCards.map((card) => (
            <button key={card.tab} onClick={() => setActiveTab(card.tab)}
              className={`surface-card text-left p-4 transition-all hover:shadow-md cursor-pointer rounded-xl border ${activeTab === card.tab ? `${card.activeBg} shadow-sm` : 'hover:border-slate-300'}`}>
              <p className={`text-[10px] font-semibold mb-1 leading-tight ${card.count > 0 ? card.lblCls : 'text-slate-500'}`}>{card.label}</p>
              <p className={`text-2xl font-black ${card.count > 0 ? card.numCls : 'text-slate-900'}`}>{card.count}</p>
              <p className="text-[9px] text-slate-400 mt-1 leading-tight">{card.sub}</p>
            </button>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 overflow-x-auto pb-1">
          <div className="flex gap-2 min-w-max">
            {TABS.map((tab) => {
              const count    = tabCounts[tab.key];
              const isActive = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all whitespace-nowrap ${isActive ? tab.activeClass : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
                  <tab.Icon />
                  <span>{tab.label}</span>
                  <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold ${isActive ? tab.badgeClass : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Panel */}
        <div className="surface-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{TABS.find((t) => t.key === activeTab)?.label} Medicines</h2>
              <p className="text-xs text-slate-500 mt-0.5">{displayed.length} medicine{displayed.length !== 1 ? 's' : ''}</p>
            </div>
            {displayed.length > 0 && (
              <Link href="/inventory" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-semibold group">
                <IconPackage />
                Manage Inventory
                <IconArrow cls="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            )}
          </div>

          {displayed.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
                {activeTab === 'urgent' ? <IconUrgent cls="w-6 h-6" /> : activeTab === 'in' ? <IconInStock cls="w-6 h-6" /> : <IconAll cls="w-6 h-6" />}
              </div>
              <p className="text-slate-700 font-semibold mb-1">
                {activeTab === 'urgent' ? 'No urgent items' : activeTab === 'all' ? 'No medicines found' : `No ${TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} medicines`}
              </p>
              <p className="text-slate-400 text-sm">
                {activeTab === 'urgent'
                  ? 'No medicines are both low stock and expiring. Great job!'
                  : activeTab === 'in'
                  ? 'Add medicines to your inventory to see them here.'
                  : 'Nothing to worry about in this category.'}
              </p>
            </div>
          ) : activeTab === 'urgent' ? (
            <div className="space-y-3">
              {displayed.map((m) => <UrgentCard key={m.id} medicine={m} />)}
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map((m) => <MedicineNotificationCard key={m.id} medicine={m} />)}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}