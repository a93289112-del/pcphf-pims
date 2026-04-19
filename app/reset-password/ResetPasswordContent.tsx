'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth, database } from '@/lib/services/firebase';
import { ref, query, orderByChild, equalTo, get } from 'firebase/database';
import { logActivity } from '@/lib/services/activity-logs';

// ─── Shared hero branding block ────────────────────────────────────────────────
function HeroBranding() {
  return (
    <div className="
      flex-1 flex flex-col justify-center
      px-8 pt-12 pb-8
      sm:px-12 sm:pt-16 sm:pb-10
      lg:px-16 lg:py-0 lg:min-h-screen
      max-w-full lg:max-w-[55%]
    ">
      <div className="space-y-5 lg:space-y-6 max-w-xl">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-400">
          Passi City
        </p>
        <div className="leading-none">
          <div className="text-[clamp(2.8rem,10vw,7rem)] font-black text-blue-600 tracking-tight leading-none">
            Primary
          </div>
          <div className="text-[clamp(2.8rem,10vw,7rem)] font-black text-blue-600 tracking-tight leading-none">
            Pharmacy
          </div>
          <div className="flex items-center gap-3 mt-3">
            <div className="h-[3px] w-10 sm:w-16 bg-slate-900 rounded-full shrink-0" />
            <div className="text-[clamp(1.6rem,5.5vw,4rem)] font-black text-slate-900 tracking-tight leading-none">
              Health <span className="text-blue-600">Facility</span>
            </div>
          </div>
        </div>
        <p className="text-base sm:text-lg lg:text-xl text-slate-500 max-w-sm leading-relaxed font-light">
          Streamline your pharmaceutical operations with intelligent, real-time inventory management
        </p>
        <div className="flex gap-2.5 pt-2 lg:pt-6">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse animation-delay-200" />
          <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse animation-delay-400" />
        </div>
      </div>
    </div>
  );
}

// ─── Shared page shell ─────────────────────────────────────────────────────────
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col lg:flex-row">
      <HeroBranding />
      <div className="
        flex items-center justify-center
        px-6 pb-12 pt-4
        sm:px-12 sm:pb-16
        lg:px-16 lg:py-0 lg:min-h-screen lg:w-[45%] lg:shrink-0
      ">
        <div className="w-full max-w-md">
          <div className="login-card rounded-2xl p-7 sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Spinner (used while validating oobCode) ───────────────────────────────────
function FullPageSpinner() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-white to-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
        </div>
        <p className="mt-4 text-slate-600">Verifying reset link…</p>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get('oobCode');

  const [newPassword,      setNewPassword]      = useState('');
  const [confirmPassword,  setConfirmPassword]  = useState('');
  const [isLoading,        setIsLoading]        = useState(false);
  const [error,            setError]            = useState('');
  const [success,          setSuccess]          = useState(false);
  const [validatingCode,   setValidatingCode]   = useState(true);
  const [userEmail,        setUserEmail]        = useState('');

  useEffect(() => {
    const validateCode = async () => {
      if (!oobCode) {
        setError('Invalid reset link. No code provided.');
        setValidatingCode(false);
        return;
      }
      try {
        const email = await verifyPasswordResetCode(auth, oobCode);
        setUserEmail(email);
        setValidatingCode(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid reset link';
        if (msg.includes('auth/expired-action-code')) {
          setError('This reset link has expired. Please request a new one.');
        } else if (msg.includes('auth/invalid-action-code')) {
          setError('This reset link is invalid. Please request a new one.');
        } else {
          setError(msg);
        }
        setValidatingCode(false);
      }
    };
    validateCode();
  }, [oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (!newPassword || !confirmPassword) {
        setError('Please fill in all fields');
        setIsLoading(false);
        return;
      }
      if (newPassword.length < 6) {
        setError('Password must be at least 6 characters long');
        setIsLoading(false);
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match');
        setIsLoading(false);
        return;
      }
      if (!oobCode) {
        setError('Invalid reset code');
        setIsLoading(false);
        return;
      }

      await confirmPasswordReset(auth, oobCode, newPassword);

      // Log password change activity
      try {
        const usersRef   = ref(database, 'users');
        const staffQuery = query(usersRef, orderByChild('email'), equalTo(userEmail));
        const snapshot   = await get(staffQuery);
        if (snapshot.exists()) {
          const staffData = snapshot.val();
          const staffId   = Object.keys(staffData)[0];
          await logActivity(
            'password_changed',
            staffId,
            userEmail,
            'Password reset via email reset link',
            {},
            userEmail.split('@')[0],
            'staff'
          );
        }
      } catch (logError) {
        console.error('Failed to log password change:', logError);
      }

      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { router.push('/login'); }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password';
      setError(msg.includes('auth/weak-password') ? 'Password is too weak. Please use a stronger password.' : msg);
      setIsLoading(false);
    }
  };

  // ── Validating ─────────────────────────────────────────────────────────────
  if (validatingCode) return <FullPageSpinner />;

  // ── Invalid / expired link ─────────────────────────────────────────────────
  if (error && !success) {
    return (
      <PageShell>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Reset Failed</h2>
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm mb-6">
          {error}
        </div>
        <Link
          href="/forgot-password"
          className="w-full py-2.5 px-4 btn-primary rounded-lg font-semibold text-center block"
        >
          Request New Reset Link
        </Link>
        <p className="text-center text-gray-600 text-sm mt-4">
          <Link href="/login" className="text-blue-600 font-bold hover:underline">
            Back to Login
          </Link>
        </p>
      </PageShell>
    );
  }

  // ── Reset form ─────────────────────────────────────────────────────────────
  return (
    <PageShell>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Create New Password</h2>
      {userEmail && (
        <p className="text-sm text-gray-500 mb-6 truncate">
          Resetting password for <span className="font-medium text-gray-700">{userEmail}</span>
        </p>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}

      {success ? (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <p className="font-semibold mb-1">Password reset successfully!</p>
          <p>Redirecting you to login…</p>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                placeholder="Enter new password (min 6 characters)"
                className="w-full px-4 py-2.5 input-field rounded-lg placeholder-opacity-50"
                disabled={isLoading}
                required
                suppressHydrationWarning
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                placeholder="Confirm new password"
                className="w-full px-4 py-2.5 input-field rounded-lg placeholder-opacity-50"
                disabled={isLoading}
                required
                suppressHydrationWarning
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 btn-primary rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {isLoading ? 'Resetting…' : 'Reset Password'}
            </button>
          </form>

          <p className="text-center text-gray-600 text-sm mt-4">
            <Link href="/login" className="text-blue-600 font-bold hover:underline">
              Back to Login
            </Link>
          </p>
        </>
      )}
    </PageShell>
  );
}