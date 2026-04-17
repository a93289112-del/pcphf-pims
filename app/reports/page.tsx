'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, onValue } from 'firebase/database';
import Processing from '@/lib/components/processing';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import dynamic from 'next/dynamic';
import { type QuarterType } from '@/lib/services/filter-utils';
import { type FirebaseTransaction } from '@/lib/types';

const SalesContent = dynamic(() => import('@/app/reports/sales-content'), { ssr: false });

// ─── Transaction Activity Log Types & Helpers ─────────────────────────────────

interface TxRow {
  date:          string;
  type:          FirebaseTransaction['type'];
  medicineId:    string;
  medicineName:  string;
  category:      string;
  strength?:     string;
  quantity:      number;
  previousStock: number;
  newStock:      number;
  currentStock:  number;
  notes?:        string;
}

const TX_TYPE_META: Record<
  FirebaseTransaction['type'],
  { label: string; color: string; bg: string; sign: string; isDeduction: boolean }
> = {
  dispense:   { label: 'Dispensed',  color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       sign: '−', isDeduction: true  },
  sale:       { label: 'POS Sale',   color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', sign: '−', isDeduction: true  },
  adjustment: { label: 'Adjustment', color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',   sign: '±', isDeduction: false },
};

function getQtySign(row: { type: FirebaseTransaction['type']; quantity: number }): string {
  if (row.type === 'adjustment') return row.quantity >= 0 ? '+' : '−';
  if (row.type === 'dispense' || row.type === 'sale') return '−';
  return '';
}

function getQtyColor(row: { type: FirebaseTransaction['type']; quantity: number }): string {
  if (row.type === 'adjustment') return 'text-violet-600';
  if (row.type === 'dispense')   return 'text-blue-600';
  if (row.type === 'sale')       return 'text-emerald-600';
  return 'text-slate-600';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ─── Single transaction event row ─────────────────────────────────────────────

function TxEventRow({
  row,
  showMedicine,
  showDate,
}: {
  row: TxRow;
  showMedicine?: boolean;
  showDate?: boolean;
}) {
  const meta   = TX_TYPE_META[row.type] ?? TX_TYPE_META.adjustment;
  const sign   = getQtySign(row);
  const qColor = getQtyColor(row);

  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-xl hover:bg-slate-50 transition-colors">
      <span
        className={`shrink-0 mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color}`}
      >
        {meta.label}
      </span>
      <div className="flex-1 min-w-0">
        {showMedicine && (
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <span className="text-xs font-semibold text-slate-800 truncate">
              {row.medicineName}
            </span>
            {row.strength && (
              <span className="text-[10px] font-black px-1 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100/50 uppercase tracking-wider">
                {row.strength}
              </span>
            )}
            <span className="text-[10px] text-slate-400">{row.category}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {showDate ? (
            <span className="text-[10px] text-slate-400">{formatDateTime(row.date)}</span>
          ) : (
            <span className="text-[10px] text-slate-400">
              {new Date(row.date).toLocaleTimeString('en-PH', {
                hour: '2-digit', minute: '2-digit', hour12: true,
              })}
            </span>
          )}
          <span className="text-[10px] text-slate-300 tabular-nums">
            {row.previousStock.toLocaleString()}
            <span className="mx-1">→</span>
            <span className="text-slate-500 font-semibold">{row.newStock.toLocaleString()}</span>
            <span className="ml-1 text-slate-300">stock</span>
          </span>
          <span className="ml-2 px-1.5 py-0.5 rounded-md bg-slate-100 text-[9px] font-black text-slate-600 uppercase tracking-tighter border border-slate-200/50">
            Current: {row.currentStock.toLocaleString()}
          </span>
        </div>
        {row.notes && (
          <p className="text-[10px] text-slate-400 italic mt-0.5 truncate">{row.notes}</p>
        )}
      </div>
      <span className={`shrink-0 text-sm font-black tabular-nums ${qColor}`}>
        {sign}{Math.abs(row.quantity).toLocaleString()}
      </span>
    </div>
  );
}

// ─── Comprehensive Transaction Details Panel ──────────────────────────────────

type TxViewMode = 'medicine' | 'date' | 'raw';

function TransactionDetailsPanel({
  transactions,
  medicines,
  txFilterMode,
  setTxFilterMode,
  txMonth,
  setTxMonth,
  txQuarter,
  setTxQuarter,
  txYear,
  setTxYear,
  years,
}: {
  transactions:    FirebaseTransaction[];
  medicines:       Medicine[];
  txFilterMode:    'monthly' | 'quarterly' | 'annual';
  setTxFilterMode: (m: 'monthly' | 'quarterly' | 'annual') => void;
  txMonth:         string;
  setTxMonth:      (m: string) => void;
  txQuarter:       QuarterType;
  setTxQuarter:    (q: QuarterType) => void;
  txYear:          number;
  setTxYear:       (y: number) => void;
  years:           number[];
}) {
  const [viewMode,     setViewMode]     = useState<TxViewMode>('medicine');
  const [txSearch,     setTxSearch]     = useState('');
  const [typeFilter,   setTypeFilter]   = useState<'all' | FirebaseTransaction['type']>('all');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const medMap = useMemo(() => {
    const m = new Map<string, Medicine>();
    medicines.forEach((med) => m.set(med.id, med));
    return m;
  }, [medicines]);

  const txDateRange = useMemo(() => {
    if (txFilterMode === 'monthly') {
      const [y, m] = txMonth.split('-').map(Number);
      return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59) };
    }
    if (txFilterMode === 'quarterly') {
      const qMap: Record<QuarterType, [number, number]> = {
        Q1: [0, 2], Q2: [3, 5], Q3: [6, 8], Q4: [9, 11],
      };
      const [sm, em] = qMap[txQuarter];
      return {
        start: new Date(txYear, sm, 1),
        end:   new Date(txYear, em + 1, 0, 23, 59, 59),
      };
    }
    return {
      start: new Date(txYear, 0, 1),
      end:   new Date(txYear, 11, 31, 23, 59, 59),
    };
  }, [txFilterMode, txMonth, txQuarter, txYear]);

  const enrichedRows = useMemo<TxRow[]>(() => {
    return transactions
      .filter((t) => {
        const d = new Date(t.date);
        return d >= txDateRange.start && d <= txDateRange.end;
      })
      .filter((t) => ['dispense', 'sale', 'adjustment'].includes(t.type))
      .map((t) => {
        const med = medMap.get(t.medicineId);
        return {
          date:          t.date,
          type:          t.type,
          medicineId:    t.medicineId,
          medicineName:  med ? (med.baseName || med.name || '—') : 'Unknown Medicine',
          category:      med?.category || 'Uncategorized',
          strength:      med?.strength,
          quantity:      t.quantity,
          previousStock: t.previousStock,
          newStock:      t.newStock,
          currentStock:  med?.quantity ?? 0,
          notes:         t.notes,
        };
      })
      .filter((r) => {
        if (typeFilter !== 'all' && r.type !== typeFilter) return false;
        if (txSearch.trim()) {
          const q = txSearch.toLowerCase();
          return (
            r.medicineName.toLowerCase().includes(q) ||
            r.category.toLowerCase().includes(q) ||
            r.type.toLowerCase().includes(q) ||
            formatDate(r.date).toLowerCase().includes(q) ||
            (r.notes || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, txDateRange, medMap, typeFilter, txSearch]);

  const totals = useMemo(() => {
    const deducted  = enrichedRows
      .filter((r) => TX_TYPE_META[r.type]?.isDeduction)
      .reduce((s, r) => s + r.quantity, 0);
    const adjusted  = enrichedRows
      .filter((r) => r.type === 'adjustment')
      .reduce((s, r) => s + r.quantity, 0);
    const dispensed = enrichedRows
      .filter((r) => r.type === 'dispense')
      .reduce((s, r) => s + r.quantity, 0);
    const sold      = enrichedRows
      .filter((r) => r.type === 'sale')
      .reduce((s, r) => s + r.quantity, 0);
    return { total: enrichedRows.length, deducted, adjusted, dispensed, sold };
  }, [enrichedRows]);

  const byMedicine = useMemo(() => {
    const map = new Map<
      string,
      { medicineName: string; category: string; rows: TxRow[] }
    >();
    enrichedRows.forEach((r) => {
      if (!map.has(r.medicineId))
        map.set(r.medicineId, { medicineName: r.medicineName, category: r.category, rows: [] });
      map.get(r.medicineId)!.rows.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].rows.length - a[1].rows.length);
  }, [enrichedRows]);

  const byDate = useMemo(() => {
    const map = new Map<string, TxRow[]>();
    enrichedRows.forEach((r) => {
      const key = formatDateKey(r.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [enrichedRows]);

  const toggleKey = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (viewMode === 'medicine')
      setExpandedKeys(new Set(byMedicine.map(([id]) => id)));
    else if (viewMode === 'date')
      setExpandedKeys(new Set(byDate.map(([d]) => d)));
  }, [viewMode, byMedicine, byDate]);

  const collapseAll = useCallback(() => setExpandedKeys(new Set()), []);

  function MedicineDayBreakdown({ rows }: { rows: TxRow[] }) {
    const byDay = new Map<string, TxRow[]>();
    rows.forEach((r) => {
      const k = formatDateKey(r.date);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(r);
    });
    const days = Array.from(byDay.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    return (
      <div className="mt-2 space-y-2">
        {days.map(([dayKey, dayRows]) => {
          const deducted  = dayRows
            .filter((r) => TX_TYPE_META[r.type]?.isDeduction)
            .reduce((s, r) => s + r.quantity, 0);
          const adjusted  = dayRows
            .filter((r) => r.type === 'adjustment')
            .reduce((s, r) => s + r.quantity, 0);
          const firstStock = dayRows[dayRows.length - 1]?.previousStock ?? 0;
          const lastStock  = dayRows[0]?.newStock ?? 0;
          return (
            <div key={dayKey} className="border border-slate-100 rounded-xl overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-slate-700">
                    {formatDate(dayKey + 'T00:00:00')}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
                    {firstStock.toLocaleString()} →{' '}
                    <span className="text-slate-600">{lastStock.toLocaleString()}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {deducted > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                      −{deducted.toLocaleString()}
                    </span>
                  )}
                  {adjusted !== 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                      {adjusted > 0 ? '+' : ''}{adjusted.toLocaleString()}
                    </span>
                  )}
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {dayRows.length} event{dayRows.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-slate-50 px-2">
                {dayRows.map((row, i) => (
                  <TxEventRow key={i} row={row} showMedicine={false} showDate={false} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mt-8">
      {/* Header & Filters */}
      <div className="p-4 sm:p-5 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-black text-slate-900 leading-tight">
              Transaction Details
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5 uppercase tracking-wider">
              Historical Audit Log
            </p>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {(['medicine', 'date', 'raw'] as TxViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  viewMode === m
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Period selector */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-50 rounded-xl border border-slate-100">
            {(['monthly', 'quarterly', 'annual'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setTxFilterMode(m)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold capitalize transition-all ${
                  txFilterMode === m
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-500'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {txFilterMode === 'monthly' && (
            <input
              type="month"
              value={txMonth}
              onChange={(e) => setTxMonth(e.target.value)}
              className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          )}
          {txFilterMode === 'quarterly' && (
            <div className="flex gap-2">
              <select
                value={txQuarter}
                onChange={(e) => setTxQuarter(e.target.value as QuarterType)}
                className="flex-1 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
              <select
                value={txYear}
                onChange={(e) => setTxYear(Number(e.target.value))}
                className="flex-1 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
          {txFilterMode === 'annual' && (
            <select
              value={txYear}
              onChange={(e) => setTxYear(Number(e.target.value))}
              className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as FirebaseTransaction['type'] | 'all')}
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">All Event Types</option>
            <option value="dispense">Dispensings Only</option>
            <option value="sale">POS Sales Only</option>
            <option value="adjustment">Adjustments Only</option>
          </select>

          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search in period..."
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Totals strip */}
        <div className="mt-4 flex flex-wrap gap-4 px-1">
          {[
            { label: 'Total Events',    val: totals.total,     color: 'text-slate-500'   },
            { label: 'Units Dispensed', val: totals.dispensed, color: 'text-blue-600'    },
            { label: 'POS Sales',       val: totals.sold,      color: 'text-emerald-600' },
            { label: 'Adjustments',     val: totals.adjusted,  color: 'text-violet-600'  },
          ].map((t) => (
            <div key={t.label}>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                {t.label}
              </p>
              <p className={`text-sm font-black tabular-nums ${t.color}`}>
                {t.val.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-5 max-h-150 overflow-y-auto bg-slate-50/30">
        {enrichedRows.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-slate-400 text-sm font-medium">
              No transactions found for this period
            </p>
          </div>
        )}

        {(viewMode === 'medicine' || viewMode === 'date') && enrichedRows.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {viewMode === 'medicine' ? 'Grouped by Medicine' : 'Grouped by Date'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={expandAll}
                  className="text-[10px] font-bold text-blue-600 hover:underline"
                >
                  Expand All
                </button>
                <button
                  onClick={collapseAll}
                  className="text-[10px] font-bold text-slate-400 hover:underline"
                >
                  Collapse All
                </button>
              </div>
            </div>

            {(viewMode === 'medicine' ? byMedicine : byDate).map(([key, data]) => {
              const isOpen = expandedKeys.has(key);
              const isDate = viewMode === 'date';

              // FIX: properly typed narrowing instead of 'as' casts
              const rows: TxRow[] = isDate
                ? (data as TxRow[])
                : (data as { medicineName: string; category: string; rows: TxRow[] }).rows;
              const name: string = isDate
                ? formatDate(key + 'T00:00:00')
                : (data as { medicineName: string; category: string; rows: TxRow[] }).medicineName;
              const sub: string = isDate
                ? `${rows.length} event${rows.length !== 1 ? 's' : ''}`
                : (data as { medicineName: string; category: string; rows: TxRow[] }).category;

              const mDeducted = rows
                .filter((r) => TX_TYPE_META[r.type]?.isDeduction)
                .reduce((s, r) => s + r.quantity, 0);
              const mAdjusted = rows
                .filter((r) => r.type === 'adjustment')
                .reduce((s, r) => s + r.quantity, 0);

              return (
                <div
                  key={key}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden transition-all duration-200 shadow-sm hover:border-slate-300"
                >
                  <button
                    onClick={() => toggleKey(key)}
                    className="w-full flex items-center justify-between gap-4 p-4 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${
                          isOpen ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {rows.length}
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{name}</p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                          {sub}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden sm:flex flex-col items-end">
                        {mDeducted > 0 && (
                          <span className="text-[10px] font-bold text-red-600">
                            −{mDeducted.toLocaleString()} units
                          </span>
                        )}
                        {mAdjusted !== 0 && (
                          <span className="text-[10px] font-bold text-violet-600">
                            {mAdjusted > 0 ? '+' : ''}{mAdjusted.toLocaleString()} units
                          </span>
                        )}
                      </div>
                      <svg
                        className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 p-2 bg-slate-50/30">
                      {isDate ? (
                        <div className="divide-y divide-slate-50 px-2">
                          {rows.map((row, i) => (
                            <TxEventRow key={i} row={row} showMedicine={true} showDate={false} />
                          ))}
                        </div>
                      ) : (
                        <MedicineDayBreakdown rows={rows} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {viewMode === 'raw' && enrichedRows.length > 0 && (
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
            <div className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[2fr_1.2fr_auto_auto_auto] gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              <span>Medicine</span>
              <span className="hidden sm:block">Date &amp; Time</span>
              <span>Type</span>
              <span className="text-center">Stock Flow</span>
              <span className="text-right">Qty</span>
            </div>
            <div className="divide-y divide-slate-50">
              {enrichedRows.map((row, i) => {
                const meta   = TX_TYPE_META[row.type] ?? TX_TYPE_META.adjustment;
                const sign   = getQtySign(row);
                const qColor = getQtyColor(row);
                return (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[2fr_1.2fr_auto_auto_auto] gap-2 px-4 py-2.5 items-center hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {row.medicineName}
                        </p>
                        {row.strength && (
                          <span className="text-[9px] font-black px-1 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100/50 uppercase tracking-tighter shrink-0">
                            {row.strength}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">{row.category}</p>
                      {row.notes && (
                        <p className="text-[10px] text-slate-300 italic truncate">{row.notes}</p>
                      )}
                    </div>
                    <div className="hidden sm:block text-[10px] text-slate-400 whitespace-nowrap">
                      {formatDateTime(row.date)}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${meta.bg} ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                    <div className="text-center text-[10px] text-slate-400 whitespace-nowrap tabular-nums">
                      {row.previousStock.toLocaleString()}
                      <span className="mx-0.5 text-slate-300">→</span>
                      <span className="text-slate-600 font-semibold">
                        {row.newStock.toLocaleString()}
                      </span>
                    </div>
                    <span className={`text-right text-sm font-black tabular-nums ${qColor}`}>
                      {sign}{Math.abs(row.quantity).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dispensing interfaces ────────────────────────────────────────────────────

interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

interface Medicine {
  id:                   string;
  name:                 string;
  baseName?:            string;
  brandModel?:          string;
  unit?:                string;
  category:             string;
  originalUnit?:        string;
  brand:                string;
  image:                string;
  description:          string;
  quantity?:            number;
  stockPerUnit?:        number;
  stockPerPieces?:      number;
  piecesPerUnit?:       number;
  totalPieces?:         number;
  containerQuantity?:   number;
  pricePerUnit?:        number;
  pricePerPieces?:      number;
  unitCost?:            number;
  sellingPrice?:        number;
  minStock?:            number;
  expirationDate?:      string;
  batches?:             Record<string, MedicineBatch>; // FIFO batches with individual expirations
  createdAt:            string;
  strength?:            string;
  strengths?:           string[] | null;
  prescriptionRequired?: boolean;
}

interface DispenseItem {
  medicineId:    string;
  medicineName:  string;
  quantity:      number;
  unitType?:     string;
  quantityType?: string;
}

interface Dispensing {
  id:          string;
  date:        string;
  patientName: string;
  patientId:   string;
  age?:        string;
  notes?:      string;
  items:       DispenseItem[];
  dispensedBy: string;
}

interface StockAdjustment {
  quantity:        number;
  stockType?:      string;
  expirationDate?: string;
  timestamp:       string;
}

interface StockAdjustmentsByMedicine {
  [medicineId: string]: {
    [adjustmentId: string]: StockAdjustment;
  };
}

interface DispensingStats {
  totalDispensings:          number;
  totalMedicinesDispensed:   number;
  avgMedicinesPerDispensing: number;
  uniquePatients:            number;
  topMedicines:              Array<{
    id:       string;
    name:     string;
    strength?: string;
    quantity: number;
    byUnit:   Record<string, number>;
  }>;
  dailyDispensings:  Array<{ date: string; count: number; medicines: number }>;
  unitTypeBreakdown: Array<{ type: string; quantity: number; percentage: number }>;
  totalStockAdded:   number;
  adjustmentCount:   number;
}

const emptyDispensingStats: DispensingStats = {
  totalDispensings:          0,
  totalMedicinesDispensed:   0,
  avgMedicinesPerDispensing: 0,
  uniquePatients:            0,
  topMedicines:              [],
  dailyDispensings:          [],
  unitTypeBreakdown:         [],
  totalStockAdded:           0,
  adjustmentCount:           0,
};

// ─── Sales interfaces ─────────────────────────────────────────────────────────

interface SaleItem {
  medicineId:   string;
  medicineName: string;
  quantity:     number;
  unitPrice:    number;
  subtotal:     number;
  unit?:        string;
  category?:    string;
}

interface Sale {
  id:            string;
  date:          string;
  phDate?:       string;
  total:         number;
  amountPaid:    number;
  change:        number;
  paymentMethod: string;
  items:         SaleItem[];
  // FIX: itemCount in POS is cart.length (unique line items), NOT total quantity
  // We sum item.quantity directly for totalItems instead of relying on itemCount
  itemCount:     number;
}

interface DailySalesSummary {
  date:           string;
  displayDate:    string;
  salesCount:     number;
  totalRevenue:   number;
  totalItems:     number;
  paymentMethods: Record<string, number>;
}

interface MedicineSalesStats {
  medicineId:    string;
  medicineName:  string;
  strength?:     string;
  totalQuantity: number;
  totalRevenue:  number;
  salesCount:    number;
}

// ─── Timezone-safe helpers ────────────────────────────────────────────────────

/** Convert any date string or ISO timestamp → YYYY-MM-DD in Asia/Manila */
function toPhDateString(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Today's date as YYYY-MM-DD in Asia/Manila */
function getTodayPH(): string {
  return toPhDateString(new Date());
}

/** Human-readable display date in PH locale */
function toPhDisplayDate(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return d.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month:    'short',
    day:      'numeric',
    year:     'numeric',
  });
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return toPhDateString(date);
}

function getItemUnitType(item: DispenseItem): string {
  return (item.unitType || item.quantityType || 'Units').trim();
}

// ─── Initial sales date range — last 30 days in PH time ──────────────────────

const getInitialSalesDateRange = () => {
  const today = getTodayPH();
  const start = addDays(today, -30);
  return { start, end: today };
};

// ─── Trend filter sub-component ───────────────────────────────────────────────

function TrendFilter({
  mode, setMode,
  preset, setPreset,
  startDate, setStartDate,
  endDate, setEndDate,
}: {
  mode:         'preset' | 'custom';
  setMode:      (v: 'preset' | 'custom') => void;
  preset:       number;
  setPreset:    (v: number) => void;
  startDate:    string;
  setStartDate: (v: string) => void;
  endDate:      string;
  setEndDate:   (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      {(['preset', 'custom'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
            mode === m
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          {m === 'preset' ? 'Preset' : 'Custom Date'}
        </button>
      ))}
      {mode === 'preset' && (
        <select
          value={preset}
          onChange={(e) => setPreset(Number(e.target.value))}
          className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      )}
      {mode === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2.5 py-1.5 text-xs text-slate-900 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ maxWidth: 150 }}
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2.5 py-1.5 text-xs text-slate-900 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ maxWidth: 150 }}
          />
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = 'dispensing' | 'sales';

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { user, loading } = useAuth();
  const router       = useRouter();
  const searchParams = useSearchParams();

  // ── Derive active tab directly from URL ──────────────────────────────────
  const activeTab = useMemo<Tab>(() => {
    const tab = searchParams.get('tab');
    return tab === 'sales' || tab === 'dispensing' ? tab : 'dispensing';
  }, [searchParams]);

  // ── Dispensing state ─────────────────────────────────────────────────────
  const [dispensings,          setDispensings]          = useState<Dispensing[]>([]);
  const [stockAdjustments,     setStockAdjustments]     = useState<StockAdjustmentsByMedicine>({});
  const [isLoadingDispensings, setIsLoadingDispensings] = useState(true);
  const [isLoadingAdjustments, setIsLoadingAdjustments] = useState(true);
  const [dispensingDateRange,  setDispensingDateRange]  = useState({ start: '', end: '' });

  // FIX: separate isPrinting/isDownloading per tab to avoid cross-tab overlay conflicts
  const [isDispensingPrinting,    setIsDispensingPrinting]    = useState(false);
  const [isDispensingDownloading, setIsDispensingDownloading] = useState(false);

  const [trendMode,      setTrendMode]      = useState<'preset' | 'custom'>('preset');
  const [trendPreset,    setTrendPreset]    = useState(30);
  const [trendStartDate, setTrendStartDate] = useState('');
  const [trendEndDate,   setTrendEndDate]   = useState('');

  // ── Transaction Details Panel State ─────────────────────────────────────
  const [medicines,    setMedicines]    = useState<Medicine[]>([]);
  const [transactions, setTransactions] = useState<FirebaseTransaction[]>([]);
  const [txFilterMode, setTxFilterMode] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [txMonth,      setTxMonth]      = useState<string>(
    new Date().toISOString().slice(0, 7),
  );
  const [txQuarter, setTxQuarter] = useState<QuarterType>('Q1');
  const [txYear,    setTxYear]    = useState<number>(new Date().getFullYear());

  const years = useMemo(() => {
    const startYear   = 2024;
    const currentYear = new Date().getFullYear();
    const list: number[] = [];
    for (let y = currentYear; y >= startYear; y--) list.push(y);
    return list;
  }, []);

  // ── Sales state ──────────────────────────────────────────────────────────
  const [sales,          setSales]          = useState<Sale[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [salesDateRange, setSalesDateRange] = useState<{ start: string; end: string }>(
    getInitialSalesDateRange,
  );

  // ── Auth guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  // ── Load dispensings ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const path  = getUserPath(user.uid, 'dispensings');
    const unsub = onValue(ref(database, path), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data as Record<string, Omit<Dispensing, 'id'>>)
          .map(([id, values]) => ({ id, ...values } as Dispensing))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setDispensings(list);
      } else {
        setDispensings([]);
      }
      setIsLoadingDispensings(false);
    });
    return () => unsub();
  }, [user]);

  // ── Load stock adjustments ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const path  = getUserPath(user.uid, 'stockAdjustments');
    const unsub = onValue(ref(database, path), (snapshot) => {
      const data = snapshot.val();
      setStockAdjustments(data ? (data as StockAdjustmentsByMedicine) : {});
      setIsLoadingAdjustments(false);
    });
    return () => unsub();
  }, [user]);

  // ── Load sales ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const path  = getUserPath(user.uid, 'sales');
    const unsub = onValue(ref(database, path), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const salesArray = Object.entries(data).map(([key, value]) => ({
          id: key,
          ...(value as Omit<Sale, 'id'>),
        }));
        setSales(salesArray);
      } else {
        setSales([]);
      }
      setIsLoadingSales(false);
    });
    return () => unsub();
  }, [user]);

  // ── Load medicines ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const medicinesPath = getUserPath(user.uid, 'medicines');
    const unsubscribe   = onValue(ref(database, medicinesPath), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data as Record<string, Omit<Medicine, 'id'>>).map(
          ([id, v]) => ({ id, ...v } as Medicine),
        );
        setMedicines(list);
      } else {
        setMedicines([]);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // ── Load transactions ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const transactionsPath = getUserPath(user.uid, 'transactions');
    return onValue(ref(database, transactionsPath), (snap) => {
      const data = snap.val();
      setTransactions(
        data ? (Object.values(data) as FirebaseTransaction[]) : [],
      );
    });
  }, [user]);

  // ── Dispensing stats ─────────────────────────────────────────────────────
  const dispensingStats = useMemo<DispensingStats>(() => {
    if (dispensings.length === 0) return emptyDispensingStats;

    let filtered = dispensings;
    if (dispensingDateRange.start && dispensingDateRange.end) {
      filtered = dispensings.filter((d) => {
        const localDate = toPhDateString(d.date);
        return (
          localDate >= dispensingDateRange.start &&
          localDate <= dispensingDateRange.end
        );
      });
    }

    const totalMedicinesDispensed = filtered.reduce(
      (sum, d) => sum + d.items.reduce((s, item) => s + item.quantity, 0),
      0,
    );
    const uniquePatients = new Set(filtered.map((d) => d.patientName)).size;

    const medicineMap = new Map<
      string,
      { name: string; quantity: number; byUnit: Record<string, number>; strength?: string }
    >();
    filtered.forEach((d) => {
      d.items.forEach((item) => {
        const key      = item.medicineId;
        const unitType = getItemUnitType(item);
        const prev     = medicineMap.get(key) ?? {
          name: item.medicineName, quantity: 0, byUnit: {},
        };

        let strength = prev.strength;
        if (!strength) {
          const med = medicines.find((m) => m.id === item.medicineId);
          strength  = med?.strength;
        }

        medicineMap.set(key, {
          name:     prev.name,
          quantity: prev.quantity + item.quantity,
          byUnit:   {
            ...prev.byUnit,
            [unitType]: (prev.byUnit[unitType] ?? 0) + item.quantity,
          },
          strength,
        });
      });
    });

    const topMedicines = Array.from(medicineMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    const dailyMap = new Map<string, { count: number; medicines: number }>();
    filtered.forEach((d) => {
      const dateKey = toPhDateString(d.date);
      const prev    = dailyMap.get(dateKey) ?? { count: 0, medicines: 0 };
      dailyMap.set(dateKey, {
        count:     prev.count + 1,
        medicines: prev.medicines + d.items.reduce((s, item) => s + item.quantity, 0),
      });
    });

    const dailyDispensings = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    const unitMap = new Map<string, number>();
    filtered.forEach((d) => {
      d.items.forEach((item) => {
        const ut = getItemUnitType(item);
        unitMap.set(ut, (unitMap.get(ut) ?? 0) + item.quantity);
      });
    });

    const unitTypeBreakdown = Array.from(unitMap.entries())
      .map(([type, quantity]) => ({
        type,
        quantity,
        percentage:
          totalMedicinesDispensed > 0 ? (quantity / totalMedicinesDispensed) * 100 : 0,
      }))
      .sort((a, b) => b.quantity - a.quantity);

    let totalStockAdded = 0;
    let adjustmentCount = 0;
    Object.values(stockAdjustments).forEach((adjsByMed) => {
      Object.values(adjsByMed).forEach((adj) => {
        if (dispensingDateRange.start && dispensingDateRange.end) {
          const adjDate = toPhDateString(adj.timestamp);
          if (
            adjDate < dispensingDateRange.start ||
            adjDate > dispensingDateRange.end
          )
            return;
        }
        if (adj.quantity > 0) {
          totalStockAdded += adj.quantity;
          adjustmentCount += 1;
        }
      });
    });

    return {
      totalDispensings: filtered.length,
      totalMedicinesDispensed,
      avgMedicinesPerDispensing:
        filtered.length > 0 ? totalMedicinesDispensed / filtered.length : 0,
      uniquePatients,
      topMedicines,
      dailyDispensings,
      unitTypeBreakdown,
      totalStockAdded,
      adjustmentCount,
    };
  }, [dispensings, stockAdjustments, dispensingDateRange, medicines]);

  // ── Trend chart data ─────────────────────────────────────────────────────
  const trendChartData = useMemo(() => {
    const today              = getTodayPH();
    const dispensingsByDate  = new Map<string, { count: number; medicines: number }>();

    dispensings.forEach((d) => {
      const key  = toPhDateString(d.date);
      const prev = dispensingsByDate.get(key) ?? { count: 0, medicines: 0 };
      dispensingsByDate.set(key, {
        count:     prev.count + 1,
        medicines: prev.medicines + d.items.reduce((s, it) => s + it.quantity, 0),
      });
    });

    if (trendMode === 'custom' && trendStartDate && trendEndDate) {
      const days: { date: string; count: number; medicines: number }[] = [];
      let cursor = trendStartDate;
      while (cursor <= trendEndDate) {
        const rec = dispensingsByDate.get(cursor) ?? { count: 0, medicines: 0 };
        days.push({ date: cursor, ...rec });
        cursor = addDays(cursor, 1);
      }
      return days;
    }

    return Array.from({ length: trendPreset }, (_, i) => {
      const date = addDays(today, -(trendPreset - 1 - i));
      const rec  = dispensingsByDate.get(date) ?? { count: 0, medicines: 0 };
      return { date, ...rec };
    });
  }, [dispensings, trendMode, trendPreset, trendStartDate, trendEndDate]);

  // ── Sales filtering — uses PH date throughout ────────────────────────────
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const saleDate = sale.phDate ?? toPhDateString(sale.date);
      return saleDate >= salesDateRange.start && saleDate <= salesDateRange.end;
    });
  }, [sales, salesDateRange]);

  // ── Daily summaries — keyed and displayed in PH time ─────────────────────
  const dailySalesSummaries = useMemo(() => {
    const summary: Record<string, DailySalesSummary> = {};

    filteredSales.forEach((sale) => {
      const dateKey = sale.phDate ?? toPhDateString(sale.date);

      if (!summary[dateKey]) {
        summary[dateKey] = {
          date:           dateKey,
          displayDate:    toPhDisplayDate(sale.date),
          salesCount:     0,
          totalRevenue:   0,
          totalItems:     0,
          paymentMethods: {},
        };
      }

      summary[dateKey].salesCount   += 1;
      summary[dateKey].totalRevenue += sale.total;

      // FIX: sum actual item quantities, not itemCount (which is unique line items)
      const itemQtySum = sale.items.reduce((s, item) => s + item.quantity, 0);
      summary[dateKey].totalItems += itemQtySum;

      const method = sale.paymentMethod || 'other';
      summary[dateKey].paymentMethods[method] =
        (summary[dateKey].paymentMethods[method] || 0) + sale.total;
    });

    return Object.values(summary).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredSales]);

  // FIX: medicineSalesStats should NOT be sliced here — SalesContent handles top-10 display.
  // Slicing here would break the "All Medicines" table in the medicines tab.
  const medicineSalesStats = useMemo<MedicineSalesStats[]>(() => {
    const stats: Record<string, MedicineSalesStats> = {};

    filteredSales.forEach((sale) => {
      sale.items.forEach((item: SaleItem) => {
        if (!stats[item.medicineId]) {
          const med = medicines.find((m) => m.id === item.medicineId);
          stats[item.medicineId] = {
            medicineId:    item.medicineId,
            medicineName:  item.medicineName,
            strength:      med?.strength,
            totalQuantity: 0,
            totalRevenue:  0,
            salesCount:    0,
          };
        }
        stats[item.medicineId].totalQuantity += item.quantity;
        stats[item.medicineId].totalRevenue  += item.subtotal;
        stats[item.medicineId].salesCount    += 1;
      });
    });

    // FIX: return ALL medicines sorted by revenue — SalesContent slices to top 10 for display
    return Object.values(stats).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [filteredSales, medicines]);

  const salesOverallStats = useMemo(() => {
    const totalSales   = filteredSales.length;
    const totalRevenue = filteredSales.reduce((sum, s) => sum + s.total, 0);
    const avgPerSale   = totalSales > 0 ? totalRevenue / totalSales : 0;

    const paymentMethodBreakdown: Record<string, number> = {};
    const unitMap = new Map<string, number>();

    // FIX: compute totalItems by summing actual item quantities
    let totalItems = 0;

    filteredSales.forEach((sale) => {
      const method = sale.paymentMethod || 'other';
      paymentMethodBreakdown[method] =
        (paymentMethodBreakdown[method] || 0) + sale.total;

      sale.items.forEach((item: SaleItem) => {
        totalItems += item.quantity; // actual units sold
        const ut    = (item.unit || 'Units').trim();
        unitMap.set(ut, (unitMap.get(ut) ?? 0) + item.quantity);
      });
    });

    const unitTypeBreakdown = Array.from(unitMap.entries())
      .map(([type, quantity]) => ({
        type,
        quantity,
        percentage: totalItems > 0 ? (quantity / totalItems) * 100 : 0,
      }))
      .sort((a, b) => b.quantity - a.quantity);

    return {
      totalSales,
      totalRevenue,
      totalItems,
      avgPerSale,
      paymentMethodBreakdown,
      unitTypeBreakdown,
    };
  }, [filteredSales]);

  // ── Print / Download (Dispensing) ────────────────────────────────────────
  const buildDispensingReportHTML = useCallback(() => {
    const dateLabel =
      dispensingDateRange.start && dispensingDateRange.end
        ? `${dispensingDateRange.start} to ${dispensingDateRange.end}`
        : 'All Time';

    const topMedicinesRows = dispensingStats.topMedicines
      .map((m, i) => {
        const unitBreakdown = Object.entries(m.byUnit)
          .map(([unit, qty]) => `${qty} ${unit}`)
          .join(', ');
        const nameWithStrength = m.strength ? `${m.name} (${m.strength})` : m.name;
        return `<tr>
          <td>${i + 1}</td>
          <td>${nameWithStrength}</td>
          <td>${m.quantity}</td>
          <td>${unitBreakdown}</td>
        </tr>`;
      })
      .join('');

    const unitBreakdownRows = dispensingStats.unitTypeBreakdown
      .map(
        (u) =>
          `<tr>
            <td>${u.type}</td>
            <td>${u.quantity}</td>
            <td>${u.percentage.toFixed(1)}%</td>
          </tr>`,
      )
      .join('');

    const dispensingRows = dispensings
      .slice(0, 50)
      .map((d) => {
        const itemsSummary = d.items
          .map(
            (item) =>
              `${item.medicineName} ×${item.quantity} ${getItemUnitType(item)}`,
          )
          .join('; ');
        return `<tr>
          <td>${toPhDisplayDate(d.date)}</td>
          <td>${d.patientName}</td>
          <td>${d.patientId}</td>
          <td>${d.items.length}</td>
          <td>${d.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
          <td style="font-size:10px;color:#6b7280">${itemsSummary}</td>
        </tr>`;
      })
      .join('');

    const generatedAt  = new Date().toLocaleString('en-PH',    { timeZone: 'Asia/Manila' });
    const generatedDay = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Dispensing Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',sans-serif;color:#1f2937;background:#fff;padding:20mm 15mm;font-size:12px}
  .header{text-align:center;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:24px}
  .header h1{font-size:26px;color:#1e3a8a}.header p{color:#6b7280;margin-top:4px;font-size:12px}
  h2{font-size:14px;color:#1e3a8a;border-left:4px solid #2563eb;padding-left:8px;margin-bottom:12px}
  .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
  .stat-card{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px}
  .stat-label{font-size:10px;color:#6b7280;margin-bottom:4px}.stat-value{font-size:20px;font-weight:800;color:#1e3a8a}
  .section{margin-bottom:24px;page-break-inside:avoid}
  table{width:100%;border-collapse:collapse}
  th{background:#eff6ff;color:#1e40af;padding:8px 10px;text-align:left;font-size:11px;border-bottom:2px solid #bfdbfe}
  td{padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:11px}
  tr:nth-child(even) td{background:#f9fafb}
  .footer{margin-top:30px;text-align:center;color:#9ca3af;font-size:10px;border-top:1px solid #e5e7eb;padding-top:12px}
  @media print{body{padding:10mm}@page{margin:10mm;size:A4}}
</style></head><body>
  <div class="header">
    <h1>Medication Dispensing Report</h1>
    <p>Period: ${dateLabel} &nbsp;|&nbsp; Generated: ${generatedAt}</p>
  </div>
  <div class="section"><h2>Key Metrics</h2><div class="stats-grid">
    <div class="stat-card"><div class="stat-label">Total Dispensings</div><div class="stat-value">${dispensingStats.totalDispensings}</div></div>
    <div class="stat-card"><div class="stat-label">Medicines Dispensed</div><div class="stat-value">${dispensingStats.totalMedicinesDispensed}</div></div>
    <div class="stat-card"><div class="stat-label">Avg per Dispensing</div><div class="stat-value">${dispensingStats.avgMedicinesPerDispensing.toFixed(1)}</div></div>
    <div class="stat-card"><div class="stat-label">Unique Patients</div><div class="stat-value">${dispensingStats.uniquePatients}</div></div>
  </div></div>
  ${
    dispensingStats.unitTypeBreakdown.length > 0
      ? `<div class="section"><h2>Dispensed by Unit Type</h2><table><thead><tr><th>Unit Type</th><th>Quantity</th><th>Share</th></tr></thead><tbody>${unitBreakdownRows}</tbody></table></div>`
      : ''
  }
  ${
    dispensingStats.topMedicines.length > 0
      ? `<div class="section"><h2>Top 10 Medicines Dispensed</h2><table><thead><tr><th>#</th><th>Medicine</th><th>Total Qty</th><th>Breakdown by Unit</th></tr></thead><tbody>${topMedicinesRows}</tbody></table></div>`
      : ''
  }
  ${
    dispensings.length > 0
      ? `<div class="section"><h2>Recent Dispensings${dispensings.length > 50 ? ' (Top 50)' : ''}</h2><table><thead><tr><th>Date</th><th>Patient Name</th><th>Patient ID</th><th>Items</th><th>Total Qty</th><th>Medicines</th></tr></thead><tbody>${dispensingRows}</tbody></table></div>`
      : ''
  }
  <div class="footer">Pharmacy Management System &nbsp;|&nbsp; Confidential &nbsp;|&nbsp; ${generatedDay}</div>
</body></html>`;
  }, [dispensingStats, dispensings, dispensingDateRange]);

  const handleDispensingPrint = useCallback(() => {
    setIsDispensingPrinting(true);
    setTimeout(() => {
      try {
        const html        = buildDispensingReportHTML();
        const printWindow = window.open('', '_blank');
        if (!printWindow) { setIsDispensingPrinting(false); return; }
        printWindow.document.write(
          html +
            `<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>`,
        );
        printWindow.document.close();
        setTimeout(() => setIsDispensingPrinting(false), 2000);
      } catch (err) {
        console.error('Print error:', err);
        setIsDispensingPrinting(false);
      }
    }, 100);
  }, [buildDispensingReportHTML]);

  const handleDispensingDownload = useCallback(() => {
    setIsDispensingDownloading(true);
    setTimeout(() => {
      try {
        const html = buildDispensingReportHTML();
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `dispensing-report-${getTodayPH()}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setTimeout(() => setIsDispensingDownloading(false), 1000);
      } catch (err) {
        console.error('Download error:', err);
        setIsDispensingDownloading(false);
      }
    }, 100);
  }, [buildDispensingReportHTML]);

  // ── Loading state ────────────────────────────────────────────────────────
  const isLoading =
    loading || isLoadingDispensings || isLoadingAdjustments || isLoadingSales;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-slate-600">Loading reports...</p>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* FIX: show Processing overlay only for the active dispensing action */}
      {isDispensingPrinting    && <Processing message="Preparing PDF..."         />}
      {isDispensingDownloading && <Processing message="Downloading report..."    />}

      <div className="min-h-screen bg-slate-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

          {/* Header */}
          <div className="mb-8 sm:mb-10">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-950 mb-2">
              Reports
            </h1>
            <p className="text-sm sm:text-base text-slate-600">
              Dispensing analytics and sales performance
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-8 border border-slate-200">
            {(
              [
                { key: 'dispensing', label: 'Dispensing' },
                { key: 'sales',      label: 'Sales'      },
              ] as { key: Tab; label: string }[]
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => router.push(`?tab=${key}`)}
                className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
                  activeTab === key
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── DISPENSING TAB ──────────────────────────────────────────────── */}
          {activeTab === 'dispensing' && (
            <div className="space-y-6">

              {/* Dispensing Filter */}
              <div className="flex flex-row gap-3 p-4 bg-white border border-slate-200 rounded-2xl items-center flex-wrap shadow-sm">
                <div className="flex items-center gap-2 flex-wrap flex-1">
                  <label className="text-sm font-semibold text-slate-700">From:</label>
                  <input
                    type="date"
                    value={dispensingDateRange.start}
                    onChange={(e) =>
                      setDispensingDateRange((prev) => ({ ...prev, start: e.target.value }))
                    }
                    className="px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 transition-all"
                  />
                  <label className="text-sm font-semibold text-slate-700">To:</label>
                  <input
                    type="date"
                    value={dispensingDateRange.end}
                    onChange={(e) =>
                      setDispensingDateRange((prev) => ({ ...prev, end: e.target.value }))
                    }
                    className="px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 transition-all"
                  />
                  {(dispensingDateRange.start || dispensingDateRange.end) && (
                    <button
                      onClick={() => setDispensingDateRange({ start: '', end: '' })}
                      className="px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-all"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDispensingPrint}
                    disabled={isDispensingPrinting}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium text-sm flex items-center gap-2"
                  >
                    {isDispensingPrinting ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    )}
                    {isDispensingPrinting ? 'Preparing...' : 'Print'}
                  </button>
                  <button
                    onClick={handleDispensingDownload}
                    disabled={isDispensingDownloading}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors font-medium text-sm flex items-center gap-2"
                  >
                    {isDispensingDownloading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    )}
                    {isDispensingDownloading ? 'Downloading...' : 'Download'}
                  </button>
                </div>
              </div>

              {/* Dispensing Key Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  {
                    label: 'Total Dispensings',
                    value: dispensingStats.totalDispensings.toString(),
                    sub:   'Patient visits',
                  },
                  {
                    label: 'Medicines Dispensed',
                    value: dispensingStats.totalMedicinesDispensed.toString(),
                    sub:   'Total qty given',
                  },
                  {
                    label: 'Avg per Dispensing',
                    value: dispensingStats.avgMedicinesPerDispensing.toFixed(1),
                    sub:   'Items per visit',
                  },
                  {
                    label: 'Unique Patients',
                    value: dispensingStats.uniquePatients.toString(),
                    sub:   'Distinct patients',
                  },
                  {
                    label: 'Restocks Done',
                    value: dispensingStats.adjustmentCount.toString(),
                    sub:   `${dispensingStats.totalStockAdded} units added`,
                  },
                ].map(({ label, value, sub }) => (
                  <div
                    key={label}
                    className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 hover:shadow-md transition-shadow"
                  >
                    <p className="text-[10px] sm:text-xs font-medium text-slate-500 mb-1 leading-tight">
                      {label}
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold text-slate-900">{value}</p>
                    <p className="text-[9px] text-slate-400 mt-1">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Dispensing Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Daily Trend */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
                  <div className="mb-2">
                    <h2 className="text-lg font-bold text-slate-900">
                      Daily Dispensings Trend
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Medicines dispensed per day
                    </p>
                    <TrendFilter
                      mode={trendMode}           setMode={setTrendMode}
                      preset={trendPreset}       setPreset={setTrendPreset}
                      startDate={trendStartDate} setStartDate={setTrendStartDate}
                      endDate={trendEndDate}     setEndDate={setTrendEndDate}
                    />
                  </div>
                  {trendChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={trendChartData}
                        margin={{ top: 15, right: 15, left: 0, bottom: 15 }}
                      >
                        <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tick={false}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#9ca3af' }}
                          stroke="#e5e7eb"
                          width={45}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1f2937',
                            border:          'none',
                            borderRadius:    '12px',
                            fontSize:        '13px',
                            color:           '#fff',
                            padding:         '12px 16px',
                          }}
                          formatter={(value: unknown): [string, string] =>
                            [String(value), 'Medicines']
                          }
                          labelFormatter={(label) => `Date: ${label}`}
                          cursor={{ fill: 'rgba(59,130,246,0.1)' }}
                        />
                        <Bar
                          dataKey="medicines"
                          fill="#3b82f6"
                          radius={[6, 6, 0, 0]}
                          animationDuration={600}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                      No data for selected range
                    </div>
                  )}
                </div>

                {/* Top 10 Medicines */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-1">Top 10 Medicines</h2>
                  <p className="text-xs text-slate-500 mb-4">Most dispensed medicines</p>
                  {dispensingStats.topMedicines.length > 0 ? (
                    <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-2">
                      {dispensingStats.topMedicines.map((medicine, index) => {
                        const badge =
                          index === 0
                            ? { text: 'text-yellow-700', icon: '🏆' }
                            : index === 1
                            ? { text: 'text-slate-700',  icon: '🥈' }
                            : index === 2
                            ? { text: 'text-orange-700', icon: '🥉' }
                            : null;
                        const unitBreakdown = Object.entries(medicine.byUnit)
                          .sort(([, a], [, b]) => b - a)
                          .map(([unit, qty]) => `${qty} ${unit}`)
                          .join(' · ');
                        return (
                          <div
                            key={medicine.id || medicine.name}
                            className="flex items-center gap-3 pb-3 border-b border-slate-100 last:border-0"
                          >
                            {badge ? (
                              <div
                                className={`${badge.text} w-8 h-8 flex items-center justify-center text-lg font-bold`}
                              >
                                {badge.icon}
                              </div>
                            ) : (
                              <span className="text-sm font-bold text-slate-600 w-6 text-center">
                                #{index + 1}
                              </span>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="text-sm text-slate-900 font-medium truncate">
                                  {medicine.name}
                                </p>
                                {medicine.strength && (
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100/50 uppercase tracking-wider shrink-0">
                                    {medicine.strength}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                <span className="font-semibold text-slate-700">
                                  {medicine.quantity}
                                </span>{' '}
                                total{unitBreakdown ? ` · ${unitBreakdown}` : ''}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                      No data available
                    </div>
                  )}
                </div>
              </div>

              {/* Unit Type Breakdown & Activity Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Unit Type Pie */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col">
                  <h2 className="text-lg font-bold text-slate-900 mb-1">
                    Dispensed by Unit Type
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">
                    Breakdown by medicine unit (Tablets, Boxes, etc.)
                  </p>
                  {dispensingStats.unitTypeBreakdown.length > 0 ? (
                    <div className="flex flex-col sm:flex-row items-center gap-4 flex-1">
                      <div className="w-full sm:w-[180px] flex-shrink-0">
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie
                              data={dispensingStats.unitTypeBreakdown.filter(
                                (d) => d.quantity > 0,
                              )}
                              cx="50%" cy="50%"
                              innerRadius="55%" outerRadius="80%"
                              paddingAngle={3}
                              dataKey="quantity"
                              labelLine={false}
                            >
                              {dispensingStats.unitTypeBreakdown.map((_, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS[index % COLORS.length]}
                                  stroke="white"
                                  strokeWidth={2}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#fff',
                                border:          '1px solid #e5e7eb',
                                borderRadius:    '8px',
                                fontSize:        '12px',
                              }}
                              formatter={(
                                value: unknown,
                                _name: unknown,
                                props: { payload?: { percentage: number; type: string } },
                              ): [string, string] => [
                                `${value} (${(props.payload?.percentage ?? 0).toFixed(1)}%)`,
                                props.payload?.type ?? '',
                              ]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 w-full flex flex-col gap-2 min-w-0">
                        {dispensingStats.unitTypeBreakdown.map((d, index) => (
                          <div
                            key={d.type}
                            className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 min-w-0"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="text-sm text-slate-700 font-medium flex-1 truncate">
                              {d.type}
                            </span>
                            <div className="flex flex-col items-end gap-0.5 flex-shrink-0 w-24">
                              <div className="flex items-center justify-between w-full gap-1">
                                <span className="text-[10px] text-slate-400">
                                  {d.percentage.toFixed(1)}%
                                </span>
                                <span className="text-xs font-bold text-slate-800">
                                  {d.quantity}
                                </span>
                              </div>
                              <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width:           `${d.percentage}%`,
                                    backgroundColor: COLORS[index % COLORS.length],
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                      No data available
                    </div>
                  )}
                </div>

                {/* Activity Summary */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-1">
                    Dispensing Activity
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">
                    Key activity metrics for the selected period
                  </p>
                  <div className="space-y-3">
                    {[
                      {
                        label: 'Total Dispensings',
                        sub:   'Number of patient visits',
                        value: dispensingStats.totalDispensings,
                        color: 'blue',
                      },
                      {
                        label: 'Unique Patients',
                        sub:   'Distinct patients served',
                        value: dispensingStats.uniquePatients,
                        color: 'emerald',
                      },
                      {
                        label: 'Stock Restocks',
                        sub:   `${dispensingStats.adjustmentCount} restocks · ${dispensingStats.totalStockAdded} units added`,
                        value: dispensingStats.adjustmentCount,
                        color: 'amber',
                      },
                      {
                        label: 'Unit Types Used',
                        sub:   'Distinct medicine unit types',
                        value: dispensingStats.unitTypeBreakdown.length,
                        color: 'violet',
                      },
                    ].map(({ label, sub, value, color }) => (
                      <div
                        key={label}
                        className={`flex items-center justify-between p-4 bg-${color}-50 rounded-xl border border-${color}-100`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{label}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
                        </div>
                        <p className={`text-3xl font-bold text-${color}-600`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Transaction Details Section */}
              <TransactionDetailsPanel
                transactions={transactions}
                medicines={medicines}
                txFilterMode={txFilterMode}
                setTxFilterMode={setTxFilterMode}
                txMonth={txMonth}
                setTxMonth={setTxMonth}
                txQuarter={txQuarter}
                setTxQuarter={setTxQuarter}
                txYear={txYear}
                setTxYear={setTxYear}
                years={years}
              />
            </div>
          )}

          {/* ── SALES TAB ───────────────────────────────────────────────────── */}
          {activeTab === 'sales' && (
            <SalesContent
              isLoadingSales={isLoadingSales}
              salesDateRange={salesDateRange}
              setSalesDateRange={setSalesDateRange}
              dailySalesSummaries={dailySalesSummaries}
              medicineSalesStats={medicineSalesStats}
              salesOverallStats={salesOverallStats}
            />
          )}

        </div>
      </div>
    </>
  );
}