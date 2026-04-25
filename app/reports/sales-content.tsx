'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Interfaces ───────────────────────────────────────────────────────────────

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

interface UnitBreakdownItem {
  type:       string;
  quantity:   number;
  percentage: number;
}

interface SalesOverallStats {
  totalSales:             number;
  totalRevenue:           number;
  totalItems:             number;
  avgPerSale:             number;
  paymentMethodBreakdown: Record<string, number>;
  unitTypeBreakdown:      UnitBreakdownItem[]; // no longer optional — always provided
}

interface SalesContentProps {
  isLoadingSales:      boolean;
  salesDateRange:      { start: string; end: string };
  setSalesDateRange:   (r: { start: string; end: string }) => void;
  dailySalesSummaries: DailySalesSummary[];
  medicineSalesStats:  MedicineSalesStats[];
  salesOverallStats:   SalesOverallStats;
}

// ─── Colors & Helpers ─────────────────────────────────────────────────────────

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Returns today as YYYY-MM-DD in Asia/Manila */
function getTodayPH(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

// ─── Report HTML Builder ──────────────────────────────────────────────────────

function buildSalesReportHTML(
  salesOverallStats:   SalesOverallStats,
  dailySalesSummaries: DailySalesSummary[],
  medicineSalesStats:  MedicineSalesStats[],
  salesDateRange:      { start: string; end: string },
): string {
  const dateLabel =
    salesDateRange.start && salesDateRange.end
      ? `${salesDateRange.start} to ${salesDateRange.end}`
      : 'All Time';

  const sortedMeds = [...medicineSalesStats].sort((a, b) => b.totalRevenue - a.totalRevenue);

  const topMedRows = sortedMeds
    .slice(0, 10)
    .map((m, i) => {
      const nameWithStrength = m.strength
        ? `${m.medicineName} (${m.strength})`
        : m.medicineName;
      return `
        <tr>
          <td class="row-number">${i + 1}</td>
          <td>${nameWithStrength}</td>
          <td class="center">${m.totalQuantity}</td>
          <td class="center">${m.salesCount}</td>
          <td class="amount-right">₱${m.totalRevenue.toFixed(2)}</td>
        </tr>`;
    })
    .join('');

  const dailyRows = dailySalesSummaries
    .map((day) => {
      const avg = day.salesCount > 0 ? day.totalRevenue / day.salesCount : 0;
      return `
      <tr>
        <td>${day.displayDate}</td>
        <td class="center">${day.salesCount}</td>
        <td class="center">${day.totalItems}</td>
        <td class="amount-right">₱${day.totalRevenue.toFixed(2)}</td>
        <td class="amount-right">₱${avg.toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  const paymentBreakdown = salesOverallStats.paymentMethodBreakdown ?? {};
  const paymentRows = Object.entries(paymentBreakdown)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([method, amount]) => `
      <tr>
        <td>${method
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')}</td>
        <td class="amount-right">₱${amount.toFixed(2)}</td>
      </tr>`,
    )
    .join('');

  const generatedAt  = new Date().toLocaleString('en-PH',     { timeZone: 'Asia/Manila' });
  const generatedDay = new Date().toLocaleDateString('en-PH',  { timeZone: 'Asia/Manila' });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Sales & Dispensing Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { 
      font-family: Arial, Helvetica, sans-serif; 
      color: #000; 
      background: #fff; 
      padding: 20mm; 
      font-size: 11px;
      line-height: 1.5;
    }
    .org-header {
      text-align: center;
      margin-bottom: 8px;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
    }
    .org-name {
      font-size: 10px;
      font-weight: normal;
      color: #333;
    }
    .org-dept {
      font-size: 12px;
      font-weight: bold;
      color: #000;
      margin-top: 2px;
    }
    .org-title {
      font-size: 10px;
      font-weight: normal;
      color: #333;
      margin-top: 2px;
    }
    .report-title {
      text-align: center;
      font-size: 13px;
      font-weight: bold;
      color: #000;
      margin-top: 12px;
      margin-bottom: 2px;
      text-decoration: underline;
    }
    .report-meta {
      text-align: center;
      font-size: 9px;
      color: #333;
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 11px;
      font-weight: bold;
      color: #000;
      margin-top: 14px;
      margin-bottom: 6px;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
    }
    table { 
      width: 100%; 
      border-collapse: collapse;
      margin-bottom: 12px;
      border: 1px solid #000;
    }
    th { 
      padding: 5px 6px; 
      text-align: left; 
      font-size: 9px;
      font-weight: bold;
      color: #000;
      background: #f5f5f5;
      border: 1px solid #000;
      border-bottom: 2px solid #000;
    }
    td { 
      padding: 4px 6px; 
      border: 1px solid #ddd; 
      font-size: 9px;
      color: #000;
    }
    tbody tr {
      background: #fff;
    }
    .row-number {
      width: 3%;
      text-align: center;
      font-weight: bold;
    }
    .amount-right {
      text-align: right;
      font-family: 'Courier New', monospace;
    }
    .center {
      text-align: center;
    }
    .footer { 
      margin-top: 20px; 
      text-align: center; 
      color: #333; 
      font-size: 8px; 
      border-top: 1px solid #000; 
      padding-top: 6px;
    }
    .empty { 
      color: #666; 
      font-style: italic; 
      padding: 12px 0;
      text-align: center;
    }
    @media print { 
      body { padding: 15mm; }
      @page { margin: 15mm; size: A4; }
      .section-title { page-break-after: avoid; }
      table { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <!-- Organization Header -->
  <div class="org-header">
    <div class="org-name">Pharmacy Management System</div>
    <div class="org-dept">PHARMACY OPERATIONS</div>
    <div class="org-title">Sales & Dispensing Report</div>
  </div>

  <div class="report-title">TRANSACTIONS REPORT</div>
  <div class="report-meta">Period: ${dateLabel} | Generated: ${generatedAt} | ${generatedDay}</div>

  <!-- Summary Metrics Table -->
  <div class="section-title">SUMMARY METRICS</div>
  <table>
    <tr>
      <td style="font-weight: bold; width: 50%;">Total POS Sales</td>
      <td class="amount-right" style="width: 50%;">${salesOverallStats.totalSales}</td>
    </tr>
    <tr>
      <td style="font-weight: bold;">Total Revenue</td>
      <td class="amount-right">₱${salesOverallStats.totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
    <tr>
      <td style="font-weight: bold;">Total Items Sold</td>
      <td class="amount-right">${salesOverallStats.totalItems.toLocaleString()}</td>
    </tr>
    <tr>
      <td style="font-weight: bold;">Average per Sale</td>
      <td class="amount-right">₱${salesOverallStats.avgPerSale.toFixed(2)}</td>
    </tr>
  </table>

  <!-- Payment Methods -->
  ${
    Object.keys(paymentBreakdown).length > 0
      ? `<div class="section-title">PAYMENT METHODS</div>
         <table>
           <thead><tr><th style="width: 70%;">Payment Method</th><th class="amount-right" style="width: 30%;">Amount</th></tr></thead>
           <tbody>${paymentRows}</tbody>
         </table>`
      : ''
  }

  <!-- Top Medicines -->
  ${
    sortedMeds.length > 0
      ? `<div class="section-title">TOP 10 MEDICINES BY REVENUE</div>
         <table>
           <thead>
             <tr>
               <th class="row-number">#</th>
               <th style="width: 45%;">Medicine</th>
               <th class="center" style="width: 15%;">Qty Sold</th>
               <th class="center" style="width: 15%;">Transactions</th>
               <th class="amount-right" style="width: 20%;">Revenue</th>
             </tr>
           </thead>
           <tbody>${topMedRows}</tbody>
         </table>`
      : ''
  }

  <!-- Daily Summary -->
  ${
    dailySalesSummaries.length > 0
      ? `<div class="section-title">DAILY TRANSACTION SUMMARY</div>
         <table>
           <thead>
             <tr>
               <th style="width: 18%;">Date</th>
               <th class="center" style="width: 15%;">Sales</th>
               <th class="center" style="width: 15%;">Items Sold</th>
               <th class="amount-right" style="width: 25%;">Revenue</th>
               <th class="amount-right" style="width: 27%;">Avg/Sale</th>
             </tr>
           </thead>
           <tbody>${dailyRows}</tbody>
         </table>`
      : `<p class="empty">No data available for the selected period.</p>`
  }

  <div class="footer">
    <p style="margin-bottom: 3px;">Pharmacy Management System | Confidential</p>
    <p style="margin: 0;">${generatedDay}</p>
  </div>
</body>
</html>`;
}

// ─── ChartWrapper ─────────────────────────────────────────────────────────────

function ChartWrapper({
  height = 260,
  children,
}: {
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ width: '100%', height, minHeight: height }}>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SalesContent({
  isLoadingSales,
  salesDateRange,
  setSalesDateRange,
  dailySalesSummaries,
  medicineSalesStats,
  salesOverallStats,
}: SalesContentProps) {
  const [activeTab,     setActiveTab]     = useState<'overview' | 'medicines' | 'daily'>('overview');
  const [isPrinting,    setIsPrinting]    = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // ── Today stats ───────────────────────────────────────────────────────────
  const todayStats = useMemo(() => {
    const found = dailySalesSummaries.find((d) => d.date === getTodayPH());
    return {
      revenue:      found?.totalRevenue ?? 0,
      transactions: found?.salesCount   ?? 0,
      items:        found?.totalItems   ?? 0,
    };
  }, [dailySalesSummaries]);

  // ── Period totals for chart header pills ─────────────────────────────────
  const periodTotals = useMemo(() => {
    const revenue      = dailySalesSummaries.reduce((s, d) => s + d.totalRevenue, 0);
    const transactions = dailySalesSummaries.reduce((s, d) => s + d.salesCount,   0);
    const items        = dailySalesSummaries.reduce((s, d) => s + d.totalItems,    0);
    const peak         = [...dailySalesSummaries].sort(
      (a, b) => b.totalRevenue - a.totalRevenue,
    )[0];
    return { revenue, transactions, items, peakDate: peak?.displayDate ?? '—' };
  }, [dailySalesSummaries]);

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrintPDF = useCallback(() => {
    setIsPrinting(true);
    setTimeout(() => {
      try {
        const html = buildSalesReportHTML(
          salesOverallStats,
          dailySalesSummaries,
          medicineSalesStats,
          salesDateRange,
        );
        const printWindow = window.open('', '_blank');
        if (!printWindow) { setIsPrinting(false); return; }
        printWindow.document.write(
          html +
            `<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>`,
        );
        printWindow.document.close();
        setTimeout(() => setIsPrinting(false), 2000);
      } catch (err) {
        console.error('Print error:', err);
        setIsPrinting(false);
      }
    }, 100);
  }, [salesOverallStats, dailySalesSummaries, medicineSalesStats, salesDateRange]);

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    setIsDownloading(true);
    setTimeout(() => {
      try {
        const html = buildSalesReportHTML(
          salesOverallStats,
          dailySalesSummaries,
          medicineSalesStats,
          salesDateRange,
        );
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `sales-report-${salesDateRange.start || 'all'}-to-${
          salesDateRange.end || 'all'
        }.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setTimeout(() => setIsDownloading(false), 1000);
      } catch (err) {
        console.error('Download error:', err);
        setIsDownloading(false);
      }
    }, 100);
  }, [salesOverallStats, dailySalesSummaries, medicineSalesStats, salesDateRange]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoadingSales) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600 text-sm">Loading sales data...</p>
        </div>
      </div>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const safeMedicineSalesStats = medicineSalesStats ?? [];
  const safePaymentBreakdown   = salesOverallStats.paymentMethodBreakdown ?? {};
  const sortedMeds             = [...safeMedicineSalesStats].sort(
    (a, b) => b.totalRevenue - a.totalRevenue,
  );

  const paymentData = Object.entries(safePaymentBreakdown).map(([method, amount]) => ({
    name: method
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    value: amount,
  }));

  // FIX: safe unitTypeBreakdown — always an array (interface no longer optional)
  const safeUnitBreakdown: UnitBreakdownItem[] = salesOverallStats.unitTypeBreakdown ?? [];

  const todayLabel = new Date().toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday:  'short',
    month:    'short',
    day:      'numeric',
    year:     'numeric',
  });

  return (
    <div className="space-y-6">

      {/* ── Date Range Filter + Actions ──────────────────────────────────────── */}
      <div className="flex flex-row gap-3 p-4 bg-white border border-slate-200 rounded-2xl items-center flex-wrap shadow-sm">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <label className="text-sm font-semibold text-slate-700">From:</label>
          <input
            type="date"
            value={salesDateRange.start}
            onChange={(e) =>
              setSalesDateRange({ ...salesDateRange, start: e.target.value })
            }
            className="px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 transition-all"
          />
          <label className="text-sm font-semibold text-slate-700">To:</label>
          <input
            type="date"
            value={salesDateRange.end}
            onChange={(e) =>
              setSalesDateRange({ ...salesDateRange, end: e.target.value })
            }
            className="px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 transition-all"
          />
          {(salesDateRange.start || salesDateRange.end) && (
            <button
              onClick={() => setSalesDateRange({ start: '', end: '' })}
              className="px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-all"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handlePrintPDF}
            disabled={isPrinting}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium text-sm flex items-center gap-2"
          >
            {isPrinting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            )}
            {isPrinting ? 'Preparing...' : 'Print'}
          </button>

          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors font-medium text-sm flex items-center gap-2"
          >
            {isDownloading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            {isDownloading ? 'Downloading...' : 'Download'}
          </button>
        </div>
      </div>

      {/* ── Today's Revenue Banner ───────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
              Today&apos;s Revenue
            </p>
            <p className="text-4xl font-extrabold tracking-tight text-slate-900">
              {peso(todayStats.revenue)}
            </p>
            <p className="text-xs text-slate-400 mt-1">{todayLabel}</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'Transactions', value: todayStats.transactions.toString() },
              { label: 'Items Sold',   value: todayStats.items.toString() },
              {
                label: 'Avg / Sale',
                value:
                  todayStats.transactions > 0
                    ? peso(todayStats.revenue / todayStats.transactions)
                    : '₱0.00',
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 min-w-[80px]"
              >
                <p className="text-lg font-extrabold text-slate-900">{value}</p>
                <p className="text-[10px] font-medium text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Key Metrics Grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue',      value: peso(salesOverallStats.totalRevenue),           sub: 'Period total'    },
          { label: 'Total Transactions', value: salesOverallStats.totalSales.toString(),         sub: 'Sales completed' },
          { label: 'Items Sold',         value: salesOverallStats.totalItems.toString(),         sub: 'Units sold'      },
          { label: 'Avg per Sale',       value: peso(salesOverallStats.avgPerSale),              sub: 'Per transaction' },
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

      {/* ── Tab Navigation ───────────────────────────────────────────────────── */}
      <div className="flex gap-4 border-b border-slate-200">
        {(['overview', 'medicines', 'daily'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">

          {/* Daily Revenue Trend */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Daily Revenue Trend</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Revenue, transactions &amp; items sold per day
                  </p>
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 flex-wrap">
                  {[
                    { color: '#3b82f6', label: 'Revenue'     },
                    { color: '#10b981', label: 'Transactions' },
                    { color: '#f59e0b', label: 'Items Sold'   },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-medium text-slate-500">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary pills */}
              {dailySalesSummaries.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-4">
                  {[
                    {
                      label:  'Total Revenue',
                      value:  peso(periodTotals.revenue),
                      bg:     'bg-blue-50',
                      text:   'text-blue-700',
                      border: 'border-blue-100',
                    },
                    {
                      label:  'Transactions',
                      value:  periodTotals.transactions.toLocaleString(),
                      bg:     'bg-emerald-50',
                      text:   'text-emerald-700',
                      border: 'border-emerald-100',
                    },
                    {
                      label:  'Items Sold',
                      value:  periodTotals.items.toLocaleString(),
                      bg:     'bg-amber-50',
                      text:   'text-amber-700',
                      border: 'border-amber-100',
                    },
                    {
                      label:  'Peak Day',
                      value:  periodTotals.peakDate,
                      bg:     'bg-slate-50',
                      text:   'text-slate-700',
                      border: 'border-slate-200',
                    },
                  ].map(({ label, value, bg, text, border }) => (
                    <div
                      key={label}
                      className={`flex flex-col px-3 py-2 rounded-xl border ${bg} ${border}`}
                    >
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide ${text} opacity-70`}
                      >
                        {label}
                      </span>
                      <span className={`text-sm font-extrabold ${text} mt-0.5`}>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Chart */}
            <div className="px-2 pt-4 pb-2">
              {dailySalesSummaries.length > 0 ? (
                <ChartWrapper height={300}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dailySalesSummaries}
                      margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                      barCategoryGap="28%"
                      barGap={3}
                    >
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="#3b82f6" stopOpacity={1}    />
                          <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="#10b981" stopOpacity={1}    />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="itemsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="#f59e0b" stopOpacity={1}    />
                          <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.85} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        stroke="#f1f5f9"
                        strokeDasharray="3 3"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="displayDate"
                        tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                        tickFormatter={(v: string) => {
                          const parts = v.split(' ');
                          return parts.length >= 2
                            ? `${parts[0]} ${parts[1].replace(',', '')}`
                            : v;
                        }}
                      />

                      {/* Left axis — Revenue */}
                      <YAxis
                        yAxisId="revenue"
                        orientation="left"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={58}
                        tickFormatter={(v: number) =>
                          v >= 1000 ? `₱${(v / 1000).toFixed(1)}k` : `₱${v}`
                        }
                      />

                      {/* Right axis — Counts */}
                      <YAxis
                        yAxisId="count"
                        orientation="right"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                        allowDecimals={false}
                      />

                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border:          'none',
                          borderRadius:    '14px',
                          fontSize:        '12px',
                          color:           '#fff',
                          padding:         '14px 18px',
                          boxShadow:       '0 20px 40px -8px rgba(0,0,0,0.4)',
                        }}
                        labelStyle={{
                          color:        '#94a3b8',
                          fontWeight:   700,
                          fontSize:     '11px',
                          marginBottom: 8,
                        }}
                        // FIX: cast cursor props correctly
                        cursor={{ fill: 'rgba(148,163,184,0.06)' } as React.SVGProps<SVGRectElement>}
                        formatter={(value: unknown, name: unknown): [string, string] => {
                          const num = Number(value ?? 0);
                          if (name === 'totalRevenue') return [peso(num),     'Revenue'];
                          if (name === 'salesCount')   return [String(num),   'Transactions'];
                          if (name === 'totalItems')   return [String(num),   'Items Sold'];
                          return [String(value), String(name ?? '')];
                        }}
                      />

                      <Bar yAxisId="revenue" dataKey="totalRevenue" fill="url(#revenueGrad)" radius={[5, 5, 0, 0]} maxBarSize={32} />
                      <Bar yAxisId="count"   dataKey="salesCount"   fill="url(#txGrad)"      radius={[5, 5, 0, 0]} maxBarSize={32} />
                      <Bar yAxisId="count"   dataKey="totalItems"   fill="url(#itemsGrad)"   radius={[5, 5, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWrapper>
              ) : (
                <div
                  className="flex flex-col items-center justify-center text-slate-400 text-sm gap-2"
                  style={{ height: 300 }}
                >
                  <svg className="w-10 h-10 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>No data for selected range</span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Methods & Unit Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Payment Methods */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Payment Methods</h2>
              <p className="text-xs text-slate-500 mb-4">Distribution by method</p>
              {paymentData.length > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div style={{ width: 180, height: 180, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentData}
                          cx="50%" cy="50%"
                          innerRadius="50%" outerRadius="78%"
                          paddingAngle={3}
                          dataKey="value"
                          labelLine={false}
                        >
                          {paymentData.map((_, index) => (
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
                          formatter={(value: unknown): [string, string] =>
                            [peso(Number(value ?? 0)), 'Amount']
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 w-full flex flex-col gap-2">
                    {paymentData.map(({ name, value }, index) => (
                      <div
                        key={name}
                        className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-sm text-slate-700 font-medium flex-1 truncate">
                          {name}
                        </span>
                        <p className="text-xs font-bold text-slate-800 flex-shrink-0">
                          ₱{value.toFixed(0)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center text-slate-400 text-sm"
                  style={{ height: 180 }}
                >
                  No payment data available
                </div>
              )}
            </div>

            {/* Unit Breakdown */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Items by Unit Type</h2>
              <p className="text-xs text-slate-500 mb-4">Distribution of items sold</p>
              {/* FIX: use safeUnitBreakdown — never undefined */}
              {safeUnitBreakdown.length > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div style={{ width: 180, height: 180, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={safeUnitBreakdown}
                          cx="50%" cy="50%"
                          innerRadius="50%" outerRadius="78%"
                          paddingAngle={3}
                          dataKey="quantity"
                          labelLine={false}
                        >
                          {safeUnitBreakdown.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[(index + 2) % COLORS.length]}
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
                          // FIX: properly typed formatter — no more cast needed
                          formatter={(value: unknown, _name: unknown, props: { payload?: UnitBreakdownItem }): [string, string] => {
                            const p = props.payload;
                            return [
                              `${Number(value ?? 0)} units (${(p?.percentage ?? 0).toFixed(1)}%)`,
                              p?.type ?? '',
                            ];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 w-full flex flex-col gap-2">
                    {safeUnitBreakdown.map((item, index) => (
                      <div
                        key={item.type}
                        className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COLORS[(index + 2) % COLORS.length] }}
                        />
                        <span className="text-sm text-slate-700 font-medium flex-1 truncate">
                          {item.type}
                        </span>
                        <p className="text-xs font-bold text-slate-800 flex-shrink-0">
                          {item.quantity}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center text-slate-400 text-sm"
                  style={{ height: 180 }}
                >
                  No unit data available
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Medicines Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'medicines' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Top Selling Medicines</h2>
            {sortedMeds.length > 0 ? (
              <div className="flex flex-col gap-4 max-h-96 overflow-y-auto pr-1">
                {sortedMeds.slice(0, 10).map((medicine, index) => {
                  const badge =
                    index === 0
                      ? { text: 'text-yellow-700', icon: '🏆' }
                      : index === 1
                      ? { text: 'text-slate-700',  icon: '🥈' }
                      : index === 2
                      ? { text: 'text-orange-700', icon: '🥉' }
                      : null;
                  return (
                    <div
                      key={medicine.medicineId}
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
                            {medicine.medicineName}
                          </p>
                          {medicine.strength && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100/50 uppercase tracking-wider shrink-0">
                              {medicine.strength}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          <span className="font-semibold text-slate-700">
                            {medicine.totalQuantity}
                          </span>{' '}
                          qty{' · '}
                          <span className="font-semibold text-slate-700">
                            {medicine.salesCount}
                          </span>{' '}
                          sales
                        </p>
                      </div>
                      <p className="text-sm font-bold text-slate-900 flex-shrink-0">
                        {peso(medicine.totalRevenue)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center text-slate-400 text-sm py-16">
                No medicine sales data available
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 overflow-x-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-4">All Medicines</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-slate-700 font-semibold text-xs text-left">
                    Medicine
                  </th>
                  {['Quantity', 'Sales', 'Revenue'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-slate-700 font-semibold text-xs text-center"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedMeds.map((medicine) => (
                  <tr
                    key={medicine.medicineId}
                    className="border-b border-slate-100 hover:bg-slate-50 transition"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-900 font-medium">
                          {medicine.medicineName}
                        </span>
                        {medicine.strength && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100/50 uppercase tracking-wider">
                            {medicine.strength}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {medicine.totalQuantity}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {medicine.salesCount}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-900 font-semibold">
                      {peso(medicine.totalRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Daily Tab ─────────────────────────────────────────────────────────── */}
      {activeTab === 'daily' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 overflow-x-auto">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Daily Summary</h2>
          {dailySalesSummaries.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  {['Date', 'Transactions', 'Items Sold', 'Revenue', 'Avg / Sale'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-slate-700 font-semibold text-xs text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailySalesSummaries.map((day) => {
                  const avgSale = day.salesCount > 0 ? day.totalRevenue / day.salesCount : 0;
                  const isToday = day.date === getTodayPH();
                  return (
                    <tr
                      key={day.date}
                      className={`border-b border-slate-100 transition ${
                        isToday
                          ? 'bg-blue-50 hover:bg-blue-100'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-3 font-medium flex items-center gap-2">
                        <span className={isToday ? 'text-blue-700' : 'text-slate-900'}>
                          {day.displayDate}
                        </span>
                        {isToday && (
                          <span className="text-[10px] font-semibold bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                            Today
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-700">
                        {day.salesCount}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-700">
                        {day.totalItems}
                      </td>
                      <td
                        className={`px-4 py-3 font-semibold ${
                          isToday ? 'text-blue-700' : 'text-slate-900'
                        }`}
                      >
                        {peso(day.totalRevenue)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{peso(avgSale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-slate-400 text-center py-12">
              No sales data for selected date range
            </p>
          )}
        </div>
      )}

    </div>
  );
}