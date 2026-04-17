'use client';

import React, { useMemo } from 'react';
import {
  type InventorySummary,
  type MedicineInventoryStatus,
  calculateInventorySummary,
  getMedicineStatusList,
  sortMedicinesByStatus,
  getCategoryBreakdown,
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
    optimal: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Optimal' },
    low: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Low Stock' },
    out: { bg: 'bg-red-100', text: 'text-red-700', label: 'Out of Stock' },
    expired: { bg: 'bg-black', text: 'text-white', label: 'Expired' },
    expiring: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Expiring Soon' },
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
  const stats = [
    {
      label: 'Total Medicines',
      value: summary.totalMedicines,
      color: 'text-blue-600',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 015.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 006.354-5.646z" /></svg>,
    },
    {
      label: 'Total Stock Units',
      value: summary.totalStockUnits.toLocaleString(),
      color: 'text-emerald-600',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>,
    },
    {
      label: 'Stock Value',
      value: `₱${summary.totalStockValue.toFixed(2)}`,
      color: 'text-purple-600',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: 'Avg Stock/Medicine',
      value: summary.avgStockPerMedicine.toFixed(1),
      color: 'text-slate-600',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
    },
    {
      label: 'Units Dispensed',
      value: summary.totalUnitsDispensed.toLocaleString(),
      color: 'text-blue-600',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m-6 3.75l3 3m0 0l3-3m-3 3V1.5m6 9h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75" /></svg>,
    },
    {
      label: 'Units Sold (POS)',
      value: summary.totalUnitsSold.toLocaleString(),
      color: 'text-emerald-600',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.821 4.915h15.412c.516 0 .949.589.788 1.067l-1.528 4.684a1.125 1.125 0 01-1.066.755H7.5M12 15a3 3 0 11-6 0 3 3 0 016 0zm0 0a3 3 0 015.25 2.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: 'Low Stock Count',
      value: summary.lowStockCount,
      color: 'text-yellow-600',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
    },
    {
      label: 'Out of Stock',
      value: summary.outOfStockCount,
      color: 'text-red-600',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {stat.label}
              </p>
              <p className={`text-2xl font-black ${stat.color}`}>
                {stat.value}
              </p>
            </div>
            <div className={`text-slate-400 ${stat.color}`}>
              {stat.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Status Overview Cards
function StatusOverviewCards({ summary }: { summary: InventorySummary }) {
  const overviewCards = [
    {
      label: 'In Stock',
      value: summary.optimalStockCount,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      label: 'Low Stock',
      value: summary.lowStockCount,
      color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    },
    {
      label: 'Expiring Soon',
      value: summary.expiringCount,
      color: 'bg-orange-50 text-orange-700 border-orange-200',
    },
    {
      label: 'Expired',
      value: summary.expiredCount,
      color: 'bg-red-50 text-red-700 border-red-200',
    },
    {
      label: 'Out of Stock',
      value: summary.outOfStockCount,
      color: 'bg-slate-50 text-slate-700 border-slate-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {overviewCards.map((card) => (
        <div
          key={card.label}
          className={`border rounded-lg p-3 text-center ${card.color}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide mb-1">
            {card.label}
          </p>
          <p className="text-2xl font-black">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

// Medicine Details Table
function MedicineDetailsTable({
  medicines,
  criticalOnly = false,
}: {
  medicines: MedicineInventoryStatus[];
  criticalOnly?: boolean;
}) {
  const filtered = criticalOnly
    ? medicines.filter((m) => m.status !== 'optimal')
    : medicines;
  const sorted = sortMedicinesByStatus(filtered, criticalOnly ? 'critical' : 'all');

  if (sorted.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <p>No medicines to display</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 text-left font-bold text-slate-700">Medicine</th>
            <th className="px-4 py-3 text-left font-bold text-slate-700">Category</th>
            <th className="px-4 py-3 text-center font-bold text-slate-700">Current Stock</th>
            <th className="px-4 py-3 text-center font-bold text-slate-700">Min Level</th>
            <th className="px-4 py-3 text-center font-bold text-slate-700">Status</th>
            <th className="px-4 py-3 text-right font-bold text-slate-700">Unit Cost</th>
            <th className="px-4 py-3 text-right font-bold text-slate-700">Total Value</th>
            <th className="px-4 py-3 text-center font-bold text-slate-700">Dispensed</th>
            <th className="px-4 py-3 text-center font-bold text-slate-700">Sold</th>
            <th className="px-4 py-3 text-center font-bold text-slate-700">Adjusted</th>
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
              <td className="px-4 py-3 text-center text-slate-600 tabular-nums">
                {medicine.minStock.toLocaleString()}
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
              <td className="px-4 py-3 text-center text-blue-600 font-semibold">
                {medicine.dispensedQty.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center text-emerald-600 font-semibold">
                {medicine.soldQty.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center text-violet-600 font-semibold">
                {medicine.adjustedQty > 0 ? '+' : ''}{medicine.adjustedQty.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 border-t-2 border-slate-300">
            <td className="px-4 py-3 font-bold text-slate-900" colSpan={2}>
              Total
            </td>
            <td className="px-4 py-3 text-center font-black text-slate-900 tabular-nums">
              {sorted.reduce((sum, m) => sum + m.currentStock, 0).toLocaleString()}
            </td>
            <td colSpan={7} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Category Breakdown Table
function CategoryBreakdownTable({ medicines }: { medicines: MedicineInventoryStatus[] }) {
  const categories = getCategoryBreakdown(medicines);

  if (categories.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold text-slate-900 mb-4">Stock by Category</h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-bold text-slate-700">Category</th>
              <th className="px-4 py-3 text-center font-bold text-slate-700">Medicines</th>
              <th className="px-4 py-3 text-right font-bold text-slate-700">Total Stock</th>
              <th className="px-4 py-3 text-right font-bold text-slate-700">Total Value</th>
              <th className="px-4 py-3 text-right font-bold text-slate-700">Avg Unit Cost</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr
                key={cat.category}
                className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <td className="px-4 py-3 font-semibold text-slate-900">{cat.category}</td>
                <td className="px-4 py-3 text-center font-semibold text-slate-900">{cat.medicineCount}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                  {cat.totalStock.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900 font-mono">
                  ₱{cat.totalValue.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right text-slate-600 font-mono">
                  ₱{cat.avgUnitCost.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      <StatusOverviewCards summary={summary} />

      {showDetailedTable && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">
              {criticalOnly ? 'Critical Items' : 'All Medicines Inventory'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {criticalOnly
                ? 'Medicines requiring immediate attention'
                : 'Complete inventory status across all medicines'}
            </p>
          </div>
          <div className="p-0">
            <MedicineDetailsTable medicines={medicineStatusList} criticalOnly={criticalOnly} />
          </div>
        </div>
      )}

      {showDetailedTable && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm p-6 mt-6">
          <CategoryBreakdownTable medicines={medicineStatusList} />
        </div>
      )}
    </div>
  );
}

export { MedicineDetailsTable, SummaryStatsGrid, StatusOverviewCards, CategoryBreakdownTable };