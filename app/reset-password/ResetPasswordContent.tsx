'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '@/lib/services/firebase';

export default function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get('oobCode');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [validatingCode, setValidatingCode] = useState(true);
  const [userEmail, setUserEmail] = useState('');

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
        const errorMessage = err instanceof Error ? err.message : 'Invalid reset link';
        if (errorMessage.includes('auth/expired-action-code')) {
          setError('This reset link has expired. Please request a new one.');
        } else if (errorMessage.includes('auth/invalid-action-code')) {
          setError('This reset link is invalid. Please request a new one.');
        } else {
          setError(errorMessage);
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
      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset password';
      if (errorMessage.includes('auth/weak-password')) {
        setError('Password is too weak. Please use a stronger password.');
      } else {
        setError(errorMessage);
      }
      setIsLoading(false);
    }
  };

  if (validatingCode) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
          </div>
          <p className="mt-4 text-slate-600">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (error && !success) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden bg-white">
        <div className="absolute inset-0 flex flex-col items-start justify-center pl-8 md:pl-12 lg:pl-24 max-w-3xl pr-8">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-blue-400 leading-none tracking-tight mb-1">City</h1>
              <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-blue-600 leading-none tracking-tight mb-2">Primary</h1>
              <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-blue-600 leading-none tracking-tight mb-2">Pharmacy</h1>
              <div className="flex items-center gap-3 mt-3">
                <div className="h-1 w-20 bg-gray-900 rounded-full"></div>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 leading-none tracking-tight">
                  Health <span className="text-blue-600">Facility</span>
                </h1>
              </div>
            </div>
            <p className="text-xl md:text-2xl text-gray-600 max-w-lg leading-relaxed font-light">
              Streamline your pharmaceutical operations with intelligent, real-time inventory management
            </p>
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-end pr-8 lg:pr-16">
          <div className="w-full max-w-md">
            <div className="login-card rounded-2xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Reset Failed</h2>
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 mb-6">{error}</div>
              <Link href="/forgot-password" className="w-full py-2 px-4 btn-primary rounded-lg font-semibold text-center block">
                Request New Reset Link
              </Link>
              <p className="text-center text-gray-600 text-sm mt-4">
                <Link href="/login" className="text-blue-600 font-bold hover:underline">Back to Login</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white">
      <div className="absolute inset-0 flex flex-col items-start justify-center pl-8 md:pl-12 lg:pl-24 max-w-3xl pr-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-blue-400 leading-none tracking-tight mb-1">City</h1>
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-blue-600 leading-none tracking-tight mb-2">Primary</h1>
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-blue-600 leading-none tracking-tight mb-2">Pharmacy</h1>
            <div className="flex items-center gap-3 mt-3">
              <div className="h-1 w-20 bg-gray-900 rounded-full"></div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 leading-none tracking-tight">
                Health <span className="text-blue-600">Facility</span>
              </h1>
            </div>
          </div>
          <p className="text-xl md:text-2xl text-gray-600 max-w-lg leading-relaxed font-light">
            Streamline your pharmaceutical operations with intelligent, real-time inventory management
          </p>
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-end pr-8 lg:pr-16">
        <div className="w-full max-w-md">
          <div className="login-card rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Create New Password</h2>
            <p className="text-sm text-gray-600 mb-6">
              {userEmail && `Resetting password for ${userEmail}`}
            </p>
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>
            )}
            {success && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                <p className="font-semibold mb-1">Password reset successfully!</p>
                <p>Redirecting you to login...</p>
              </div>
            )}
            {!success ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                    placeholder="Enter new password (min 6 characters)"
                    className="w-full px-4 py-2 input-field rounded-lg placeholder-opacity-50"
                    disabled={isLoading}
                    required
                    suppressHydrationWarning
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                    placeholder="Confirm new password"
                    className="w-full px-4 py-2 input-field rounded-lg placeholder-opacity-50"
                    disabled={isLoading}
                    required
                    suppressHydrationWarning
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2 px-4 btn-primary rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                >
                  {isLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            ) : null}
            {!success && (
              <p className="text-center text-gray-600 text-sm mt-4">
                <Link href="/login" className="text-blue-600 font-bold hover:underline">Back to Login</Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}