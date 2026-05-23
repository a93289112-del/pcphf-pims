'use client';

import React, { useMemo, useState } from 'react';
import {
  type InventorySummary,
  type MedicineInventoryStatus,
  calculateInventorySummary,
  getMedicineStatusList,
  sortMedicinesByStatus,
} from '@/lib/services/inventory-summary';
import { type Medicine, type FirebaseTransaction } from '@/lib/types';

interface InventorySummaryProps {
  medicines: Medicine[];
  transactions: FirebaseTransaction[];
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  showDetailedTable?: boolean;
  criticalOnly?: boolean;
}

// Status Badge Component
function StatusBadge({ status }: { status: MedicineInventoryStatus['status'] }) {
  const config = {
    inStock: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'In Stock' },
    low: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Low Stock' },
    out: { bg: 'bg-red-100', text: 'text-red-700', label: 'Out of Stock' },
    expired: { bg: 'bg-black', text: 'text-white', label: 'Expired' },
    expiring: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Expiring Soon' },
    critical: { bg: 'bg-red-200', text: 'text-red-900', label: 'Critical' },
  };

  const cfg = config[status];
  return (
    <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

// Summary Stats Grid
function SummaryStatsGrid({ summary }: { summary: InventorySummary }) {
  const accentMap: Record<string, { bg: string; icon: string }> = {
    indigo: { bg: 'bg-indigo-50', icon: 'bg-indigo-600 text-white' },
    amber: { bg: 'bg-amber-50', icon: 'bg-amber-500 text-white' },
    emerald: { bg: 'bg-emerald-50', icon: 'bg-emerald-500 text-white' },
    teal: { bg: 'bg-teal-50', icon: 'bg-teal-600 text-white' },
  };

  const stats = [
    {
      title: 'Total Medicines',
      value: summary.totalMedicines,
      accent: 'indigo',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L20 9m-8 4.5L4 5m7.5 9L12 17.5m.5-13H11a1 1 0 00-1 1v6a1 1 0 001 1h1a1 1 0 001-1V5a1 1 0 00-1-1z" />
        </svg>
      ),
    },
    {
      title: 'Total Stock Units',
      value: summary.totalStockUnits.toLocaleString(),
      accent: 'emerald',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m0 10v10l8 4m0-10l8 4" />
        </svg>
      ),
    },
    {
      title: 'Stock Value',
      value: `₱${summary.totalStockValue.toFixed(0)}`,
      accent: 'amber',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: 'Units Dispensed',
      value: summary.totalUnitsDispensed.toLocaleString(),
      accent: 'teal',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2m0 0v-8m0 8l6-4m-6 4l-6-4" />
        </svg>
      ),
    },
    {
      title: 'Units Sold (POS)',
      value: summary.totalUnitsSold.toLocaleString(),
      accent: 'indigo',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      title: 'Low Stock Count',
      value: summary.lowStockCount,
      accent: 'amber',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4v2m0 5v1M7.08 6.47A9.969 9.969 0 0112 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12c0-1.821.487-3.53 1.333-5" />
        </svg>
      ),
    },
    {
      title: 'Out of Stock',
      value: summary.outOfStockCount,
      accent: 'teal',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => {
        const accent = accentMap[stat.accent];
        return (
          <div
            key={stat.title}
            className="group relative bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
          >
            <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full ${accent.bg} opacity-60 blur-xl pointer-events-none`} />
            <div className="relative">
              <div className={`p-2.5 rounded-xl ${accent.icon} shadow-sm w-fit mb-5`}>
                {stat.icon}
              </div>
              <p className="text-3xl font-black text-slate-900 leading-none mb-1.5">{stat.value}</p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.title}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Medicine Details Table
// Medicine Details Table — add overflow-y-auto wrapper
function MedicineDetailsTable({
  medicines,
  criticalOnly = false,
  statusFilter = null,
}: {
  medicines: MedicineInventoryStatus[];
  criticalOnly?: boolean;
  statusFilter?: string | null;
}) {
  let filtered = medicines;

  if (criticalOnly) {
    filtered = medicines.filter((m) => m.status === 'critical');
  } else if (statusFilter) {
    // Map filter types to medicine statuses
    const filterMap: Record<string, string[]> = {
      'critical': ['critical'],
      'low': ['low'],
      'expiring': ['expiring'],
      'out-of-stock': ['out'],
    };
    const targetStatuses = filterMap[statusFilter] || [];
    filtered = medicines.filter((m) => targetStatuses.includes(m.status));
  }

  const sorted = sortMedicinesByStatus(filtered, criticalOnly ? 'critical' : 'all');

  if (sorted.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <p>No medicines to display</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-y-auto overflow-x-auto rounded-xl border border-slate-200 shadow-sm
                 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent
                 hover:scrollbar-thumb-slate-400"
      style={{ maxHeight: '420px' }}
    >
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 text-left font-bold text-slate-700">Medicine</th>
            <th className="px-4 py-3 text-left font-bold text-slate-700">Category</th>
            <th className="px-4 py-3 text-center font-bold text-slate-700">Current Stock</th>
            <th className="px-4 py-3 text-center font-bold text-slate-700">Status</th>
            <th className="px-4 py-3 text-right font-bold text-slate-700">Unit Cost</th>
            <th className="px-4 py-3 text-right font-bold text-slate-700">Total Value</th>
            <th className="px-4 py-3 text-center font-bold text-slate-700">Dispensed</th>
            <th className="px-4 py-3 text-center font-bold text-slate-700">Sold</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((medicine) => (
            <tr
              key={medicine.id}
              className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
            >
              <td className="px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {medicine.baseName || medicine.name}
                  </p>
                  {medicine.strength && (
                    <p className="text-xs text-slate-400">{medicine.strength}</p>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600">{medicine.category}</td>
              <td className="px-4 py-3 text-center font-semibold text-slate-900 tabular-nums">
                {medicine.currentStock.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center">
                <StatusBadge status={medicine.status} />
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-600">
                ₱{medicine.unitCost.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900 font-mono">
                ₱{medicine.totalValue.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-center text-slate-900 font-semibold">
                {medicine.dispensedQty.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center text-slate-900 font-semibold">
                {medicine.soldQty.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0">
          <tr className="bg-slate-50 border-t-2 border-slate-300">
            <td className="px-4 py-3 font-bold text-slate-900" colSpan={2}>
              Total
            </td>
            <td className="px-4 py-3 text-center font-black text-slate-900 tabular-nums">
              {sorted.reduce((sum, m) => sum + m.currentStock, 0).toLocaleString()}
            </td>
            <td colSpan={5} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Main Component
export default function InventorySummaryComponent({
  medicines,
  transactions,
  dateRangeStart,
  dateRangeEnd,
  showDetailedTable = true,
  criticalOnly = false,
}: InventorySummaryProps) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const summary = useMemo(
    () => calculateInventorySummary(medicines, transactions, dateRangeStart, dateRangeEnd),
    [medicines, transactions, dateRangeStart, dateRangeEnd],
  );

  const medicineStatusList = useMemo(
    () => getMedicineStatusList(medicines, transactions, dateRangeStart, dateRangeEnd),
    [medicines, transactions, dateRangeStart, dateRangeEnd],
  );

  return (
    <div className="w-full">
      <SummaryStatsGrid summary={summary} />

      {showDetailedTable && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mt-4">
              {criticalOnly ? 'Critical Items' : activeFilter ? 'Filtered Medicines' : 'All Medicines Inventory'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {criticalOnly
                ? 'Medicines requiring immediate attention'
                : activeFilter
                  ? 'Medicines matching the selected alert category'
                  : 'Complete inventory status across all medicines'}
            </p>
          </div>
          <div className="p-0">
            <MedicineDetailsTable medicines={medicineStatusList} criticalOnly={criticalOnly} statusFilter={activeFilter} />
          </div>
        </div>
      )}
    </div>
  );
}

export { MedicineDetailsTable, SummaryStatsGrid };