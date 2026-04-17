'use client';

import { useState, useEffect, useCallback } from 'react';
import { database, getUserPath } from '../services/firebase';
import { ref, update, push, get, remove, onValue } from 'firebase/database';
import Button from '../components/button';
import { useAuth } from '../auth/auth-context';

// Format number with commas for display
const formatNumberWithCommas = (value: string) => {
  if (!value) return '';
  const numStr = value.replace(/,/g, '');
  if (!numStr || isNaN(Number(numStr))) return value;
  const parts = numStr.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
};

interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

interface Medicine {
  id: string;
  name: string;
  /** The resolved/display unit (may be converted, e.g. "Tablets") */
  unit: string;
  /** Original packaging unit before conversion (e.g. "Boxes") */
  originalUnit?: string;
  /**
   * Canonical stock count in the resolved unit.
   * We prefer `quantity` over `stockPerUnit` because `quantity` is what the
   * order-medicine page writes when a unit-conversion is applied.
   */
  quantity?: number;
  stockPerUnit?: number;
  expirationDate?: string;
  batches?: Record<string, MedicineBatch>; // FIFO batches with individual expirations
}

interface StockAdjustment {
  id: string;
  medicineId: string;
  type: 'add' | 'remove' | 'set';
  quantity: number;
  reason: string;
  timestamp: string;
}

type MedicineRecord = {
  name: string;
  unit?: string;
  originalUnit?: string;
  quantity?: number;
  stockPerUnit?: number;
};

type StockAdjustmentRecord = Omit<StockAdjustment, 'id'>;

