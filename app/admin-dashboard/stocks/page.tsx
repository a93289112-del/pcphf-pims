'use client';

import { useEffect, useState } from 'react';
import { database } from '@/lib/services/firebase';
import { ref, onValue } from 'firebase/database';
import { PieChart, Pie, ResponsiveContainer, Tooltip as RechartsTooltip, Legend as RechartsLegend } from 'recharts';
import { type Medicine } from '@/lib/types';

export default function StockMonitoring() {

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Since all staff now share the same global inventory, read directly from 'medicines'
    const medicinesRef = ref(database, 'medicines');
    const unsubscribe = onValue(medicinesRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data) {
        const meds: Medicine[] = Object.entries(data as Record<string, Omit<Medicine, 'id'>>).map(([id, med]) => ({
          id,
          ...med,
        } as Medicine));
        setMedicines(meds);
      } else {
        setMedicines([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getEffectiveStock = (m: Medicine): number => {
    if (m.quantity !== undefined) return m.quantity;
    return Math.max(m.stockPerUnit ?? 0, m.stockPerPieces ?? 0);
  };

  const totalStock = (() => medicines.reduce((s, m) => s + getEffectiveStock(m), 0))();
  
  const inventoryValue = (() => {
    return medicines.reduce((sum, m) => {
      if (m.totalCost !== undefined) return sum + m.totalCost;
      const qty = m.containerQuantity ?? (m.quantity || 0);
      return sum + (qty * (m.unitCost || 0));
    }, 0);
  })();

  const categoryData = (() => {
    const counts: Record<string, number> = {};
    medicines.forEach(m => {
      const cat = m.category || 'Uncategorized';
      counts[cat] = (counts[cat] || 0) + getEffectiveStock(m);
    });
    return Object.entries(counts).map(([name, value], index) => ({ 
      name, 
      value, 
      fill: COLORS[index % COLORS.length] 
    }));
  })();

  const lowStockItems = (() => medicines.filter(m => {
    const s = getEffectiveStock(m);
    const min = m.minStock ?? 0;
    return min > 0 && s <= min && s > 0;
  }))();

  const expiredItems = (() => medicines.filter(m => {
    return !!m.expirationDate && new Date(m.expirationDate) < new Date();
  }))();

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-all duration-300 bg-slate-50/70 w-full overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">Overall Stock Monitoring</h1>
          <p className="text-slate-500">Comprehensive view of inventory levels and health</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Summary Stats */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Total Stock Units</p>
              <p className="text-5xl font-black text-slate-900">{totalStock.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Inventory Value</p>
              <p className="text-4xl font-black text-emerald-600">₱{inventoryValue.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Stock Alerts</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 text-red-700 border border-red-100">
                  <span className="text-sm font-bold">Expired Medicines</span>
                  <span className="text-lg font-black">{expiredItems.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50 text-orange-700 border border-orange-100">
                  <span className="text-sm font-bold">Low Stock Items</span>
                  <span className="text-lg font-black">{lowStockItems.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Category Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-900 mb-6">Stock by Category</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    fill="#3b82f6"
                  />
                  <RechartsTooltip />
                  <RechartsLegend verticalAlign="bottom" align="center" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Detailed Table for Alerts */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Inventory Health Alerts</h2>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Medicine Name</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Category</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Stock</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Min Stock</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...expiredItems, ...lowStockItems].map((m) => {
                const stock = getEffectiveStock(m);
                const isExpired = !!m.expirationDate && new Date(m.expirationDate) < new Date();
                
                return (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-slate-900">{m.baseName || m.name}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{m.category}</td>
                    <td className="px-6 py-4 text-sm font-black text-right">{stock.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 text-right">{m.minStock || '—'}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                        isExpired ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {isExpired ? 'Expired' : 'Low Stock'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {expiredItems.length === 0 && lowStockItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-slate-500 font-medium italic">No critical stock alerts found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
