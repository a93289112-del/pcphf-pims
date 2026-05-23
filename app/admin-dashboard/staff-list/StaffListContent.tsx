'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useEffect, useState, useMemo } from 'react';
import { database } from '@/lib/services/firebase';
import { ref, onValue, update, remove } from 'firebase/database';
import ConfirmationModal from '@/lib/components/confirmation-modal';
import { logActivity } from '@/lib/services/activity-logs';

// Only count these activity types as "actual staff activity" for Last Active status
// Exclude administrative actions like staff_created, staff_enabled, staff_disabled, etc.
const STAFF_ACTIVITY_TYPES = [
  'staff_login',
  'staff_logout',
  'medicine_dispensed',
  'medicine_sold',
  'stock_deducted',
  'stock_adjusted',
  'medicine_added',
  'medicine_restocked',
  'password_changed',
];

interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'staff';
  status: 'pending' | 'approved' | 'disabled';
  createdAt: string;
  staffName?: string;
  position?: string;
  address?: string;
  contactNumber?: string;
  pharmacy?: {
    name: string;
    address: string;
    phone: string;
    email: string;
    type: string;
    licenseNumber: string;
  };
  pharmacistInCharge?: {
    fullName: string;
    licenseNumber: string;
    contactDetails: string;
  };
}

