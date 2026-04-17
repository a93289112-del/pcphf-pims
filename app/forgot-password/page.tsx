'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/services/firebase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successEmail, setSuccessEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      if (!email) {
        setError('Please enter your email address');
        setIsLoading(false);
        return;
      }

      await sendPasswordResetEmail(auth, email);
      setSuccessEmail(email);
      setSuccess(true);
      setEmail('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send reset email';
      // Firebase error messages are somewhat technical, so we customize them
      if (errorMessage.includes('auth/user-not-found')) {
        setError('No account found with this email address');
      } else if (errorMessage.includes('auth/invalid-email')) {
        setError('Please enter a valid email address');
      } else {
        setError(errorMessage);
      }
      setIsLoading(false);
    }
  };

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

      {/* Password Reset Form - Right Side */}
      <div className="absolute inset-0 flex items-center justify-end pr-8 lg:pr-16">
        <div className="w-full max-w-md">
          <div className="login-card rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Reset Password</h2>
            <p className="text-sm text-gray-600 mb-6">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                <p className="font-semibold mb-1">Email sent successfully!</p>
                <p>
                  Check your email at <span className="font-semibold">{successEmail}</span> for a link to reset your password. 
                  The link will expire in 1 hour.
                </p>
              </div>
            )}

            {!success ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    placeholder="Enter your email"
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
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            ) : (
              <div className="mt-6">
                <button
                  onClick={() => {
                    setSuccess(false);
                    setError('');
                  }}
                  className="w-full py-2 px-4 btn-primary rounded-lg font-semibold"
                >
                  Try Another Email
                </button>
              </div>
            )}

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Remember your password? <Link href="/login" className="text-blue-600 font-bold hover:underline">Back to Login</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
