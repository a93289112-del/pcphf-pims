'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, onValue } from 'firebase/database';
import Link from 'next/link';

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
  unit?: string;
  quantity?: number;
  piecesPerUnit?: number;
  containerQuantity?: number;
  originalUnit?: string;
  expirationDate?: string;
  batches?: Record<string, MedicineBatch>; // FIFO batches with individual expirations
}

type MedicineRecord = Omit<Medicine, 'id'>;

export default function MedicinesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loadingMedicines, setLoadingMedicines] = useState(true);

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedBrand,    setSelectedBrand]    = useState<string>('All');
  const [searchQuery,      setSearchQuery]      = useState<string>('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      const medicinesPath = getUserPath(user.uid, 'medicines');
      const medicinesRef = ref(database, medicinesPath);
      const unsubscribe = onValue(medicinesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const medicinesArray = Object.entries(data as Record<string, MedicineRecord>).map(([key, value]) => ({
            id: key,
            ...value,
          }));
          setMedicines(medicinesArray);
        } else {
          setMedicines([]);
        }
        setLoadingMedicines(false);
      });

      return () => unsubscribe();
    }
  }, [user, loading, router]);

  // Derive unique categories from data
  const categories = useMemo(() => {
    const cats = Array.from(new Set(medicines.map((m) => m.category).filter(Boolean)));
    return ['All', ...cats.sort()];
  }, [medicines]);

  // Derive unique brands from data
  const brands = useMemo(() => {
    const bs = Array.from(new Set(medicines.map((m) => m.brand).filter(Boolean)));
    return ['All', ...bs.sort()];
  }, [medicines]);

  // Filtered medicines
  const filteredMedicines = useMemo(() => {
    return medicines.filter((m) => {
      const matchesCategory = selectedCategory === 'All' || m.category === selectedCategory;
      const matchesBrand    = selectedBrand    === 'All' || m.brand    === selectedBrand;
      const matchesSearch =
        searchQuery === '' ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.brand.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesBrand && matchesSearch;
    });
  }, [medicines, selectedCategory, selectedBrand, searchQuery]);

  const hasActiveFilters =
    selectedCategory !== 'All' || selectedBrand !== 'All' || searchQuery !== '';

  const clearFilters = () => {
    setSelectedCategory('All');
    setSelectedBrand('All');
    setSearchQuery('');
  };

  if (loading || loadingMedicines) {
    return (
      <div className="min-h-screen transition-[margin] duration-300 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading medicines...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mb-2">Medicines</h1>
          <p className="text-sm sm:text-base text-slate-700">Manage your pharmacy inventory</p>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-end mb-4 sm:mb-6">
          <Link
            href="/medicines/add-medicine"
            className="px-5 py-2.5 bg-slate-900 text-white font-semibold text-sm rounded-xl hover:bg-slate-950 transition-colors shadow-sm hover:shadow-md"
          >
            + Add Medicines
          </Link>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-row gap-3 mb-6 sm:mb-8 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
          {/* Search */}
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or brand…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Category Dropdown */}
          <div className="relative w-37.5 shrink-0">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="appearance-none w-full pl-4 pr-9 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Brand Dropdown */}
          <div className="relative w-37.5 shrink-0">
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="appearance-none w-full pl-4 pr-9 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
            >
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b === 'All' ? 'All Brands' : b}
                </option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>


          {/* Clear Filters */}
          <div className="w-20 shrink-0">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center justify-center gap-1.5 w-full h-full px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Results count */}
        <p className="text-sm text-slate-500 mb-4 h-5">
          {hasActiveFilters && (
            <>
              Showing <span className="font-semibold text-slate-700">{filteredMedicines.length}</span> of{' '}
              <span className="font-semibold text-slate-700">{medicines.length}</span> medicines
            </>
          )}
        </p>

        {/* Medicines Grid */}
        {filteredMedicines.length === 0 ? (
          <div className="text-center py-20">
            {hasActiveFilters ? (
              <>
                <p className="text-xl text-gray-500 mb-3">No medicines match your filters</p>
                <button
                  onClick={clearFilters}
                  className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-xl text-gray-500 mb-6">No medicines added yet</p>
                <Link
                  href="/medicines/add-medicine"
                  className="inline-flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                >
                  Add your first medicine
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
            {filteredMedicines.map((medicine) => (
              <Link
                key={medicine.id}
                href={`/medicines/${medicine.id}`}
                className="group block"
              >
                <div className="surface-card surface-card-hover overflow-hidden transition-all duration-200">
                  {/* Image Container */}
                  {medicine.image ? (
                    <div className="relative h-36 overflow-hidden bg-slate-50">
                      <Image
                        src={medicine.image}
                        alt={medicine.name}
                        fill
                        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                        unoptimized
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  ) : (
                    <div className="h-36 bg-slate-100 flex items-center justify-center">
                      <span className="text-3xl text-slate-400">💊</span>
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-3.5">
                    {/* Category Badge */}
                    <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                        {medicine.category}
                      </span>
                      {medicine.prescriptionRequired && (
                        <span className="text-[10px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          Rx Only
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                      {medicine.baseName || medicine.name}
                    </h3>

                    {/* Brand */}
                    <p className="text-xs text-slate-500 mb-2 line-clamp-1">
                      {medicine.brand}
                    </p>

                    {/* Inventory Info */}
                    <div className="text-xs text-slate-600 space-y-0.5 mb-3">
                      {medicine.unit && (
                        <p><span className="font-semibold text-slate-700">Unit:</span> {medicine.unit}</p>
                      )}
                      {medicine.strength && (
                        <p><span className="font-semibold text-slate-700">Strength:</span> {medicine.strength}</p>
                      )}
                      {medicine.originalUnit && (
                        <p><span className="font-semibold text-slate-700">Original:</span> {medicine.originalUnit}</p>
                      )}
                      {medicine.piecesPerUnit && medicine.originalUnit && (
                        <p>{medicine.piecesPerUnit}pcs{medicine.containerQuantity ? `/${medicine.containerQuantity}` : ''} {medicine.originalUnit}</p>
                      )}
                    </div>

                    {/* View Details Link */}
                    <div className="flex items-center text-blue-600 text-xs font-medium group-hover:text-blue-700">
                      View
                      <svg className="w-3 h-3 ml-1 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}