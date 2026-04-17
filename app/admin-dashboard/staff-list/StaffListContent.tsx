'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useEffect, useState, useMemo } from 'react';
import { database } from '@/lib/services/firebase';
import { ref, onValue, update, remove } from 'firebase/database';
import ConfirmationModal from '@/lib/components/confirmation-modal';
import { logActivity } from '@/lib/services/activity-logs';

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
  const [staffActivityMap, setStaffActivityMap] = useState<Record<string, string>>({});

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

  // Track activity logs to determine staff active/inactive status
  useEffect(() => {
    if (!user) return;
    const activityRef = ref(database, 'activityLogs');
    const unsubscribe = onValue(activityRef, (snap) => {
      const data = snap.val();
      if (data) {
        const activityMap: Record<string, string> = {};
        const now = new Date();
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

        Object.values(data as Record<string, { staffId?: string; timestamp?: string }>).forEach((activity) => {
          if (activity.staffId && activity.timestamp) {
            const activityTime = new Date(activity.timestamp);
            // Only track staff activities, not admin
            if (activity.staffId !== user.uid) {
              if (!activityMap[activity.staffId] || new Date(activityMap[activity.staffId]) < activityTime) {
                activityMap[activity.staffId] = activity.timestamp;
              }
            }
          }
        });

        // Determine active/inactive based on last activity
        const statusMap: Record<string, string> = {};
        Object.entries(activityMap).forEach(([staffId, lastActivity]) => {
          const lastActivityTime = new Date(lastActivity);
          statusMap[staffId] = lastActivityTime >= threeDaysAgo ? 'active' : 'inactive';
        });

        setStaffActivityMap(statusMap);
      }
    });
    return () => unsubscribe();
  }, [user]);

  const getStaffStatus = (staffId: string): string => {
    return staffActivityMap[staffId] || 'active'; // Default to active if no activity tracked
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
      const statusAction = newStatus === 'approved' ? 'enabled' : 'disabled';
      const activityType = 'staff_disabled';
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
        'staff_disabled',
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
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 w-24 sm:w-auto">Staff Name</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 hidden sm:table-cell w-32 sm:w-auto">Email</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 hidden lg:table-cell w-20 sm:w-auto">Position</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 hidden md:table-cell w-24 sm:w-auto">Contact No.</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 hidden xl:table-cell w-28 sm:w-auto">Address</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 hidden md:table-cell w-16 sm:w-auto">Role</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 hidden lg:table-cell w-20 sm:w-auto">Date</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right w-16 sm:w-auto">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => (
                <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 truncate">
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{u.staffName || u.email || '—'}</p>
                      <p className="text-[9px] text-slate-500 sm:hidden truncate">{u.email}</p>
                    </div>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 hidden sm:table-cell truncate">
                    <p className="text-xs sm:text-sm text-slate-700 truncate">{u.email}</p>
                    <p className="text-[9px] text-slate-400 uppercase tracking-tighter truncate">{u.uid}</p>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 hidden lg:table-cell truncate">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{u.position || '—'}</p>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 hidden md:table-cell truncate">
                    <p className="text-xs sm:text-sm text-slate-700 truncate">{u.contactNumber || '—'}</p>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 hidden xl:table-cell truncate">
                    <p className="text-xs sm:text-sm text-slate-700 truncate">{u.address || '—'}</p>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 hidden md:table-cell">
                    <span className={`text-[9px] sm:text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-lg whitespace-nowrap inline-block ${
                      u.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-slate-500 hidden lg:table-cell truncate">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => { setDetailsUser(u); setShowDetailsPanel(true); }}
                        className="p-1 sm:p-1.5 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
                        title="View Details"
                      >
                        <svg className="w-3 sm:w-4 h-3 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </button>
                      {u.status !== 'disabled' ? (
                        <button
                          onClick={() => { setSelectedUser(u); setNewStatus('disabled'); setShowStatusConfirm(true); }}
                          className="p-1 sm:p-1.5 text-orange-600 hover:text-orange-700 transition-colors shrink-0"
                          title="Disable User"
                        >
                          <svg className="w-3 sm:w-4 h-3 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        </button>
                      ) : null}
                      {u.uid !== user?.uid && (
                        <button
                          onClick={() => { setSelectedUser(u); setShowDeleteConfirm(true); }}
                          className="p-1 sm:p-1.5 text-red-600 hover:text-red-700 transition-colors shrink-0"
                          title="Delete User"
                        >
                          <svg className="w-3 sm:w-4 h-3 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 sm:px-4 py-8 text-center">
                    <p className="text-slate-500 text-xs sm:text-sm">No staff members found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
          <div className="relative w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl bg-white rounded-3xl sm:rounded-3xl border border-slate-200 shadow-xl max-h-[95vh]">
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
            <div className="overflow-y-auto max-h-[calc(95vh-80px)] sm:max-h-[calc(95vh-88px)] p-2 sm:p-3 md:p-4 lg:p-6">
              <div className="space-y-2 sm:space-y-3 md:space-y-4">
                {/* Account Information */}
                <div className="border border-slate-200 rounded-2xl p-2 sm:p-3 md:p-4 bg-slate-50/50">
                  <div className="flex items-center gap-2 mb-2 sm:mb-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">Account</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email Address</p>
                      <p className="text-xs sm:text-sm text-slate-900 font-medium truncate">{detailsUser.email}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Role</p>
                      <span className={`inline-flex items-center px-2 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                        detailsUser.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {detailsUser.role}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Activity</p>
                      <span className={`inline-flex items-center px-2 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                        getStaffStatus(detailsUser.uid) === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {getStaffStatus(detailsUser.uid) === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">User ID</p>
                      <p className="text-xs text-slate-600 font-mono bg-slate-100 px-2 py-1.5 rounded-lg truncate">{detailsUser.uid}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Joined Date</p>
                      <p className="text-xs sm:text-sm text-slate-900">{new Date(detailsUser.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                  </div>
                </div>

                {/* Staff Information */}
                {(detailsUser.staffName || detailsUser.position || detailsUser.address || detailsUser.contactNumber) && (
                  <div className="border border-slate-200 rounded-2xl p-2 sm:p-3 md:p-4 bg-indigo-50/50">
                    <div className="flex items-center gap-2 mb-2 sm:mb-3">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">Staff Info</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      {detailsUser.staffName && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Name</p>
                          <p className="text-xs sm:text-sm text-slate-900 font-medium">{detailsUser.staffName}</p>
                        </div>
                      )}
                      {detailsUser.position && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Position</p>
                          <p className="text-xs sm:text-sm text-slate-900">{detailsUser.position}</p>
                        </div>
                      )}
                      {detailsUser.contactNumber && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Contact</p>
                          <p className="text-xs sm:text-sm text-slate-900 font-medium">{detailsUser.contactNumber}</p>
                        </div>
                      )}
                      {detailsUser.address && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Address</p>
                          <p className="text-xs sm:text-sm text-slate-900">{detailsUser.address}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Pharmacy Information */}
                {detailsUser.pharmacy && (
                  <div className="border border-slate-200 rounded-2xl p-2 sm:p-3 md:p-4 bg-amber-50/50">
                    <div className="flex items-center gap-2 mb-2 sm:mb-3">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /></svg>
                      </div>
                      <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">Pharmacy</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Name</p>
                        <p className="text-xs sm:text-sm text-slate-900 font-medium">{detailsUser.pharmacy.name}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Address</p>
                        <p className="text-xs sm:text-sm text-slate-900">{detailsUser.pharmacy.address}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">License</p>
                        <p className="text-xs text-slate-600 font-mono bg-slate-100 px-2 py-1 rounded-lg truncate">{detailsUser.pharmacy.licenseNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Type</p>
                        <p className="text-xs sm:text-sm text-slate-900">{detailsUser.pharmacy.type}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Phone</p>
                        <p className="text-xs sm:text-sm text-slate-900">{detailsUser.pharmacy.phone}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email</p>
                        <p className="text-xs sm:text-sm text-slate-900 truncate">{detailsUser.pharmacy.email}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pharmacist In Charge */}
                {detailsUser.pharmacistInCharge && (
                  <div className="border border-slate-200 rounded-2xl p-2 sm:p-3 md:p-4 bg-green-50/50">
                    <div className="flex items-center gap-2 mb-2 sm:mb-3">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                      <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">Pharmacist</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Full Name</p>
                        <p className="text-xs sm:text-sm text-slate-900 font-medium">{detailsUser.pharmacistInCharge.fullName}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">License</p>
                        <p className="text-xs text-slate-600 font-mono bg-slate-100 px-2 py-1 rounded-lg truncate">{detailsUser.pharmacistInCharge.licenseNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Contact</p>
                        <p className="text-xs sm:text-sm text-slate-900">{detailsUser.pharmacistInCharge.contactDetails}</p>
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