interface StockAdjustmentModalProps {
  medicineId?: string;
  medicineName?: string;
  currentStock?: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function StockAdjustmentModal({
  medicineId: initialMedicineId,
  medicineName: initialMedicineName,
  currentStock: initialCurrentStock,
  isOpen,
  onClose,
  onSuccess,
}: StockAdjustmentModalProps) {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState(initialMedicineId || '');
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'remove' | 'set'>('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [history, setHistory] = useState<StockAdjustment[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ quantity: string; reason: string }>({ quantity: '', reason: '' });
  const { user } = useAuth();

  const selectedMedicine = medicines.find((m) => m.id === selectedMedicineId);

  /**
   * Canonical stock: prefer `quantity` (the converted-unit count written by the
   * order-medicine page), fall back to `stockPerUnit`, then the prop, then 0.
   */
  const currentStock =
    selectedMedicine?.quantity ??
    selectedMedicine?.stockPerUnit ??
    initialCurrentStock ??
    0;

  /**
   * The unit label shown in the UI.
   * Uses the medicine's `unit` field (which is already the converted unit,
   * e.g. "Tablets") when a medicine is selected, otherwise falls back to a
   * generic "units" label.
   */
  const displayUnit = selectedMedicine?.unit || '';

  const displayName = selectedMedicine?.name || initialMedicineName || 'Select a medicine';

  useEffect(() => {
    if (isOpen && user) {
      const medicinesPath = getUserPath(user.uid, 'medicines');
      const medicinesRef = ref(database, medicinesPath);
      const unsubscribe = onValue(
        medicinesRef,
        (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const medicinesList = Object.entries(data as Record<string, MedicineRecord>).map(([id, values]) => ({
              id,
              name: values.name,
              unit: values.unit || '',
              originalUnit: values.originalUnit,
              // Prefer `quantity` as the authoritative converted-unit stock
              quantity: values.quantity,
              stockPerUnit: values.stockPerUnit,
            }));
            setMedicines(medicinesList);
            if (initialMedicineId && !selectedMedicineId) {
              setSelectedMedicineId(initialMedicineId);
            }
          }
        },
        (error) => {
          console.error('Failed to load medicines:', error);
        }
      );

      return () => unsubscribe();
    }
  }, [isOpen, initialMedicineId, selectedMedicineId, user]);

  const loadHistory = useCallback(async () => {
    if (!selectedMedicineId || !user) return;
    try {
      const historyPath = getUserPath(user.uid, `stockAdjustments/${selectedMedicineId}`);
      const adjustmentsRef = ref(database, historyPath);
      const snapshot = await get(adjustmentsRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const adjustmentsList = Object.entries(data as Record<string, StockAdjustmentRecord>).map(([key, value]) => ({
          id: key,
          ...value,
        }));
        setHistory(adjustmentsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        setHistory([]);
      }
    } catch (err) {
      const error = err as { message?: string };
      console.error('Failed to load history:', error);
      if (error.message?.includes('Permission denied')) {
        setError('Permission denied. Please check Firebase Security Rules.');
      }
      setHistory([]);
    }
  }, [selectedMedicineId, user]);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => {
      setNotification(null);
      if (notification.type === 'success') onClose();
    }, 2000);
    return () => clearTimeout(t);
  }, [notification, onClose]);

  useEffect(() => {
    if (selectedMedicineId && user) {
      loadHistory();
    }
  }, [selectedMedicineId, loadHistory, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedMedicineId || !user) {
      setError('Please select a medicine');
      return;
    }

    if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
      setError('Please enter a valid quantity');
      return;
    }

    if (!reason.trim()) {
      setError('Please provide a reason for adjustment');
      return;
    }

    setIsLoading(true);

    try {
      const newQuantity = Number(quantity);
      let updatedStock = currentStock;
      let delta = 0;

      if (adjustmentType === 'add') {
        updatedStock = currentStock + newQuantity;
        delta = newQuantity;
      } else if (adjustmentType === 'remove') {
        if (newQuantity > currentStock) {
          setError('Cannot remove more than current stock');
          setIsLoading(false);
          return;
        }
        updatedStock = currentStock - newQuantity;
        delta = -newQuantity;
      } else {
        // 'set'
        updatedStock = newQuantity;
        delta = newQuantity - currentStock;
      }

      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {};

      const medicinePath = getUserPath(user.uid, `medicines/${selectedMedicineId}`);
      const snap = await get(ref(database, medicinePath));
      const medicine = snap.val();

      const unitCost = medicine.unitCost || 0;
      const ppu =
        medicine.piecesPerUnit ??
        medicine.unitConversion?.conversionFactor ??
        undefined;

      /**
       * Write the updated count to BOTH `quantity` and `stockPerUnit` so that
       * every page that reads either field sees the correct converted-unit count.
       */
      updates[`${medicinePath}/quantity`]     = updatedStock;
      updates[`${medicinePath}/stockPerUnit`] = updatedStock;
      updates[`${medicinePath}/totalCost`]    = updatedStock * unitCost;
      updates[`${medicinePath}/updatedAt`]    = now;

      // If piecesPerUnit exists it means `updatedStock` IS already in the piece
      // unit, so totalPieces === updatedStock.
      if (ppu !== undefined) {
        updates[`${medicinePath}/totalPieces`] = updatedStock;
      }

      // Log transaction
      const transactionsPath = getUserPath(user.uid, 'transactions');
      const transRef = push(ref(database, transactionsPath));
      updates[`${transactionsPath}/${transRef.key}`] = {
        date: now,
        type: 'adjustment',
        medicineId: selectedMedicineId,
        quantity: delta,
        previousStock: currentStock,
        newStock: updatedStock,
        unitCost: unitCost,
        notes: `Stock adjusted manually: ${reason}`,
      };

      // Log to stockAdjustments history (used by the History tab)
      const stockAdjustmentsPath = getUserPath(user.uid, `stockAdjustments/${selectedMedicineId}`);
      const adjustmentRef = push(ref(database, stockAdjustmentsPath));
      updates[`${stockAdjustmentsPath}/${adjustmentRef.key}`] = {
        type: adjustmentType,
        quantity: newQuantity,
        reason: reason,
        timestamp: now,
      };

      await update(ref(database), updates);

      onSuccess?.();
      setNotification({ message: 'Stock adjusted successfully!', type: 'success' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to adjust stock';
      setError(errorMessage);
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAdjustment = async (adjustmentId: string) => {
    if (!confirm('Delete this adjustment? This action cannot be undone.') || !user) return;

    try {
      const historyPath = getUserPath(user.uid, `stockAdjustments/${selectedMedicineId}/${adjustmentId}`);
      const adjustmentRef = ref(database, historyPath);
      await remove(adjustmentRef);
      await loadHistory();
    } catch (err) {
      console.error('Failed to delete adjustment:', err);
    }
  };

  const handleUpdateAdjustment = async (adjustmentId: string) => {
    if (!editData.quantity || isNaN(Number(editData.quantity)) || Number(editData.quantity) <= 0 || !user) {
      setError('Please enter a valid quantity');
      return;
    }

    try {
      const historyPath = getUserPath(user.uid, `stockAdjustments/${selectedMedicineId}/${adjustmentId}`);
      const adjustmentRef = ref(database, historyPath);
      await update(adjustmentRef, {
        quantity: Number(editData.quantity),
        reason: editData.reason.trim(),
      });
      setEditingId(null);
      setEditData({ quantity: '', reason: '' });
      await loadHistory();
    } catch {
      setError('Failed to update adjustment');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Modal Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl z-50 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Stock Adjustment</h2>
            <p className="text-sm text-gray-600 mt-1">{displayName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Medicine Selector */}
          {!initialMedicineId && (
            <div>
              <label htmlFor="medicine-select" className="block text-sm font-semibold text-gray-700 mb-2">
                Select Medicine
              </label>
              <select
                id="medicine-select"
                value={selectedMedicineId}
                onChange={(e) => setSelectedMedicineId(e.target.value)}
                className="w-full px-4 py-2 text-slate-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="" className="text-slate-900">Choose a medicine...</option>
                {medicines.map((med) => {
                  // Canonical stock for the dropdown label
                  const stock = med.quantity ?? med.stockPerUnit ?? 0;
                  return (
                    <option key={med.id} value={med.id} className="text-slate-900">
                      {med.name} (Stock: {stock} {med.unit || 'units'})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Current Stock Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-1">
            <p className="text-sm font-medium text-blue-900">
              Current Stock:{' '}
              <span className="text-xl font-bold">{currentStock.toLocaleString()}</span>{' '}
              <span className="text-base font-semibold">{displayUnit || 'units'}</span>
            </p>
            {/* Show original packaging unit as a hint when a conversion exists */}
            {selectedMedicine?.originalUnit && selectedMedicine.originalUnit !== displayUnit && (
              <p className="text-xs text-blue-600">
                Originally ordered in{' '}
                <span className="font-semibold">{selectedMedicine.originalUnit}</span>
                {' '}— stock is now tracked in{' '}
                <span className="font-semibold">{displayUnit}</span>
              </p>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setShowHistory(false)}
              className={`px-4 py-2 font-medium transition-colors ${!showHistory ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Adjust Stock
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className={`px-4 py-2 font-medium transition-colors ${showHistory ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              History ({history.length})
            </button>
          </div>

          {!showHistory ? (
            // Adjustment Form
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Adjustment Type
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['add', 'remove', 'set'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAdjustmentType(type)}
                      className={`p-3 rounded-lg border-2 font-semibold transition-all ${
                        adjustmentType === type
                          ? 'border-blue-600 bg-blue-50 text-blue-900'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {type === 'add' && '➕ Add'}
                      {type === 'remove' && '➖ Remove'}
                      {type === 'set' && '🎯 Set'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="quantity" className="block text-sm font-semibold text-gray-700 mb-2">
                  Quantity{displayUnit ? ` (${displayUnit})` : ''}
                </label>
                <input
                  id="quantity"
                  type="text"
                  inputMode="decimal"
                  value={formatNumberWithCommas(quantity)}
                  onChange={(e) => setQuantity(e.target.value.replace(/,/g, ''))}
                  placeholder={`Enter quantity in ${displayUnit || 'units'}`}
                  className="w-full px-4 py-2 text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              {/* Preview of resulting stock */}
              {quantity && !isNaN(Number(quantity)) && Number(quantity) > 0 && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
                  {adjustmentType === 'add' && (
                    <>
                      After adjustment:{' '}
                      <span className="font-bold text-emerald-700">
                        {(currentStock + Number(quantity)).toLocaleString()} {displayUnit || 'units'}
                      </span>
                    </>
                  )}
                  {adjustmentType === 'remove' && (
                    <>
                      After adjustment:{' '}
                      <span className={`font-bold ${Number(quantity) > currentStock ? 'text-red-600' : 'text-slate-900'}`}>
                        {Number(quantity) > currentStock
                          ? 'Exceeds current stock'
                          : `${(currentStock - Number(quantity)).toLocaleString()} ${displayUnit || 'units'}`}
                      </span>
                    </>
                  )}
                  {adjustmentType === 'set' && (
                    <>
                      Stock will be set to:{' '}
                      <span className="font-bold text-blue-700">
                        {Number(quantity).toLocaleString()} {displayUnit || 'units'}
                      </span>
                    </>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="reason" className="block text-sm font-semibold text-gray-700 mb-2">
                  Reason
                </label>
                <select
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-2 text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="" className="text-gray-900">Select a reason</option>
                  <option value="Restock" className="text-gray-900">Restock</option>
                  <option value="Sales" className="text-gray-900">Sales</option>
                  <option value="Damage" className="text-gray-900">Damage</option>
                  <option value="Expiration" className="text-gray-900">Expiration</option>
                  <option value="Return" className="text-gray-900">Return</option>
                  <option value="Physical Count" className="text-gray-900">Physical Count</option>
                  <option value="Other" className="text-gray-900">Other</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-900 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  isLoading={isLoading}
                  className="flex-1"
                >
                  Adjust Stock
                </Button>
              </div>
            </form>
          ) : (
            // History List
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No adjustments yet</p>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                    {editingId === item.id ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editData.quantity}
                          onChange={(e) => setEditData({ ...editData, quantity: e.target.value.replace(/,/g, '') })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder={`Quantity (${displayUnit || 'units'})`}
                        />
                        <input
                          type="text"
                          value={editData.reason}
                          onChange={(e) => setEditData({ ...editData, reason: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="Reason"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateAdjustment(item.id)}
                            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="flex-1 px-3 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 text-sm font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-bold px-2.5 py-1 rounded-full ${
                                item.type === 'add'
                                  ? 'bg-green-100 text-green-800'
                                  : item.type === 'remove'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {item.type === 'add' && '➕ +'}
                              {item.type === 'remove' && '➖ -'}
                              {item.type === 'set' && '🎯 Set'}{' '}
                              {item.quantity.toLocaleString()} {displayUnit || 'units'}
                            </span>
                            <span className="text-sm text-gray-600 font-medium">{item.reason}</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingId(item.id);
                                setEditData({ quantity: String(item.quantity), reason: item.reason });
                              }}
                              className="text-blue-600 hover:text-blue-700 text-sm font-semibold"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteAdjustment(item.id)}
                              className="text-red-600 hover:text-red-700 text-sm font-semibold"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          {new Date(item.timestamp).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {notification && (
        <div className={`fixed top-5 right-5 z-100 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium animate-in slide-in-from-right duration-300 ${
          notification.type === 'success' ? 'bg-white border-emerald-200 text-emerald-800' : 'bg-white border-red-200 text-red-700'
        }`}>
          <span className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`} />
          {notification.message}
        </div>
      )}
    </>
  );
}