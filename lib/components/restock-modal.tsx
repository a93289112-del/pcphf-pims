'use client';

import { useState, useEffect } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, onValue, update } from 'firebase/database';
import { logActivity } from '@/lib/services/activity-logs';

interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

interface Medicine {
  id: string;
  name?: string;
  baseName?: string;
  quantity?: number;
  stockPerUnit?: number;
  stockPerPieces?: number;
  minStock?: number;
  unit?: string;
  category?: string;
  expirationDate?: string;
  batches?: Record<string, MedicineBatch>; // FIFO batches with individual expirations
  [key: string]: unknown;
}

interface RestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
  staffName?: string;
  adminName?: string;
  role?: 'admin' | 'staff';
  onRestockSuccess?: () => void;
}

export default function RestockModal({
  isOpen,
  onClose,
  userId,
  userEmail,
  staffName,
  adminName,
  role,
  onRestockSuccess,
}: RestockModalProps) {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [quantity, setQuantity] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [costPerUnit, setCostPerUnit] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load medicines on mount
  useEffect(() => {
    if (!isOpen || !userId) return;
    
    const medicinesPath = getUserPath(userId, 'medicines');
    const medicinesRef = ref(database, medicinesPath);
    const unsubscribe = onValue(medicinesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val() as Record<string, Omit<Medicine, 'id'>>;
        const list = Object.entries(data).map(([id, val]) => ({
          id,
          ...val,
        }));
        setMedicines(list);
      }
    });

    return () => unsubscribe();
  }, [isOpen, userId]);

  const filteredMedicines = medicines.filter(m =>
    (m.baseName || m.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.category || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getEffectiveStock = (m: Medicine): number => {
    if (m.quantity !== undefined) return m.quantity;
    return Math.max(m.stockPerUnit ?? 0, m.stockPerPieces ?? 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedMedicine || !quantity || !expirationDate) {
      setError('Please select medicine, enter quantity, and set expiration date');
      return;
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be a valid positive number');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const medicineName = selectedMedicine.baseName || selectedMedicine.name || 'Unknown';
      const displayName = staffName || adminName || userEmail;
      const currentStock = getEffectiveStock(selectedMedicine);
      const newStock = currentStock + qty;

      // Create batch ID
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Normalize expiration date to YYYY-MM-DD format for consistency
      const normalizedExpiryInput = expirationDate && typeof expirationDate === 'string' 
        ? expirationDate 
        : new Date().toISOString().split('T')[0];

      // Create batch object - store only the standardized fields
      const newBatch: MedicineBatch = {
        quantity: qty,
        expirationDate: normalizedExpiryInput, // YYYY-MM-DD format
        createdAt: new Date().toISOString(),
      };

      // Calculate new total quantity and earliest expiration
      const existingBatches = selectedMedicine.batches || {};
      const allBatches = { ...existingBatches, [batchId]: newBatch };
      
      let totalQuantity = 0;
      let earliestExpiration = new Date('9999-12-31');
      
      Object.values(allBatches).forEach((batch: MedicineBatch) => {
        totalQuantity += batch.quantity;
        const batchExpiry = new Date(batch.expirationDate);
        if (batchExpiry < earliestExpiration) {
          earliestExpiration = batchExpiry;
        }
      });

      // Update path for batch storage using getUserPath
      const medicinesBasePath = getUserPath(userId, 'medicines');
      const batchPath = `${medicinesBasePath}/${selectedMedicine.id}/batches/${batchId}`;
      const quantityPath = `${medicinesBasePath}/${selectedMedicine.id}/quantity`;
      const expiryPath = `${medicinesBasePath}/${selectedMedicine.id}/expirationDate`;

      // Normalize earliest expiration to YYYY-MM-DD format (must match stock-adjustments and deductStockFEFO)
      const normalizedDate = earliestExpiration.toISOString().split('T')[0];

      const updates: Record<string, unknown> = {
        [batchPath]: newBatch,
        [quantityPath]: totalQuantity,
        [expiryPath]: normalizedDate,
      };

      console.log('🔵 Restock Modal - Saving Updates:', {
        batchPath,
        newBatch,
        totalQuantity,
        normalizedDate,
        updates,
      });

      await update(ref(database), updates);
      
      console.log('✅ Restock completed - expirationDate saved as:', normalizedDate);

      // Log the restock activity
      await logActivity(
        'medicine_restocked',
        userId,
        userEmail,
        `Restocked ${qty} units of ${medicineName} (${currentStock} → ${newStock}) - Batch expires: ${new Date(expirationDate).toLocaleDateString()}`,
        {
          medicineId: selectedMedicine.id,
          medicineName: medicineName,
          quantity: qty,
          batchId: batchId,
          expirationDate: expirationDate,
          previousValue: currentStock,
          newValue: newStock,
          reason: notes || 'Staff restock batch',
          costPerUnit: costPerUnit ? parseFloat(costPerUnit) : undefined,
        },
        displayName,
        role,
      );

      setSuccess(`Successfully restocked ${qty} units for ${medicineName} (Expires: ${new Date(expirationDate).toLocaleDateString()})`);
      setSelectedMedicine(null);
      setQuantity('');
      setExpirationDate('');
      setCostPerUnit('');
      setNotes('');
      setSearchTerm('');

      setTimeout(() => {
        setSuccess('');
        onRestockSuccess?.();
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Restock error:', err);
      setError('Failed to restock medicine. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl">
        {/* Header */}
        <div className="rounded-t-2xl bg-linear-to-r from-teal-600 to-teal-700 border-b border-teal-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white">Restock Medicine</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
              {success}
            </div>
          )}

          {/* Medicine Search */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Select Medicine
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search medicine by name or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {searchTerm && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                  {filteredMedicines.length > 0 ? (
                    filteredMedicines.map((med) => (
                      <button
                        key={med.id}
                        type="button"
                        onClick={() => {
                          setSelectedMedicine(med);
                          setSearchTerm('');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition-colors"
                      >
                        <p className="text-sm font-medium text-slate-900">{med.baseName || med.name}</p>
                        <p className="text-xs text-slate-500">
                          Current: {getEffectiveStock(med)} | Min: {med.minStock || 0}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-slate-500">No medicines found</div>
                  )}
                </div>
              )}
            </div>
            {selectedMedicine && (
              <div className="mt-2 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                <p className="text-sm font-medium text-teal-900">{selectedMedicine.baseName || selectedMedicine.name}</p>
                <p className="text-xs text-teal-700 mt-1">
                  Current Stock: {getEffectiveStock(selectedMedicine)} | Min Stock: {selectedMedicine.minStock || 0}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedMedicine(null)}
                  className="text-xs text-teal-600 hover:text-teal-800 mt-2 font-semibold"
                >
                  Change ✕
                </button>
              </div>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Quantity to Add
            </label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Expiration Date - Required */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Expiration Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              min={new Date().toISOString().split('T')[0]}
            />
            <p className="text-xs text-slate-500 mt-1">This batch will expire on this date</p>
          </div>

          {/* Cost Per Unit - Optional */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Cost Per Unit (Optional)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costPerUnit}
              onChange={(e) => setCostPerUnit(e.target.value)}
              placeholder="Enter unit cost"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this restock..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedMedicine || !quantity || !expirationDate}
              className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-semibold rounded-lg transition-colors"
            >
              {isSubmitting ? 'Restocking...' : 'Restock Medicine'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
