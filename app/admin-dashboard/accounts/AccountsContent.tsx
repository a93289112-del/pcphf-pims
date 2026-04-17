'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { database } from '@/lib/services/firebase';
import { ref, onValue, update, remove } from 'firebase/database';
import ConfirmationModal from '@/lib/components/confirmation-modal';

interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'staff';
  status: 'pending' | 'approved' | 'disabled';
  createdAt: string;
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

export default function AccountsManagement() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const filter = searchParams.get('filter');

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [detailsUser, setDetailsUser] = useState<UserProfile | null>(null);
  const [newStatus, setNewStatus] = useState<UserProfile['status'] | null>(null);

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

  const filteredUsers = useMemo(() => {
  return users.filter(u => {
    if (!u || !u.email) return false;
    const matchesSearch = u.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter ? u.status === filter : true;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}, [users, searchQuery, filter]);

  const handleUpdateStatus = async () => {
    if (!selectedUser || !newStatus) return;
    try {
      const userRef = ref(database, `users/${selectedUser.uid}`);
      await update(userRef, { status: newStatus });
      setShowStatusConfirm(false);
      setSelectedUser(null);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    try {
      const userRef = ref(database, `users/${selectedUser.uid}`);
      await remove(userRef);
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
        
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">View all staff</h1>
          <p className="text-slate-500">Approve, edit, or remove user accounts</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64 shadow-sm"
            />
            <svg className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">User Email</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Pharmacy Name</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Pharmacist In Charge</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Role</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Status</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Joined Date</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => (
                <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-slate-900">{u.email}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-tighter">{u.uid}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-slate-900">{u.pharmacy?.name || '—'}</p>
                    {u.pharmacy?.address && <p className="text-[10px] text-slate-500">{u.pharmacy.address}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-slate-900">{u.pharmacistInCharge?.fullName || '—'}</p>
                    {u.pharmacistInCharge?.licenseNumber && <p className="text-[10px] text-slate-500">Lic: {u.pharmacistInCharge.licenseNumber}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                      u.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      u.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      u.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setDetailsUser(u); setShowDetailsPanel(true); }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View Full Details"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </button>
                      {u.status === 'pending' && (
                        <button
                          onClick={() => { setSelectedUser(u); setNewStatus('approved'); setShowStatusConfirm(true); }}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Approve User"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </button>
                      )}
                      {u.uid !== user?.uid && (
                        <>
                          {u.status !== 'disabled' ? (
                            <button
                              onClick={() => { setSelectedUser(u); setNewStatus('disabled'); setShowStatusConfirm(true); }}
                              className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                              title="Disable User"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                            </button>
                          ) : (
                            <button
                              onClick={() => { setSelectedUser(u); setNewStatus('approved'); setShowStatusConfirm(true); }}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Enable User"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button>
                          )}
                          <button
                            onClick={() => { setSelectedUser(u); setShowDeleteConfirm(true); }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete User"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center">
                      <svg className="w-12 h-12 text-slate-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      <p className="text-slate-500 font-medium">No users found matching your search</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showStatusConfirm}
        title={`${newStatus === 'approved' ? 'Approve/Enable' : 'Disable'} User?`}
        message={`Are you sure you want to change ${selectedUser?.email}'s status to ${newStatus}?`}
        confirmText="Confirm Change"
        onConfirm={handleUpdateStatus}
        onCancel={() => { setShowStatusConfirm(false); setSelectedUser(null); }}
      />

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete User Account?"
        message={`Warning: This will permanently remove ${selectedUser?.email} from the system. This action cannot be undone.`}
        confirmText="Permanently Delete"
        isDangerous={true}
        onConfirm={handleDeleteUser}
        onCancel={() => { setShowDeleteConfirm(false); setSelectedUser(null); }}
      />

      {/* Details Modal */}
      {showDetailsPanel && detailsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => { setShowDetailsPanel(false); setDetailsUser(null); }}
          />
          
          {/* Modal */}
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-linear-to-r from-blue-600 to-blue-700 px-6 py-6 flex items-center justify-between">
              <h2 className="text-2xl font-black text-white">Complete Registrant Details</h2>
              <button
                onClick={() => { setShowDetailsPanel(false); setDetailsUser(null); }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-8 space-y-8">
              {/* Account Information */}
              <div>
                <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M2 12c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12z"/></svg>
                  Account Information
                </h3>
                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Email</p>
                      <p className="text-sm font-medium text-slate-900">{detailsUser.email}</p>
                    </div>
                    <div className="flex-1 ml-4">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Role</p>
                      <p className={`text-sm font-bold px-2 py-1 rounded w-fit ${
                        detailsUser.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                      }`}>{detailsUser.role.toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-start pt-3 border-t border-slate-200">
                    <div className="flex-1">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Status</p>
                      <p className={`text-sm font-bold px-2 py-1 rounded w-fit inline-block ${
                        detailsUser.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        detailsUser.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>{detailsUser.status.toUpperCase()}</p>
                    </div>
                    <div className="flex-1 ml-4">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Joined Date</p>
                      <p className="text-sm font-medium text-slate-900">{new Date(detailsUser.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pharmacy Information */}
              {detailsUser.pharmacy && (
                <div>
                  <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M6 2a1 1 0 00-1 1v2H4a2 2 0 00-2 2v13a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v2H9V3a1 1 0 00-1-1zm0 5h12v10H6V7z"/></svg>
                    Pharmacy Information
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Pharmacy Name</p>
                      <p className="text-sm font-medium text-slate-900">{detailsUser.pharmacy.name}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Physical Address</p>
                      <p className="text-sm font-medium text-slate-900">{detailsUser.pharmacy.address}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Phone</p>
                        <p className="text-sm font-medium text-slate-900">{detailsUser.pharmacy.phone || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Email</p>
                        <p className="text-sm font-medium text-slate-900">{detailsUser.pharmacy.email || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Pharmacy Type</p>
                        <p className="text-sm font-medium text-slate-900">{detailsUser.pharmacy.type}</p>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">License/Permit Number</p>
                        <p className="text-sm font-medium text-slate-900">{detailsUser.pharmacy.licenseNumber}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pharmacist-in-Charge Information */}
              {detailsUser.pharmacistInCharge && (
                <div>
                  <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
                    Pharmacist-in-Charge (PIC)
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Full Name</p>
                      <p className="text-sm font-medium text-slate-900">{detailsUser.pharmacistInCharge.fullName}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Professional License Number</p>
                        <p className="text-sm font-medium text-slate-900">{detailsUser.pharmacistInCharge.licenseNumber || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Contact Details</p>
                        <p className="text-sm font-medium text-slate-900">{detailsUser.pharmacistInCharge.contactDetails || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!detailsUser.pharmacy && !detailsUser.pharmacistInCharge && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-blue-700">No pharmacy registration details available for this user.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
