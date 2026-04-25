'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, onValue } from 'firebase/database';

// ─── Interfaces ────────────────────────────────────────────────────────────────
interface Medicine {
  id: string;
  name?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  brandModel?: string;
  countryOfOrigin?: string;
  unitCost?: number;
  totalCost?: number;
  category?: string;
  brand?: string;
  image?: string;
  stockPerUnit?: number;
  stockPerPieces?: number;
  strength?: string;
  minStock?: number;
  expirationDate?: string;
  prescriptionRequired?: boolean;
  createdAt: string;
}

type MedicineRecord = Omit<Medicine, 'id'>;

// ─── Schema helpers ────────────────────────────────────────────────────────────
function getDisplayName(m: Medicine): string        { return m.name || '—'; }
function getDisplayDescription(m: Medicine): string { return m.description || '—'; }
function getDisplayBrand(m: Medicine): string       { return m.brandModel || m.brand || '—'; }
function getDisplayUnit(m: Medicine): string        { return m.unit || m.category || '—'; }
function getEffectiveStock(m: Medicine): number     { return m.quantity ?? 0; }
function getMinStock(m: Medicine): number           { return m.minStock ?? 0; }

// ─── Status logic ──────────────────────────────────────────────────────────────
type FieldStatus = 'out' | 'expired' | 'urgent' | 'expiring' | 'low' | 'in';

function getMedicineStatus(medicine: Medicine): { label: string; variant: FieldStatus } {
  const stock    = getEffectiveStock(medicine);
  const minStock = getMinStock(medicine);
  const exp = medicine.expirationDate ? new Date(medicine.expirationDate) : null;
  const now = new Date();

  if (stock === 0)      return { label: 'Out of Stock',  variant: 'out' };
  if (exp && exp < now) return { label: 'Expired',       variant: 'expired' };

  const isLowStock = minStock > 0 && stock <= minStock;
  let isExpiringSoon = false;
  if (exp) {
    const days = Math.floor((exp.getTime() - now.getTime()) / 86400000);
    if (days <= 30) isExpiringSoon = true;
  }

  if (isLowStock && isExpiringSoon) return { label: 'Urgent Alert',  variant: 'urgent' };
  if (isExpiringSoon) return { label: 'Expiring Soon', variant: 'expiring' };
  if (isLowStock)     return { label: 'Low Stock',     variant: 'low' };

  return { label: 'In Stock', variant: 'in' };
}

interface BadgeProps { label: string; cls: string }
function fieldBadge(variant: FieldStatus, label: string): BadgeProps {
  switch (variant) {
    case 'out':      return { label, cls: 'bg-red-100 text-red-700' };
    case 'expired':  return { label, cls: 'bg-black text-white' };
    case 'urgent':   return { label, cls: 'bg-red-600 text-white animate-pulse font-black' };
    case 'expiring': return { label, cls: 'bg-orange-100 text-orange-700' };
    case 'low':      return { label, cls: 'bg-yellow-100 text-yellow-700' };
    case 'in':       return { label, cls: 'bg-green-100 text-green-700' };
  }
}

const UNIT_BADGE: Record<string, string> = {
  Tablets: 'bg-blue-50 text-blue-700 border border-blue-200',
  Nebules: 'bg-violet-50 text-violet-700 border border-violet-200',
  Capsule: 'bg-teal-50 text-teal-700 border border-teal-200',
  Bottles: 'bg-amber-50 text-amber-700 border border-amber-200',
  Boxes:   'bg-slate-100 text-slate-700 border border-slate-200',
  Tubes:   'bg-pink-50 text-pink-700 border border-pink-200',
  Sachets: 'bg-lime-50 text-lime-700 border border-lime-200',
  Ampules: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
  Vials:   'bg-indigo-50 text-indigo-700 border border-indigo-200',
};
function unitBadgeCls(unit: string): string {
  return UNIT_BADGE[unit] ?? 'bg-slate-100 text-slate-600 border border-slate-200';
}

type StockFilter = 'all' | 'in' | 'low' | 'expiring' | 'expired' | 'out';

function matchesStockFilter(medicine: Medicine, filter: StockFilter): boolean {
  if (filter === 'all') return true;
  return getMedicineStatus(medicine).variant === filter;
}

