'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, get } from 'firebase/database';
import Link from 'next/link';
import BackButton from '@/lib/components/back-button';
import Image from 'next/image';

interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

interface Medicine {
  id: string;
  name: string;
  baseName?: string;
  category: string;
  brand: string;
  image: string;
  description: string;
  strength?: string;
  strengths?: string[] | null;
  prescriptionRequired?: boolean;
  createdAt?: string;
  unit?: string;
  quantity?: number;
  piecesPerUnit?: number;
  containerQuantity?: number;
  originalUnit?: string;
  expirationDate?: string;
  batches?: Record<string, MedicineBatch>; // FIFO batches with individual expirations
}

export default function MedicineDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const medicineId = params.id as string;
  
  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [loadingMedicine, setLoadingMedicine] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    if (medicineId && user) {
      const medicineRef = ref(database, getUserPath(user.uid, `medicines/${medicineId}`));
      get(medicineRef)
        .then((snapshot) => {
          if (snapshot.exists()) {
            setMedicine({
              id: medicineId,
              ...snapshot.val(),
            });
          } else {
            setError('Medicine not found');
          }
        })
        .catch(() => {
          setError('Failed to load medicine details');
        })
        .finally(() => {
          setLoadingMedicine(false);
        });
    }
  }, [medicineId, user, loading, router]);

  if (loading || loadingMedicine) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading medicine details...</p>
        </div>
      </div>
    );
  }

  if (error || !medicine) {
    return (
      <div className="min-h-screen bg-slate-50/70">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <BackButton href="/medicines" label="Back to Medicines" position="left" className="mb-4" />
          <div className="login-card rounded-xl p-12 text-center">
            <p className="text-red-600 font-semibold mb-4">{error || 'Medicine not found'}</p>
            <Link
              href="/medicines"
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Return to medicines →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-all duration-300 ml-0">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Back Button */}
        <div className="flex justify-end mb-12">
          <BackButton href="/medicines" label="Back to Medicines" position="right" className="" />
        </div>

        {/* Medicine Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Image Section */}
          {medicine.image && (
            <div className="flex items-center justify-center bg-slate-50 rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm">
              <Image
                src={medicine.image}
                alt={medicine.name}
                width={480}
                height={480}
                unoptimized
                className="max-h-96 w-full object-contain p-8"
              />
            </div>
          )}

          {/* Details Section */}
          <div className="flex flex-col justify-start">
            {/* Meta */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                {medicine.category}
              </span>
              <span className="text-xs text-slate-700">by {medicine.brand}</span>
              {medicine.prescriptionRequired && (
                <span className="text-xs font-bold text-white bg-red-600 px-3 py-1 rounded-full">
                  Prescription Required
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-slate-900 mb-8">
              {medicine.baseName || medicine.name}
            </h1>

            {/* Description */}
            <div className="mb-10">
              <p className="text-slate-900 leading-relaxed text-lg">
                {medicine.description}
              </p>
            </div>

            {/* Inventory Details */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
              <div className="surface-card p-4">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Unit</p>
                <p className="text-lg font-semibold text-slate-900">{medicine.unit || '—'}</p>
              </div>
              <div className="surface-card p-4">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Original Unit</p>
                <p className="text-lg font-semibold text-slate-900">{medicine.originalUnit || '—'}</p>
              </div>
              {medicine.strength && (
                <div className="surface-card p-4">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Strength</p>
                  <p className="text-lg font-semibold text-slate-900">{medicine.strength}</p>
                </div>
              )}
            </div>

            {/* Stock Info */}
            {medicine.piecesPerUnit && medicine.originalUnit && (
              <div className="surface-card p-4 mb-10 border border-blue-200 bg-blue-50">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Stock Details</p>
                <p className="text-lg font-semibold text-slate-900">{medicine.piecesPerUnit}pcs{medicine.containerQuantity ? `/${medicine.containerQuantity}` : ''} {medicine.originalUnit}</p>
              </div>
            )}

            {/* Meta Cards */}
            <div className="grid grid-cols-2 gap-4 mb-10">
              <div className="surface-card p-4">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Brand</p>
                <p className="text-lg font-semibold text-slate-900">{medicine.brand}</p>
              </div>
              <div className="surface-card p-4">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Category</p>
                <p className="text-lg font-semibold text-slate-900">{medicine.category}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <Link
                href="/medicines"
                className="flex-1 px-6 py-3 border border-slate-200 text-slate-900 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-center"
              >
                Back
              </Link>
              <Link
                href="/medicines/add-medicine"
                className="flex-1 px-6 py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-950 transition-colors text-center shadow-sm"
              >
                Add More Medicines
              </Link>
            </div>
          </div>
        </div>

        {/* Related Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 pt-12 border-t border-slate-200/80">
          <Link
            href="/medicines"
            className="surface-card surface-card-hover p-6 transition-all group text-center"
          >
            <div className="text-3xl mb-3">💊</div>
            <p className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">View All Medicines</p>
          </Link>
          <Link
            href="/medicines/add-medicine"
            className="surface-card surface-card-hover p-6 transition-all group text-center"
          >
            <div className="text-3xl mb-3">➕</div>
            <p className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">Add Medicines</p>
          </Link>
          <Link
            href="/staff-dashboard"
            className="surface-card surface-card-hover p-6 transition-all group text-center"
          >
            <div className="text-3xl mb-3">📊</div>
            <p className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">Dashboard</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