export default function StaffListContent() {
  const { user, role, adminName } = useAuth();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [detailsUser, setDetailsUser] = useState<UserProfile | null>(null);
  const [newStatus, setNewStatus] = useState<UserProfile['status'] | null>(null);
  const [staffActivityMap, setStaffActivityMap] = useState<Record<string, { timestamp: string; formattedTime: string }>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    const usersRef = ref(database, 'users');
    const unsubscribe = onValue(usersRef, (snap) => {
      const data = snap.val();
      if (data) {
        const list = Object.values(data) as UserProfile[];
        setUsers(list);
      } else {
        setUsers([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Helper function to format relative time
  const formatTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const activityTime = new Date(timestamp);
    const diffMs = now.getTime() - activityTime.getTime();

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 4) return `${weeks}w ago`;
    if (months < 12) return `${months}mo ago`;
    return `${years}y ago`;
  };

  // Track activity logs to determine staff active status with last activity time
  useEffect(() => {
    if (!user) return;
    const activityRef = ref(database, 'activityLogs');
    const unsubscribe = onValue(activityRef, (snap) => {
      const data = snap.val();
      if (data) {
        const activityMap: Record<string, string> = {};

        Object.values(data as Record<string, { staffId?: string; timestamp?: string; type?: string }>).forEach((activity) => {
          // Only count staff activity types, not administrative actions
          if (activity.staffId && activity.timestamp && activity.type && STAFF_ACTIVITY_TYPES.includes(activity.type)) {
            const activityTime = new Date(activity.timestamp);
            // Only track staff activities, not admin
            if (activity.staffId !== user.uid) {
              if (!activityMap[activity.staffId] || new Date(activityMap[activity.staffId]) < activityTime) {
                activityMap[activity.staffId] = activity.timestamp;
              }
            }
          }
        });

        // Create activity status map with formatted times
        const statusMap: Record<string, { timestamp: string; formattedTime: string }> = {};
        Object.entries(activityMap).forEach(([staffId, lastActivity]) => {
          statusMap[staffId] = {
            timestamp: lastActivity,
            formattedTime: formatTimeAgo(lastActivity),
          };
        });

        setStaffActivityMap(statusMap);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Refresh formatted times every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 60000); // Refresh every 60 seconds
    return () => clearInterval(interval);
  }, []);

  const getStaffStatus = (staffId: string): string => {
    return staffActivityMap[staffId]?.formattedTime || 'No activity';
  };

  const getStaffActivityTime = (staffId: string): string => {
    return staffActivityMap[staffId]?.formattedTime || 'no activity yet';
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (!u || !u.email || u.role === 'admin') return false;
      const matchesSearch = u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.pharmacistInCharge?.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.staffName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.contactNumber?.includes(searchQuery);
      return matchesSearch;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [users, searchQuery]);

  const handleUpdateStatus = async () => {
    if (!selectedUser || !newStatus || !user) return;
    try {
      const userRef = ref(database, `users/${selectedUser.uid}`);
      await update(userRef, { status: newStatus });

      // Log staff status change activity
      const isEnabling = newStatus === 'approved';
      const activityType = isEnabling ? 'staff_enabled' : 'staff_disabled';
      const statusAction = isEnabling ? 'enabled' : 'disabled';

      await logActivity(
        activityType,
        user.uid,
        user.email || '',
        `${statusAction.charAt(0).toUpperCase() + statusAction.slice(1)} staff account for ${selectedUser.staffName || selectedUser.email}`,
        {
          staffName: selectedUser.staffName,
          email: selectedUser.email,
          position: selectedUser.position,
          previousStatus: selectedUser.status,
          newStatus: newStatus,
        },
        adminName || user.displayName || user.email || undefined,
        role || undefined,
      );

      setShowStatusConfirm(false);
      setSelectedUser(null);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser || !user) return;
    try {
      const userRef = ref(database, `users/${selectedUser.uid}`);
      await remove(userRef);

      // Log staff account deletion activity
      await logActivity(
        'staff_deleted',
        user.uid,
        user.email || '',
        `Deleted staff account for ${selectedUser.staffName || selectedUser.email}`,
        {
          staffName: selectedUser.staffName,
          email: selectedUser.email,
          position: selectedUser.position,
          deletedAt: new Date().toISOString(),
        },
        adminName || user.displayName || user.email || undefined,
        role || undefined,
      );

      setShowDeleteConfirm(false);
      setSelectedUser(null);
    } catch (err) {
      console.error('Failed to delete user:', err);
    }
  };

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
        <div className="mb-10">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">View All Staff</h1>
          <p className="text-slate-500">Manage and view all staff members</p>
        </div>

        <div className="border-b border-slate-200 pb-6 mb-8">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by email or pharmacist name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-96 transition-all"
            />
            <svg className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">Staff Name</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">Email</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">Last Active</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                    <td className="px-2 sm:px-3 py-2 sm:py-3 truncate">
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{u.staffName || u.email || '—'}</p>
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 py-2 sm:py-3 truncate">
                      <p className="text-xs sm:text-sm text-slate-700 truncate">{u.email}</p>
                    </td>
                    <td className="px-2 sm:px-3 py-2 sm:py-3">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        {staffActivityMap[u.uid]?.timestamp && new Date(staffActivityMap[u.uid].timestamp).getTime() > new Date().getTime() - 24 * 60 * 60 * 1000 ? (
                          <>
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-xs sm:text-sm text-slate-700 font-medium">
                              active {getStaffActivityTime(u.uid)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
                            <span className="text-xs sm:text-sm text-slate-600 font-medium">
                              inactive
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 py-2 sm:py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setDetailsUser(u); setShowDetailsPanel(true); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition-all whitespace-nowrap"
                          title="View Details"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          View
                        </button>
                        <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                          {u.status !== 'disabled' ? (
                            <button
                              onClick={() => { setSelectedUser(u); setNewStatus('disabled'); setShowStatusConfirm(true); }}
                              className="p-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors shrink-0"
                              title="Disable User"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                            </button>
                          ) : (
                            <button
                              onClick={() => { setSelectedUser(u); setNewStatus('approved'); setShowStatusConfirm(true); }}
                              className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors shrink-0"
                              title="Enable User"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button>
                          )}
                          {u.uid !== user?.uid && (
                            <button
                              onClick={() => { setSelectedUser(u); setShowDeleteConfirm(true); }}
                              className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                              title="Delete User"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 sm:px-3 py-8 text-center">
                      <p className="text-slate-500 text-xs sm:text-sm">No staff members found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showStatusConfirm}
        title={`${newStatus === 'approved' ? 'Enable' : 'Disable'} User?`}
        message={`Are you sure you want to change ${selectedUser?.email}'s status to ${newStatus}?`}
        confirmText="Confirm"
        onConfirm={handleUpdateStatus}
        onCancel={() => { setShowStatusConfirm(false); setSelectedUser(null); }}
      />

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete User?"
        message={`This will permanently remove ${selectedUser?.email} from the system.`}
        confirmText="Delete"
        isDangerous={true}
        onConfirm={handleDeleteUser}
        onCancel={() => { setShowDeleteConfirm(false); setSelectedUser(null); }}
      />

      {showDetailsPanel && detailsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 md:p-4 lg:p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowDetailsPanel(false)} />
          <div className="relative w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl bg-white rounded-3xl sm:rounded-3xl border border-slate-200 shadow-xl flex flex-col max-h-[95vh]">
            {/* Header */}
            <div className="rounded-t-3xl bg-linear-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700 px-3 sm:px-4 md:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-black text-white truncate">Staff Details</h2>
                  <p className="text-xs text-slate-400 truncate">{detailsUser.email}</p>
                </div>
              </div>
              <button onClick={() => setShowDetailsPanel(false)} className="p-1.5 sm:p-2 hover:bg-slate-700 rounded-xl transition-colors shrink-0">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Content - Grid Layout */}
            <div className="flex-1 overflow-hidden p-2 sm:p-3 md:p-4 lg:p-6">
              <div className="space-y-2 sm:space-y-2 md:space-y-3">
                {/* Account Information */}
                <div className="border border-slate-200 rounded-2xl p-2 sm:p-2 bg-slate-50/50">
                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">Account</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Email</p>
                      <p className="text-xs text-slate-900 font-medium truncate">{detailsUser.email}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Role</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider ${detailsUser.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                        {detailsUser.role}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Activity</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider ${getStaffStatus(detailsUser.uid) === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                        {getStaffStatus(detailsUser.uid) === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">User ID</p>
                      <p className="text-xs text-slate-600 font-mono bg-slate-100 px-2 py-1 rounded-lg truncate text-ellipsis overflow-hidden">{detailsUser.uid}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Joined</p>
                      <p className="text-xs text-slate-900">{new Date(detailsUser.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                    </div>
                  </div>
                </div>

                {/* Staff Information */}
                {(detailsUser.staffName || detailsUser.position || detailsUser.address || detailsUser.contactNumber) && (
                  <div className="border border-slate-200 rounded-2xl p-2 sm:p-2 bg-indigo-50/50">
                    <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">Staff Info</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                      {detailsUser.staffName && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Name</p>
                          <p className="text-xs text-slate-900 font-medium">{detailsUser.staffName}</p>
                        </div>
                      )}
                      {detailsUser.position && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Position</p>
                          <p className="text-xs text-slate-900">{detailsUser.position}</p>
                        </div>
                      )}
                      {detailsUser.contactNumber && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Contact</p>
                          <p className="text-xs text-slate-900 font-medium">{detailsUser.contactNumber}</p>
                        </div>
                      )}
                      {detailsUser.address && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Address</p>
                          <p className="text-xs text-slate-900">{detailsUser.address}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Pharmacy Information */}
                {detailsUser.pharmacy && (
                  <div className="border border-slate-200 rounded-2xl p-2 sm:p-2 bg-amber-50/50">
                    <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /></svg>
                      </div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">Pharmacy</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Name</p>
                        <p className="text-xs text-slate-900 font-medium">{detailsUser.pharmacy.name}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Address</p>
                        <p className="text-xs text-slate-900">{detailsUser.pharmacy.address}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">License</p>
                        <p className="text-xs text-slate-600 font-mono bg-slate-100 px-2 py-1 rounded-lg truncate">{detailsUser.pharmacy.licenseNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Type</p>
                        <p className="text-xs text-slate-900">{detailsUser.pharmacy.type}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Phone</p>
                        <p className="text-xs text-slate-900">{detailsUser.pharmacy.phone}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Email</p>
                        <p className="text-xs text-slate-900 truncate">{detailsUser.pharmacy.email}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pharmacist In Charge */}
                {detailsUser.pharmacistInCharge && (
                  <div className="border border-slate-200 rounded-2xl p-2 sm:p-2 bg-green-50/50">
                    <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">Pharmacist</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Full Name</p>
                        <p className="text-xs text-slate-900 font-medium">{detailsUser.pharmacistInCharge.fullName}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">License</p>
                        <p className="text-xs text-slate-600 font-mono bg-slate-100 px-2 py-1 rounded-lg truncate">{detailsUser.pharmacistInCharge.licenseNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Contact</p>
                        <p className="text-xs text-slate-900">{detailsUser.pharmacistInCharge.contactDetails}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