interface SummaryCounts { inStock: number; low: number; expiring: number; expired: number; out: number; }

function computeSummaryCounts(medicines: Medicine[]): SummaryCounts {
  let inStock = 0, low = 0, expiring = 0, expired = 0, out = 0;
  for (const m of medicines) {
    const st = getMedicineStatus(m).variant;
    if      (st === 'in')       inStock++;
    else if (st === 'low')      low++;
    else if (st === 'expiring') expiring++;
    else if (st === 'expired')  expired++;
    else if (st === 'out')      out++;
  }
  return { inStock, low, expiring, expired, out };
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const fmt = (value: number): string => {
  if (Number.isInteger(value)) return value.toLocaleString();
  return parseFloat(value.toFixed(2)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

// ─── Scroll threshold ──────────────────────────────────────────────────────────
// Each row ≈ 46px; 10 rows = 460px + 44px thead = 504px total cap
const TABLE_SCROLL_THRESHOLD = 10;
const TABLE_BODY_MAX_HEIGHT   = 460; // px — tbody only; thead sticks above via CSS

// ─── Component ─────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [medicines,          setMedicines]          = useState<Medicine[]>([]);
  const [isLoadingMedicines, setIsLoadingMedicines] = useState(true);

  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [searchTerm,  setSearchTerm]  = useState(initialParams.get('q') || '');
  const [filterUnit,  setFilterUnit]  = useState(initialParams.get('category') || '');
  const [stockStatus, setStockStatus] = useState<StockFilter>(
    ((): StockFilter => {
      const s = initialParams.get('stock') || 'all';
      return (['all', 'in', 'low', 'expiring', 'expired', 'out'] as StockFilter[]).includes(s as StockFilter)
        ? (s as StockFilter) : 'all';
    })()
  );
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const [highlightId, setHighlightId] = useState<string | null>(
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('highlight') : null
  );
  const highlightRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(timer);
  }, [highlightId]);

  useEffect(() => {
    if (!highlightId || isLoadingMedicines) return;
    const el = highlightRefs.current[highlightId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, isLoadingMedicines]);

  useEffect(() => { if (!loading && !user) router.push('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      const medicinesPath = getUserPath(user.uid, 'medicines');
      const unsubscribe = onValue(ref(database, medicinesPath), (snapshot) => {
        const data = snapshot.val();
        setMedicines(data
          ? Object.entries(data as Record<string, MedicineRecord>).map(([id, v]) => ({ id, ...v }))
          : []);
        setIsLoadingMedicines(false);
      });
      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm)  params.set('q', searchTerm);
    if (filterUnit)  params.set('category', filterUnit);
    if (stockStatus && stockStatus !== 'all') params.set('stock', stockStatus);
    if (highlightId) params.set('highlight', highlightId);
    const qs = params.toString();
    router.replace(`/inventory${qs ? `?${qs}` : ''}`);
  }, [searchTerm, filterUnit, stockStatus, highlightId, router]);

  const unitTypes = Array.from(new Set(medicines.map((m) => getDisplayUnit(m)).filter((u) => u !== '—'))).sort();

  const filteredMedicines = medicines.filter((medicine) => {
    const name  = getDisplayName(medicine).toLowerCase();
    const desc  = getDisplayDescription(medicine).toLowerCase();
    const brand = getDisplayBrand(medicine).toLowerCase();
    const unit  = getDisplayUnit(medicine).toLowerCase();
    const q     = searchTerm.toLowerCase();
    const matchesSearch = name.includes(q) || desc.includes(q) || brand.includes(q) || unit.includes(q);
    const matchesUnit   = !filterUnit || getDisplayUnit(medicine) === filterUnit;
    return matchesSearch && matchesUnit && matchesStockFilter(medicine, stockStatus);
  });

  const summary = computeSummaryCounts(medicines);

  // Whether the desktop table body should scroll
  const tableScrollable = filteredMedicines.length > TABLE_SCROLL_THRESHOLD;

  const getHighlightRowCls  = (id: string) => highlightId === id ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset animate-pulse-once' : '';
  const getHighlightCardCls = (id: string) => highlightId === id ? 'ring-2 ring-blue-400 bg-blue-50 animate-pulse-once' : '';

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
      <style>{`
        @keyframes pulseOnce {
          0%   { box-shadow:0 0 0 0 rgba(59,130,246,0.5); }
          50%  { box-shadow:0 0 0 8px rgba(59,130,246,0); }
          100% { box-shadow:0 0 0 0 rgba(59,130,246,0); }
        }
        .animate-pulse-once { animation:pulseOnce 1.2s ease-out 3; }

        /*
         * Sticky-header technique for the inventory table scroll container.
         * We cap the wrapper height and let it scroll vertically; thead cells
         * are position:sticky so they stay visible as rows scroll past.
         * box-shadow replaces the border that disappears from normal flow.
         */
        .inv-tbl-wrap {
          overflow-x: auto;
          overflow-y: auto;
        }
        .inv-tbl-wrap thead th {
          position: sticky;
          top: 0;
          z-index: 10;
          background: #f8fafc; /* bg-slate-50 */
          /* Restore the bottom border that sticky removes */
          box-shadow: inset 0 -1px 0 rgba(226,232,240,0.8);
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        {/* ── Header ── */}
        <div className="mb-8 sm:mb-10">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mb-2">Inventory</h1>
          <p className="text-sm sm:text-base text-slate-500">Monitor stock levels and expiration dates</p>
          {highlightId && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-semibold text-blue-700">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse inline-block" />
              Highlighted medicine found — scroll to see it
            </div>
          )}
        </div>

        {/* ── Toolbar ── */}
        <div className="surface-card p-4 sm:p-5 mb-8 rounded-xl">
          <div className="flex flex-wrap items-end gap-2 sm:gap-3">

            {/* Search */}
            <div className="flex-1 min-w-44 max-w-72">
              <label className="block text-xs sm:text-sm font-semibold text-slate-900 mb-2">Search</label>
              <input type="text" placeholder="Search by name, description, brand..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full max-w-xs px-3 py-2 text-slate-900 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm" />
            </div>

            {/* Unit Type */}
            <div className="basis-28 sm:basis-36 shrink-0">
              <label className="block text-xs sm:text-sm font-semibold text-slate-900 mb-2">Unit Type</label>
              <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}
                className="w-full px-3 py-2 text-slate-900 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm">
                <option value="">All</option>
                {unitTypes.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            {/* Stock Status */}
            <div className="basis-auto shrink-0">
              <label className="block text-xs sm:text-sm font-semibold text-slate-900 mb-2">Stock Status</label>
              <div className="md:hidden">
                <select value={stockStatus} onChange={(e) => setStockStatus(e.target.value as StockFilter)}
                  className="px-3 py-2 text-slate-900 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm">
                  <option value="all">All</option>
                  <option value="in">In Stock</option>
                  <option value="low">Low Stock</option>
                  <option value="expiring">Expiring Soon</option>
                  <option value="expired">Expired</option>
                  <option value="out">Out of Stock</option>
                </select>
              </div>
              <div className="hidden md:flex flex-wrap gap-1">
                {[
                  { key: 'all', label: 'All' }, { key: 'in', label: 'In Stock' }, { key: 'low', label: 'Low' },
                  { key: 'expiring', label: 'Expiring' }, { key: 'expired', label: 'Expired' }, { key: 'out', label: 'Out' },
                ].map((opt) => (
                  <button key={opt.key} type="button" onClick={() => setStockStatus(opt.key as StockFilter)}
                    className={`px-2.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border transition-colors ${
                      stockStatus === opt.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <button onClick={() => { setSearchTerm(''); setFilterUnit(''); setStockStatus('all'); setHighlightId(null); }}
                className="px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                Clear
              </button>
              <div className="hidden md:flex items-center border border-slate-200 rounded-lg overflow-hidden">
                <button onClick={() => setViewMode('table')} className={`px-2.5 py-1.5 text-xs font-semibold ${viewMode === 'table' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}>Table</button>
                <button onClick={() => setViewMode('grid')}  className={`px-2.5 py-1.5 text-xs font-semibold ${viewMode === 'grid'  ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}>Grid</button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Loading / Empty ── */}
        {isLoadingMedicines ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading inventory...</p>
          </div>
        ) : filteredMedicines.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No medicines found in inventory</p>
          </div>
        ) : (
          <>
            {/* ── Desktop Table View ─────────────────────────────────────────── */}
            {viewMode === 'table' && (
              <div className="hidden md:block w-full surface-card rounded-xl overflow-hidden">

                {/*
                 * ── Scroll wrapper ────────────────────────────────────────────
                 * Always overflow-x-auto for wide tables on smaller desktops.
                 * When rows > TABLE_SCROLL_THRESHOLD we also cap the height and
                 * enable vertical scroll. thead sticks via .inv-tbl-wrap thead th.
                 */}
                <div
                  className="inv-tbl-wrap"
                  style={tableScrollable ? { maxHeight: `${TABLE_BODY_MAX_HEIGHT + 44}px` } : {}}
                >
                  <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <thead className="bg-slate-50/70 border-b border-slate-200/80">
                      <tr>
                        {['Name', 'Item Description', 'Brand / Model', 'Unit', 'Strength', 'Quantity', 'Min Stock', 'Status', 'Expiry Date'].map((h) => (
                          <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200/80">
                      {filteredMedicines.map((medicine) => {
                        const status   = getMedicineStatus(medicine);
                        const badge    = fieldBadge(status.variant, status.label);
                        const stock    = getEffectiveStock(medicine);
                        const minStock = getMinStock(medicine);
                        const unit     = getDisplayUnit(medicine);
                        const rowTint  =
                          status.variant === 'out'      ? 'bg-red-50/40' :
                          status.variant === 'expired'  ? 'bg-gray-50/60' :
                          status.variant === 'expiring' ? 'bg-orange-50/40' :
                          status.variant === 'low'      ? 'bg-yellow-50/40' : '';

                        return (
                          <tr key={medicine.id}
                            ref={(el) => { highlightRefs.current[medicine.id] = el; }}
                            className={`hover:bg-slate-50/70 transition-colors ${rowTint} ${getHighlightRowCls(medicine.id)}`}>

                            {/* Name */}
                            <td className="px-3 py-2.5 text-left">
                              <div className="flex items-center gap-2">
                                {highlightId === medicine.id && (
                                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 animate-pulse" />
                                )}
                                <span className="text-xs font-semibold text-slate-900 truncate max-w-35">
                                  {getDisplayName(medicine)}
                                </span>
                                {medicine.prescriptionRequired && (
                                  <span className="shrink-0 text-[9px] font-bold text-white bg-red-600 px-1 py-0.5 rounded">Rx</span>
                                )}
                              </div>
                            </td>

                            {/* Item Description */}
                            <td className="px-3 py-2.5 text-left max-w-45">
                              <span className="text-xs text-slate-600 truncate block w-full" title={getDisplayDescription(medicine)}>
                                {getDisplayDescription(medicine)}
                              </span>
                            </td>

                            {/* Brand / Model */}
                            <td className="px-3 py-2.5 text-left max-w-30">
                              <span className="text-xs text-slate-600 truncate block" title={getDisplayBrand(medicine)}>
                                {getDisplayBrand(medicine)}
                              </span>
                            </td>

                            {/* Unit */}
                            <td className="px-3 py-2.5 text-left">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold inline-block whitespace-nowrap ${unitBadgeCls(unit)}`}>
                                {unit}
                              </span>
                            </td>

                            {/* Strength */}
                            <td className="px-3 py-2.5 text-left">
                              {medicine.strength ? (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200 inline-block whitespace-nowrap">
                                  {medicine.strength}
                                </span>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>

                            {/* Quantity */}
                            <td className="px-3 py-2.5 text-left">
                              <span className={`text-xs font-bold font-mono ${status.variant === 'out' ? 'text-red-400' : 'text-slate-900'}`}>
                                {status.variant === 'out' ? '—' : fmt(stock)}
                              </span>
                            </td>

                            {/* Min Stock */}
                            <td className="px-3 py-2.5 text-left">
                              <span className="text-xs font-medium text-slate-700 font-mono">
                                {minStock > 0 ? fmt(minStock) : <span className="text-slate-300">—</span>}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-3 py-2.5 text-left">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold inline-block whitespace-nowrap ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </td>

                            {/* Expiry Date */}
                            <td className="px-3 py-2.5 text-left">
                              <span className="text-xs text-slate-600 whitespace-nowrap">
                                {medicine.expirationDate
                                  ? parseLocalDate(medicine.expirationDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                                  : <span className="text-slate-300">N/A</span>}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Table footer: row count + scroll hint ── */}
                <div className="px-4 py-2.5 border-t border-slate-100 bg-white flex items-center justify-between rounded-b-xl">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-slate-400">
                      {filteredMedicines.length !== medicines.length
                        ? `${filteredMedicines.length} of ${medicines.length} records`
                        : `${filteredMedicines.length} ${filteredMedicines.length === 1 ? 'record' : 'records'}`}
                    </p>
                    {/* Scroll hint — only shown when the table is in scroll mode */}
                    {tableScrollable && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-semibold">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                        scroll to see all
                      </span>
                    )}
                  </div>
                  {(searchTerm || filterUnit || stockStatus !== 'all') && (
                    <button
                      onClick={() => { setSearchTerm(''); setFilterUnit(''); setStockStatus('all'); setHighlightId(null); }}
                      className="text-[11px] text-slate-500 hover:text-slate-800 underline underline-offset-2"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Desktop Grid View ──────────────────────────────────────────── */}
            {viewMode === 'grid' && (
              <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMedicines.map((medicine) => {
                  const status   = getMedicineStatus(medicine);
                  const badge    = fieldBadge(status.variant, status.label);
                  const stock    = getEffectiveStock(medicine);
                  const minStock = getMinStock(medicine);
                  const unit     = getDisplayUnit(medicine);
                  const barPct   = minStock > 0 ? Math.min((stock / minStock) * 100, 100) : null;
                  const barColor = barPct === null ? '' : stock <= minStock ? 'bg-red-400' : stock <= minStock * 1.5 ? 'bg-yellow-400' : 'bg-emerald-400';

                  return (
                    <div key={medicine.id}
                      ref={(el) => { highlightRefs.current[medicine.id] = el; }}
                      className={`surface-card surface-card-hover p-5 rounded-xl transition-all ${getHighlightCardCls(medicine.id)}`}>

                      <div className="flex items-start justify-between mb-1 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {highlightId === medicine.id && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 animate-pulse" />}
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-900 truncate">{getDisplayName(medicine)}</h3>
                            <p className="text-xs text-slate-500 truncate">{getDisplayDescription(medicine)}</p>
                            <p className="text-xs text-slate-600 truncate mt-0.5">{getDisplayBrand(medicine)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {medicine.prescriptionRequired && (
                            <span className="text-[9px] font-bold text-white bg-red-600 px-1 py-0.5 rounded">Rx</span>
                          )}
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${unitBadgeCls(unit)}`}>{unit}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs mt-3">
                        <div className={`rounded-lg p-2 border ${
                          status.variant === 'out'      ? 'bg-red-50 border-red-200' :
                          status.variant === 'expired'  ? 'bg-gray-50 border-gray-300' :
                          status.variant === 'expiring' ? 'bg-orange-50 border-orange-200' :
                          status.variant === 'low'      ? 'bg-yellow-50 border-yellow-200' :
                          'bg-green-50 border-green-200'
                        }`}>
                          <p className="text-slate-600 mb-1">Quantity</p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className={`font-bold text-sm ${status.variant === 'out' ? 'text-red-400' : 'text-slate-900'}`}>
                              {status.variant === 'out' ? '—' : fmt(stock)}
                            </p>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                          </div>
                          {barPct !== null && (
                            <div className="mt-2">
                              <div className="w-full h-1 bg-white bg-opacity-60 rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-300 ${barColor}`} style={{ width: `${barPct}%` }} />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="rounded-lg p-2 border bg-slate-50 border-slate-200">
                          <p className="text-slate-600 mb-1">Min Stock</p>
                          <p className="font-bold text-sm text-slate-900">
                            {minStock > 0 ? fmt(minStock) : <span className="text-slate-400 font-normal text-xs">Not set</span>}
                          </p>
                        </div>

                        <div className="col-span-2">
                          <p className="text-slate-600 mb-0.5">Expiry Date</p>
                          <p className="font-semibold text-slate-900">
                            {medicine.expirationDate
                              ? parseLocalDate(medicine.expirationDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                              : <span className="text-slate-400 font-normal">Not set</span>}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Mobile Card View ───────────────────────────────────────────── */}
            <div className="md:hidden space-y-3">
              {filteredMedicines.map((medicine) => {
                const status   = getMedicineStatus(medicine);
                const badge    = fieldBadge(status.variant, status.label);
                const stock    = getEffectiveStock(medicine);
                const minStock = getMinStock(medicine);
                const unit     = getDisplayUnit(medicine);

                return (
                  <div key={medicine.id}
                    ref={(el) => { highlightRefs.current[medicine.id] = el; }}
                    className={`surface-card surface-card-hover p-3 transition-all ${getHighlightCardCls(medicine.id)}`}>

                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {highlightId === medicine.id && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 animate-pulse" />}
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 truncate">{getDisplayName(medicine)}</h3>
                          <p className="text-xs text-slate-500 truncate">{getDisplayDescription(medicine)}</p>
                          <p className="text-xs text-slate-600 truncate">{getDisplayBrand(medicine)}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${unitBadgeCls(unit)}`}>{unit}</span>
                      {medicine.prescriptionRequired && (
                        <span className="text-[9px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded">Rx</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className={`rounded-lg p-2 border ${
                        status.variant === 'out'      ? 'bg-red-50 border-red-200' :
                        status.variant === 'expired'  ? 'bg-gray-50 border-gray-300' :
                        status.variant === 'expiring' ? 'bg-orange-50 border-orange-200' :
                        status.variant === 'low'      ? 'bg-yellow-50 border-yellow-200' :
                        'bg-slate-50 border-slate-100'
                      }`}>
                        <p className="text-slate-600 mb-1">Quantity</p>
                        <p className={`font-bold ${status.variant === 'out' ? 'text-red-400' : 'text-slate-900'}`}>
                          {status.variant === 'out' ? '—' : fmt(stock)}
                        </p>
                      </div>
                      <div className="rounded-lg p-2 border bg-slate-50 border-slate-100">
                        <p className="text-slate-600 mb-1">Min Stock</p>
                        <p className="font-bold text-slate-900">
                          {minStock > 0 ? fmt(minStock) : <span className="text-slate-400 font-normal">—</span>}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-slate-600">Expiry Date</p>
                        <p className="font-semibold text-slate-900">
                          {medicine.expirationDate
                            ? parseLocalDate(medicine.expirationDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                            : <span className="text-slate-400 font-normal">Not set</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── Summary Cards ─────────────────────────────────────────────────── */}
        {!isLoadingMedicines && filteredMedicines.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mt-8 sm:mt-12">
            {[
              { label: 'Total',         value: filteredMedicines.length, sub: 'medicines', cls: '' },
              { label: 'In Stock',      value: summary.inStock,          sub: 'items', cls: 'border border-green-200',  textCls: 'text-green-700',  numCls: 'text-green-600' },
              { label: 'Low Stock',     value: summary.low,              sub: 'items', cls: 'border border-yellow-200', textCls: 'text-yellow-700', numCls: 'text-yellow-600' },
              { label: 'Expiring Soon', value: summary.expiring,         sub: 'items', cls: 'border border-orange-200', textCls: 'text-orange-700', numCls: 'text-orange-600' },
              { label: 'Expired',       value: summary.expired,          sub: 'items', cls: 'border border-gray-300',   textCls: 'text-gray-700',   numCls: 'text-gray-800' },
              { label: 'Out of Stock',  value: summary.out,              sub: 'items', cls: 'border border-red-200',    textCls: 'text-red-700',    numCls: 'text-red-600' },
            ].map(({ label, value, sub, cls, textCls, numCls }) => (
              <div key={label} className={`surface-card surface-card-hover p-4 sm:p-5 transition-all ${cls}`}>
                <p className={`text-xs sm:text-sm font-medium mb-1 ${textCls || 'text-slate-600'}`}>{label}</p>
                <p className={`text-2xl sm:text-3xl font-bold ${numCls || 'text-slate-900'}`}>{fmt(value)}</p>
                <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}