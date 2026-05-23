'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth, database } from '@/lib/services/firebase';
import { ref, set, get } from 'firebase/database';
import Link from 'next/link';

export default function AdminInitPage() {
  const router = useRouter();
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setPasswordConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [adminName, setAdminName] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successAdminName, setSuccessAdminName] = useState('');

  useEffect(() => {
    let isMounted = true;

    const checkAdmin = async () => {
      try {
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);

        if (isMounted) {
          if (snapshot.exists()) {
            const users = snapshot.val() as Record<string, { role: string }>;
            const existingAdmin = Object.values(users).find((u) => u.role === 'admin');
            setAdminExists(!!existingAdmin);
          } else {
            setAdminExists(false);
          }
        }
      } catch (err) {
        console.error('Error checking admin status:', err);
        if (isMounted) {
          setAdminExists(false);
        }
      }
    };

    checkAdmin();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!adminName.trim()) {
      setError('Admin name is required');
      return;
    }

    setIsLoading(true);

    try {
      // Double-check that no admin exists (security check)
      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);

      if (snapshot.exists()) {
        const users = snapshot.val();
        const existingAdmin = Object.values(users as Record<string, { role: string }>).find((u) => u.role === 'admin');
        if (existingAdmin) {
          setError('An admin account already exists. Please contact the system administrator.');
          setIsLoading(false);
          return;
        }
      }

      // Create admin user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create admin profile in Realtime Database
      await set(ref(database, `users/${user.uid}`), {
        uid: user.uid,
        email: user.email,
        name: adminName.trim(),
        role: 'admin',
        status: 'approved',
        createdAt: new Date().toISOString(),
      });

      // Show success modal instead of redirecting
      setSuccessAdminName(adminName.trim());
      setShowSuccessModal(true);
      setIsLoading(false);
    } catch (err) {
      if (err instanceof FirebaseError) {
        if (err.code === 'auth/email-already-in-use') {
          setError('An account with this email already exists.');
        } else if (err.code === 'PERMISSION_DENIED') {
          setError('Database permission denied. Please contact an administrator.');
          console.error('Database Error:', err);
        } else {
          setError(`Error: ${err.message}`);
          console.error('Firebase Auth Error:', err);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
        console.error('Unexpected Registration Error:', err);
      }
      setIsLoading(false);
    }
  };

  // If admin already exists, show message
  if (adminExists === true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border border-slate-100 text-center">
          <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Admin Already Exists</h1>
          <p className="text-slate-500 mb-8">
            An admin account has already been created in this system. If you need to access the system, please log in with your credentials.
          </p>
          <Link
            href="/login"
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors inline-block"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  // Show loading state while checking
  if (adminExists === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm tracking-wide">Initializing system…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl border border-slate-100 p-8 md:p-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-2">Create Admin Account</h1>
          <p className="text-slate-500">This is the first account. It will be set as the system administrator.</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 font-medium text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Section */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@pharmacy.com"
              required
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              required
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="Re-enter password"
              required
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Admin Name
            </label>
            <input
              type="text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="John Doe"
              required
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-8 py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v6m6 0h-6m0 6v6m0-6H6" />
                </svg>
                Initializing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Create Admin Account
              </>
            )}
          </button>
        </form>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 text-center">
            {/* Success Icon */}
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            {/* Title and Message */}
            <h2 className="text-2xl font-black text-slate-900 mb-2">Admin Account Created</h2>
            <p className="text-slate-500 mb-2">Welcome, {successAdminName}!</p>
            <p className="text-sm text-slate-400 mb-8">
              Your admin account has been successfully created. Please log in to access the admin dashboard.
            </p>

            {/* Login Button */}
            <button
              onClick={async () => {
                try {
                  await signOut(auth);
                  router.push('/login');
                } catch (err) {
                  console.error('Error signing out:', err);
                  router.push('/login');
                }
              }}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Go to Login
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
