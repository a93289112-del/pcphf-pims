'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { subscribeToActivityLogs, type ActivityLog } from '@/lib/services/activity-logs';

export default function SystemNotificationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStaff, setFilterStaff] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const unsubscribe = subscribeToActivityLogs((logs) => {
      setActivityLogs(logs);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredLogs = useMemo(() => {
    const staffNotificationTypes = ['admin_login', 'admin_logout', 'staff_created', 'staff_disabled', 'staff_login', 'staff_logout', 'password_changed'];
    return activityLogs
      .filter(log => staffNotificationTypes.includes(log.type))
      .filter(log => {
        const matchesType  = filterType  === 'all' || log.type === filterType;
        const matchesStaff = filterStaff === 'all' || log.staffId === filterStaff;
        const matchesSearch =
          log.staffEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.staffName?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesType && matchesStaff && matchesSearch;
      });
  }, [activityLogs, filterType, filterStaff, searchTerm]);

  const uniqueStaff = useMemo(() => {
    const staffOnlyTypes = ['staff_created', 'staff_disabled', 'staff_login', 'staff_logout', 'password_changed'];
    const staff = new Map<string, { id: string; email: string; name?: string }>();
    activityLogs
      .filter(log => staffOnlyTypes.includes(log.type))
      .filter(log => log.userRole !== 'admin')
      .filter(log => log.staffId !== user?.uid)
      .filter(log => log.staffEmail !== user?.email)
      .forEach(log => {
        if (!staff.has(log.staffId)) {
          staff.set(log.staffId, { id: log.staffId, email: log.staffEmail, name: log.staffName });
        }
      });
    return Array.from(staff.values());
  }, [activityLogs, user]);

  const getActivityTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      'admin_login':        'Admin Login',
      'admin_logout':       'Admin Logout',
      'staff_login':        'Staff Login',
      'staff_logout':       'Staff Logout',
      'password_changed':   'Password Changed',
      'stock_deducted':     'Stock Deducted',
      'stock_adjusted':     'Stock Adjusted',
      'medicine_dispensed': 'Medicine Dispensed',
      'medicine_sold':      'Medicine Sold',
      'staff_created':      'Staff Created',
      'staff_disabled':     'Staff Disabled',
      'session_ended':      'Daily Session Ended',
      'session_started':    'New Session Started',
    };
    return labels[type] || type;
  };

  const getActivityTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      'admin_login':        'bg-green-50 text-green-700 border-green-200',
      'admin_logout':       'bg-red-50 text-red-700 border-red-200',
      'staff_login':        'bg-green-50 text-green-700 border-green-200',
      'staff_logout':       'bg-red-50 text-red-700 border-red-200',
      'password_changed':   'bg-blue-50 text-blue-700 border-blue-200',
      'stock_deducted':     'bg-orange-50 text-orange-700 border-orange-200',
      'stock_adjusted':     'bg-violet-50 text-violet-700 border-violet-200',
      'medicine_dispensed': 'bg-sky-50 text-sky-700 border-sky-200',
      'medicine_sold':      'bg-emerald-50 text-emerald-700 border-emerald-200',
      'staff_created':      'bg-indigo-50 text-indigo-700 border-indigo-200',
      'staff_disabled':     'bg-red-50 text-red-700 border-red-200',
      'session_ended':      'bg-rose-50 text-rose-700 border-rose-200',
      'session_started':    'bg-teal-50 text-teal-700 border-teal-200',
    };
    return colors[type] || 'bg-slate-50 text-slate-700 border-slate-200';
  };

  const getActivityIcon = (type: string) => {
    const iconProps = {
      className: 'w-4 h-4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      viewBox: '0 0 24 24',
    };
    switch (type) {
      case 'admin_login':
        return <svg {...iconProps}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" /></svg>;
      case 'admin_logout':
        return <svg {...iconProps}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>;
      case 'staff_login':
        return <svg {...iconProps}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" /></svg>;
      case 'staff_logout':
        return <svg {...iconProps}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>;
      case 'staff_created':
        return <svg {...iconProps}><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /><path d="M19 8v6M22 11h-6" strokeWidth="2.5" /></svg>;
      case 'staff_disabled':
        return <svg {...iconProps}><path d="M13 13h8a4 4 0 0 0 0-8h-3V4m0 16h-8a4 4 0 0 1 0-8h3v-4" /><circle cx="9" cy="8" r="4" /></svg>;
      case 'password_changed':
        return <svg {...iconProps}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
      case 'stock_deducted':
        return <svg {...iconProps}><path d="M12 5v14M5 12h14" /></svg>;
      case 'stock_adjusted':
        return <svg {...iconProps}><path d="M23 7l-7 5 7 5V7Z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>;
      case 'medicine_dispensed':
        return <svg {...iconProps}><path d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-.75" /></svg>;
      case 'medicine_sold':
        return <svg {...iconProps}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>;
      case 'session_ended':
        return <svg {...iconProps}><path d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>;
      case 'session_started':
        return <svg {...iconProps}><path d="M12 4v16m8-8H4" /></svg>;
      default:
        return <svg {...iconProps}><circle cx="12" cy="12" r="10" /></svg>;
    }
  };

  const formatTime = (timestamp: string): string => {
    const date      = new Date(timestamp);
    const now       = new Date();
    const diffMs    = now.getTime() - date.getTime();
    const diffMins  = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays  = Math.floor(diffMs / 86400000);
    if (diffMins  < 1)  return 'Just now';
    if (diffMins  < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays  < 7)  return `${diffDays}d ago`;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm tracking-wide">Loading system notifications…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f9f8] w-full">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">Staff Notifications</h1>
          <p className="text-slate-500">Staff account activities, login/logout events, and password changes</p>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Search</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by email, staff name, or action..."
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Notification Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300 text-sm"
              >
                <option value="all">All Types</option>
                <option value="admin_login">Admin Login</option>
                <option value="admin_logout">Admin Logout</option>
                <option value="staff_created">Staff Created</option>
                <option value="staff_disabled">Staff Disabled</option>
                <option value="staff_login">Staff Login</option>
                <option value="staff_logout">Staff Logout</option>
                <option value="password_changed">Password Changed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Staff Member</label>
              <select
                value={filterStaff}
                onChange={(e) => setFilterStaff(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300 text-sm"
              >
                <option value="all">All Staff Members</option>
                {uniqueStaff.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name || staff.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Scrollable logs container ── */}
        <div
          className="overflow-y-auto space-y-3 pr-1
                     scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent
                     hover:scrollbar-thumb-slate-400"
          style={{ height: '65vh' }}
        >
          {filteredLogs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-12 text-center">
              <p className="text-slate-500">No activity logs found</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow p-4">
                <div className="flex items-start gap-4">

                  {/* Icon */}
                  <div className={`p-2.5 rounded-lg border mt-0.5 shrink-0 ${getActivityTypeColor(log.type)}`}>
                    {getActivityIcon(log.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${getActivityTypeColor(log.type)}`}>
                        {getActivityTypeLabel(log.type)}
                      </span>
                      {log.isActive && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-semibold text-slate-900 mb-1">{log.action}</p>

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="font-medium">{log.staffName || log.staffEmail}</span>
                      <span>•</span>
                      <span>{formatTime(log.timestamp)}</span>
                    </div>

                    {/* Details */}
                    {log.details && Object.keys(log.details).length > 0 && (
                      <>
                        {log.type === 'session_ended' ? (
                          <div className="mt-3 pt-3 border-t border-slate-100 space-y-3 text-xs">
                            {log.details.sessionDurationMinutes !== undefined && (
                              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                <p className="text-slate-600 font-medium mb-1">Session Duration</p>
                                <p className="text-slate-900 font-semibold">
                                  {Math.floor(log.details.sessionDurationMinutes / 60)}h {log.details.sessionDurationMinutes % 60}m
                                </p>
                              </div>
                            )}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {log.details.totalUnitsDispensed !== undefined && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                                  <p className="text-blue-600 font-medium text-[10px] mb-1">Units Dispensed</p>
                                  <p className="text-blue-900 font-black text-lg">{log.details.totalUnitsDispensed}</p>
                                </div>
                              )}
                              {log.details.totalTransactions !== undefined && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                                  <p className="text-emerald-600 font-medium text-[10px] mb-1">Transactions</p>
                                  <p className="text-emerald-900 font-black text-lg">{log.details.totalTransactions}</p>
                                </div>
                              )}
                              {log.details.totalDispenseTransactions !== undefined && (
                                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2">
                                  <p className="text-indigo-600 font-medium text-[10px] mb-1">Dispense Transaction</p>
                                  <p className="text-indigo-900 font-black text-lg">{log.details.totalDispenseTransactions}</p>
                                </div>
                              )}
                              {log.details.totalSalesTransactions !== undefined && (
                                <div className="bg-violet-50 border border-violet-200 rounded-lg p-2">
                                  <p className="text-violet-600 font-medium text-[10px] mb-1">Sales Transaction</p>
                                  <p className="text-violet-900 font-black text-lg">{log.details.totalSalesTransactions}</p>
                                </div>
                              )}
                            </div>
                            {((log.details.lowStockCount ?? 0) > 0 ||
                              (log.details.expiredCount ?? 0) > 0 ||
                              (log.details.outOfStockCount ?? 0) > 0) && (
                              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <p className="text-red-700 font-medium mb-2 text-[10px] uppercase tracking-wide">⚠️ Inventory Alerts</p>
                                <div className="space-y-1 text-red-800">
                                  {(log.details.outOfStockCount ?? 0) > 0 && <p className="text-[11px]">• {log.details.outOfStockCount} out of stock</p>}
                                  {(log.details.expiredCount ?? 0) > 0 && <p className="text-[11px]">• {log.details.expiredCount} expired</p>}
                                  {(log.details.lowStockCount ?? 0) > 0 && <p className="text-[11px]">• {log.details.lowStockCount} low stock</p>}
                                  {log.details.totalCriticalAlerts !== undefined && (
                                    <p className="text-[11px] font-semibold mt-1">Total Critical: {log.details.totalCriticalAlerts}</p>
                                  )}
                                </div>
                              </div>
                            )}
                            {log.details.sessionSummary && (
                              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                <p className="text-slate-600 font-medium mb-1 text-[10px] uppercase tracking-wide">Summary</p>
                                <p className="text-slate-700 text-[11px] leading-relaxed">{log.details.sessionSummary}</p>
                              </div>
                            )}
                            {log.details.detailedBreakdown && (
                              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                <p className="text-slate-600 font-medium mb-1 text-[10px] uppercase tracking-wide">Details</p>
                                <p className="text-slate-700 text-[10px] leading-relaxed">{log.details.detailedBreakdown}</p>
                              </div>
                            )}
                          </div>

                        ) : log.type === 'session_started' ? (
                          <div className="mt-3 pt-3 border-t border-slate-100 text-xs">
                            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                              <p className="text-teal-700 font-medium mb-1 text-[10px] uppercase tracking-wide">Session Started</p>
                              {log.details.sessionStartTime && (
                                <p className="text-teal-800 text-[11px]">
                                  Started at: {new Date(log.details.sessionStartTime).toLocaleString('en-PH', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })}
                                </p>
                              )}
                            </div>
                          </div>

                        ) : (
                          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            {log.details.medicineName && (
                              <div>
                                <p className="text-slate-400 font-medium">Medicine</p>
                                <p className="text-slate-700 font-semibold">{log.details.medicineName}</p>
                              </div>
                            )}
                            {log.details.quantity !== undefined && (
                              <div>
                                <p className="text-slate-400 font-medium">Quantity</p>
                                <p className="text-slate-700 font-semibold">{log.details.quantity}</p>
                              </div>
                            )}
                            {log.details.previousValue !== undefined && (
                              <div>
                                <p className="text-slate-400 font-medium">Previous</p>
                                <p className="text-slate-700 font-semibold">{log.details.previousValue}</p>
                              </div>
                            )}
                            {log.details.newValue !== undefined && (
                              <div>
                                <p className="text-slate-400 font-medium">New Value</p>
                                <p className="text-slate-700 font-semibold">{log.details.newValue}</p>
                              </div>
                            )}
                            {log.details.reason && (
                              <div className="col-span-2">
                                <p className="text-slate-400 font-medium">Reason</p>
                                <p className="text-slate-700 font-semibold">{log.details.reason}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="text-right text-xs text-slate-400 shrink-0">
                    <p>{new Date(log.timestamp).toLocaleDateString()}</p>
                    <p>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Summary cards */}
        {filteredLogs.length > 0 && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Activities</p>
              <p className="text-3xl font-black text-slate-900">{filteredLogs.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Active Staff</p>
              <p className="text-3xl font-black text-emerald-600">{filteredLogs.filter(l => l.isActive).length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Sessions Ended Today</p>
              <p className="text-3xl font-black text-rose-600">
                {filteredLogs.filter(
                  l => l.type === 'session_ended' &&
                  new Date(l.timestamp).toDateString() === new Date().toDateString()
                ).length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">New Sessions Today</p>
              <p className="text-3xl font-black text-teal-600">
                {filteredLogs.filter(
                  l => l.type === 'session_started' &&
                  new Date(l.timestamp).toDateString() === new Date().toDateString()
                ).length}
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}