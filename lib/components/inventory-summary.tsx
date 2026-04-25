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
      icon: (
        // Pill outline
        <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M10.5 20H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v2" />
          <circle cx="17" cy="17" r="5" />
          <path d="m14.5 19.5 5-5" />
        </svg>
      ),
    },
    {
      label: 'Total Stock Units',
      value: summary.totalStockUnits.toLocaleString(),
      icon: (
        // Archive box outline
        <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M21 8H3M21 8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1M21 8l-1.5-4.5a1 1 0 0 0-.95-.5H5.45a1 1 0 0 0-.95.5L3 8" />
          <path d="M10 13h4" />
        </svg>
      ),
    },
    {
      label: 'Stock Value',
      value: `₱${summary.totalStockValue.toFixed(2)}`,
      icon: (
        // Circle dollar outline
        <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v10" />
          <path d="M15.5 9.5A3.5 3.5 0 0 0 12 8c-1.93 0-3.5 1.12-3.5 2.5S10.07 13 12 13s3.5 1.12 3.5 2.5S13.93 18 12 18a3.5 3.5 0 0 1-3.5-1.5" />
        </svg>
      ),
    },
    {
      label: 'Avg Stock/Medicine',
      value: summary.avgStockPerMedicine.toFixed(1),
      icon: (
        // Bar chart outline
        <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="3" y="12" width="4" height="9" rx="1" />
          <rect x="10" y="7" width="4" height="14" rx="1" />
          <rect x="17" y="3" width="4" height="18" rx="1" />
        </svg>
      ),
    },
    {
      label: 'Units Dispensed',
      value: summary.totalUnitsDispensed.toLocaleString(),
      icon: (
        // Tray arrow down outline
        <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M12 3v12" />
          <path d="m8 11 4 4 4-4" />
          <path d="M8 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1" />
          <path d="M19 5h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3" />
          <path d="M8 19h8" />
        </svg>
      ),
    },
    {
      label: 'Units Sold (POS)',
      value: summary.totalUnitsSold.toLocaleString(),
      icon: (
        // Shopping cart outline
        <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      ),
    },
    {
      label: 'Low Stock Count',
      value: summary.lowStockCount,
      icon: (
        // Triangle alert outline
        <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    {
      label: 'Out of Stock',
      value: summary.outOfStockCount,
      icon: (
        // Circle X outline
        <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="m15 9-6 6M9 9l6 6" />
        </svg>
      ),
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
              <p className="text-2xl font-black text-slate-900">
                {stat.value}
              </p>
            </div>
            <div className="text-slate-400">
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
      bg: 'bg-emerald-50 border-emerald-200',
    },
    {
      label: 'Low Stock',
      value: summary.lowStockCount,
      bg: 'bg-yellow-50 border-yellow-200',
    },
    {
      label: 'Expiring Soon',
      value: summary.expiringCount,
      bg: 'bg-orange-50 border-orange-200',
    },
    {
      label: 'Expired',
      value: summary.expiredCount,
      bg: 'bg-red-50 border-red-200',
    },
    {
      label: 'Out of Stock',
      value: summary.outOfStockCount,
      bg: 'bg-slate-50 border-slate-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {overviewCards.map((card) => (
        <div
          key={card.label}
          className={`border rounded-lg p-3 text-center ${card.bg}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide mb-1 text-slate-500">
            {card.label}
          </p>
          <p className="text-2xl font-black text-slate-900">{card.value}</p>
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
              <td className="px-4 py-3 text-center text-slate-900 font-semibold">
                {medicine.dispensedQty.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center text-slate-900 font-semibold">
                {medicine.soldQty.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center text-slate-900 font-semibold">
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