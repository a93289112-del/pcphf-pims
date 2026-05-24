'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, AreaChart, Area, PieChart, Pie, Cell, Bar,
} from 'recharts';
import { database, getUserPath } from './firebase';
import { ref, onValue } from 'firebase/database';
import {
  getDateRange,
  getPreviousDateRange,
  QUARTER_MONTHS,
  formatMonth,
  formatQuarter,
  type QuarterType,
} from './filter-utils';

// ─── Types ────────────────────────────────────────────────────────────────────
interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

interface Medicine {
  id: string;
  name?: string;
  baseName?: string;
  brandModel?: string;
  unit?: string;
  category?: string;
  originalUnit?: string;
  brand?: string;
  image?: string;
  description?: string;
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
  createdAt?: string;
  strength?: string;
  strengths?: string[] | null;
  prescriptionRequired?: boolean;
  ageGroup?: string;
}

interface FirebaseTransaction {
  id?: string;
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

interface DetailedTransaction {
  medicineId: string;
  medicineName: string;
  category: string;
  dispensedQty: number;
  posSalesQty: number;
  totalUsed: number;
  stockBefore: number;
  stockDeducted: number;
  stockAfter: number;
}

interface ChartDataPoint {
  period: string;
  dispensedQty: number;
  posSalesQty: number;
  totalUsed: number;
}

interface TopMedicineItem {
  name: string;
  strength?: string;
  usage: number;
  percentage: number;
  stockAfter: number;
  minStock: number;
  dispensed: number;
  sales: number;
  expirationDate?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const CHART_COLORS = {
  dispensed: '#3b82f6',
  dispensedLight: 'rgba(59,130,246,0.15)',
  sales: '#10b981',
  salesLight: 'rgba(16,185,129,0.15)',
  total: '#f59e0b',
  totalLight: 'rgba(245,158,11,0.15)',
  pie: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16'],
};

// ─── Helper: get effective stock from a medicine record ───────────────────────
function getEffectiveStock(m: Medicine): number {
  if (m.quantity !== undefined) return m.quantity;
  return Math.max(m.stockPerUnit ?? 0, m.stockPerPieces ?? 0);
}

// ─── Shared chart defs ────────────────────────────────────────────────────────
const SharedChartDefs = () => (
  <defs>
    <linearGradient id="barDispensed" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={CHART_COLORS.dispensed} stopOpacity={1} />
      <stop offset="100%" stopColor={CHART_COLORS.dispensed} stopOpacity={0.8} />
    </linearGradient>
    <linearGradient id="barSales" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={CHART_COLORS.sales} stopOpacity={1} />
      <stop offset="100%" stopColor={CHART_COLORS.sales} stopOpacity={0.8} />
    </linearGradient>
    <linearGradient id="areaTotal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor={CHART_COLORS.total} stopOpacity={0.4} />
      <stop offset="95%" stopColor={CHART_COLORS.total} stopOpacity={0.05} />
    </linearGradient>
  </defs>
);

interface LegendPayload { value: string; type: string; id: string; color: string; }
const SHARED_LEGEND_PAYLOAD: LegendPayload[] = [
  { value: 'Total Used', type: 'circle', id: 'totalUsed', color: CHART_COLORS.total },
  { value: 'Dispensed', type: 'circle', id: 'dispensedQty', color: CHART_COLORS.dispensed },
  { value: 'POS Sales', type: 'circle', id: 'posSalesQty', color: CHART_COLORS.sales },
];

const SHARED_CHART_PROPS = {
  margin: { top: 10, right: 15, left: 0, bottom: 10 },
  xAxis: { tick: { fill: '#94a3b8', fontSize: 10, fontWeight: 500 }, axisLine: false, tickLine: false, dy: 10 },
  yAxis: { tick: { fill: '#94a3b8', fontSize: 10, fontWeight: 500 }, axisLine: false, tickLine: false, dx: -5 },
  legend: {
    verticalAlign: 'bottom' as const,
    align: 'center' as const,
    height: 36,
    iconType: 'circle' as const,
    iconSize: 10,
    wrapperStyle: {
      fontSize: '11px', fontWeight: 'bold', color: '#64748b',
      paddingTop: '16px', paddingBottom: '4px',
      display: 'flex', justifyContent: 'center', gap: '24px',
    },
    payload: SHARED_LEGEND_PAYLOAD,
  },
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ value: number | string; name: string; color?: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl p-3 shadow-2xl min-w-35">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 pb-1 border-b border-slate-700/50">{label}</p>
      <div className="space-y-1.5">
        {payload.map(p => (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
              <span className="text-[11px] font-medium text-slate-300">{p.name}</span>
            </div>
            <span className="text-xs font-bold text-white">
              {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Metric Card ──────────────────────────────────────────────────────────────
const MetricCard = ({
  label, value, change, changeLabel, isPositive, onClick, accent,
}: {
  label: string; value: number; change?: number; changeLabel?: string;
  isPositive?: boolean; onClick?: () => void; accent?: string;
}) => (
  <div
    className={`surface-card p-4 sm:p-5 transition-all overflow-hidden ${onClick ? 'cursor-pointer hover:shadow-lg' : ''}`}
    onClick={onClick}
    style={accent ? { borderTop: `3px solid ${accent}` } : {}}
  >
    <p className="text-slate-500 text-xs font-medium mb-2 uppercase tracking-wide">{label}</p>
    <p className="text-3xl sm:text-4xl font-black text-slate-900 mb-2">{value.toLocaleString()}</p>
    {change !== undefined && (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${isPositive === undefined ? 'bg-slate-100 text-slate-600'
        : isPositive ? 'bg-green-100 text-green-700'
          : 'bg-red-100 text-red-700'
        }`}>
        {isPositive !== undefined && <span>{isPositive ? '↑' : '↓'}</span>}
        <span>{Math.abs(change).toLocaleString()}</span>
        {changeLabel && <span className="text-slate-500 ml-0.5">{changeLabel}</span>}
      </div>
    )}
    {onClick && <p className="text-xs text-blue-500 mt-2 font-semibold">Click to view details</p>}
  </div>
);

// ─── Data helpers ─────────────────────────────────────────────────────────────
function filterTransactions(txs: FirebaseTransaction[], start: Date, end: Date): FirebaseTransaction[] {
  return txs.filter(tx => {
    const d = new Date(tx.date);
    return d >= start && d <= end;
  });
}

function aggregateByMedicine(transactions: FirebaseTransaction[]) {
  const map = new Map<string, {
    dispensedQty: number; posSalesQty: number; adjustmentsIn: number; adjustmentsOut: number;
    latestNewStock: number; originalStock: number; hasTransactions: boolean;
  }>();

  const sortedAsc = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  sortedAsc.forEach(tx => {
    if (!map.has(tx.medicineId)) {
      map.set(tx.medicineId, {
        dispensedQty: 0, posSalesQty: 0, adjustmentsIn: 0, adjustmentsOut: 0,
        latestNewStock: 0,
        originalStock: tx.previousStock === 0 ? tx.newStock : tx.previousStock,
        hasTransactions: true,
      });
    }
    const entry = map.get(tx.medicineId)!;
    const qty = Math.abs(tx.quantity || 0);

    if (tx.type === 'dispense') {
      entry.dispensedQty += qty;
    } else if (tx.type === 'sale') {
      entry.posSalesQty += qty;
    } else if (tx.type === 'adjustment') {
      // Adjustments: positive = stock added, negative = stock removed
      if (tx.quantity > 0) {
        entry.adjustmentsIn += tx.quantity;
      } else {
        entry.adjustmentsOut += Math.abs(tx.quantity);
      }
    }
    entry.latestNewStock = tx.newStock;
  });

  return map;
}

function buildDetailedTransactions(
  aggregated: ReturnType<typeof aggregateByMedicine>,
  medicinesMap: Map<string, Medicine>,
): DetailedTransaction[] {
  const data: DetailedTransaction[] = [];

  medicinesMap.forEach((medicine, medicineId) => {
    const agg = aggregated.get(medicineId);
    const currentStock = getEffectiveStock(medicine);

    if (!agg) {
      data.push({
        medicineId,
        medicineName: medicine.baseName || medicine.name || '—',
        category: medicine.category || 'Uncategorized',
        dispensedQty: 0, posSalesQty: 0, totalUsed: 0,
        stockBefore: currentStock, stockDeducted: 0, stockAfter: currentStock,
      });
      return;
    }

    // Count all outflows: dispense + sale + adjustments out
    const totalOutflow = agg.dispensedQty + agg.posSalesQty + agg.adjustmentsOut;
    data.push({
      medicineId,
      medicineName: medicine.baseName || medicine.name || '—',
      category: medicine.category || 'Uncategorized',
      dispensedQty: agg.dispensedQty,
      posSalesQty: agg.posSalesQty,
      totalUsed: totalOutflow,
      stockBefore: agg.originalStock,
      stockDeducted: totalOutflow,
      stockAfter: agg.latestNewStock,
    });
  });

  aggregated.forEach((agg, medicineId) => {
    if (!medicinesMap.has(medicineId)) {
      const totalOutflow = agg.dispensedQty + agg.posSalesQty + agg.adjustmentsOut;
      data.push({
        medicineId,
        medicineName: 'Unknown Medicine',
        category: 'Uncategorized',
        dispensedQty: agg.dispensedQty,
        posSalesQty: agg.posSalesQty,
        totalUsed: totalOutflow,
        stockBefore: agg.originalStock,
        stockDeducted: totalOutflow,
        stockAfter: agg.latestNewStock,
      });
    }
  });

  return data;
}

// ─── Monthly Chart Panel ───────────────────────────────────────────────────────
function MonthlyChartPanel({
  filteredByDate, selectedMonth,
}: { filteredByDate: FirebaseTransaction[]; selectedMonth: string }) {
  const [subView, setSubView] = useState<'daily' | 'weekly'>('daily');

  const dailyData = useMemo<ChartDataPoint[]>(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const arr: ChartDataPoint[] = Array.from({ length: daysInMonth }, (_, i) => ({
      period: `${i + 1}`, dispensedQty: 0, posSalesQty: 0, totalUsed: 0,
    }));
    filteredByDate.forEach(tx => {
      const d = new Date(tx.date).getDate() - 1;
      if (d >= 0 && d < arr.length) {
        if (tx.type === 'dispense') arr[d].dispensedQty += Math.abs(tx.quantity);
        else if (tx.type === 'sale') arr[d].posSalesQty += Math.abs(tx.quantity);
        else if (tx.type === 'adjustment' && tx.quantity < 0) arr[d].dispensedQty += Math.abs(tx.quantity);
      }
    });
    return arr.map(d => ({ ...d, totalUsed: d.dispensedQty + d.posSalesQty }));
  }, [filteredByDate, selectedMonth]);

  const weeklyData = useMemo(() => {
    const weeks = [
      { period: 'Week 1', dispensedQty: 0, posSalesQty: 0, totalUsed: 0 },
      { period: 'Week 2', dispensedQty: 0, posSalesQty: 0, totalUsed: 0 },
      { period: 'Week 3', dispensedQty: 0, posSalesQty: 0, totalUsed: 0 },
      { period: 'Week 4+', dispensedQty: 0, posSalesQty: 0, totalUsed: 0 },
    ];
    dailyData.forEach((d, i) => {
      const wk = Math.min(Math.floor(i / 7), 3);
      weeks[wk].dispensedQty += d.dispensedQty;
      weeks[wk].posSalesQty += d.posSalesQty;
    });
    return weeks.map(w => ({ ...w, totalUsed: w.dispensedQty + w.posSalesQty }));
  }, [dailyData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            {formatMonth(selectedMonth)}
          </h4>
          <div className="flex gap-2">
            {(['daily', 'weekly'] as const).map(v => (
              <button key={v} onClick={() => setSubView(v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${subView === v
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-72">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          {subView === 'daily' ? 'Daily usage breakdown' : 'Weekly usage breakdown'}
        </p>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={subView === 'daily' ? dailyData : weeklyData} margin={SHARED_CHART_PROPS.margin}>
            <SharedChartDefs />
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="period" {...SHARED_CHART_PROPS.xAxis} interval={subView === 'daily' ? 4 : 0} />
            <YAxis {...SHARED_CHART_PROPS.yAxis} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Legend {...SHARED_CHART_PROPS.legend} />
            <Area type="monotone" dataKey="totalUsed" stroke={CHART_COLORS.total} fill="url(#areaTotal)"
              name="Total Used" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
            <Bar dataKey="dispensedQty" fill={CHART_COLORS.dispensed} name="Dispensed" radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="posSalesQty" fill={CHART_COLORS.sales} name="POS Sales" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Quarterly Chart Panel ─────────────────────────────────────────────────────
function QuarterlyChartPanel({
  filteredByDate, selectedQuarter, selectedYear,
}: { filteredByDate: FirebaseTransaction[]; selectedQuarter: QuarterType; selectedYear: number }) {

  const monthlyData = useMemo<ChartDataPoint[]>(() => {
    const [startM, endM] = QUARTER_MONTHS[selectedQuarter] || [0, 2];
    const arr: ChartDataPoint[] = [];
    for (let m = startM; m <= endM; m++) {
      arr.push({
        period: new Date(selectedYear, m).toLocaleString('en-US', { month: 'short' }),
        dispensedQty: 0, posSalesQty: 0, totalUsed: 0,
      });
    }
    filteredByDate.forEach(tx => {
      const txM = new Date(tx.date).getMonth();
      const idx = txM - startM;
      if (idx >= 0 && idx < arr.length) {
        if (tx.type === 'dispense') arr[idx].dispensedQty += Math.abs(tx.quantity);
        else if (tx.type === 'sale') arr[idx].posSalesQty += Math.abs(tx.quantity);
        else if (tx.type === 'adjustment' && tx.quantity < 0) arr[idx].dispensedQty += Math.abs(tx.quantity);
      }
    });
    return arr.map(d => ({ ...d, totalUsed: d.dispensedQty + d.posSalesQty }));
  }, [filteredByDate, selectedQuarter, selectedYear]);

  const categoryData = useMemo(() => {
    const dispenseTotal = filteredByDate.filter(t => t.type === 'dispense').reduce((s, t) => s + Math.abs(t.quantity), 0);
    const saleTotal = filteredByDate.filter(t => t.type === 'sale').reduce((s, t) => s + Math.abs(t.quantity), 0);
    return [
      { name: 'Dispensed', value: dispenseTotal },
      { name: 'POS Sales', value: saleTotal },
    ].filter(d => d.value > 0);
  }, [filteredByDate]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 mb-2">
        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
          {formatQuarter(selectedQuarter, selectedYear)}
        </h4>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Monthly breakdown
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyData} margin={SHARED_CHART_PROPS.margin}>
                <SharedChartDefs />
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="period" {...SHARED_CHART_PROPS.xAxis} />
                <YAxis {...SHARED_CHART_PROPS.yAxis} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Legend {...SHARED_CHART_PROPS.legend} />
                <Area type="monotone" dataKey="totalUsed" stroke={CHART_COLORS.total} fill="url(#areaTotal)"
                  name="Total Used" strokeWidth={3} dot={{ r: 4, fill: CHART_COLORS.total, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
                <Bar dataKey="dispensedQty" fill={CHART_COLORS.dispensed} name="Dispensed" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="posSalesQty" fill={CHART_COLORS.sales} name="POS Sales" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Usage Split
          </p>
          <div className="h-56 flex flex-col items-center justify-center">
            {categoryData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                      paddingAngle={5} dataKey="value" stroke="none">
                      {categoryData.map((_, idx) => (
                        <Cell key={idx} fill={[CHART_COLORS.dispensed, CHART_COLORS.sales][idx]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 w-full mt-4">
                  {categoryData.map((d, i) => {
                    const total = categoryData.reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : 0;
                    return (
                      <div key={d.name} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: [CHART_COLORS.dispensed, CHART_COLORS.sales][i] }} />
                          <span className="text-[11px] font-bold text-slate-600">{d.name}</span>
                        </div>
                        <span className="text-[11px] font-black text-slate-900">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">No data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Annual Chart Panel ────────────────────────────────────────────────────────
function AnnualChartPanel({
  filteredByDate, selectedYear,
}: { filteredByDate: FirebaseTransaction[]; selectedYear: number }) {
  const [subView, setSubView] = useState<'monthly' | 'quarterly'>('monthly');

  const monthlyData = useMemo<ChartDataPoint[]>(() => {
    const arr: ChartDataPoint[] = Array.from({ length: 12 }, (_, i) => ({
      period: new Date(selectedYear, i).toLocaleString('en-US', { month: 'short' }),
      dispensedQty: 0, posSalesQty: 0, totalUsed: 0,
    }));
    filteredByDate.forEach(tx => {
      const m = new Date(tx.date).getMonth();
      if (tx.type === 'dispense') arr[m].dispensedQty += Math.abs(tx.quantity);
      else if (tx.type === 'sale') arr[m].posSalesQty += Math.abs(tx.quantity);
      else if (tx.type === 'adjustment' && tx.quantity < 0) arr[m].dispensedQty += Math.abs(tx.quantity);
    });
    return arr.map(d => ({ ...d, totalUsed: d.dispensedQty + d.posSalesQty }));
  }, [filteredByDate, selectedYear]);

  const quarterlyData = useMemo(() => {
    const qArr = ['Q1', 'Q2', 'Q3', 'Q4'].map(p => ({
      period: p, dispensedQty: 0, posSalesQty: 0, totalUsed: 0,
    }));
    monthlyData.forEach((m, i) => {
      const q = Math.floor(i / 3);
      qArr[q].dispensedQty += m.dispensedQty;
      qArr[q].posSalesQty += m.posSalesQty;
    });
    return qArr.map(q => ({ ...q, totalUsed: q.dispensedQty + q.posSalesQty }));
  }, [monthlyData]);

  const chartData = subView === 'monthly' ? monthlyData : quarterlyData;

  const cumulativeData = useMemo(() => {
    let running = 0;
    return monthlyData.map(d => {
      running += d.totalUsed;
      return { period: d.period, cumulative: running };
    });
  }, [monthlyData]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest bg-violet-50 px-3 py-1.5 rounded-lg border border-violet-100">
            Year {selectedYear}
          </h4>
          <div className="flex gap-2">
            {(['monthly', 'quarterly'] as const).map(v => (
              <button key={v} onClick={() => setSubView(v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${subView === v
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-72 mb-8">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
          {subView === 'monthly' ? 'Monthly breakdown' : 'Quarterly summary'}
        </p>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={SHARED_CHART_PROPS.margin}>
            <SharedChartDefs />
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="period" {...SHARED_CHART_PROPS.xAxis} />
            <YAxis {...SHARED_CHART_PROPS.yAxis} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Legend {...SHARED_CHART_PROPS.legend} />
            <Area type="monotone" dataKey="totalUsed" stroke={CHART_COLORS.total} fill="url(#areaTotal)"
              name="Total Used" strokeWidth={3} dot={{ r: 4, fill: CHART_COLORS.total, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
            <Bar dataKey="dispensedQty" fill={CHART_COLORS.dispensed} name="Dispensed" radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="posSalesQty" fill={CHART_COLORS.sales} name="POS Sales" radius={[4, 4, 0, 0]} maxBarSize={32} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Cumulative usage growth
        </p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cumulativeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradCumulA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="period" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 500 }} axisLine={false} tickLine={false} dy={10} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="cumulative" stroke="#8b5cf6" fill="url(#gradCumulA)"
                strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} name="Cumulative Total" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Top Medicines Chart ───────────────────────────────────────────────────────
// Scrollable when more than 10 medicines
function TopMedicinesChart({ data }: { data: TopMedicineItem[] }) {
  if (!data.length) return (
    <div className="flex items-center justify-center h-48">
      <p className="text-sm text-slate-400">No data for this period</p>
    </div>
  );

  const maxUsage = Math.max(...data.map(d => d.usage), 1);
  const scrollable = data.length > 10;

  const getStatusInfo = (med: TopMedicineItem) => {
    const stock = med.stockAfter;
    const minStock = med.minStock;
    const exp = med.expirationDate ? new Date(med.expirationDate) : null;
    const now = new Date();
    if (stock === 0) return { label: 'Out of Stock', badgeClass: 'bg-red-50 text-red-700 border-red-100' };
    if (exp && exp < now) return { label: 'Expired', badgeClass: 'bg-red-50 text-red-700 border-red-100' };
    if (exp) {
      const days = Math.floor((exp.getTime() - now.getTime()) / 86400000);
      if (days <= 30) return { label: `Exp. ${days}d`, badgeClass: 'bg-amber-50 text-amber-700 border-amber-100' };
    }
    if (minStock > 0 && stock <= minStock) return { label: 'Low Stock', badgeClass: 'bg-amber-50 text-amber-700 border-amber-100' };
    return { label: 'In Stock', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  };

  return (
    // ── Scroll wrapper: activates only when > 10 items ──
    <div
      className={scrollable ? 'overflow-y-auto pr-2' : ''}
      style={scrollable ? { maxHeight: '520px' } : {}}
    >
      <div className="space-y-5">
        {data.map((med, i) => {
          const { label: statusLabel, badgeClass } = getStatusInfo(med);
          return (
            <div key={`${med.name}-${i}`} className="group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-colors italic">
                    {i + 1}
                  </span>
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-xs font-bold text-slate-700 truncate group-hover:text-slate-900 transition-colors">{med.name}</span>
                    {med.strength && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100/50 truncate uppercase tracking-wider">
                        {med.strength}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="text-[11px] font-black text-slate-900">{med.usage.toLocaleString()} units</span>
                  <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-black tracking-wider ${badgeClass}`}>
                    {statusLabel}
                  </span>
                </div>
              </div>
              <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                <div
                  className="absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out shadow-sm"
                  style={{
                    width: `${(med.usage / maxUsage) * 100}%`,
                    background: `linear-gradient(90deg, ${CHART_COLORS.pie[i % CHART_COLORS.pie.length]}, ${CHART_COLORS.pie[(i + 1) % CHART_COLORS.pie.length]})`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5 px-0.5">
                <div className="flex gap-3">
                  <div className="flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-blue-400" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Disp: {med.dispensed}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-emerald-400" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">POS: {med.sales}</span>
                  </div>
                </div>
                <span className="text-[9px] font-black text-slate-400 italic">{med.percentage.toFixed(1)}% share</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
type TabType = 'monthly' | 'quarterly' | 'annual';
type SortField = 'medicineName' | 'category' | 'dispensedQty' | 'posSalesQty' | 'totalUsed' | 'stockDeducted';

// ─── Table row count constant ──────────────────────────────────────────────────
// When filteredData exceeds this, the tbody becomes scrollable
const TABLE_SCROLL_THRESHOLD = 10;
// Each row is ~64px tall (2 lines of content + padding); 10 rows ≈ 640px
const TABLE_MAX_HEIGHT = 640;

interface MedicineDispensingMonitorProps {
  hideHeader?: boolean;
  hideMetricCards?: boolean;
  dashboardFilterRange?: 'today' | 'last7' | 'last30' | 'monthly' | 'quarterly' | 'annual' | 'custom';
  dashboardFilterStartDate?: string;
  dashboardFilterEndDate?: string;
  dashboardSelectedMonth?: string;
  dashboardSelectedQuarter?: QuarterType;
  dashboardSelectedYear?: number;
  onFilterRangeChange?: (range: 'today' | 'last7' | 'last30' | 'monthly' | 'quarterly' | 'annual' | 'custom') => void;
  onSelectedMonthChange?: (month: string) => void;
  onSelectedQuarterChange?: (quarter: QuarterType) => void;
  onSelectedYearChange?: (year: number) => void;
  onFilterStartDateChange?: (date: string) => void;
  onFilterEndDateChange?: (date: string) => void;
  userId?: string;
  initialMedicines?: Medicine[];
  initialTransactions?: FirebaseTransaction[];
}

export default function MedicineDispensingMonitor({
  hideHeader = false,
  hideMetricCards = false,
  dashboardFilterRange,
  dashboardFilterStartDate,
  dashboardFilterEndDate,
  dashboardSelectedMonth,
  dashboardSelectedQuarter,
  dashboardSelectedYear,
  onFilterRangeChange,
  onSelectedMonthChange,
  onSelectedQuarterChange,
  onSelectedYearChange,
  onFilterStartDateChange,
  onFilterEndDateChange,
  userId,
  initialMedicines,
  initialTransactions,
}: MedicineDispensingMonitorProps = {}) {

  const [activeTab, setActiveTab] = useState<TabType>('monthly');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [selectedQuarter, setSelectedQuarter] = useState<QuarterType>('Q1');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const handleMonthChange = useCallback((m: string) => {
    if (onSelectedMonthChange) onSelectedMonthChange(m); else setSelectedMonth(m);
  }, [onSelectedMonthChange]);
  const handleQuarterChange = useCallback((q: QuarterType) => {
    if (onSelectedQuarterChange) onSelectedQuarterChange(q); else setSelectedQuarter(q);
  }, [onSelectedQuarterChange]);
  const handleYearChange = useCallback((y: number) => {
    if (onSelectedYearChange) onSelectedYearChange(y); else setSelectedYear(y);
  }, [onSelectedYearChange]);

  const [sortField, setSortField] = useState<SortField>('dispensedQty');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockModalSearch, setStockModalSearch] = useState('');

  const [internalMedicines, setInternalMedicines] = useState<Medicine[]>([]);
  const [internalTransactions, setInternalTransactions] = useState<FirebaseTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => currentYear - i), [currentYear]);

  useEffect(() => {
    if (initialMedicines && initialTransactions) return;
    if (!userId) return;

    const medsPath = getUserPath(userId, 'medicines');
    const transPath = getUserPath(userId, 'transactions');

    let medsReady = false;
    let transReady = false;
    const checkDone = () => {
      if (medsReady && transReady) setLoading(false);
    };

    const unsubMeds = onValue(ref(database, medsPath), snap => {
      const data = snap.val();
      if (data) {
        const list: Medicine[] = Object.entries(data as Record<string, Omit<Medicine, 'id'>>)
          .map(([id, v]) => ({ id, ...v }));
        setInternalMedicines(list);
      } else {
        setInternalMedicines([]);
      }
      medsReady = true;
      checkDone();
    });

    const unsubTrans = onValue(ref(database, transPath), snap => {
      const data = snap.val();
      if (data) {
        const list: FirebaseTransaction[] = Object.entries(
          data as Record<string, Omit<FirebaseTransaction, 'id'>>,
        ).map(([id, v]) => ({ id, ...v }));
        setInternalTransactions(list);
      } else {
        setInternalTransactions([]);
      }
      transReady = true;
      checkDone();
    });

    return () => { unsubMeds(); unsubTrans(); };
  }, [userId, initialMedicines, initialTransactions]);

  const effectiveMedicines = initialMedicines ?? internalMedicines;
  const effectiveTransactions = initialTransactions ?? internalTransactions;
  const isActuallyLoading = loading && !initialMedicines && !initialTransactions;

  const medicinesMap = useMemo(() => {
    const map = new Map<string, Medicine>();
    effectiveMedicines.forEach(m => map.set(m.id, m));
    return map;
  }, [effectiveMedicines]);

  const effectiveMonth = dashboardSelectedMonth ?? selectedMonth;
  const effectiveQuarter = dashboardSelectedQuarter ?? selectedQuarter;
  const effectiveYear = dashboardSelectedYear ?? selectedYear;

  const dateRange = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    if (dashboardFilterRange === 'today') return { start: todayStart, end: todayEnd };
    if (dashboardFilterRange === 'last7') {
      const s = new Date(todayStart); s.setDate(s.getDate() - 6);
      return { start: s, end: todayEnd };
    }
    if (dashboardFilterRange === 'last30') {
      const s = new Date(todayStart); s.setDate(s.getDate() - 29);
      return { start: s, end: todayEnd };
    }
    if (dashboardFilterRange === 'monthly') return getDateRange('monthly', effectiveMonth);
    if (dashboardFilterRange === 'quarterly') return getDateRange('quarterly', undefined, effectiveQuarter, effectiveYear);
    if (dashboardFilterRange === 'annual') return getDateRange('annual', undefined, undefined, effectiveYear);
    if (dashboardFilterRange === 'custom' && dashboardFilterStartDate && dashboardFilterEndDate) {
      return getDateRange('custom', undefined, undefined, undefined, dashboardFilterStartDate, dashboardFilterEndDate);
    }
    return getDateRange(activeTab, selectedMonth, selectedQuarter, selectedYear);
  }, [
    dashboardFilterRange, dashboardFilterStartDate, dashboardFilterEndDate,
    effectiveMonth, effectiveQuarter, effectiveYear,
    activeTab, selectedMonth, selectedQuarter, selectedYear,
  ]);

  const filteredByDate = useMemo(
    () => filterTransactions(effectiveTransactions, dateRange.start, dateRange.end),
    [effectiveTransactions, dateRange],
  );

  const aggregated = useMemo(() => aggregateByMedicine(filteredByDate), [filteredByDate]);
  const aggregatedData = useMemo(() => buildDetailedTransactions(aggregated, medicinesMap), [aggregated, medicinesMap]);

  const metrics = useMemo(() => {
    const totalDispensed = aggregatedData.reduce((s, d) => s + d.dispensedQty, 0);
    const totalPosSalesQty = aggregatedData.reduce((s, d) => s + d.posSalesQty, 0);
    const totalStockDeducted = aggregatedData.reduce((s, d) => s + d.stockDeducted, 0);
    const remainingStock = aggregatedData.reduce((s, d) => s + d.stockAfter, 0);
    const medicinesWithActivity = aggregatedData.filter(d => d.totalUsed > 0).length;
    const posSalesTransactions = new Set(
      filteredByDate.filter(t => t.type === 'sale').map(t => t.referenceId).filter(Boolean),
    ).size;

    let prevTotalDispensed = 0;
    let prevTotalStockDeducted = 0;
    let prevPosSales = 0;
    const isPeriodic = !dashboardFilterRange || ['monthly', 'quarterly', 'annual'].includes(dashboardFilterRange);

    if (isPeriodic) {
      const prevTab = (dashboardFilterRange as TabType) ?? activeTab;
      const prev = getPreviousDateRange(prevTab, effectiveMonth, effectiveQuarter, effectiveYear);
      const prevFiltered = filterTransactions(effectiveTransactions, prev.start, prev.end);
      const prevAgg = aggregateByMedicine(prevFiltered);
      const prevData = buildDetailedTransactions(prevAgg, medicinesMap);
      prevTotalDispensed = prevData.reduce((s, d) => s + d.dispensedQty, 0);
      prevTotalStockDeducted = prevData.reduce((s, d) => s + d.stockDeducted, 0);
      prevPosSales = new Set(prevFiltered.filter(t => t.type === 'sale').map(t => t.referenceId).filter(Boolean)).size;
    }

    return {
      medicinesWithActivity, totalDispensed, totalPosSales: posSalesTransactions,
      totalPosSalesQty, totalStockDeducted, remainingStock,
      previousPeriodDispensed: prevTotalDispensed,
      previousPeriodSales: prevPosSales,
      previousPeriodStockDeducted: prevTotalStockDeducted,
    };
  }, [
    aggregatedData, filteredByDate, effectiveTransactions, medicinesMap,
    dashboardFilterRange, activeTab, effectiveMonth, effectiveQuarter, effectiveYear,
  ]);

  const topMedicinesData = useMemo<TopMedicineItem[]>(() => {
    // Show ALL medicines (no .slice) so the scrollable list shows everything
    const sorted = [...aggregatedData].sort((a, b) => b.totalUsed - a.totalUsed);
    const total = sorted.reduce((s, d) => s + d.totalUsed, 0);
    return sorted.map(d => {
      const med = medicinesMap.get(d.medicineId);
      return {
        name: d.medicineName,
        strength: med?.strength,
        usage: d.totalUsed,
        dispensed: d.dispensedQty,
        sales: d.posSalesQty,
        percentage: total > 0 ? (d.totalUsed / total) * 100 : 0,
        stockAfter: d.stockAfter,
        minStock: med?.minStock ?? 0,
        expirationDate: med?.expirationDate,
      };
    });
  }, [aggregatedData, medicinesMap]);

  const filteredData = useMemo(() => {
    return aggregatedData
      .filter(d =>
        d.medicineName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.category.toLowerCase().includes(searchQuery.toLowerCase()),
      )
      .sort((a, b) => {
        let aVal: string | number = 0;
        let bVal: string | number = 0;
        switch (sortField) {
          case 'medicineName': aVal = a.medicineName.toLowerCase(); bVal = b.medicineName.toLowerCase(); break;
          case 'category': aVal = a.category.toLowerCase(); bVal = b.category.toLowerCase(); break;
          case 'dispensedQty': aVal = a.dispensedQty; bVal = b.dispensedQty; break;
          case 'posSalesQty': aVal = a.posSalesQty; bVal = b.posSalesQty; break;
          case 'totalUsed': aVal = a.totalUsed; bVal = b.totalUsed; break;
          case 'stockDeducted': aVal = a.stockDeducted; bVal = b.stockDeducted; break;
        }
        if (typeof aVal === 'string')
          return sortOrder === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
        return sortOrder === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
      });
  }, [aggregatedData, searchQuery, sortField, sortOrder]);

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  }, [sortField]);

  const effectiveTab: TabType =
    dashboardFilterRange === 'quarterly' ? 'quarterly' :
      dashboardFilterRange === 'annual' ? 'annual' :
        dashboardFilterRange ? 'monthly' :
          activeTab;

  const chartMonth =
    (dashboardFilterRange === 'today' || dashboardFilterRange === 'last7' ||
      dashboardFilterRange === 'last30' || dashboardFilterRange === 'custom')
      ? new Date().toISOString().slice(0, 7)
      : effectiveMonth;

  // ── Whether the table body should scroll ──
  const tableScrollable = filteredData.length > TABLE_SCROLL_THRESHOLD;

  if (isActuallyLoading) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3" />
          <p className="text-slate-500 text-sm">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">

      {/* ── HEADER ── */}
      {!hideHeader && (
        <div>
          <h2 className="text-3xl font-black text-slate-900 mb-1">Medicine Dispensing &amp; Sales Monitor</h2>
          <p className="text-sm text-slate-500">Track dispensing, POS sales, and inventory deductions across monthly, quarterly, and annual periods</p>
        </div>
      )}

      {/* ── DASHBOARD FILTER CONTROLS ── */}
      {onFilterRangeChange && dashboardFilterRange && (
        <div className="flex items-center gap-2 flex-wrap p-4 bg-slate-50 rounded-xl border border-slate-200">
          {([
            { key: 'today', label: 'Today' },
            { key: 'last7', label: 'Last 7d' },
            { key: 'last30', label: 'Last 30d' },
            { key: 'monthly', label: 'Monthly' },
            { key: 'quarterly', label: 'Quarterly' },
            { key: 'annual', label: 'Annual' },
            { key: 'custom', label: 'Custom' },
          ] as const).map(opt => (
            <button key={opt.key} type="button" onClick={() => onFilterRangeChange(opt.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${dashboardFilterRange === opt.key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}>
              {opt.label}
            </button>
          ))}

          {dashboardFilterRange === 'monthly' && onSelectedMonthChange && (
            <input type="month" value={dashboardSelectedMonth || ''}
              onChange={e => onSelectedMonthChange(e.target.value)}
              className="px-2.5 py-1.5 text-xs text-slate-900 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}

          {dashboardFilterRange === 'quarterly' && onSelectedQuarterChange && onSelectedYearChange && (
            <>
              <select value={dashboardSelectedQuarter || 'Q1'}
                onChange={e => onSelectedQuarterChange(e.target.value as QuarterType)}
                className="px-2.5 py-1.5 text-xs text-slate-900 border border-slate-200 rounded-lg bg-white">
                {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <option key={q}>{q}</option>)}
              </select>
              <select value={dashboardSelectedYear || currentYear}
                onChange={e => onSelectedYearChange(Number(e.target.value))}
                className="px-2.5 py-1.5 text-xs text-slate-900 border border-slate-200 rounded-lg bg-white">
                {years.map(y => <option key={y}>{y}</option>)}
              </select>
            </>
          )}

          {dashboardFilterRange === 'annual' && onSelectedYearChange && (
            <select value={dashboardSelectedYear || currentYear}
              onChange={e => onSelectedYearChange(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs text-slate-900 border border-slate-200 rounded-lg bg-white">
              {years.map(y => <option key={y}>{y}</option>)}
            </select>
          )}

          {dashboardFilterRange === 'custom' && onFilterStartDateChange && onFilterEndDateChange && (() => {
            const today = new Date();
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const formatDate = (date: Date): string => date.toISOString().split('T')[0];
            const defaultStart = formatDate(thirtyDaysAgo);
            const defaultEnd = formatDate(today);
            return (
              <div className="flex items-center gap-2">
                <input type="date" value={dashboardFilterStartDate || defaultStart}
                  onChange={e => onFilterStartDateChange(e.target.value)}
                  className="px-2.5 py-1.5 text-xs text-slate-900 border border-slate-200 rounded-lg bg-white" />
                <span className="text-slate-300 text-xs">→</span>
                <input type="date" value={dashboardFilterEndDate || defaultEnd}
                  onChange={e => onFilterEndDateChange(e.target.value)}
                  className="px-2.5 py-1.5 text-xs text-slate-900 border border-slate-200 rounded-lg bg-white" />
              </div>
            );
          })()}
        </div>
      )}

      {/* ── METRIC CARDS ── */}
      {!hideMetricCards && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard label="Total Dispensed" value={metrics.totalDispensed}
            change={Math.abs(metrics.totalDispensed - metrics.previousPeriodDispensed)}
            changeLabel="vs prev" isPositive={metrics.totalDispensed >= metrics.previousPeriodDispensed}
            accent={CHART_COLORS.dispensed} />
          <MetricCard label="POS Sales Transactions" value={metrics.totalPosSales}
            change={Math.abs(metrics.totalPosSales - metrics.previousPeriodSales)}
            changeLabel="vs prev" isPositive={metrics.totalPosSales >= metrics.previousPeriodSales}
            accent={CHART_COLORS.sales} />
          <MetricCard label="Total Stock Deducted" value={metrics.totalStockDeducted}
            change={Math.abs(metrics.totalStockDeducted - metrics.previousPeriodStockDeducted)}
            changeLabel="vs prev" isPositive={metrics.totalStockDeducted >= metrics.previousPeriodStockDeducted}
            onClick={() => setShowStockModal(true)} accent={CHART_COLORS.total} />
          <MetricCard label="Remaining Stock" value={metrics.remainingStock} accent="#8b5cf6" />
        </div>
      )}

      {/* ── CHART SECTION ── */}
      <div className="surface-card p-4 sm:p-6">
        {!dashboardFilterRange && (
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-200 pb-4">
            <div className="flex gap-2">
              {(['monthly', 'quarterly', 'annual'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all ${activeTab === tab
                    ? tab === 'monthly' ? 'bg-blue-600 text-white shadow-sm'
                      : tab === 'quarterly' ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-violet-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {activeTab === 'monthly' && (
                <input type="month" value={selectedMonth} onChange={e => handleMonthChange(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
              {activeTab === 'quarterly' && (
                <div className="flex gap-2">
                  <select value={selectedQuarter} onChange={e => handleQuarterChange(e.target.value as QuarterType)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <option key={q}>{q}</option>)}
                  </select>
                  <select value={selectedYear} onChange={e => handleYearChange(Number(e.target.value))}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {years.map(y => <option key={y}>{y}</option>)}
                  </select>
                </div>
              )}
              {activeTab === 'annual' && (
                <select value={selectedYear} onChange={e => handleYearChange(Number(e.target.value))}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {years.map(y => <option key={y}>{y}</option>)}
                </select>
              )}
            </div>
          </div>
        )}

        {effectiveTab === 'monthly' && (
          <MonthlyChartPanel filteredByDate={filteredByDate} selectedMonth={chartMonth} />
        )}
        {effectiveTab === 'quarterly' && (
          <QuarterlyChartPanel filteredByDate={filteredByDate}
            selectedQuarter={effectiveQuarter} selectedYear={effectiveYear} />
        )}
        {effectiveTab === 'annual' && (
          <AnnualChartPanel filteredByDate={filteredByDate} selectedYear={effectiveYear} />
        )}

        {filteredByDate.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <svg className="w-10 h-10 text-slate-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <p className="text-sm font-semibold text-slate-400">No dispensing activity in this period</p>
            <p className="text-xs text-slate-300">Dispense a medicine to see it appear here</p>
          </div>
        )}
      </div>

      {/* ── BOTTOM PANELS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

        <div className="lg:col-span-2 surface-card p-4 sm:p-6">
          <h3 className="text-base font-bold text-slate-900 mb-1">Top Medicines by Usage</h3>
          <p className="text-xs text-slate-400 mb-4">Ranked by total dispensed + POS sales for the selected period</p>
          <TopMedicinesChart data={topMedicinesData} />
        </div>

        <div className="surface-card p-4 sm:p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4">Period Summary</h3>
          <div className="space-y-3">
            {[
              { label: 'Medicines with activity', value: metrics.medicinesWithActivity, color: 'text-slate-900' },
              { label: 'Total stock outflow', value: metrics.totalStockDeducted, color: 'text-red-600' },
              {
                label: 'Avg units per medicine', value: metrics.medicinesWithActivity > 0
                  ? Math.round(metrics.totalStockDeducted / metrics.medicinesWithActivity) : 0, color: 'text-slate-900'
              },
              { label: 'Period closing stock', value: metrics.remainingStock, color: 'text-emerald-600' },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                <span className="text-xs text-slate-500">{item.label}</span>
                <span className={`text-base font-bold ${item.color}`}>{item.value.toLocaleString()}</span>
              </div>
            ))}

            <div className="pt-2">
              <p className="text-xs text-slate-500 mb-2">Dispense vs POS split (Qty)</p>
              {metrics.totalDispensed + metrics.totalPosSalesQty > 0 ? (
                <div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="h-full" style={{
                      width: `${(metrics.totalDispensed / (metrics.totalDispensed + metrics.totalPosSalesQty)) * 100}%`,
                      background: CHART_COLORS.dispensed,
                    }} />
                    <div className="h-full flex-1" style={{ background: CHART_COLORS.sales }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-blue-500">
                      Dispensed {((metrics.totalDispensed / (metrics.totalDispensed + metrics.totalPosSalesQty)) * 100).toFixed(0)}%
                    </span>
                    <span className="text-[10px] text-emerald-500">
                      POS {((metrics.totalPosSalesQty / (metrics.totalDispensed + metrics.totalPosSalesQty)) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No data</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── TRANSACTION TABLE ── */}
      <div className="surface-card p-4 sm:p-6">
        {/* Header row: title + row count badge + search */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-slate-900">Medicine Stocks Timeline</h3>
            {/* Row count badge — shows how many rows and hints about scroll */}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-wider">
              {filteredData.length} {filteredData.length === 1 ? 'item' : 'items'}
              {tableScrollable && (
                <span className="text-blue-400 ml-0.5">· scroll</span>
              )}
            </span>
          </div>
          <input type="text" placeholder="Search medicine or category..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full sm:w-72 px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/*
          ── Scrollable table container ──
          We use a wrapper div with overflow-x-auto for horizontal scroll (existing)
          AND overflow-y-auto + maxHeight for vertical scroll when rows > threshold.
          The thead is made sticky so column headers stay visible while scrolling.
        */}
        <div
          className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6"
        >
          <div
            className={tableScrollable ? 'overflow-y-auto' : ''}
            style={tableScrollable ? { maxHeight: `${TABLE_MAX_HEIGHT}px` } : {}}
          >
            <table className="w-full text-sm">
              {/* ── Sticky header — stays put while tbody scrolls ── */}
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-slate-200 bg-slate-50">
                  {([
                    { field: 'medicineName', label: 'Medicine Name', align: 'left' },
                    { field: 'category', label: 'Category', align: 'left' },
                    { field: 'dispensedQty', label: 'Dispensed', align: 'right' },
                    { field: 'posSalesQty', label: 'POS Sales', align: 'right' },
                    { field: 'totalUsed', label: 'Total Used', align: 'right' },
                    { field: null, label: 'Opening Stock', align: 'right' },
                    { field: 'stockDeducted', label: 'Deducted', align: 'right' },
                    { field: null, label: 'Closing Stock', align: 'right' },
                  ] as const).map(col => (
                    <th key={col.label}
                      className={`px-4 py-3 text-${col.align} text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50`}>
                      {col.field ? (
                        <button onClick={() => toggleSort(col.field as SortField)}
                          className={`flex items-center gap-1 hover:text-slate-900 transition-colors ${col.align === 'right' ? 'ml-auto' : ''}`}>
                          {col.label}
                          {sortField === col.field && (
                            <span className="text-blue-600 font-black">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      ) : col.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredData.map(row => {
                  const med = medicinesMap.get(row.medicineId);
                  const isLowStock = med?.minStock !== undefined && row.stockAfter > 0 && row.stockAfter <= med.minStock;
                  const isOut = row.stockAfter === 0;
                  return (
                    <tr key={row.medicineId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex flex-col min-w-0">
                          <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">{row.medicineName}</p>
                          {med?.strength && (
                            <span className="mt-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100/50 uppercase tracking-wider w-fit">
                              {med.strength}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                          {row.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-black text-blue-600 tabular-nums">{row.dispensedQty.toLocaleString()}</span>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">Units</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-black text-emerald-600 tabular-nums">{row.posSalesQty.toLocaleString()}</span>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">Sales</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-black text-slate-900 tabular-nums">{row.totalUsed.toLocaleString()}</span>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">Total</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-slate-500 tabular-nums">{row.stockBefore.toLocaleString()}</span>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">Opening</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-black text-red-500 tabular-nums">−{row.stockDeducted.toLocaleString()}</span>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">Outflow</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`font-black tabular-nums ${isOut ? 'text-red-600' : isLowStock ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {row.stockAfter.toLocaleString()}
                          </span>
                          {isOut ? (
                            <span className="text-[8px] font-black text-white bg-red-500 px-1 rounded uppercase tracking-tighter">Out</span>
                          ) : isLowStock ? (
                            <span className="text-[8px] font-black text-white bg-amber-500 px-1 rounded uppercase tracking-tighter">Low</span>
                          ) : (
                            <p className="text-[9px] text-slate-400 font-bold uppercase">Closing</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredData.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <p className="text-sm text-slate-400 font-medium">No results found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── STOCK MODAL ── */}
      {showStockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">Medicine Stock Overview</h3>
              <button onClick={() => setShowStockModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <div className="px-6 pt-4 pb-2">
              <input type="text" placeholder="Search medicine name or category..."
                value={stockModalSearch} onChange={e => setStockModalSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-slate-700">Medicine</th>
                    <th className="px-6 py-3 text-left font-semibold text-slate-700">Category</th>
                    <th className="px-6 py-3 text-right font-semibold text-slate-700">Current Stock</th>
                    <th className="px-6 py-3 text-right font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveMedicines
                    .filter(med =>
                      (med.baseName || med.name || '').toLowerCase().includes(stockModalSearch.toLowerCase()) ||
                      (med.category || '').toLowerCase().includes(stockModalSearch.toLowerCase()),
                    )
                    .sort((a, b) => (a.baseName || a.name || '').localeCompare(b.baseName || b.name || ''))
                    .map(med => {
                      const stock = getEffectiveStock(med);
                      const min = med.minStock ?? 0;
                      const isCritical = min > 0 && stock < min * 0.5;
                      const isLow = min > 0 && stock < min && !isCritical;
                      return (
                        <tr key={med.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-6 py-3 font-medium text-slate-900">{med.baseName || med.name || '—'}</td>
                          <td className="px-6 py-3 text-slate-500 text-xs">{med.category || 'Uncategorized'}</td>
                          <td className="px-6 py-3 text-right font-bold text-slate-900">{stock.toLocaleString()}</td>
                          <td className="px-6 py-3 text-right">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${isCritical ? 'bg-red-100 text-red-700' : isLow ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                              }`}>
                              {isCritical ? 'Critical' : isLow ? 'Low' : 'OK'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button onClick={() => setShowStockModal(false)}
                className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}