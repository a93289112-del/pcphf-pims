'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useEffect, useState, useMemo } from 'react';
import { database } from '@/lib/services/firebase';
import { ref, onValue } from 'firebase/database';
import Link from 'next/link';
import { type Medicine, type FirebaseTransaction } from '@/lib/types';
import { type ActivityLog } from '@/lib/services/activity-logs';
import { TRANSACTION_TYPES } from '@/app/admin-dashboard/logs/LogsContent';

interface UserProfile {
  uid: string;
  email: string;
  staffName?: string;
  name?: string;
  role: 'admin' | 'staff';
  status: 'pending' | 'approved' | 'disabled';
  createdAt: string;
}

export default function AdminDashboard() {
  const { user } = useAuth();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<FirebaseTransaction[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingStates, setLoadingStates] = useState({
    users: true,
    medicines: true,
    transactions: true,
  });

  const isLoading =
    loadingStates.users ||
    loadingStates.medicines ||
    loadingStates.transactions;

  useEffect(() => {
    if (!user) return;

    const timeout = setTimeout(() => {
      setLoadingStates({ users: false, medicines: false, transactions: false });
    }, 10000);

    const unsubUsers = onValue(
      ref(database, 'users'),
      (snap) => {
        const data = snap.val();
        setUsers(data ? (Object.values(data) as UserProfile[]) : []);
        setLoadingStates((p) => ({ ...p, users: false }));
      },
      (err) => {
        console.error('Users read error:', err);
        setLoadingStates((p) => ({ ...p, users: false }));
      },
    );

    const unsubMedicines = onValue(
      ref(database, 'medicines'),
      (snapshot) => {
        const data = snapshot.val();
        const meds: Medicine[] = data
          ? Object.entries(data as Record<string, Omit<Medicine, 'id'>>).map(
            ([id, med]) => ({ id, ...med } as Medicine),
          )
          : [];
        setMedicines(meds);
        setLoadingStates((p) => ({ ...p, medicines: false }));
      },
      (err) => {
        console.error('Medicines read error:', err);
        setLoadingStates((p) => ({ ...p, medicines: false }));
      },
    );

    const unsubTransactions = onValue(
      ref(database, 'transactions'),
      (snapshot) => {
        const data = snapshot.val();
        const trans: FirebaseTransaction[] = data
          ? Object.values(data as Record<string, FirebaseTransaction>)
          : [];
        setTransactions(trans);
        setLoadingStates((p) => ({ ...p, transactions: false }));
      },
      (err) => {
        console.error('Transactions read error:', err);
        setLoadingStates((p) => ({ ...p, transactions: false }));
      },
    );

    const unsubLogs = onValue(
      ref(database, 'activityLogs'),
      (snap) => {
        const data = snap.val() as Record<
          string,
          Omit<ActivityLog, 'id'>
        > | null;
        setActivityLogs(
          data
            ? Object.entries(data).map(([id, v]) => ({ id, ...v } as ActivityLog))
            : [],
        );
      },
      (err) => {
        console.error('Activity logs read error:', err);
      },
    );

    return () => {
      clearTimeout(timeout);
      unsubUsers();
      unsubMedicines();
      unsubTransactions();
      unsubLogs();
    };
  }, [user]);

  const staffActivity = useMemo(() => {
    const activity: Record<
      string,
      { count: number; recent: FirebaseTransaction[] }
    > = {};
    const validTx = transactions.filter((t) => t && t.date && t.userId);
    const sorted = [...validTx].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const counted = new Set<string>();

    sorted.forEach((t) => {
      if (!t.userId) return;
      if (!activity[t.userId]) activity[t.userId] = { count: 0, recent: [] };
      if ((t.type === 'dispense' || t.type === 'sale') && t.referenceId) {
        const key = `${t.userId}-${t.referenceId}`;
        if (!counted.has(key)) {
          activity[t.userId].count++;
          counted.add(key);
        }
      } else {
        activity[t.userId].count++;
      }
      if (activity[t.userId].recent.length < 3)
        activity[t.userId].recent.push(t);
    });

    return Object.entries(activity)
      .map(([uid, data]) => {
        const found = (Array.isArray(users) ? users : []).find(
          (u) => u.uid === uid,
        );
        return {
          uid,
          displayName:
            found?.name || found?.staffName || found?.email || uid,
          email: found?.email || uid,
          count: data.count,
          recent: data.recent,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [transactions, users]);

  const totalStaffs = useMemo(
    () => users.filter((u) => u.role === 'staff' && u.status !== 'disabled').length,
    [users],
  );

  const transactionsToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return transactions.filter((t) => t.date?.startsWith(today)).length;
  }, [transactions]);

  const disabledStaffCount = useMemo(
    () =>
      users.filter((u) => u.role === 'staff' && u.status === 'disabled').length,
    [users],
  );

  // Uses the same AUDITABLE_TYPES as the logs page — guaranteed to match
  const activityLogsToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return activityLogs.filter(
      (log) =>
        log.timestamp?.startsWith(today) &&
        TRANSACTION_TYPES.includes(log.type),
    ).length;
  }, [activityLogs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f8f7f4]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
            <div className="absolute inset-0 rounded-full border-4 border-t-indigo-600 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-slate-400 tracking-widest uppercase">
            Loading dashboard
          </p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const greeting =
    now.getHours() < 12
      ? 'Good morning'
      : now.getHours() < 17
        ? 'Good afternoon'
        : 'Good evening';

  return (
    <div className="min-h-screen bg-[#f8f7f4] w-full">
      <div className="bg-white border-b border-slate-100 px-4 sm:px-8 py-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">
              {greeting}
            </p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 leading-none">
              Admin Dashboard
            </h1>
            <p className="text-slate-400 text-sm mt-2">
              {now.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        <Section label="Overview">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Active Staff"
              value={totalStaffs}
              icon={<PeopleIcon />}
              accent="indigo"
              link="/admin-dashboard/staff-list"
              sub="team members"
            />
            <StatCard
              title="Transactions"
              value={transactionsToday}
              icon={<ActivityIcon />}
              accent="teal"
              sub="today"
            />
            <StatCard
              title="Activity Logs"
              value={activityLogsToday}
              icon={<HistoryIcon />}
              accent="violet"
              link="/admin-dashboard/logs"
              sub="entries today"
            />
            <StatCard
              title="Disabled"
              value={disabledStaffCount}
              icon={<UserOffIcon />}
              accent={disabledStaffCount > 0 ? 'rose' : 'emerald'}
              link="/admin-dashboard/staff-list"
              sub="suspended staff"
            />
          </div>
        </Section>

        <Section label="Staff Activity Monitor">
          {staffActivity.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center py-16">
              <p className="text-sm text-slate-400">
                No staff activity recorded yet
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {staffActivity.map((staff, idx) => (
                <StaffCard key={staff.uid} staff={staff} rank={idx + 1} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {label}
        </span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>
      {children}
    </div>
  );
}

const accentMap: Record<
  string,
  { bg: string; text: string; ring: string; icon: string }
> = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-100', icon: 'bg-indigo-600 text-white' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-100', icon: 'bg-amber-500 text-white' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100', icon: 'bg-emerald-500 text-white' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-100', icon: 'bg-rose-500 text-white' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-100', icon: 'bg-teal-500 text-white' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-100', icon: 'bg-violet-600 text-white' },
};

function StatCard({
  title, value, icon, accent, link, sub,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  accent: string;
  link?: string;
  sub?: string;
}) {
  const a = accentMap[accent] || accentMap.indigo;

  const content = (
    <div className="group relative bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
      <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full ${a.bg} opacity-60 blur-xl pointer-events-none`} />
      <div className="relative flex items-start justify-between mb-5">
        <div className={`p-2.5 rounded-xl ${a.icon} shadow-sm`}>{icon}</div>
        {link && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400">
            <ArrowIcon />
          </div>
        )}
      </div>
      <p className="text-3xl font-black text-slate-900 leading-none mb-1.5">{value}</p>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );

  return link ? <Link href={link}>{content}</Link> : content;
}

function StaffCard({
  staff, rank,
}: {
  staff: { uid: string; displayName: string; email: string; count: number; recent: FirebaseTransaction[] };
  rank: number;
}) {
  const txTypeStyle: Record<string, string> = {
    adjustment: 'bg-amber-100 text-amber-700',
    sale: 'bg-emerald-100 text-emerald-700',
    dispense: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={staff.displayName} index={rank - 1} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{staff.displayName}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{staff.count} total actions</p>
          </div>
        </div>
        <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2.5 py-1.5 rounded-lg">#{rank}</span>
      </div>

      <div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Recent Activity</p>
        <div className="space-y-1.5">
          {staff.recent.length === 0 && (
            <p className="text-[10px] text-slate-400 italic py-1">No recent activity</p>
          )}
          {staff.recent.map((log, idx) => (
            <div key={idx} className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-2">
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${txTypeStyle[log.type] || 'bg-slate-100 text-slate-600'}`}>
                {log.type}
              </span>
              <span className="text-[10px] text-slate-500 flex-1 truncate">qty: {log.quantity}</span>
              <span className="text-[10px] text-slate-400 shrink-0">
                {new Date(log.date).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const avatarColors = ['bg-indigo-600', 'bg-violet-600', 'bg-rose-500', 'bg-teal-600', 'bg-amber-500', 'bg-emerald-600'];

function Avatar({ name, index, size = 'sm' }: { name: string; index: number; size?: 'sm' | 'lg' }) {
  const color = avatarColors[index % avatarColors.length];
  const dim = size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';
  return (
    <div className={`${dim} ${color} rounded-xl text-white flex items-center justify-center font-black shadow-sm shrink-0`}>
      {name[0].toUpperCase()}
    </div>
  );
}

const i = (d: string) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const PeopleIcon = () => i('M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0zM6 20a9 9 0 0118 0v1H1v-1a9 9 0 0118 0z');
const ActivityIcon = () => i('M13 10V3L4 14h7v7l9-11h-7z');
const HistoryIcon = () => i('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0');
const UserOffIcon = () => i('M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 15l-5 5m0-5l5 5');
const ArrowIcon = () => i('M17 8l4 4m0 0l-4 4m4-4H3');