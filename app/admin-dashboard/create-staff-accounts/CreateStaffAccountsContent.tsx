'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useEffect, useState } from 'react';
import { database, secondaryAuth } from '@/lib/services/firebase';
import { ref, set } from 'firebase/database';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import Processing from '@/lib/components/processing';
import StaffSuccessModal from '@/lib/components/staff-success-modal';
import { logActivity } from '@/lib/services/activity-logs';

interface SuccessInfo {
  staffName: string;
  email: string;
  position: string;
  contactNumber: string;
}

export default function CreateStaffAccountsContent() {
  const { user, role, adminName } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  
  // Form states
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formConfirmPassword, setFormConfirmPassword] = useState('');
  const [formStaffName, setFormStaffName] = useState('');
  const [formPosition, setFormPosition] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formContactNumber, setFormContactNumber] = useState('');

  useEffect(() => {
    if (!user) return;
    setLoading(false);
  }, [user]);

  const validateForm = () => {
    if (!formEmail.trim()) {
      setError('Email is required');
      return false;
    }
    if (!formPassword) {
      setError('Password is required');
      return false;
    }
    if (formPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    if (formPassword !== formConfirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (!formStaffName.trim()) {
      setError('Staff name is required');
      return false;
    }
    if (!formPosition.trim()) {
      setError('Position is required');
      return false;
    }
    if (!formAddress.trim()) {
      setError('Address is required');
      return false;
    }
    if (!formContactNumber.trim()) {
      setError('Contact number is required');
      return false;
    }
    return true;
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) return;

    setIsCreating(true);
    
    try {
      // Create user in Firebase Auth using secondary auth instance
      // This keeps the admin's primary session untouched
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, formEmail.trim(), formPassword);
      const newUser = userCredential.user;

      // Create user profile in Realtime Database with approved status
      await set(ref(database, `users/${newUser.uid}`), {
        uid: newUser.uid,
        email: newUser.email,
        staffName: formStaffName.trim(),
        position: formPosition.trim(),
        address: formAddress.trim(),
        contactNumber: formContactNumber.trim(),
        role: 'staff',
        status: 'approved',
        createdAt: new Date().toISOString(),
      });

      // Show success modal with staff info
      setSuccessInfo({
        staffName: formStaffName.trim(),
        email: formEmail.trim(),
        position: formPosition.trim(),
        contactNumber: formContactNumber.trim(),
      });
      setShowSuccessModal(true);

      // Log staff account creation activity
      if (user) {
        await logActivity(
          'staff_created',
          user.uid,
          user.email || '',
          `Created new staff account for ${formStaffName.trim()} (${formEmail.trim()})`,
          {
            staffName: formStaffName.trim(),
            email: formEmail.trim(),
            position: formPosition.trim(),
            contactNumber: formContactNumber.trim(),
            address: formAddress.trim(),
          },
          adminName || user.email || undefined,
          role || undefined,
        );
      }

      // Clear form
      setFormEmail('');
      setFormPassword('');
      setFormConfirmPassword('');
      setFormStaffName('');
      setFormPosition('');
      setFormAddress('');
      setFormContactNumber('');
    } catch (err) {
      if (err instanceof FirebaseError) {
        if (err.code === 'auth/email-already-in-use') {
          setError('An account with this email already exists');
        } else {
          setError(`Error: ${err.message}`);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsCreating(false);
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
      {isCreating && <Processing message="Creating staff account..." />}
      {showSuccessModal && successInfo && (
        <StaffSuccessModal
          info={successInfo}
          onClose={() => setShowSuccessModal(false)}
          onCreateAnother={() => setShowSuccessModal(false)}
        />
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-10">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">Create Staff Accounts</h1>
          <p className="text-slate-500">Create and manage staff accounts</p>
        </div>

        <div className="mb-8 bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">New Staff Account</h2>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleCreateStaff} className="space-y-6">
            {/* Personal Information Section */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-4 uppercase tracking-wide">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Staff Name</label>
                  <input
                    type="text"
                    value={formStaffName}
                    onChange={(e) => setFormStaffName(e.target.value)}
                    placeholder="e.g., John Doe"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Position</label>
                  <input
                    type="text"
                    value={formPosition}
                    onChange={(e) => setFormPosition(e.target.value)}
                    placeholder="e.g., Pharmacist, Cashier"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Contact Information Section */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-4 uppercase tracking-wide">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="staff@pharmacy.com"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Contact Number</label>
                  <input
                    type="tel"
                    value={formContactNumber}
                    onChange={(e) => setFormContactNumber(e.target.value)}
                    placeholder="e.g., +1 (555) 123-4567"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Address</label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="e.g., 123 Main Street, City"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Account & Security Section */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-4 uppercase tracking-wide">Account & Security</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Password</label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Confirm Password</label>
                  <input
                    type="password"
                    value={formConfirmPassword}
                    onChange={(e) => setFormConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setFormEmail('');
                  setFormPassword('');
                  setFormConfirmPassword('');
                  setFormStaffName('');
                  setFormPosition('');
                  setFormAddress('');
                  setFormContactNumber('');
                }}
                className="px-6 py-2.5 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Clear Form
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isCreating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v6m6 0h-6m0 6v6m0-6H6" /></svg>
                    Creating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Create Account
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
