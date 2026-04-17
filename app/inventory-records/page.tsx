'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useSidebar } from '@/lib/contexts/sidebar-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, onValue } from 'firebase/database';
import Link from 'next/link';

// ─── Interfaces ────────────────────────────────────────────────────────────────
interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

interface Medicine {
  id: string;
  name?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  originalUnit?: string;
  brandModel?: string;
  brand?: string;
  countryOfOrigin?: string;
  unitCost?: number;
  totalCost?: number;
  containerQuantity?: number;
  expirationDate?: string;
  batches?: Record<string, MedicineBatch>; // FIFO batches with individual expirations
  createdAt: string;
  strength?: string;
  category?: string;
  stockPerUnit?: number;
  stockPerPieces?: number;
}

type MedicineRecord = Omit<Medicine, 'id'>;

// ─── Helpers ───────────────────────────────────────────────────────────────────
function getDisplayName(m: Medicine): string        { return m.name || '—'; }
function getDisplayDescription(m: Medicine): string { return m.description || '—'; }

// FIX: prefer originalUnit so the table always shows what was ordered
// (e.g. "Boxes"), not the converted tracking unit (e.g. "Tablets").
function getDisplayUnit(m: Medicine): string {
  return m.originalUnit || m.unit || m.category || '—';
}

function getDisplayBrand(m: Medicine): string       { return m.brandModel || m.brand || '—'; }
function getDisplayCountry(m: Medicine): string     { return m.countryOfOrigin || '—'; }
function getDisplayQuantity(m: Medicine): number {
  return m.containerQuantity ?? m.quantity ?? 0;
}
function getDisplayUnitCost(m: Medicine): number | null {
  return m.unitCost !== undefined ? m.unitCost : null;
}

// Total cost = current container quantity × unit cost.
// We deliberately recalculate from containerQuantity × unitCost rather than
// reading the stored `totalCost` field, because `totalCost` in the DB is a
// cumulative purchase ledger value that grows with every stock adjustment and
// is never reduced when stock is dispensed/sold. Using it here would make the
// grand total overstate the value of stock actually on hand.
function getDisplayTotalCost(m: Medicine): number | null {
  const containerQty = m.containerQuantity ?? m.quantity ?? 0;
  const cost = getDisplayUnitCost(m);
  if (cost !== null && cost > 0 && containerQty >= 0) return containerQty * cost;
  // Fall back to stored totalCost only when unitCost is absent (legacy records
  // that were saved without a unit cost but do have a totalCost snapshot).
  if (cost === null && m.totalCost != null) return m.totalCost;
  return null;
}

