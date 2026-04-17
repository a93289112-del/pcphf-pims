'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/services/firebase';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, status, role, signIn, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (user && !loading) {
      if (status === 'approved') {
        if (role === 'admin') {
          router.push('/admin-dashboard');
        } else {
          router.push('/staff-dashboard');
        }
      } else if (status === 'disabled') {
        router.push('/account-disabled');
      }
      // status === 'pending' is handled by the UI message below
    }
  }, [user, loading, status, role, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();
    setIsLoading(true);

    try {
      if (!email || !password) {
        setLocalError('Please fill in all fields');
        setIsLoading(false);
        return;
      }

      await signIn(email, password);
      setIsLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : error || 'Failed to sign in';
      setLocalError(errorMessage);
      setIsLoading(false);
    }
  };

  const displayError = localError || error;

  // Show pending status message if user is logged in but pending approval
  if (user && !loading && status === 'pending') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-blue-50 to-indigo-100">
        <div className="max-w-md mx-auto text-center bg-white rounded-2xl shadow-xl p-8">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Pending Approval</h2>
          <p className="text-gray-600 mb-6">Your account has been registered successfully. An administrator is reviewing your request and will approve your access soon.</p>
          <button
            onClick={() => {
              signOut(auth).catch(console.error);
              router.push('/login');
            }}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white">
      {/* Hero Section - Left Side */}
      <div className="absolute inset-0 flex flex-col items-start justify-center pl-8 md:pl-12 lg:pl-24 max-w-3xl pr-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-blue-400 leading-none tracking-tight mb-1">
              City
            </h1>
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-blue-600 leading-none tracking-tight mb-2">
              Primary
            </h1>
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-blue-600 leading-none tracking-tight mb-2">
              Pharmacy
            </h1>
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
          <div className="flex gap-3 pt-6">
            <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse"></div>
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse animation-delay-200"></div>
            <div className="w-3 h-3 rounded-full bg-blue-600 animate-pulse animation-delay-400"></div>
          </div>
        </div>
      </div>

      {/* Login Form - Right Side */}
      <div className="absolute inset-0 flex items-center justify-end pr-8 lg:pr-16">
        <div className="w-full max-w-md">
          <div className="login-card rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Login</h2>

            {displayError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                {displayError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setLocalError('');
                  }}
                  placeholder="Enter your email"
                  className="w-full px-4 py-2 input-field rounded-lg placeholder-opacity-50"
                  disabled={isLoading || loading}
                  required
                  suppressHydrationWarning
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLocalError('');
                  }}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2 input-field rounded-lg placeholder-opacity-50"
                  disabled={isLoading || loading}
                  required
                  suppressHydrationWarning
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || loading}
                className="w-full py-2 px-4 btn-primary rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              >
                {isLoading || loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="mt-4">
              <Link
                href="/forgot-password"
                className="text-sm text-blue-600 font-semibold hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}