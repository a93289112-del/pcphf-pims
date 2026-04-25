'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { database } from '@/lib/services/firebase';
import { ref, onValue } from 'firebase/database';
import InventorySummary from '@/lib/components/inventory-summary';
import { type Medicine, type FirebaseTransaction } from '@/lib/types';

// ── Inline SVG icons ────────────────────────────────────────────────────────
const IconBox = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </svg>
);

export default function InventoryReports() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [transactions, setTransactions] = useState<FirebaseTransaction[]>([]);
  const [isLoadingMedicines, setIsLoadingMedicines] = useState(true);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);


  // Auth guard
  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  // Load all medicines (system-wide)
  useEffect(() => {
    const unsubscribe = onValue(ref(database, 'medicines'), (snapshot) => {
      const data = snapshot.val();
      setMedicines(
        data
          ? Object.entries(data as Record<string, Omit<Medicine, 'id'>>).map(([id, v]) => ({ id, ...v } as Medicine))
          : []
      );
      setIsLoadingMedicines(false);
    });
    return () => unsubscribe();
  }, []);

  // Load all transactions (system-wide, no staff filter)
  useEffect(() => {
    const unsubscribe = onValue(ref(database, 'transactions'), (snap) => {
      const data = snap.val();
      const allTransactions = data ? (Object.values(data) as FirebaseTransaction[]) : [];
      setTransactions(allTransactions);
      setIsLoadingTransactions(false);
    });
    return () => unsubscribe();
  }, []);

  const isLoading = loading || isLoadingMedicines || isLoadingTransactions;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm tracking-wide">Loading inventory data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f9f8] w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* ── Page header ── */}
        <div className="mb-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">Pharmacy Overview</h1>
            <p className="text-slate-500">Real-time system-wide inventory and transaction data</p>
          </div>


        </div>

        {/* ── Content area ── */}
        {medicines.length > 0 ? (
          <InventorySummary
            medicines={medicines}
            transactions={transactions}
            showDetailedTable={true}
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-14 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-5">
              <IconBox />
            </div>
            <h2 className="text-base font-semibold text-slate-800 mb-1.5">No Inventory Data</h2>
            <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
              No medicines found in the system. Add medicines first to view inventory reports.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}