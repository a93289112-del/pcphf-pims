'use client';

import React from 'react';
import {
  getMedicineStatusList,
  calculateInventorySummary,
} from '@/lib/services/inventory-summary';
import { type Medicine, type FirebaseTransaction } from '@/lib/types';

interface InventoryOverviewProps {
  medicines: Medicine[];
  transactions?: FirebaseTransaction[];
  compact?: boolean;
}

interface StatusCount {
  inStock: number;
  low: number;
  out: number;
  expired: number;
  expiring: number;
}

// Quick stats badge for dashboard
function StatusCountBadge({ count, status }: { count: number; status: string }) {
  const config: Record<string, { bg: string; text: string; icon: string }> = {
    inStock: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: '✓' },
    low: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '⚠️' },
    out: { bg: 'bg-red-100', text: 'text-red-700', icon: '✕' },
    expiring: { bg: 'bg-orange-100', text: 'text-orange-700', icon: '⏰' },
    expired: { bg: 'bg-slate-800 text-white', text: 'text-white', icon: '✕' },
  };

  const cfg = config[status] || config.inStock;

  if (count === 0) return null;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold ${cfg.bg} ${cfg.text}`}>
      <span>{cfg.icon}</span>
      <span>{count}</span>
    </div>
  );
}

export default function InventoryOverview({
  medicines,
  transactions = [],
  compact = false,
}: InventoryOverviewProps) {
  const summary = React.useMemo(
    () => calculateInventorySummary(medicines, transactions),
    [medicines, transactions],
  );

  const medicineList = React.useMemo(
    () => getMedicineStatusList(medicines, transactions),
    [medicines, transactions],
  );

  // Count statuses
  const statusCounts: StatusCount = React.useMemo(() => {
    return {
      inStock: medicineList.filter((m) => m.status === 'inStock').length,
      low: medicineList.filter((m) => m.status === 'low').length,
      out: medicineList.filter((m) => m.status === 'out').length,
      expired: medicineList.filter((m) => m.status === 'expired').length,
      expiring: medicineList.filter((m) => m.status === 'expiring').length,
    };
  }, [medicineList]);

  return (
    <div className="w-full">
      {compact ? (
        // Compact version - quick summary cards
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 text-center shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Total Stock Units
            </p>
            <p className="text-2xl sm:text-3xl font-black text-slate-900">
              {summary.totalStockUnits.toLocaleString()}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 text-center shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Stock Value
            </p>
            <p className="text-lg sm:text-xl font-black text-purple-600">
              ₱{(summary.totalStockValue / 1000).toFixed(0)}K
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 text-center shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Low Stock
            </p>
            <p className="text-2xl sm:text-3xl font-black text-yellow-600">
              {statusCounts.low}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 text-center shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Critical Items
            </p>
            <p className="text-2xl sm:text-3xl font-black text-red-600">
              {statusCounts.out + statusCounts.expired}
            </p>
          </div>
        </div>
      ) : (
        // Full version
        <div className="space-y-4">
          {/* Overview Section */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Inventory Overview</h3>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-linear-to-br from-blue-50 to-blue-100/30 rounded-xl p-4 border border-blue-100">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">
                  Total Medicines
                </p>
                <p className="text-3xl font-black text-blue-700">
                  {summary.totalMedicines}
                </p>
              </div>

              <div className="bg-linear-to-br from-emerald-50 to-emerald-100/30 rounded-xl p-4 border border-emerald-100">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">
                  Total Stock
                </p>
                <p className="text-3xl font-black text-emerald-700">
                  {summary.totalStockUnits.toLocaleString()}
                </p>
              </div>

              <div className="bg-linear-to-br from-purple-50 to-purple-100/30 rounded-xl p-4 border border-purple-100">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">
                  Stock Value
                </p>
                <p className="text-3xl font-black text-purple-700">
                  ₱{(summary.totalStockValue / 1000).toFixed(1)}K
                </p>
              </div>
            </div>

            {/* Status Summary */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-sm font-bold text-slate-900 mb-3">Stock Status Summary</p>
              <div className="flex flex-wrap gap-2">
                {statusCounts.inStock > 0 && (
                  <StatusCountBadge count={statusCounts.inStock} status="inStock" />
                )}
                {statusCounts.low > 0 && (
                  <StatusCountBadge count={statusCounts.low} status="low" />
                )}
                {statusCounts.out > 0 && (
                  <StatusCountBadge count={statusCounts.out} status="out" />
                )}
                {statusCounts.expiring > 0 && (
                  <StatusCountBadge count={statusCounts.expiring} status="expiring" />
                )}
                {statusCounts.expired > 0 && (
                  <StatusCountBadge count={statusCounts.expired} status="expired" />
                )}
              </div>
            </div>
          </div>

          {/* Transaction Metrics */}
          {transactions.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Transaction Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Dispensed
                  </p>
                  <p className="text-2xl font-black text-blue-600">
                    {summary.totalUnitsDispensed.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Sold
                  </p>
                  <p className="text-2xl font-black text-emerald-600">
                    {summary.totalUnitsSold.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Adjusted
                  </p>
                  <p className="text-2xl font-black text-violet-600">
                    {summary.totalUnitsAdjusted.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Transactions
                  </p>
                  <p className="text-2xl font-black text-slate-600">
                    {summary.totalTransactions.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
