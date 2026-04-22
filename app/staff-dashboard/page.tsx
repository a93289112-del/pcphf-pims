'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useSidebar } from '@/lib/contexts/sidebar-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, onValue } from 'firebase/database';
import Link from 'next/link';
import Image from 'next/image';
import MedicineDispensingMonitor from '@/lib/services/medicine-dispensing-sales-monitor';
import { type QuarterType } from '@/lib/services/filter-utils';

// ─── Interfaces ────────────────────────────────────────────────────────────────
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
  unitConversion?: {
    packagingUnit?: string;
    conversionUnit?: string;
    conversionFactor?: number;
    customUnitName?: string;
  } | null;
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

interface FirebaseTransaction {
  date: string;
  type: 'dispense' | 'sale' | 'adjustment';
  medicineId: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost?: number;
  referenceId?: string;
  userId?: string;
  notes?: string;
  unitPrice?: number;
}

type MedicineRecord = Omit<Medicine, 'id'>;

// ─── Helpers ───────────────────────────────────────────────────────────────────
function getEffectiveStock(m: Medicine): number {
  if (m.quantity !== undefined) return m.quantity;
  return Math.max(m.stockPerUnit ?? 0, m.stockPerPieces ?? 0);
}
function getMinStock(m: Medicine): number { return m.minStock ?? 0; }
function getCategory(m: Medicine): string { return m.category || 'Unknown'; }

function isExpired(m: Medicine): boolean {
  return !!m.expirationDate && new Date(m.expirationDate) < new Date();
}
function isLowStock(m: Medicine): boolean {
  if (isExpired(m)) return false;
  const min = getMinStock(m);
  if (min === 0) return false;
  const stock = getEffectiveStock(m);
  return stock > 0 && stock <= min;
}

function getOriginalStock(m: Medicine): number | null {
  if (m.containerQuantity !== undefined && m.containerQuantity !== null) {
    if (m.unitConversion?.conversionFactor) {
      return m.containerQuantity * m.unitConversion.conversionFactor;
    }
    return m.containerQuantity;
  }
  return null;
}

type MedicineStatusVariant = 'out' | 'expired' | 'urgent' | 'expiring' | 'low' | 'in';
function getMedicineStatus(m: Medicine): { label: string; variant: MedicineStatusVariant } {
  const stock = getEffectiveStock(m);
  const min = getMinStock(m);
  const exp = m.expirationDate ? new Date(m.expirationDate) : null;
  const now = new Date();

  if (stock === 0) return { label: 'Out of Stock', variant: 'out' };
  if (exp && exp < now) return { label: 'Expired', variant: 'expired' };

  const isLow = min > 0 && stock <= min;
  let isExpiringSoon = false;
  let expDays = 0;
  if (exp) {
    expDays = Math.floor((exp.getTime() - now.getTime()) / 86400000);
    if (expDays <= 30) isExpiringSoon = true;
  }

  if (isLow && isExpiringSoon) return { label: 'Urgent Alert', variant: 'urgent' };
  if (isExpiringSoon) return { label: `Exp. ${expDays}d`, variant: 'expiring' };
  if (isLow) return { label: 'Low Stock', variant: 'low' };

  return { label: 'In Stock', variant: 'in' };
}

const stockModalStatusStyles: Record<MedicineStatusVariant, string> = {
  out: 'bg-slate-100 text-slate-500',
  expired: 'bg-red-100 text-red-700',
  urgent: 'bg-red-600 text-white animate-pulse font-bold',
  expiring: 'bg-amber-100 text-amber-700',
  low: 'bg-yellow-100 text-yellow-700',
  in: 'bg-green-100 text-green-700',
};