const formatPeso = (value: number) =>
  value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt = (value: number): string => {
  if (Number.isInteger(value)) return value.toLocaleString();
  return parseFloat(value.toFixed(2)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

// ─── Unit badge ────────────────────────────────────────────────────────────────
const UNIT_BADGE: Record<string, string> = {
  Tablets:  'bg-blue-50 text-blue-700 border border-blue-200',
  Nebules:  'bg-violet-50 text-violet-700 border border-violet-200',
  Capsule:  'bg-teal-50 text-teal-700 border border-teal-200',
  Bottles:  'bg-amber-50 text-amber-700 border border-amber-200',
  Boxes:    'bg-slate-100 text-slate-700 border border-slate-200',
  Tubes:    'bg-pink-50 text-pink-700 border border-pink-200',
  Sachets:  'bg-lime-50 text-lime-700 border border-lime-200',
  Ampules:  'bg-cyan-50 text-cyan-700 border border-cyan-200',
  Vials:    'bg-indigo-50 text-indigo-700 border border-indigo-200',
};
function unitBadgeCls(unit: string): string {
  return UNIT_BADGE[unit] ?? 'bg-slate-100 text-slate-600 border border-slate-200';
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function InventoryRecordsPage() {
  const { user, loading } = useAuth();
  const { isCollapsed }   = useSidebar();
  const router = useRouter();

  const [medicines,          setMedicines]          = useState<Medicine[]>([]);
  const [isLoadingMedicines, setIsLoadingMedicines] = useState(true);
  const [searchTerm,         setSearchTerm]         = useState('');
  const [filterUnit,         setFilterUnit]         = useState('');

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      const medicinesPath = getUserPath(user.uid, 'medicines');
      const unsubscribe = onValue(ref(database, medicinesPath), (snapshot) => {
        const data = snapshot.val();
        const list: Medicine[] = data
          ? Object.entries(data as Record<string, MedicineRecord>).map(([id, v]) => ({ id, ...v }))
          : [];
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMedicines(list);
        setIsLoadingMedicines(false);
      });
      return () => unsubscribe();
    }
  }, [user]);

  // Unit filter options derived from originalUnit (same field used in the table)
  const unitTypes = Array.from(
    new Set(medicines.map((m) => getDisplayUnit(m)).filter((u) => u !== '—'))
  ).sort();

  const filtered = medicines.filter((m) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      getDisplayName(m).toLowerCase().includes(q) ||
      getDisplayDescription(m).toLowerCase().includes(q) ||
      getDisplayBrand(m).toLowerCase().includes(q) ||
      getDisplayCountry(m).toLowerCase().includes(q) ||
      getDisplayUnit(m).toLowerCase().includes(q);
    const matchesUnit = !filterUnit || getDisplayUnit(m) === filterUnit;
    return matchesSearch && matchesUnit;
  });

  const grandTotalCost = filtered.reduce((sum, m) => sum + (getDisplayTotalCost(m) ?? 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-400 text-sm tracking-wide">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 transition-all duration-300 ml-0">
      <style jsx global>{`
        .surface-card-rec {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
        }
        .surface-card-rec-hover {
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .surface-card-rec-hover:hover {
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
          border-color: #cbd5e1;
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        {/* ── Header ── */}
        <div className="mb-8 sm:mb-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mb-2">
              Inventory Records
            </h1>
            <p className="text-sm sm:text-base text-slate-500">
              Complete list of all medicines added to the system
            </p>
          </div>
          <Link
            href="/medicines/add-medicine"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-700 text-white font-semibold rounded-xl transition-colors text-sm shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Medicines
          </Link>
        </div>

        {/* ── Toolbar ── */}
        <div className="surface-card-rec p-4 sm:p-5 mb-6">
          <div className="flex flex-wrap items-end gap-2 sm:gap-3">

            {/* Search */}
            <div className="flex-1 min-w-44 max-w-72">
              <label className="block text-xs sm:text-sm font-semibold text-slate-900 mb-2">Search</label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1110.5 3a7.5 7.5 0 016.15 13.65z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name, brand, origin…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-slate-900 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm text-sm"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Unit Type */}
            <div className="basis-28 sm:basis-36 shrink-0">
              <label className="block text-xs sm:text-sm font-semibold text-slate-900 mb-2">Unit Type</label>
              <select
                value={filterUnit}
                onChange={(e) => setFilterUnit(e.target.value)}
                className="w-full px-3 py-2 text-slate-900 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm text-sm"
              >
                <option value="">All</option>
                {unitTypes.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0 flex-wrap">
              {/* Stats */}
              <div className="hidden sm:flex items-center gap-3 text-sm text-slate-500">
                <span>
                  <span className="font-semibold text-slate-800">{filtered.length}</span> items
                </span>
                <span className="w-px h-4 bg-slate-200" />
                <span>
                  Total <span className="font-semibold text-slate-800">₱{formatPeso(grandTotalCost)}</span>
                </span>
              </div>

              {/* Clear */}
              <button
                onClick={() => { setSearchTerm(''); setFilterUnit(''); }}
                className="px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Mobile stats row */}
          <div className="flex sm:hidden items-center gap-3 text-sm text-slate-500 mt-3 pt-3 border-t border-slate-100">
            <span><span className="font-semibold text-slate-800">{filtered.length}</span> items</span>
            <span className="w-px h-4 bg-slate-200" />
            <span>Total <span className="font-semibold text-slate-800">₱{formatPeso(grandTotalCost)}</span></span>
          </div>
        </div>

        {/* ── Loading ── */}
        {isLoadingMedicines ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-500 text-sm">Loading records…</p>
          </div>

        /* ── Empty ── */
        ) : filtered.length === 0 ? (
          <div className="surface-card-rec text-center py-16">
            <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-slate-400 font-medium text-sm mb-2">
              {searchTerm || filterUnit ? 'No records match your search.' : 'No inventory records yet.'}
            </p>
            {(searchTerm || filterUnit) ? (
              <button onClick={() => { setSearchTerm(''); setFilterUnit(''); }} className="text-xs text-blue-600 hover:underline font-medium">
                Clear filters
              </button>
            ) : (
              <Link href="/medicines/add-medicine" className="text-xs text-slate-500 underline underline-offset-2">
                Add your first medicine →
              </Link>
            )}
          </div>

        ) : (
          <>
            {/* ── Table View ── */}
            <div className="surface-card-rec overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-10">#</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Item Name</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-[180px]">Description</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Strength</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Brand / Model</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Origin</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit Cost</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Cost</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((medicine, index) => {
                      // originalUnit is used for the Unit column display
                      const unit      = getDisplayUnit(medicine);
                      // Qty shows the container/ordered quantity, not the converted pieces
                      const qty       = getDisplayQuantity(medicine);
                      const brand     = getDisplayBrand(medicine);
                      const country   = getDisplayCountry(medicine);
                      const unitCost  = getDisplayUnitCost(medicine);
                      const totalCost = getDisplayTotalCost(medicine);

                      return (
                        <tr key={medicine.id} className="hover:bg-slate-50/70 transition-colors">

                          {/* # */}
                          <td className="px-3 py-2.5 text-center">
                            <span className="text-xs font-mono text-slate-400">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                          </td>

                          {/* Item Name */}
                          <td className="px-3 py-2.5 text-left max-w-[160px]">
                            <span className="text-xs font-semibold text-slate-900 truncate block" title={getDisplayName(medicine)}>
                              {getDisplayName(medicine)
                                .replace(/\s*\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|u\/ml|units?)\b/gi, '')
                                .trim() || '—'}
                            </span>
                          </td>

                          {/* Description */}
                          <td className="px-3 py-2.5 text-left max-w-[180px]">
                            {getDisplayDescription(medicine) !== '—' ? (
                              <span
                                className="text-xs text-slate-600 truncate block w-full"
                                title={getDisplayDescription(medicine)}
                              >
                                {getDisplayDescription(medicine)}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
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

                          {/* Unit — shows originalUnit (e.g. "Boxes"), not converted unit */}
                          <td className="px-3 py-2.5 text-left">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold inline-block whitespace-nowrap ${unitBadgeCls(unit)}`}>
                              {unit}
                            </span>
                          </td>

                          {/* Quantity — shows container qty (e.g. 10 Boxes), not piece count */}
                          <td className="px-3 py-2.5 text-left">
                            <span className="text-xs font-bold font-mono text-slate-900">
                              {fmt(qty)}
                            </span>
                          </td>

                          {/* Brand / Model */}
                          <td className="px-3 py-2.5 text-left max-w-[120px]">
                            <span className="text-xs text-slate-600 truncate block" title={brand}>
                              {brand}
                            </span>
                          </td>

                          {/* Country of Origin */}
                          <td className="px-3 py-2.5 text-left">
                            <span className="text-xs text-slate-600 whitespace-nowrap">
                              {country}
                            </span>
                          </td>

                          {/* Unit Cost */}
                          <td className="px-3 py-2.5 text-left">
                            {unitCost !== null ? (
                              <span className="text-xs font-mono text-slate-700 whitespace-nowrap">
                                ₱{formatPeso(unitCost)}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Total Cost */}
                          <td className="px-3 py-2.5 text-left">
                            {totalCost !== null ? (
                              <span className="text-xs font-bold font-mono text-slate-900 whitespace-nowrap">
                                ₱{formatPeso(totalCost)}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Grand total footer */}
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td
                        colSpan={9}
                        className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500"
                      >
                        Grand Total Cost
                      </td>
                      <td className="px-3 py-3 text-left">
                        <span className="text-sm font-bold font-mono text-slate-900 whitespace-nowrap">
                          ₱{formatPeso(grandTotalCost)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Table footer row */}
              <div className="px-4 py-2.5 border-t border-slate-100 bg-white flex items-center justify-between rounded-b-xl">
                <p className="text-[11px] text-slate-400">
                  {filtered.length !== medicines.length
                    ? `${filtered.length} of ${medicines.length} records`
                    : `${filtered.length} ${filtered.length === 1 ? 'record' : 'records'}`}
                </p>
                {(searchTerm || filterUnit) && (
                  <button
                    onClick={() => { setSearchTerm(''); setFilterUnit(''); }}
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline underline-offset-2"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Summary Cards ── */}
        {!isLoadingMedicines && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mt-8 sm:mt-12">
            {[
              {
                label: 'Total Items',
                value: String(filtered.length),
                sub: 'medicines',
                borderCls: '',
                textCls: 'text-slate-600',
                numCls: 'text-slate-900 text-2xl sm:text-3xl',
              },
              {
                label: 'With Unit Cost',
                value: String(filtered.filter(m => getDisplayUnitCost(m) !== null).length),
                sub: 'have unit cost',
                borderCls: 'border-blue-200',
                textCls: 'text-blue-700',
                numCls: 'text-blue-600 text-2xl sm:text-3xl',
              },
              {
                label: 'Grand Total',
                value: `₱${formatPeso(grandTotalCost)}`,
                sub: 'total inventory value',
                borderCls: 'border-emerald-200',
                textCls: 'text-emerald-700',
                numCls: 'text-emerald-600 text-lg sm:text-xl',
              },
              {
                label: 'Unit Types',
                value: String(unitTypes.length),
                sub: 'distinct units',
                borderCls: 'border-slate-200',
                textCls: 'text-slate-600',
                numCls: 'text-slate-800 text-2xl sm:text-3xl',
              },
            ].map(({ label, value, sub, borderCls, textCls, numCls }) => (
              <div key={label} className={`surface-card-rec surface-card-rec-hover p-4 sm:p-5 transition-all border ${borderCls}`}>
                <p className={`text-xs sm:text-sm font-medium mb-1 ${textCls}`}>{label}</p>
                <p className={`font-bold ${numCls}`}>{value}</p>
                <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}