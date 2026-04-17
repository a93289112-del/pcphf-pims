'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { database } from '@/lib/services/firebase';
import { ref, onValue } from 'firebase/database';
import InventorySummary from '@/lib/components/inventory-summary';
import { type Medicine, type FirebaseTransaction } from '@/lib/types';

interface UserData {
  role: string;
  status: string;
  email: string;
  pharmacistInCharge?: {
    fullName: string;
    licenseNumber: string;
    contactDetails: string;
  };
}

interface StaffMember {
  uid: string;
  email: string;
  status: 'pending' | 'approved' | 'disabled';
  pharmacistInCharge?: {
    fullName: string;
    licenseNumber: string;
    contactDetails: string;
  };
}

// ── Inline SVG icons ────────────────────────────────────────────────────────
const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

const IconBadge = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="12" cy="10" r="3" />
    <path d="M7 20v-1a5 5 0 0 1 10 0v1" />
  </svg>
);

const IconCalendar = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const IconChevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const IconX = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const IconBox = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </svg>
);

const IconUsers = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="7" r="4" />
    <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" />
  </svg>
);

export default function InventoryReports() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [selectedStaffUid, setSelectedStaffUid] = useState<string>('');
  const [selectedStaffInfo, setSelectedStaffInfo] = useState<StaffMember | null>(null);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [transactions, setTransactions] = useState<FirebaseTransaction[]>([]);
  const [isLoadingMedicines, setIsLoadingMedicines] = useState(true);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');

  // Auth guard
  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  // Load all staff members
  useEffect(() => {
    if (!user) return;
    const usersRef = ref(database, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val() as Record<string, UserData> | null;
      if (data) {
        const staffList = Object.entries(data)
          .filter(([, userData]) => userData?.role === 'staff' && userData?.status === 'approved')
          .map(([uid, userData]) => ({
            uid,
            email: userData.email,
            status: userData.status as 'approved',
            pharmacistInCharge: userData.pharmacistInCharge,
          }));
        setStaffMembers(staffList);
        if (staffList.length > 0 && !selectedStaffUid) {
          setSelectedStaffUid(staffList[0].uid);
          setSelectedStaffInfo(staffList[0]);
        }
      } else {
        setStaffMembers([]);
      }
      setIsLoadingStaff(false);
    });
    return () => unsubscribe();
  }, [user, selectedStaffUid]);

  const handleStaffChange = (uid: string) => {
    setSelectedStaffUid(uid);
    const staff = staffMembers.find((s) => s.uid === uid);
    if (staff) setSelectedStaffInfo(staff);
  };

  // Load medicines (now globally shared across all staff)
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

  // Load transactions (now globally shared, but can filter by selected staff)
  useEffect(() => {
    const unsubscribe = onValue(ref(database, 'transactions'), (snap) => {
      const data = snap.val();
      const allTransactions = data ? (Object.values(data) as FirebaseTransaction[]) : [];
      
      // Filter by selected staff if one is selected
      const filtered = selectedStaffUid
        ? allTransactions.filter(t => t.userId === selectedStaffUid)
        : allTransactions;
      
      setTransactions(filtered);
      setIsLoadingTransactions(false);
    });
    return () => unsubscribe();
  }, [selectedStaffUid]);

  const isLoading = loading || isLoadingStaff || isLoadingMedicines || isLoadingTransactions;

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

  const dateRangeStartDate = dateRangeStart ? new Date(dateRangeStart + 'T00:00:00') : undefined;
  const dateRangeEndDate = dateRangeEnd ? new Date(dateRangeEnd + 'T23:59:59') : undefined;
  const hasDateFilter = dateRangeStart || dateRangeEnd;

  return (
    <div className="min-h-screen bg-[#f9f9f8] w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* ── Page header (untouched) ── */}
        <div className="mb-10">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">Pharmacy Overview</h1>
          <p className="text-slate-500">View stock levels and transaction history</p>
        </div>

        {/* ── Control bar ── */}
        {staffMembers.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 overflow-hidden">

                    {/* Staff selector row */}
        <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-5 border-b border-slate-100">

          {/* Dropdown */}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <IconUser />
              Staff Member
            </p>
            <div className="relative">
              <select
                value={selectedStaffUid}
                onChange={(e) => handleStaffChange(e.target.value)}
                className="w-full appearance-none pl-3 pr-9 py-2.5 text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300 text-slate-800 transition-all cursor-pointer"
              >
                {staffMembers.map((staff) => (
                  <option key={staff.uid} value={staff.uid}>
                    {staff.pharmacistInCharge?.fullName || staff.email}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <IconChevron />
              </span>
            </div>
          </div>

          {/* Pharmacist meta pill */}
          {selectedStaffInfo?.pharmacistInCharge?.licenseNumber && (
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <IconBadge />
                License
              </p>
              <div className="flex items-center px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-sm font-mono font-medium text-slate-700">
                  {selectedStaffInfo.pharmacistInCharge.licenseNumber}
                </p>
              </div>
            </div>
          )}
        </div>

                      {/* Date range row */}
          <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-end gap-4">
            
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <IconCalendar />
                From
              </p>
              <input
                type="date"
                value={dateRangeStart}
                onChange={(e) => setDateRangeStart(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300 text-slate-800 transition-all"
              />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <IconCalendar />
                To
              </p>
              <input
                type="date"
                value={dateRangeEnd}
                onChange={(e) => setDateRangeEnd(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300 text-slate-800 transition-all"
              />
            </div>

            <div className="shrink-0">
              <button
                onClick={() => { setDateRangeStart(''); setDateRangeEnd(''); }}
                disabled={!hasDateFilter}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl border transition-all disabled:opacity-30 disabled:cursor-not-allowed
                  text-slate-500 hover:text-slate-800 bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white"
              >
                <IconX />
                Clear
              </button>
            </div>

            {hasDateFilter && (
              <div className="shrink-0">
                <span className="inline-flex items-center px-3 py-2.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
                  Filtered
                </span>
              </div>
            )}

          </div>
          </div>
        )}

        {/* ── Content area ── */}
        {staffMembers.length === 0 ? (
          <EmptyState
            icon={<IconUsers />}
            title="No Staff Members"
            description="No approved staff members found. Create and approve staff accounts first to view their inventory reports."
          />
        ) : medicines.length > 0 ? (
          <InventorySummary
            medicines={medicines}
            transactions={transactions}
            dateRangeStart={dateRangeStartDate}
            dateRangeEnd={dateRangeEndDate}
            showDetailedTable={true}
          />
        ) : (
          <EmptyState
            icon={<IconBox />}
            title="No Inventory Data"
            description={`No medicines found for ${selectedStaffInfo?.pharmacistInCharge?.fullName || selectedStaffInfo?.email}. Add medicines first to view inventory reports.`}
          />
        )}
      </div>
    </div>
  );
}

// ── Shared empty-state component ────────────────────────────────────────────
function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-14 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-5">
        {icon}
      </div>
      <h2 className="text-base font-semibold text-slate-800 mb-1.5">{title}</h2>
      <p className="text-sm text-slate-400 max-w-sm leading-relaxed">{description}</p>
    </div>
  );
}