const fmt = (value: number): string => {
  if (Number.isInteger(value)) return value.toLocaleString();
  return parseFloat(value.toFixed(2)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ─── Delta badge ───────────────────────────────────────────────────────────────
function Delta({ current, prev }: { current: number; prev: number }) {
  const diff = current - prev;
  if (diff === 0 && prev === 0) return null;
  const up = diff >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
      {up ? '↑' : '↓'} {Math.abs(diff).toLocaleString()} vs prev
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, accent, icon, alert, current, prev, onClick, clickLabel
}: {
  label: string; value: number; sub: string; accent: string; icon: React.ReactNode;
  alert?: boolean; current?: number; prev?: number; onClick?: () => void; clickLabel?: string;
}) {
  const hasDelta = current !== undefined && prev !== undefined;

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl p-4 sm:p-5 flex flex-col justify-between min-h-[130px] sm:min-h-[145px] transition-all duration-200 active:scale-[0.98] hover:scale-[1.02] hover:shadow-xl ${onClick ? 'cursor-pointer' : ''} ${alert ? 'bg-red-50 border border-red-200' : 'bg-white border border-slate-100 shadow-sm'}`}
      style={{ boxShadow: alert ? undefined : `0 2px 16px 0 ${accent}18` }}
    >
      <div className="absolute top-0 left-0 right-0 h-0.75 rounded-t-2xl" style={{ background: accent }} />
      <div className="flex items-start justify-between gap-2">
        <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest leading-tight ${alert ? 'text-red-600' : 'text-slate-400'}`}>{label}</p>
        <span className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center" style={{ background: `${accent}18`, color: accent }}>{icon}</span>
      </div>
      <div>
        <p className={`text-2xl sm:text-3xl lg:text-4xl font-black leading-none tabular-nums ${alert ? 'text-red-600' : 'text-slate-900'}`}>{fmt(value)}</p>
        <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1 sm:mt-1.5 font-medium truncate">{sub}</p>
        <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-1 sm:gap-1.5 min-h-4 sm:min-h-5">
          {hasDelta && <Delta current={current!} prev={prev!} />}
          {clickLabel && <span className="text-[9px] sm:text-[10px] text-blue-500 font-semibold">{clickLabel}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Today strip ──────────────────────────────────────────────────────────────
function TodayStrip({ dispensed, transactions, pharmacyName }: {
  dispensed: number; transactions: number; pharmacyName: string | null;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden relative"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="pharmacy-ring pharmacy-ring-1" />
        <div className="pharmacy-ring pharmacy-ring-2" />
        <div className="pharmacy-ring pharmacy-ring-3" />
      </div>

      <div className="relative px-4 sm:px-6 md:px-8 py-5 sm:py-6 md:py-8">

        {/* Mobile layout: stacked */}
        <div className="flex flex-col gap-4 sm:hidden">
          {/* Date row */}
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            </span>
            <div>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Today&apos;s Activity</p>
              <p className="text-xs text-white font-semibold mt-0.5">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Pharmacy name */}
          {pharmacyName && (
            <p className="pharmacy-name-text text-2xl font-black text-white text-center tracking-tight leading-tight break-words">
              {pharmacyName}
            </p>
          )}

          {/* Metrics row */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center">
              <p className="text-xl font-black text-white tabular-nums leading-none">{fmt(dispensed)}</p>
              <p className="text-[9px] text-white/50 uppercase tracking-widest font-semibold mt-1">Units Dispensed</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="flex flex-col items-center">
              <p className="text-xl font-black text-emerald-400 tabular-nums leading-none">{fmt(transactions)}</p>
              <p className="text-[9px] text-white/50 uppercase tracking-widest font-semibold mt-1">Transactions</p>
            </div>
          </div>
        </div>

        {/* Desktop layout: horizontal */}
        <div className="hidden sm:flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            </span>
            <div className="whitespace-nowrap">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Today&apos;s Activity</p>
              <p className="text-sm text-white font-semibold mt-0.5">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          {pharmacyName && (
            <div className="flex-1 min-w-0 flex items-center justify-center px-4">
              <p className="pharmacy-name-text text-3xl sm:text-4xl md:text-5xl font-black text-white text-center tracking-tight leading-tight break-words w-full">
                {pharmacyName}
              </p>
            </div>
          )}

          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            <div className="flex flex-col items-center whitespace-nowrap">
              <p className="text-2xl md:text-3xl font-black text-white tabular-nums leading-none">{fmt(dispensed)}</p>
              <p className="text-[10px] text-white/50 uppercase tracking-widest font-semibold mt-1.5">Units Dispensed</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="flex flex-col items-center whitespace-nowrap">
              <p className="text-2xl md:text-3xl font-black text-emerald-400 tabular-nums leading-none">{fmt(transactions)}</p>
              <p className="text-[10px] text-white/50 uppercase tracking-widest font-semibold mt-1.5">Transactions</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Print Report Modal ────────────────────────────────────────────────────────
const colVal = (cls: string) =>
  cls === 'blue' ? '#2563eb' :
    cls === 'green' ? '#059669' :
      cls === 'violet' ? '#7c3aed' :
        cls === 'red' ? '#dc2626' :
          cls === 'amber' ? '#d97706' : '#0f172a';

function PrintReportModal({
  medicines, transactions,
  printMode, setPrintMode,
  printMonth, setPrintMonth,
  printQuarter, setPrintQuarter,
  printYear, setPrintYear,
  years, onClose,
}: {
  medicines: Medicine[]; transactions: FirebaseTransaction[];
  printMode: 'monthly' | 'quarterly' | 'annual' | 'all'; setPrintMode: (m: 'monthly' | 'quarterly' | 'annual' | 'all') => void;
  printMonth: string; setPrintMonth: (v: string) => void;
  printQuarter: QuarterType; setPrintQuarter: (v: QuarterType) => void;
  printYear: number; setPrintYear: (v: number) => void;
  years: number[]; onClose: () => void;
}) {
  const { start, end, label } = useMemo(() => {
    if (printMode === 'all') return { start: null, end: null, label: 'All Time' };
    if (printMode === 'monthly') {
      const [y, m] = printMonth.split('-').map(Number);
      return {
        start: new Date(y, m - 1, 1),
        end: new Date(y, m, 0, 23, 59, 59),
        label: new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
      };
    }
    if (printMode === 'quarterly') {
      const qMap: Record<QuarterType, [number, number]> = { Q1: [0, 2], Q2: [3, 5], Q3: [6, 8], Q4: [9, 11] };
      const [sm, em] = qMap[printQuarter];
      return {
        start: new Date(printYear, sm, 1),
        end: new Date(printYear, em + 1, 0, 23, 59, 59),
        label: `${printQuarter} ${printYear}`,
      };
    }
    return {
      start: new Date(printYear, 0, 1),
      end: new Date(printYear, 11, 31, 23, 59, 59),
      label: `Year ${printYear}`,
    };
  }, [printMode, printMonth, printQuarter, printYear]);

  const periodTx = useMemo(() =>
    transactions.filter(t => {
      if (!['dispense', 'sale', 'adjustment'].includes(t.type)) return false;
      if (!start || !end) return true;
      const d = new Date(t.date);
      return d >= start && d <= end;
    }),
    [transactions, start, end]);

  const medicineSummary = useMemo(() => {
    type Row = {
      name: string; category: string; unit: string; originalUnit: string;
      isConverted: boolean; packagingUnit: string | null;
      currentStock: number; originalStock: number | null;
      dispensed: number; sold: number; adjusted: number; totalOut: number; events: number;
      firstEventDate: string | null; lastEventDate: string | null;
      minStock: number; expirationDate: string | null;
      unitCost: number;
    };
    const map = new Map<string, Row>();

    medicines.forEach(m => {
      map.set(m.id, {
        name: m.baseName || m.name || '—',
        category: m.category || 'Uncategorized',
        unit: m.unit || m.category || '—',
        originalUnit: m.originalUnit || m.unit || '—',
        isConverted: !!m.unitConversion,
        packagingUnit: m.unitConversion?.packagingUnit || null,
        currentStock: getEffectiveStock(m),
        originalStock: getOriginalStock(m),
        dispensed: 0, sold: 0, adjusted: 0, totalOut: 0, events: 0,
        firstEventDate: null, lastEventDate: null,
        minStock: m.minStock ?? 0,
        expirationDate: m.expirationDate ?? null,
        unitCost: m.unitCost ?? 0,
      });
    });

    periodTx.forEach(t => {
      if (!map.has(t.medicineId)) {
        map.set(t.medicineId, {
          name: 'Unknown Medicine', category: 'Uncategorized', unit: '—', originalUnit: '—',
          isConverted: false, packagingUnit: null,
          currentStock: t.newStock, originalStock: null,
          dispensed: 0, sold: 0, adjusted: 0, totalOut: 0, events: 0,
          firstEventDate: null, lastEventDate: null,
          minStock: 0, expirationDate: null, unitCost: 0,
        });
      }
      const r = map.get(t.medicineId)!;
      r.events++;
      if (!r.firstEventDate || t.date < r.firstEventDate) r.firstEventDate = t.date;
      if (!r.lastEventDate || t.date > r.lastEventDate) r.lastEventDate = t.date;
      const q = Math.abs(Number(t.quantity) || 0);
      if (t.type === 'dispense') { r.dispensed += q; r.totalOut += q; }
      else if (t.type === 'sale') { r.sold += q; r.totalOut += q; }
      else if (t.type === 'adjustment') { r.adjusted += (Number(t.quantity) || 0); }
    });

    const rows = Array.from(map.values());
    rows.forEach(r => {
      if (r.originalStock === null || r.originalStock === undefined) {
        r.originalStock = r.currentStock + r.totalOut - r.adjusted;
      }
    });

    return rows
      .filter(r => r.dispensed > 0 || r.sold > 0 || r.adjusted !== 0 || r.currentStock > 0)
      .sort((a, b) => b.totalOut - a.totalOut || a.name.localeCompare(b.name));
  }, [medicines, periodTx]);

  const totals = useMemo(() => ({
    dispensed: periodTx.filter(t => t.type === 'dispense').reduce((s, t) => s + Math.abs(Number(t.quantity) || 0), 0),
    sold: periodTx.filter(t => t.type === 'sale').reduce((s, t) => s + Math.abs(Number(t.quantity) || 0), 0),
    adjusted: periodTx.filter(t => t.type === 'adjustment').reduce((s, t) => s + (Number(t.quantity) || 0), 0),
    totalOut: periodTx.filter(t => ['dispense', 'sale'].includes(t.type)).reduce((s, t) => s + Math.abs(Number(t.quantity) || 0), 0),
    events: periodTx.length,
    uniqueMeds: new Set(periodTx.map(t => t.medicineId)).size,
    totalStock: medicines.reduce((s, m) => s + getEffectiveStock(m), 0),
    totalOriginal: medicineSummary.reduce((s, r) => s + (r.originalStock || 0), 0),
    posOrders: new Set(periodTx.filter(t => t.type === 'sale').map(t => t.referenceId).filter(Boolean)).size,
    lowStock: medicines.filter(m => isLowStock(m)).length,
    expired: medicines.filter(m => isExpired(m)).length,
  }), [periodTx, medicines, medicineSummary]);

  const dayTimeline = useMemo(() => {
    const map = new Map<string, { dispensed: number; sold: number; adjusted: number; events: number }>();
    periodTx.forEach(t => {
      const key = t.date.slice(0, 10);
      if (!map.has(key)) map.set(key, { dispensed: 0, sold: 0, adjusted: 0, events: 0 });
      const r = map.get(key)!;
      r.events++;
      const q = Math.abs(Number(t.quantity) || 0);
      if (t.type === 'dispense') r.dispensed += q;
      else if (t.type === 'sale') r.sold += q;
      else if (t.type === 'adjustment') r.adjusted += (Number(t.quantity) || 0);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, ...v, totalOut: v.dispensed + v.sold }));
  }, [periodTx]);

  const now = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });

  const printNow = () => {
    const el = document.getElementById('print-report-content');
    if (!el) return;
    const w = window.open('', '_blank', 'width=1100,height=800');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head>
      <title>Inventory Report – ${label}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff;padding:24px}
        h1{font-size:22px;font-weight:900;color:#0f172a;margin-bottom:2px}
        h2{font-size:14px;font-weight:800;color:#0f172a;margin-bottom:10px;margin-top:0}
        .subtitle{font-size:11px;color:#64748b;margin-bottom:10px}
        .badge{display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:3px 12px;font-size:11px;font-weight:700;color:#334155;margin-bottom:20px}
        .grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px}
        .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
        .card{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;background:#f8fafc}
        .card .val{font-size:20px;font-weight:900;color:#0f172a;line-height:1}
        .card .lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-top:4px}
        .blue .val{color:#2563eb}.green .val{color:#059669}.violet .val{color:#7c3aed}
        .red .val{color:#dc2626}.amber .val{color:#d97706}
        table{width:100%;border-collapse:collapse;font-size:10px}
        thead tr{background:#f1f5f9}
        th{padding:7px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;border-bottom:2px solid #e2e8f0}
        th.r,td.r{text-align:right}
        td{padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#334155}
        tr:last-child td{border-bottom:none}
        tr:nth-child(even){background:#fafafa}
        .tot td{background:#f1f5f9;font-weight:800;border-top:2px solid #e2e8f0}
        .section{margin-bottom:28px}
        .divider{border-top:2px solid #e2e8f0;margin:20px 0}
        .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;display:flex;justify-content:space-between}
        @media print{body{padding:12px}}
      </style></head><body>
    ${el.innerHTML}
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const S = {
    h1: { fontSize: 22, fontWeight: 900, color: '#0f172a', marginBottom: 2 } as React.CSSProperties,
    h2: { fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 10, marginTop: 0 } as React.CSSProperties,
    subtitle: { fontSize: 11, color: '#64748b', marginBottom: 10 } as React.CSSProperties,
    badge: { display: 'inline-block', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 12px', fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 20 } as React.CSSProperties,
    lbl: { fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#94a3b8', marginTop: 4 },
    grid5: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 } as React.CSSProperties,
    grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 } as React.CSSProperties,
    card: { border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', background: '#f8fafc' } as React.CSSProperties,
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 10 },
    thead: { background: '#f1f5f9' },
    th: (right = false) => ({ padding: '7px 10px', textAlign: (right ? 'right' : 'left') as 'right' | 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#64748b', borderBottom: '2px solid #e2e8f0' }),
    td: { padding: '6px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155' } as React.CSSProperties,
    tdr: { padding: '6px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', textAlign: 'right' as const },
    totRow: { background: '#f1f5f9', fontWeight: 800 } as React.CSSProperties,
    divider: { borderTop: '2px solid #e2e8f0', margin: '20px 0' } as React.CSSProperties,
    footer: { marginTop: 24, paddingTop: 12, borderTop: '1px solid #e2e8f0', fontSize: 9, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' } as React.CSSProperties,
    section: { marginBottom: 28 } as React.CSSProperties,
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 transition-all duration-300">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-6xl max-h-[95vh] sm:max-h-[92vh] overflow-hidden flex flex-col">

        {/* Modal header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-slate-900 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">Print Inventory Report</h3>
              <p className="text-[10px] sm:text-xs text-slate-400 hidden sm:block">Comprehensive stock, transaction &amp; activity summary</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-xl leading-none">×</button>
        </div>

        {/* Period controls */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Period</span>
            <div className="flex gap-1 flex-wrap">
              {(['monthly', 'quarterly', 'annual', 'all'] as const).map(m => (
                <button key={m} onClick={() => setPrintMode(m)}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-semibold rounded-lg border transition-colors ${printMode === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}>
                  {m === 'all' ? 'All Time' : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            {printMode === 'monthly' && (
              <input type="month" value={printMonth} onChange={e => setPrintMonth(e.target.value)}
                className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-slate-900 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}
            {printMode === 'quarterly' && (<>
              <select value={printQuarter} onChange={e => setPrintQuarter(e.target.value as QuarterType)}
                className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-slate-900 border border-slate-200 rounded-lg bg-white">
                {(['Q1', 'Q2', 'Q3', 'Q4'] as QuarterType[]).map(q => <option key={q}>{q}</option>)}
              </select>
              <select value={printYear} onChange={e => setPrintYear(Number(e.target.value))}
                className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-slate-900 border border-slate-200 rounded-lg bg-white">
                {years.map(y => <option key={y}>{y}</option>)}
              </select>
            </>)}
            {printMode === 'annual' && (
              <select value={printYear} onChange={e => setPrintYear(Number(e.target.value))}
                className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-slate-900 border border-slate-200 rounded-lg bg-white">
                {years.map(y => <option key={y}>{y}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white">
          <div id="print-report-content">

            <div style={S.section}>
              <h1 style={S.h1}>Pharmacy Inventory &amp; Transaction Report</h1>
              <p style={S.subtitle}>Generated: {now}</p>
              <span style={S.badge}>Period: {label}</span>

              <div style={S.grid5}>
                {[
                  { lbl: 'Total Medicines', val: medicines.length.toLocaleString(), cls: '' },
                  { lbl: 'Total Stock (now)', val: totals.totalStock.toLocaleString(), cls: '' },
                  { lbl: 'Dispensed (period)', val: totals.dispensed.toLocaleString(), cls: 'blue' },
                  { lbl: 'POS Sold (period)', val: totals.sold.toLocaleString(), cls: 'green' },
                  { lbl: 'Total Out (period)', val: totals.totalOut.toLocaleString(), cls: 'red' },
                ].map(({ lbl, val, cls }) => (
                  <div key={lbl} style={S.card}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: colVal(cls), lineHeight: 1 }}>{val}</div>
                    <div style={S.lbl}>{lbl}</div>
                  </div>
                ))}
              </div>

              <div style={S.grid5}>
                {[
                  { lbl: 'Adjusted (period)', val: (totals.adjusted >= 0 ? '+' : '') + totals.adjusted.toLocaleString(), cls: 'violet' },
                  { lbl: 'POS Orders', val: totals.posOrders.toLocaleString(), cls: 'green' },
                  { lbl: 'Total Events', val: totals.events.toLocaleString(), cls: '' },
                  { lbl: 'Low-Stock Items', val: totals.lowStock.toLocaleString(), cls: totals.lowStock > 0 ? 'amber' : '' },
                  { lbl: 'Expired Items', val: totals.expired.toLocaleString(), cls: totals.expired > 0 ? 'red' : '' },
                ].map(({ lbl, val, cls }) => (
                  <div key={lbl} style={S.card}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: colVal(cls), lineHeight: 1 }}>{val}</div>
                    <div style={S.lbl}>{lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={S.divider} />
            <div style={S.section}>
              <h2 style={S.h2}>
                Per-Medicine Stock &amp; Transaction Breakdown
                <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', marginLeft: 8 }}>
                  ({medicineSummary.length} medicines)
                </span>
              </h2>
              <table style={S.table}>
                <thead style={S.thead}>
                  <tr>
                    {([
                      ['Medicine', false],
                      ['Category', false],
                      ['Unit', false],
                      ['Orig. Stock*', true],
                      ['Current Stock', true],
                      ['Dispensed', true],
                      ['POS Sold', true],
                      ['Adjusted', true],
                      ['Total Out', true],
                      ['Events', true],
                      ['Last Activity', false],
                      ['Expires', false],
                    ] as [string, boolean][]).map(([h, r]) => (
                      <th key={h} style={S.th(r)}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {medicineSummary.map((m, i) => {
                    const orig = m.originalStock;
                    const isExp = m.expirationDate ? new Date(m.expirationDate) < new Date() : false;
                    const isLow = m.minStock > 0 && m.currentStock <= m.minStock && !isExp;
                    const stockColor = m.currentStock === 0 ? '#94a3b8' : isExp ? '#dc2626' : isLow ? '#d97706' : '#059669';
                    return (
                      <tr key={m.name + i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ ...S.td, fontWeight: 600, color: '#1e293b' }}>{m.name}</td>
                        <td style={{ ...S.td, color: '#64748b', fontSize: 9 }}>{m.category}</td>
                        <td style={{ ...S.td, color: '#64748b', fontSize: 9 }}>
                          {m.unit}
                          {m.isConverted && m.packagingUnit && (
                            <span style={{ fontSize: 8, color: '#94a3b8', display: 'block', fontStyle: 'italic', marginTop: 2 }}>
                              (ORIGINAL: {m.packagingUnit.toUpperCase()})
                            </span>
                          )}
                        </td>
                        <td style={{ ...S.tdr, color: orig !== null ? '#0f172a' : '#cbd5e1', fontWeight: orig !== null ? 700 : 400, fontStyle: orig !== null ? 'normal' : 'italic' }}>
                          {orig !== null ? orig.toLocaleString() : '—'}
                        </td>
                        <td style={{ ...S.tdr, fontWeight: 700, color: stockColor }}>{m.currentStock.toLocaleString()}</td>
                        <td style={{ ...S.tdr, color: m.dispensed > 0 ? '#2563eb' : '#cbd5e1', fontWeight: m.dispensed > 0 ? 700 : 400 }}>
                          {m.dispensed > 0 ? `−${m.dispensed.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ ...S.tdr, color: m.sold > 0 ? '#059669' : '#cbd5e1', fontWeight: m.sold > 0 ? 700 : 400 }}>
                          {m.sold > 0 ? `−${m.sold.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ ...S.tdr, color: m.adjusted !== 0 ? '#7c3aed' : '#cbd5e1', fontWeight: m.adjusted !== 0 ? 700 : 400 }}>
                          {m.adjusted !== 0 ? `${m.adjusted > 0 ? '+' : ''}${m.adjusted.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ ...S.tdr, color: m.totalOut > 0 ? '#dc2626' : '#cbd5e1', fontWeight: m.totalOut > 0 ? 800 : 400 }}>
                          {m.totalOut > 0 ? `−${m.totalOut.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ ...S.tdr, color: '#475569' }}>{m.events || '—'}</td>
                        <td style={{ ...S.td, color: '#64748b', fontSize: 9, whiteSpace: 'nowrap' }}>
                          {m.lastEventDate ? formatDate(m.lastEventDate) : '—'}
                        </td>
                        <td style={{ ...S.td, color: isExp ? '#dc2626' : '#64748b', fontWeight: isExp ? 700 : 400, fontSize: 9, whiteSpace: 'nowrap' }}>
                          {m.expirationDate ? formatDate(m.expirationDate) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={S.totRow}>
                    <td colSpan={3} style={{ ...S.td, fontWeight: 800, color: '#0f172a' }}>TOTALS</td>
                    <td style={{ ...S.tdr, color: '#0f172a' }}>{totals.totalOriginal.toLocaleString()}</td>
                    <td style={{ ...S.tdr, color: '#0f172a' }}>{totals.totalStock.toLocaleString()}</td>
                    <td style={{ ...S.tdr, color: '#2563eb' }}>{totals.dispensed > 0 ? `−${totals.dispensed.toLocaleString()}` : '—'}</td>
                    <td style={{ ...S.tdr, color: '#059669' }}>{totals.sold > 0 ? `−${totals.sold.toLocaleString()}` : '—'}</td>
                    <td style={{ ...S.tdr, color: '#7c3aed' }}>{totals.adjusted !== 0 ? `${totals.adjusted > 0 ? '+' : ''}${totals.adjusted.toLocaleString()}` : '—'}</td>
                    <td style={{ ...S.tdr, color: '#dc2626' }}>{totals.totalOut > 0 ? `−${totals.totalOut.toLocaleString()}` : '—'}</td>
                    <td style={{ ...S.tdr, color: '#475569' }}>{totals.events}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 6 }}>
                * Orig. Stock = quantity entered at the time of adding the medicine (before any unit-conversion expansion). A dash (—) means no conversion was recorded.
              </p>
            </div>

            {dayTimeline.length > 0 && (
              <>
                <div style={S.divider} />
                <div style={S.section}>
                  <h2 style={S.h2}>
                    Daily Activity Timeline
                    <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', marginLeft: 8 }}>
                      ({dayTimeline.length} active days in period)
                    </span>
                  </h2>
                  <table style={S.table}>
                    <thead style={S.thead}>
                      <tr>
                        {([['Date', false], ['Day', false], ['Dispensed', true], ['POS Sold', true], ['Adjusted', true], ['Total Out', true], ['Events', true]] as [string, boolean][]).map(([h, r]) => (
                          <th key={h} style={S.th(r)}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dayTimeline.map((day, i) => (
                        <tr key={day.date} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ ...S.td, fontWeight: 600 }}>{formatDate(day.date + 'T00:00:00')}</td>
                          <td style={{ ...S.td, color: '#64748b', fontSize: 9 }}>
                            {new Date(day.date).toLocaleDateString('en-PH', { weekday: 'long' })}
                          </td>
                          <td style={{ ...S.tdr, color: day.dispensed > 0 ? '#2563eb' : '#cbd5e1', fontWeight: day.dispensed > 0 ? 700 : 400 }}>
                            {day.dispensed > 0 ? `−${day.dispensed.toLocaleString()}` : '—'}
                          </td>
                          <td style={{ ...S.tdr, color: day.sold > 0 ? '#059669' : '#cbd5e1', fontWeight: day.sold > 0 ? 700 : 400 }}>
                            {day.sold > 0 ? `−${day.sold.toLocaleString()}` : '—'}
                          </td>
                          <td style={{ ...S.tdr, color: day.adjusted !== 0 ? '#7c3aed' : '#cbd5e1', fontWeight: day.adjusted !== 0 ? 700 : 400 }}>
                            {day.adjusted !== 0 ? `${day.adjusted > 0 ? '+' : ''}${day.adjusted.toLocaleString()}` : '—'}
                          </td>
                          <td style={{ ...S.tdr, color: day.totalOut > 0 ? '#dc2626' : '#cbd5e1', fontWeight: day.totalOut > 0 ? 800 : 400 }}>
                            {day.totalOut > 0 ? `−${day.totalOut.toLocaleString()}` : '—'}
                          </td>
                          <td style={{ ...S.tdr, color: '#475569' }}>{day.events}</td>
                        </tr>
                      ))}
                      <tr style={S.totRow}>
                        <td colSpan={2} style={{ ...S.td, fontWeight: 800, color: '#0f172a' }}>TOTALS</td>
                        <td style={{ ...S.tdr, color: '#2563eb' }}>{totals.dispensed > 0 ? `−${totals.dispensed.toLocaleString()}` : '—'}</td>
                        <td style={{ ...S.tdr, color: '#059669' }}>{totals.sold > 0 ? `−${totals.sold.toLocaleString()}` : '—'}</td>
                        <td style={{ ...S.tdr, color: '#7c3aed' }}>{totals.adjusted !== 0 ? `${totals.adjusted > 0 ? '+' : ''}${totals.adjusted.toLocaleString()}` : '—'}</td>
                        <td style={{ ...S.tdr, color: '#dc2626' }}>{totals.totalOut > 0 ? `−${totals.totalOut.toLocaleString()}` : '—'}</td>
                        <td style={{ ...S.tdr, color: '#475569' }}>{totals.events}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={S.divider} />
            <div style={S.section}>
              <h2 style={S.h2}>Inventory Health Snapshot</h2>
              <div style={S.grid4}>
                {[
                  { lbl: 'In Stock (healthy)', val: medicines.filter(m => { const s = getEffectiveStock(m); const min = m.minStock ?? 0; const exp = m.expirationDate ? new Date(m.expirationDate) < new Date() : false; return s > 0 && !exp && (min === 0 || s > min); }).length, cls: 'green' },
                  { lbl: 'Low Stock', val: totals.lowStock, cls: 'amber' },
                  { lbl: 'Expired', val: totals.expired, cls: 'red' },
                  { lbl: 'Out of Stock', val: medicines.filter(m => getEffectiveStock(m) === 0).length, cls: '' },
                ].map(({ lbl, val, cls }) => (
                  <div key={lbl} style={S.card}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: colVal(cls), lineHeight: 1 }}>{val.toLocaleString()}</div>
                    <div style={S.lbl}>{lbl}</div>
                  </div>
                ))}
              </div>

              {(totals.lowStock > 0 || totals.expired > 0) && (
                <table style={S.table}>
                  <thead style={S.thead}>
                    <tr>
                      {([['Medicine', false], ['Category', false], ['Current Stock', true], ['Min Stock', true], ['Status', false], ['Expires', false]] as [string, boolean][]).map(([h, r]) => (
                        <th key={h} style={S.th(r)}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {medicines
                      .filter(m => {
                        const s = getEffectiveStock(m);
                        const min = m.minStock ?? 0;
                        const exp = m.expirationDate ? new Date(m.expirationDate) < new Date() : false;
                        return exp || (min > 0 && s <= min);
                      })
                      .sort((a, b) => getEffectiveStock(a) - getEffectiveStock(b))
                      .map((m, i) => {
                        const stock = getEffectiveStock(m);
                        const min = m.minStock ?? 0;
                        const isExpM = m.expirationDate ? new Date(m.expirationDate) < new Date() : false;
                        const isCrit = !isExpM && min > 0 && stock < min * 0.5;
                        const status = isExpM ? 'Expired' : isCrit ? 'Critical' : 'Low Stock';
                        const statusColor = isExpM || isCrit ? '#dc2626' : '#d97706';
                        return (
                          <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ ...S.td, fontWeight: 600, color: '#1e293b' }}>{m.baseName || m.name || '—'}</td>
                            <td style={{ ...S.td, color: '#64748b', fontSize: 9 }}>{m.category || 'Uncategorized'}</td>
                            <td style={{ ...S.tdr, fontWeight: 700, color: statusColor }}>{stock.toLocaleString()}</td>
                            <td style={{ ...S.tdr, color: '#64748b' }}>{min > 0 ? min.toLocaleString() : '—'}</td>
                            <td style={{ ...S.td, fontWeight: 700, color: statusColor }}>{status}</td>
                            <td style={{ ...S.td, color: isExpM ? '#dc2626' : '#64748b', fontWeight: isExpM ? 700 : 400, fontSize: 9 }}>
                              {m.expirationDate ? formatDate(m.expirationDate) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={S.footer}>
              <span>Pharmacy Inventory System — Confidential</span>
              <span>Printed: {now}</span>
            </div>

          </div>
        </div>

        {/* Modal footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 sm:gap-3 shrink-0">
          <button onClick={onClose} className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors">Close</button>
          <button onClick={printNow} className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 bg-slate-900 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-xl transition-all">
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
            Print Report
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, loading, pharmacyName, pharmacistInChargeName, staffName, role } = useAuth();
  const { isCollapsed } = useSidebar();
  const router = useRouter();

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [transactions, setTransactions] = useState<FirebaseTransaction[]>([]);
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockModalSearch, setStockModalSearch] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printMode, setPrintMode] = useState<'monthly' | 'quarterly' | 'annual' | 'all'>('monthly');
  const [printMonth, setPrintMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [printQuarter, setPrintQuarter] = useState<QuarterType>('Q1');
  const [printYear, setPrintYear] = useState<number>(new Date().getFullYear());

  const [filterRange, setFilterRange] = useState<'today' | 'last7' | 'last30' | 'monthly' | 'quarterly' | 'annual' | 'custom'>('last7');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [selectedQuarter, setSelectedQuarter] = useState<QuarterType>('Q1');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  useEffect(() => { if (!loading && !user) router.push('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!loading && user && role === 'admin') {
      router.push('/admin-dashboard');
    }
  }, [user, loading, role, router]);

  useEffect(() => {
    if (!user) return;
    const medicinesPath = getUserPath(user.uid, 'medicines');
    return onValue(ref(database, medicinesPath), snap => {
      const data = snap.val();
      if (!data) { setMedicines([]); return; }
      const list = Object.entries(data as Record<string, MedicineRecord>).map(([id, v]) => ({
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
        quantity: v.quantity,
        stockPerUnit: v.stockPerUnit ?? 0,
        stockPerPieces: v.stockPerPieces ?? 0,
        piecesPerUnit: v.piecesPerUnit,
        totalPieces: v.totalPieces,
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
      }));
      setMedicines(list);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const transactionsPath = getUserPath(user.uid, 'transactions');
    return onValue(ref(database, transactionsPath), snap => {
      const data = snap.val();
      setTransactions(
        data
          ? (Object.values(data).filter(Boolean) as FirebaseTransaction[])
          : []
      );
    });
  }, [user]);

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDate = today.getDate();
  const { todayStart, todayEnd } = useMemo(() => ({
    todayStart: new Date(todayYear, todayMonth, todayDate),
    todayEnd: new Date(todayYear, todayMonth, todayDate + 1),
  }), [todayYear, todayMonth, todayDate]);

  const { rangeStart, rangeEnd, prevStart, prevEnd } = useMemo(() => {
    let rs: Date | null = null;
    let re: Date | null = null;
    let ps: Date | null = null;
    let pe: Date | null = null;

    if (filterRange === 'today') {
      rs = todayStart; re = todayEnd;
      ps = new Date(rs); ps.setDate(ps.getDate() - 1); pe = rs;
    } else if (filterRange === 'last7') {
      rs = new Date(todayStart); rs.setDate(rs.getDate() - 6); re = todayEnd;
      ps = new Date(rs); ps.setDate(ps.getDate() - 7); pe = rs;
    } else if (filterRange === 'last30') {
      rs = new Date(todayStart); rs.setDate(rs.getDate() - 29); re = todayEnd;
      ps = new Date(rs); ps.setDate(ps.getDate() - 30); pe = rs;
    } else if (filterRange === 'monthly') {
      const [y, m] = selectedMonth.split('-').map(Number);
      rs = new Date(y, m - 1, 1); re = new Date(y, m, 1);
      ps = new Date(y, m - 2, 1); pe = rs;
    } else if (filterRange === 'quarterly') {
      const quarterMap: Record<QuarterType, number> = { Q1: 0, Q2: 3, Q3: 6, Q4: 9 };
      const startMonth = quarterMap[selectedQuarter];
      rs = new Date(selectedYear, startMonth, 1); re = new Date(selectedYear, startMonth + 3, 1);
      ps = new Date(selectedYear, startMonth - 3, 1); pe = rs;
    } else if (filterRange === 'annual') {
      rs = new Date(selectedYear, 0, 1); re = new Date(selectedYear + 1, 0, 1);
      ps = new Date(selectedYear - 1, 0, 1); pe = rs;
    } else if (filterRange === 'custom' && filterStartDate && filterEndDate) {
      rs = new Date(filterStartDate);
      const e = new Date(filterEndDate);
      re = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
      const span = re.getTime() - rs.getTime();
      ps = new Date(rs.getTime() - span); pe = rs;
    }

    return { rangeStart: rs, rangeEnd: re, prevStart: ps, prevEnd: pe };
  }, [filterRange, filterStartDate, filterEndDate, selectedMonth, selectedQuarter, selectedYear, todayStart, todayEnd]);

  const filteredTransactions = useMemo(() =>
    transactions.filter(t => {
      const dt = new Date(t.date);
      return rangeStart && rangeEnd ? dt >= rangeStart && dt < rangeEnd : true;
    }),
    [transactions, rangeStart, rangeEnd]);

  const prevTransactions = useMemo(() =>
    transactions.filter(t => {
      const dt = new Date(t.date);
      return prevStart && prevEnd ? dt >= prevStart && dt < prevEnd : false;
    }),
    [transactions, prevStart, prevEnd]);

  const totalDispensed = useMemo(() => filteredTransactions.filter(t => t.type === 'dispense').reduce((s, t) => s + Math.abs(Number(t.quantity) || 0), 0), [filteredTransactions]);
  const prevDispensed = useMemo(() => prevTransactions.filter(t => t.type === 'dispense').reduce((s, t) => s + Math.abs(Number(t.quantity) || 0), 0), [prevTransactions]);
  const totalDispenseSessions = useMemo(() => new Set(filteredTransactions.filter(t => t.type === 'dispense').map(t => t.referenceId).filter(Boolean)).size, [filteredTransactions]);
  const totalPosSales = useMemo(() => new Set(filteredTransactions.filter(t => t.type === 'sale').map(t => t.referenceId).filter(Boolean)).size, [filteredTransactions]);
  const prevPosSales = useMemo(() => new Set(prevTransactions.filter(t => t.type === 'sale').map(t => t.referenceId).filter(Boolean)).size, [prevTransactions]);
  const totalStockDeducted = useMemo(() => filteredTransactions.filter(t => t.type === 'dispense' || t.type === 'sale').reduce((s, t) => s + Math.abs(Number(t.quantity) || 0), 0), [filteredTransactions]);
  const prevStockDeducted = useMemo(() => prevTransactions.filter(t => t.type === 'dispense' || t.type === 'sale').reduce((s, t) => s + Math.abs(Number(t.quantity) || 0), 0), [prevTransactions]);

  const totalMedicines = useMemo(() => medicines.length, [medicines]);

  const totalCategories = useMemo(() => new Set(medicines.map(getCategory)).size, [medicines]);

  const inStockCount = useMemo(() => {
    return medicines.filter(m => {
      const s = getEffectiveStock(m);
      const min = m.minStock ?? 0;
      const exp = m.expirationDate ? new Date(m.expirationDate) < new Date() : false;
      const dying = (() => {
        if (!m.expirationDate) return false;
        const days = Math.floor((new Date(m.expirationDate).getTime() - Date.now()) / 86400000);
        return days >= 0 && days <= 30;
      })();
      return s > 0 && !exp && !dying && (min === 0 || s > min);
    }).length;
  }, [medicines]);

  const lowStockCount = useMemo(() => medicines.filter(isLowStock).length, [medicines]);

  const expiredCount = useMemo(() => medicines.filter(isExpired).length, [medicines]);

  const remainingStock = useMemo(() => medicines.reduce((s, m) => s + getEffectiveStock(m), 0), [medicines]);

  const todayTransactions = transactions.filter(t => { const dt = new Date(t.date); return dt >= todayStart && dt < todayEnd; });
  const todayItemsDispensed = todayTransactions.filter(t => t.type === 'dispense' || t.type === 'sale').reduce((s, t) => s + Math.abs(Number(t.quantity) || 0), 0);
  const todaySessionCount = new Set(todayTransactions.map(t => t.referenceId).filter(Boolean)).size;

  const brandMap = medicines.reduce<Record<string, string | undefined>>((acc, m) => {
    const brand = m.brand || m.brandModel || 'Unknown';
    if (!(brand in acc)) acc[brand] = m.image;
    return acc;
  }, {});
  const uniqueBrands = Object.entries(brandMap);
  const marqueeSpeed = Math.max(uniqueBrands.length * (isCollapsed ? 1 : 1.2), 8);
  const defaultStockParam = expiredCount > 0 ? 'expired' : lowStockCount > 0 ? 'low' : 'ok';
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  if (loading || role === 'admin') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @keyframes marquee-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .marquee-track { display: flex; width: max-content; animation: marquee-scroll ${marqueeSpeed}s linear infinite; }
        .marquee-track:hover { animation-play-state: paused; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up   { animation: fadeUp 0.4s ease both; }
        .fade-up-1 { animation-delay: 0.05s; } .fade-up-2 { animation-delay: 0.10s; }
        .fade-up-3 { animation-delay: 0.15s; } .fade-up-4 { animation-delay: 0.20s; }
        .fade-up-5 { animation-delay: 0.25s; } .fade-up-6 { animation-delay: 0.30s; }
        .fade-up-7 { animation-delay: 0.35s; } .fade-up-8 { animation-delay: 0.40s; }

        @keyframes pharmacy-reveal {
          from { opacity: 0; transform: translateY(14px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes pharmacy-pulse-ring {
          0%   { transform: translateX(-50%) scale(0.55); opacity: 0.18; }
          70%  { opacity: 0.07; }
          100% { transform: translateX(-50%) scale(1.9);  opacity: 0;    }
        }
        .pharmacy-name-text {
          text-shadow: 0 0 80px rgba(255, 255, 255, 0.18);
          letter-spacing: -0.025em;
        }
        .pharmacy-ring {
          position: absolute;
          top: -60px;
          left: 50%;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.07);
          animation: pharmacy-pulse-ring 4.5s ease-out infinite;
          pointer-events: none;
        }
        .pharmacy-ring-1 { width: 280px; height: 280px; animation-delay: 0s;    }
        .pharmacy-ring-2 { width: 480px; height: 480px; animation-delay: 1.5s;  }
        .pharmacy-ring-3 { width: 680px; height: 680px; animation-delay: 3.0s;  }
      `}</style>

      <div className="w-full overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-8 py-5 sm:py-8 lg:py-10">

          {/* ── Header ── */}
          <div className="mb-6 sm:mb-8 lg:mb-10 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-slate-900 mb-1 sm:mb-2">Dashboard</h1>
              <p className="text-xs sm:text-sm lg:text-base text-slate-500 truncate max-w-[220px] sm:max-w-none">
                Welcome back, {staffName || pharmacistInChargeName || user?.email}
              </p>
            </div>
            <button
              onClick={() => setShowPrintModal(true)}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-900 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
              <span className="hidden xs:inline">Print </span>Report
            </button>
          </div>

          {/* ── Today strip ── */}
          <div className="fade-up fade-up-1 mb-5 sm:mb-6">
            <TodayStrip dispensed={todayItemsDispensed} transactions={todaySessionCount} pharmacyName={pharmacyName} />
          </div>

          {/* ── Inventory section label ── */}
          <div className="mb-2 mt-6 sm:mt-8 flex items-center gap-3">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Inventory</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* ── Inventory stat cards: 2 cols on mobile, 4 on desktop ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 lg:gap-4 mb-6 sm:mb-8">
            <div className="fade-up fade-up-2">
              <StatCard label="Total Medicines" value={totalMedicines} sub="In inventory" accent="#3b82f6"
                icon={<svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21a48.309 48.309 0 01-8.135-1.587c-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>}
              />
            </div>
            <div className="fade-up fade-up-3">
              <StatCard label="Categories" value={totalCategories} sub="Distinct types" accent="#8b5cf6"
                icon={<svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>}
              />
            </div>
            <div className="fade-up fade-up-4">
              <StatCard label="In Stock" value={inStockCount} sub="Available now" accent="#10b981"
                icon={<svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
            </div>
            <div className="fade-up fade-up-5">
              <StatCard label="Low Stock" value={lowStockCount} sub="Need reorder" accent={lowStockCount > 0 ? '#ef4444' : '#94a3b8'} alert={lowStockCount > 0}
                icon={<svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}
              />
            </div>
          </div>

          {/* ── Dispensing & Sales label ── */}
          <div className="mb-2 mt-1 sm:mt-2 flex items-center gap-3">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 whitespace-nowrap">Dispensing &amp; Sales</span>
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium whitespace-nowrap">selected period</span>
          </div>

          {/* ── Dispensing stat cards: 2 cols mobile, 4 desktop ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 lg:gap-4 mb-2.5 sm:mb-3">
            <div className="fade-up fade-up-2">
              <StatCard label="Total Dispensed" value={totalDispensed} sub={`${fmt(totalDispenseSessions)} transactions`} accent="#3b82f6" current={totalDispensed} prev={prevDispensed}
                icon={<svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m-6 3.75l3 3m0 0l3-3m-3 3V1.5m6 9h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75" /></svg>}
              />
            </div>
            <div className="fade-up fade-up-3">
              <StatCard label="POS Sales" value={totalPosSales} sub="Unique sale orders" accent="#10b981" current={totalPosSales} prev={prevPosSales}
                icon={<svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>}
              />
            </div>
            <div className="fade-up fade-up-4">
              <StatCard label="Stock Deducted" value={totalStockDeducted} sub="Dispense + sales only" accent="#f59e0b" current={totalStockDeducted} prev={prevStockDeducted} onClick={() => setShowStockModal(true)} clickLabel="Tap for details →"
                icon={<svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>}
              />
            </div>
            <div className="fade-up fade-up-5">
              <StatCard label="Remaining Stock" value={remainingStock} sub="Total units across all" accent="#8b5cf6"
                icon={<svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>}
              />
            </div>
          </div>

          {/* Expired alert card */}
          {expiredCount > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 lg:gap-4 mb-6 sm:mb-8">
              <div className="fade-up fade-up-6">
                <StatCard
                  label="Expired Items"
                  value={expiredCount}
                  sub="Remove from stock immediately"
                  accent="#ef4444"
                  alert
                  icon={<svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                />
              </div>
            </div>
          )}

          {/* ── Charts ── */}
          <div className="my-6 sm:my-8 pt-6 sm:pt-8 border-t border-slate-200">
            <MedicineDispensingMonitor
              hideHeader hideMetricCards
              userId={user?.uid}
              dashboardFilterRange={filterRange}
              dashboardFilterStartDate={filterStartDate}
              dashboardFilterEndDate={filterEndDate}
              dashboardSelectedMonth={selectedMonth}
              dashboardSelectedQuarter={selectedQuarter}
              dashboardSelectedYear={selectedYear}
              onFilterRangeChange={setFilterRange}
              onSelectedMonthChange={setSelectedMonth}
              onSelectedQuarterChange={setSelectedQuarter}
              onSelectedYearChange={setSelectedYear}
              onFilterStartDateChange={setFilterStartDate}
              onFilterEndDateChange={setFilterEndDate}
            />
          </div>

          {/* ── Brand marquee ── */}
          <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3 sm:p-4 lg:p-5 mb-4 sm:mb-6 overflow-hidden">
            <h2 className="text-xs sm:text-sm font-bold text-slate-700 mb-3 sm:mb-4 uppercase tracking-widest">Medicines by Brand</h2>
            {uniqueBrands.length > 0 ? (
              <div className="relative overflow-hidden">
                <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 sm:w-10 z-10" style={{ background: 'linear-gradient(to right, white, transparent)' }} />
                <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 sm:w-10 z-10" style={{ background: 'linear-gradient(to left, white, transparent)' }} />
                <div key={`marquee-${isCollapsed}`} className="marquee-track gap-2 sm:gap-3 py-1">
                  {uniqueBrands.map(([brand, image]) => (
                    <div key={brand} className="shrink-0 flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded-xl px-3 sm:px-4 py-2 sm:py-3 cursor-default select-none hover:bg-slate-100 transition-colors gap-1.5 sm:gap-2" style={{ minWidth: '76px' }}>
                      {image
                        ? <Image src={image} alt={brand} width={32} height={32} className="w-8 h-8 sm:w-10 sm:h-10 object-contain rounded-lg" />
                        : <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-slate-200 flex items-center justify-center">
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.318A48.309 48.309 0 0112 21a48.309 48.309 0 01-8.135-1.587c-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
                        </div>
                      }
                      <p className="text-[10px] sm:text-[11px] font-semibold text-slate-700 text-center leading-tight" style={{ maxWidth: '70px', wordBreak: 'break-word' }}>{brand}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-slate-500 text-center text-sm py-6 sm:py-8">No medicines added yet</p>}
          </div>

          {/* ── Quick Actions ── */}
          <div className="mb-2 flex items-center gap-3">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Quick Actions</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          {/* 1 col on mobile, 3 on sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 lg:gap-4">
            {[
              {
                href: '/medicines',
                title: 'View Medicines',
                sub: 'Browse all medicines in your pharmacy',
                accent: '#3b82f6',
                icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
              },
              {
                href: '/medicines/add-medicine',
                title: 'Add Medicines',
                sub: 'Directly add new medicines to inventory',
                accent: '#10b981',
                icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>,
              },
              {
                href: `/inventory?stock=${defaultStockParam}&range=${filterRange}${filterRange === 'custom' && filterStartDate && filterEndDate ? `&start=${filterStartDate}&end=${filterEndDate}` : ''}`,
                title: 'Inventory Management',
                sub: 'Monitor stock, pricing, and expiration',
                accent: '#8b5cf6',
                icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>,
              },
            ].map(({ href, title, sub, accent, icon }) => (
              <Link key={href} href={href}
                className="group relative overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm p-4 sm:p-5 flex items-center gap-3 sm:gap-4 transition-all duration-200 active:scale-[0.98] hover:scale-[1.02] hover:shadow-lg"
                style={{ boxShadow: `0 2px 16px 0 ${accent}12` }}
              >
                <div className="absolute top-0 left-0 right-0 h-0.75 rounded-t-2xl" style={{ background: accent }} />
                <span className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center" style={{ background: `${accent}15`, color: accent }}>{icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">{title}</p>
                  <p className="text-[10px] sm:text-xs text-slate-500 truncate">{sub}</p>
                </div>
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-300 ml-auto shrink-0 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </Link>
            ))}
          </div>

        </div>
      </div>

      {/* ── Stock Modal ── */}
      {showStockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 transition-all duration-300">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[90vh] sm:max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200">
              <h3 className="text-base sm:text-xl font-bold text-slate-900">Medicine Stock Overview</h3>
              <button onClick={() => setShowStockModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">×</button>
            </div>
            <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-2">
              <input
                type="text"
                placeholder="Search medicine name or category..."
                value={stockModalSearch}
                onChange={e => setStockModalSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-xs sm:text-sm">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 sm:px-6 py-2.5 sm:py-3 text-left font-semibold text-slate-700">Medicine</th>
                    <th className="px-3 sm:px-6 py-2.5 sm:py-3 text-left font-semibold text-slate-700 hidden sm:table-cell">Category</th>
                    <th className="px-3 sm:px-6 py-2.5 sm:py-3 text-right font-semibold text-slate-700">Stock</th>
                    <th className="px-3 sm:px-6 py-2.5 sm:py-3 text-right font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {medicines
                    .filter(med => (med.baseName || med.name || '').toLowerCase().includes(stockModalSearch.toLowerCase()) || (med.category || '').toLowerCase().includes(stockModalSearch.toLowerCase()))
                    .sort((a, b) => (a.baseName || a.name || '').localeCompare(b.baseName || b.name || ''))
                    .map(med => {
                      const stock = getEffectiveStock(med);
                      const { label, variant } = getMedicineStatus(med);
                      return (
                        <tr key={med.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 sm:px-6 py-2.5 sm:py-3 font-medium text-slate-900">
                            <div>{med.baseName || med.name || '—'}</div>
                            <div className="text-[10px] text-slate-400 sm:hidden">{med.category || 'Uncategorized'}</div>
                          </td>
                          <td className="px-3 sm:px-6 py-2.5 sm:py-3 text-slate-500 text-xs hidden sm:table-cell">{med.category || 'Uncategorized'}</td>
                          <td className="px-3 sm:px-6 py-2.5 sm:py-3 text-right font-bold text-slate-900">{stock.toLocaleString()}</td>
                          <td className="px-3 sm:px-6 py-2.5 sm:py-3 text-right">
                            <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${stockModalStatusStyles[variant]}`}>
                              {label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button onClick={() => setShowStockModal(false)} className="px-4 sm:px-5 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print Report Modal ── */}
      {showPrintModal && (
        <PrintReportModal
          medicines={medicines}
          transactions={transactions}
          printMode={printMode} setPrintMode={setPrintMode}
          printMonth={printMonth} setPrintMonth={setPrintMonth}
          printQuarter={printQuarter} setPrintQuarter={setPrintQuarter}
          printYear={printYear} setPrintYear={setPrintYear}
          years={years}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
}