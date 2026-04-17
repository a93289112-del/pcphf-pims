'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, push, get, update } from 'firebase/database';
import Link from 'next/link';
import BackButton from '@/lib/components/back-button';
import Image from 'next/image';
import Processing from '@/lib/components/processing';
import UnitConversion, { type UnitConversion as UnitConversionType } from '@/lib/ui/unit-conversion';
import { logActivity } from '@/lib/services/activity-logs';

const CLOUDINARY_NAME          = 'do8l51z5q';
const CLOUDINARY_UPLOAD_PRESET = 'cap-pims';

const DEFAULT_UNIT_OPTIONS = [
  'Tablets', 'Bottles', 'Nebules', 'Capsule',
  'Boxes', 'Tubes', 'Sachets', 'Ampules', 'Vials',
];

const COUNTRIES = [
  'Philippines', 'India', 'China', 'United States', 'United Kingdom',
  'Germany', 'Japan', 'South Korea', 'Australia', 'Canada',
  'France', 'Italy', 'Spain', 'Netherlands', 'Switzerland',
  'Singapore', 'Malaysia', 'Thailand', 'Indonesia', 'Vietnam',
  'Other',
] as const;

const AGE_GROUP_OPTIONS = [
  'Neonatal (Birth – 28 days)',
  'Pediatric / Children (1 month – 12 years)',
  'Adolescent (13 – 17 years)',
  'Adult (18 – 59 years)',
  'Elderly (60 – 74 years)',
  'Geriatric / Elderly (75 years and above)',
  'Pregnant / Maternal (Pregnancy & postpartum)',
  'Lactating / Nursing (Breastfeeding mothers)',
  'Immunocompromised (HIV, chemo, transplant)',
  'Renal / Hepatic (Impaired organ function)',
] as const;

const formatPeso = (value: number) =>
  value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatNumberWithCommas = (value: string) => {
  if (!value) return '';
  const numStr = value.replace(/,/g, '');
  if (!numStr || isNaN(Number(numStr))) return value;
  const parts = numStr.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
};

const stripUndefined = <T extends object>(obj: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;

interface StrengthVariant {
  strength: string;
}

interface SuccessInfo {
  name: string;
  strength?: string;
  brand: string;
  quantity: string;
  unit: string;
  sellingPrice: string;
  expirationDate: string;
  imageUrl?: string;
}

/* ─── Duplicate Info (passed to DuplicateModal) ─────────────────────────── */
interface DuplicateInfo {
  /** Firebase key of the existing record */
  key:             string;
  /** Human-readable label for the modal (e.g. "Albendazole 400mg") */
  displayName:     string;
  /** Current quantity already in the DB */
  currentQty:      number;
  /** Quantity the user is trying to add (already resolved to final unit) */
  incomingQty:     number;
  /** Resolved final unit (e.g. "Tablets") */
  unit:            string;
  /** Brand */
  brand:           string;
  /** Incoming total cost to add on top of existing totalCost */
  newTotalCost:    number;
}

/* ─── Generic Error Modal (non-duplicate errors only) ───────────────────── */
function ErrorModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = () => onClose();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ animation: 'modalPop 0.3s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <style>{`
          @keyframes modalPop {
            from { opacity: 0; transform: scale(0.88) translateY(16px); }
            to   { opacity: 1; transform: scale(1)    translateY(0);    }
          }
        `}</style>
        <div className="h-2 bg-gradient-to-r from-red-400 to-red-600" />
        <div className="px-6 pt-7 pb-6 text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-50 border-4 border-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2">Error</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">{message}</p>
          <p className="text-[11px] text-slate-400 mb-3">Press any key or click outside to dismiss</p>
          <button
            onClick={onClose}
            className="w-full py-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-xl transition-all text-sm cursor-pointer"
          >
            Go Back &amp; Edit
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Duplicate Modal ────────────────────────────────────────────────────── */
function DuplicateModal({
  info,
  onClose,
  onAdjustStock,
}: {
  info: DuplicateInfo;
  onClose: () => void;
  onAdjustStock: (duplicateKey: string, addQty: number, newTotalCost: number) => Promise<void>;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const newTotal = info.currentQty + info.incomingQty;

  const handleAdjust = async () => {
    setAdjusting(true);
    await onAdjustStock(info.key, info.incomingQty, info.newTotalCost);
    setAdjusting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ animation: 'modalPop 0.3s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <style>{`
          @keyframes modalPop {
            from { opacity: 0; transform: scale(0.88) translateY(16px); }
            to   { opacity: 1; transform: scale(1)    translateY(0);    }
          }
        `}</style>

        {/* Amber accent bar */}
        <div className="h-2 bg-gradient-to-r from-amber-400 to-orange-500" />

        <div className="px-6 pt-7 pb-6">
          {/* Icon */}
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-amber-50 border-4 border-amber-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>

          {/* Title */}
          <h2 className="text-xl font-black text-slate-900 mb-1 text-center">Duplicate Found</h2>
          <p className="text-sm text-slate-500 text-center mb-5">
            This medicine already exists. Would you like to adjust its stock instead?
          </p>

          {/* Medicine info card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Medicine</p>
              <p className="text-sm font-bold text-slate-900 leading-tight">{info.displayName}</p>
              <p className="text-xs text-slate-500">{info.brand} · {info.unit}</p>
            </div>

            {/* Stock breakdown: current / +adding / new total */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-200 text-center">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Current</p>
                <p className="text-base font-bold text-slate-700 mt-0.5">
                  {info.currentQty.toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-400">{info.unit}</p>
              </div>
              <div className="flex flex-col items-center justify-center">
                <span className="text-lg font-black text-emerald-500">+{info.incomingQty.toLocaleString()}</span>
                <p className="text-[10px] text-slate-400">adding</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">New Total</p>
                <p className="text-base font-bold text-blue-600 mt-0.5">
                  {newTotal.toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-400">{info.unit}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleAdjust}
              disabled={adjusting}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {adjusting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Adjusting Stock…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Yes, Adjust Stock (+{info.incomingQty.toLocaleString()} {info.unit})
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={adjusting}
              className="w-full py-2.5 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 font-semibold rounded-xl transition-all text-sm border border-slate-200 cursor-pointer disabled:opacity-50"
            >
              Go Back &amp; Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Stock-Adjusted Success Modal ───────────────────────────────────────── */
function StockAdjustedModal({
  displayName,
  addedQty,
  newTotal,
  unit,
  onGoToList,
  onAddAnother,
  onClose,
}: {
  displayName:  string;
  addedQty:     number;
  newTotal:     number;
  unit:         string;
  onGoToList:   () => void;
  onAddAnother: () => void;
  onClose:      () => void;
}) {
  useEffect(() => {
    const handleKey = () => onClose();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ animation: 'modalPop 0.35s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <style>{`
          @keyframes modalPop {
            from { opacity: 0; transform: scale(0.88) translateY(16px); }
            to   { opacity: 1; transform: scale(1)    translateY(0);    }
          }
          @keyframes checkDraw {
            from { stroke-dashoffset: 60; }
            to   { stroke-dashoffset: 0;  }
          }
          @keyframes circlePop {
            0%   { transform: scale(0);    opacity: 0; }
            60%  { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(1);    opacity: 1; }
          }
        `}</style>

        <div className="h-2 bg-gradient-to-r from-emerald-400 to-emerald-600" />

        <div className="px-6 pt-8 pb-6 text-center">
          <div
            className="mx-auto mb-5 w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center"
            style={{ animation: 'circlePop 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.1s both' }}
          >
            <svg viewBox="0 0 52 52" className="w-10 h-10" fill="none">
              <circle cx="26" cy="26" r="24" stroke="#10b981" strokeWidth="3" fill="none" />
              <polyline
                points="14,27 22,35 38,18"
                stroke="#10b981"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="60"
                style={{ animation: 'checkDraw 0.4s ease 0.3s both' }}
              />
            </svg>
          </div>

          <h2 className="text-2xl font-black text-slate-900 mb-1">Stock Adjusted!</h2>
          <p className="text-sm text-slate-500 mb-5">
            Successfully updated the stock for{' '}
            <span className="font-semibold text-slate-700">{displayName}</span>.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Added</p>
              <p className="text-xl font-black text-emerald-600 mt-0.5">+{addedQty.toLocaleString()}</p>
              <p className="text-[10px] text-slate-500">{unit}</p>
            </div>
            <div className="border-l border-slate-200">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">New Total</p>
              <p className="text-xl font-black text-blue-600 mt-0.5">{newTotal.toLocaleString()}</p>
              <p className="text-[10px] text-slate-500">{unit}</p>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 mb-3">Press any key or click outside to close</p>

          <div className="flex flex-col gap-2">
            <button
              onClick={onGoToList}
              className="w-full py-3 bg-slate-900 hover:bg-blue-600 active:scale-95 text-white font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10" />
              </svg>
              Go to Medicines List
            </button>
            <button
              onClick={onAddAnother}
              className="w-full py-2.5 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 font-semibold rounded-xl transition-all text-sm border border-slate-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Another Medicine
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── New-Medicine Success Modal ─────────────────────────────────────────── */
function SuccessModal({
  info,
  onAddAnother,
  onGoToList,
  onClose,
}: {
  info: SuccessInfo;
  onAddAnother: () => void;
  onGoToList: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = () => onClose();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ animation: 'modalPop 0.35s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <style>{`
          @keyframes modalPop {
            from { opacity: 0; transform: scale(0.88) translateY(16px); }
            to   { opacity: 1; transform: scale(1)    translateY(0);    }
          }
          @keyframes checkDraw {
            from { stroke-dashoffset: 60; }
            to   { stroke-dashoffset: 0;  }
          }
          @keyframes circlePop {
            0%   { transform: scale(0);    opacity: 0; }
            60%  { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(1);    opacity: 1; }
          }
        `}</style>

        <div className="h-2 bg-gradient-to-r from-emerald-400 to-emerald-600" />

        <div className="px-6 pt-8 pb-6 text-center">
          <div
            className="mx-auto mb-5 w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center"
            style={{ animation: 'circlePop 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.1s both' }}
          >
            <svg viewBox="0 0 52 52" className="w-10 h-10" fill="none">
              <circle cx="26" cy="26" r="24" stroke="#10b981" strokeWidth="3" fill="none" />
              <polyline
                points="14,27 22,35 38,18"
                stroke="#10b981"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="60"
                style={{ animation: 'checkDraw 0.4s ease 0.3s both' }}
              />
            </svg>
          </div>

          <h2 className="text-2xl font-black text-slate-900 mb-1">Medicine Added!</h2>
          <p className="text-sm text-slate-500 mb-6">Successfully added to your inventory.</p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left mb-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                {info.imageUrl
                  ? <Image src={info.imageUrl} alt="" width={48} height={48} className="object-contain" unoptimized />
                  : <span className="text-2xl">💊</span>
                }
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-sm leading-tight truncate">
                  {info.name}{info.strength ? ` ${info.strength}` : ''}
                </p>
                <p className="text-xs text-slate-500 truncate">{info.brand}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200">
              <div className="text-center">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Qty</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{info.quantity}</p>
                <p className="text-[10px] text-slate-500">{info.unit}</p>
              </div>
              <div className="text-center border-x border-slate-200">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Price</p>
                <p className="text-sm font-bold text-emerald-600 mt-0.5">
                  ₱{parseFloat(info.sellingPrice || '0').toFixed(2)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Expires</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">
                  {new Date(info.expirationDate).toLocaleDateString('en-PH', {
                    month: 'short', day: 'numeric', year: '2-digit',
                  })}
                </p>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 mb-3">Press any key or click outside to close</p>

          <div className="flex flex-col gap-2">
            <button
              onClick={onGoToList}
              className="w-full py-3 bg-slate-900 hover:bg-blue-600 active:scale-95 text-white font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10" />
              </svg>
              Go to Medicines List
            </button>
            <button
              onClick={onAddAnother}
              className="w-full py-2.5 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 font-semibold rounded-xl transition-all text-sm border border-slate-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Another Medicine
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function AddMedicinePage() {
  const { user, loading, staffName, role } = useAuth();
  const router = useRouter();
  const [isSubmitting,     setIsSubmitting]     = useState(false);
  const [uploadingImage,   setUploadingImage]   = useState(false);
  const [imageUrl,         setImageUrl]         = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInfo,      setSuccessInfo]      = useState<SuccessInfo | null>(null);
  const [errorModal,       setErrorModal]       = useState('');

  // Duplicate-specific state
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);

  // Stock-Adjusted success state (for orders that would update existing stock)
  const [stockAdjustedInfo, setStockAdjustedInfo] = useState<{
    displayName: string;
    addedQty:    number;
    newTotal:    number;
    unit:        string;
  } | null>(null);

  const [formData, setFormData] = useState({
    name:            '',
    description:     '',
    quantity:        '',
    unit:            '' as string,
    brandModel:      '',
    ageGroup:        '',
    countryOfOrigin: '',
    unitCost:        '',
    sellingPrice:    '',
    minStock:        '',
    expirationDate:  '',
  });

  const [unitConversion,      setUnitConversion]      = useState<UnitConversionType | null>(null);
  const [showUnitConversion,  setShowUnitConversion]  = useState(false);
  const [strengthVariants,    setStrengthVariants]    = useState<StrengthVariant[]>([]);
  const [strengthInput,       setStrengthInput]       = useState('');
  const [showCustomUnitInput, setShowCustomUnitInput] = useState(false);
  const [customUnitInput,     setCustomUnitInput]     = useState('');
  const [customUnitError,     setCustomUnitError]     = useState('');

  const totalPiecesCalculated = useMemo(() => {
    const qty = parseInt(formData.quantity);
    const ppu = unitConversion?.conversionFactor;
    if (!isNaN(qty) && ppu && qty > 0 && ppu > 0) return qty * ppu;
    return null;
  }, [formData.quantity, unitConversion]);

  const totalCost = useMemo(() => {
    const qty  = parseFloat(formData.quantity);
    const cost = parseFloat(formData.unitCost);
    if (!isNaN(qty) && !isNaN(cost) && qty >= 0 && cost >= 0) return qty * cost;
    return null;
  }, [formData.quantity, formData.unitCost]);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  const resetForm = () => {
    setFormData({
      name: '', description: '', quantity: '', unit: '',
      brandModel: '', ageGroup: '', countryOfOrigin: '', unitCost: '',
      sellingPrice: '', minStock: '', expirationDate: '',
    });
    setImageUrl('');
    setStrengthVariants([]);
    setStrengthInput('');
    setUnitConversion(null);
    setShowUnitConversion(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_NAME}/image/upload`,
        { method: 'POST', body: fd }
      );
      if (!res.ok) throw new Error('Image upload failed');
      const data = await res.json();
      setImageUrl(data.secure_url);
    } catch (err) {
      setErrorModal(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    let processedValue = value;
    if (['quantity', 'unitCost', 'minStock'].includes(name)) {
      processedValue = value.replace(/,/g, '');
    }
    setFormData((prev) => ({ ...prev, [name]: processedValue }));
  };

  const handleAddStrength = () => {
    const strength = strengthInput.trim();
    if (!strength) {
      setErrorModal('Please enter a strength value');
      return;
    }
    if (strengthVariants.length >= 1) {
      setErrorModal('Only one strength variant is allowed per medicine');
      return;
    }
    setStrengthVariants([...strengthVariants, { strength }]);
    setStrengthInput('');
  };

  const handleRemoveStrength = (index: number) => {
    setStrengthVariants(strengthVariants.filter((_, i) => i !== index));
  };

  const buildUnitConversionPayload = (uc: UnitConversionType) =>
    stripUndefined({
      packagingUnit:    uc.packagingUnit,
      conversionUnit:   uc.conversionUnit,
      conversionFactor: uc.conversionFactor,
      customUnitName:   uc.customUnitName,
    });

  const handleAdjustStock = async (
    duplicateKey: string,
    addQty:       number,
    incomingCost: number,
  ) => {
    try {
      if (!user) throw new Error('Not authenticated');
      const medicinePath = getUserPath(user.uid, `medicines/${duplicateKey}`);
      const snap = await get(ref(database, medicinePath));
      if (!snap.exists()) throw new Error('Medicine record not found.');

      const current = snap.val() as {
        quantity?:          number;
        totalCost?:         number;
        name: string;
        unit: string;
      };

      const newQty = (current.quantity || 0) + addQty;
      const newTotalCost = (current.totalCost || 0) + incomingCost;
      const now = new Date().toISOString();

      const updates: Record<string, unknown> = {};
      updates[`${medicinePath}/quantity`] = newQty;
      updates[`${medicinePath}/totalCost`] = newTotalCost;
      updates[`${medicinePath}/updatedAt`] = now;

      // Log transaction directly
      const transactionsPath = getUserPath(user.uid, 'transactions');
      const transRef = push(ref(database, transactionsPath));
      updates[`${transactionsPath}/${transRef.key}`] = {
        date: now,
        type: 'adjustment',
        medicineId: duplicateKey,
        quantity: addQty,
        previousStock: current.quantity || 0,
        newStock: newQty,
        unitCost: incomingCost / addQty,
        notes: `Stock added manually`,
      };

      await update(ref(database), updates);

      setDuplicateInfo(null);
      setStockAdjustedInfo({
        displayName: current.name,
        addedQty:    addQty,
        newTotal:    newQty,
        unit:        current.unit,
      });
      resetForm();
    } catch (err) {
      setDuplicateInfo(null);
      setErrorModal(err instanceof Error ? err.message : 'Failed to update stock');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setErrorModal('Authentication error. Please re-login.');
      return;
    }
    setIsSubmitting(true);
    try {
      if (!formData.name.trim())        throw new Error('Name is required');
      if (!formData.description.trim()) throw new Error('Item description is required');
      if (!formData.unit)               throw new Error('Unit is required');
      if (!formData.brandModel.trim())  throw new Error('Brand / Model is required');
      if (!formData.ageGroup)           throw new Error('Age group category is required');
      if (!formData.countryOfOrigin)    throw new Error('Country of origin is required');
      if (!formData.minStock || isNaN(parseInt(formData.minStock)) || parseInt(formData.minStock) < 0)
        throw new Error('Valid minimum stock is required');
      if (!formData.expirationDate)     throw new Error('Expiration date is required');

      // ── Compute finalUnit ─────────────────────
      const piecesPerUnitVal = unitConversion?.conversionFactor;
      const finalUnit = piecesPerUnitVal
        ? (unitConversion?.conversionUnit || unitConversion?.customUnitName || 'Pieces')
        : formData.unit;

      const containerQtyRaw   = parseInt(formData.quantity) || 0;
      const incomingQty       = piecesPerUnitVal ? containerQtyRaw * piecesPerUnitVal : containerQtyRaw;
      const unitCostVal       = formData.unitCost ? parseFloat(formData.unitCost) : 0;
      const incomingTotalCost = containerQtyRaw * unitCostVal;

      // ── Duplicate check ───────────────────────
      const medicinesPath = getUserPath(user.uid, 'medicines');
      const snapshot = await get(ref(database, medicinesPath));
      if (snapshot.exists()) {
        const rawData = snapshot.val() as Record<string, {
          baseName?:     string;
          name?:         string;
          strength?:     string;
          brandModel?:   string;
          unit?:         string;
          category?:     string;
          quantity?:     number;
        }>;

        const entries       = Object.entries(rawData);
        const baseName      = formData.name.trim().toLowerCase();
        const brand         = formData.brandModel.trim().toLowerCase();
        const finalUnitNorm = finalUnit.trim().toLowerCase();

        const matchEntry = entries.find(([, m]) => {
          const mName     = (m.baseName || m.name || '').toLowerCase();
          const mBrand    = (m.brandModel || '').toLowerCase();
          const mUnit     = (m.unit || m.category || '').toLowerCase();
          const mStrength = (m.strength || '').toLowerCase();
          
          const userStrength = strengthVariants[0]?.strength.toLowerCase() || '';
          
          return (
            mName     === baseName &&
            mBrand    === brand &&
            mUnit     === finalUnitNorm &&
            mStrength === userStrength
          );
        });

        if (matchEntry) {
          const [dupKey, dupRecord] = matchEntry;
          setDuplicateInfo({
            key:          dupKey,
            displayName:  dupRecord.name || formData.name.trim(),
            currentQty:   dupRecord.quantity ?? 0,
            incomingQty,
            unit:         finalUnit,
            brand:        formData.brandModel.trim(),
            newTotalCost: incomingTotalCost,
          });
          setIsSubmitting(false);
          return;
        }
      }

      const sellingPriceVal = formData.sellingPrice ? parseFloat(formData.sellingPrice) : 0;
      const baseName        = formData.name.trim();
      const description     = formData.description.trim();
      const minStockVal     = parseInt(formData.minStock);
      const now             = new Date().toISOString();
      const updates: Record<string, unknown> = {};
      const transactionsPath = getUserPath(user.uid, 'transactions');

      const itemsToAdd = strengthVariants.length > 0 
        ? strengthVariants.map(variant => ({
            name:                 `${baseName} ${variant.strength}`,
            baseName:             baseName,
            description:          description,
            quantity:             incomingQty,
            unit:                 finalUnit,
            originalUnit:         formData.unit,
            brandModel:           formData.brandModel.trim(),
            ageGroup:             formData.ageGroup,
            countryOfOrigin:      formData.countryOfOrigin,
            unitCost:             unitCostVal,
            sellingPrice:         sellingPriceVal,
            totalCost:            incomingTotalCost,
            minStock:             minStockVal,
            expirationDate:       formData.expirationDate,
            image:                imageUrl,
            strength:             variant.strength,
            prescriptionRequired: false,
            totalPieces:          incomingQty,
            containerQuantity:    containerQtyRaw,
            brand:                formData.brandModel.trim(),
            category:             finalUnit,
            stockPerUnit:         incomingQty,
            stockPerPieces:       incomingQty,
            unitConversion:       unitConversion ? buildUnitConversionPayload(unitConversion) : null,
            createdAt:            now,
            updatedAt:            now
          }))
        : [{
            name:                 baseName,
            baseName:             baseName,
            description:          description,
            quantity:             incomingQty,
            unit:                 finalUnit,
            originalUnit:         formData.unit,
            brandModel:           formData.brandModel.trim(),
            ageGroup:             formData.ageGroup,
            countryOfOrigin:      formData.countryOfOrigin,
            unitCost:             unitCostVal,
            sellingPrice:         sellingPriceVal,
            totalCost:            incomingTotalCost,
            minStock:             minStockVal,
            expirationDate:       formData.expirationDate,
            image:                imageUrl,
            prescriptionRequired: false,
            totalPieces:          incomingQty,
            containerQuantity:    containerQtyRaw,
            brand:                formData.brandModel.trim(),
            category:             finalUnit,
            stockPerUnit:         incomingQty,
            stockPerPieces:       incomingQty,
            unitConversion:       unitConversion ? buildUnitConversionPayload(unitConversion) : null,
            createdAt:            now,
            updatedAt:            now
          }];

      for (const item of itemsToAdd) {
        const newMedRef = push(ref(database, medicinesPath));
        const newMedId = newMedRef.key;
        
        // Create initial batch for the stock being added
        const initialBatchId = `batch_${Date.now()}_initial`;
        const initialBatch = {
          quantity: item.quantity,
          expirationDate: item.expirationDate || formData.expirationDate,
          createdAt: now,
        };
        
        // Save medicine with initial batch
        updates[`${medicinesPath}/${newMedId}`] = { 
          ...item, 
          id: newMedId,
          batches: {
            [initialBatchId]: initialBatch
          },
          // expirationDate stays the same (will be the earliest from batches)
        };

        // Log transaction directly
        const transRef = push(ref(database, transactionsPath));
        updates[`${transactionsPath}/${transRef.key}`] = {
          date: now,
          type: 'adjustment',
          medicineId: newMedId,
          quantity: item.quantity,
          previousStock: 0,
          newStock: item.quantity,
          unitCost: item.unitCost,
          notes: `Initial stock added manually`,
        };
      }

      await update(ref(database), updates);

      // Log each medicine added to activity logs
      for (const item of itemsToAdd) {
        await logActivity(
          'medicine_added',
          user.uid,
          user.email || '',
          `Added medicine: ${item.name || item.baseName} (${item.quantity} ${item.unit}) - Brand: ${item.brandModel}`,
          {
            medicineName: item.name || item.baseName,
            quantity: item.quantity,
            unitType: item.unit,
            unitCost: item.unitCost,
          },
          staffName || undefined,
          role || undefined
        );
      }

      setSuccessInfo({
        name:           formData.name.trim(),
        strength:       strengthVariants[0]?.strength,
        brand:          formData.brandModel.trim(),
        quantity:       formData.quantity,
        unit:           finalUnit,
        sellingPrice:   formData.sellingPrice || '0',
        expirationDate: formData.expirationDate,
        imageUrl:       imageUrl || undefined,
      });
      setShowSuccessModal(true);
      resetForm();

    } catch (err) {
      setErrorModal(err instanceof Error ? err.message : 'Failed to add medicine');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    !!formData.name.trim() &&
    !!formData.description.trim() &&
    (strengthVariants.length > 0 || (!!formData.quantity && !isNaN(parseInt(formData.quantity)) && parseInt(formData.quantity) >= 0)) &&
    !!formData.unit &&
    !!formData.brandModel.trim() &&
    !!formData.ageGroup &&
    !!formData.countryOfOrigin &&
    !!formData.minStock && !isNaN(parseInt(formData.minStock)) && parseInt(formData.minStock) >= 0 &&
    !!formData.expirationDate;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 transition-all duration-300 ml-0">

      {/* Processing overlay */}
      {isSubmitting && <Processing message="Adding medicine..." />}

      {/* Generic error modal */}
      {errorModal && (
        <ErrorModal
          message={errorModal}
          onClose={() => setErrorModal('')}
        />
      )}

      {/* Duplicate modal — shown instead of error when a match is found */}
      {duplicateInfo && (
        <DuplicateModal
          info={duplicateInfo}
          onClose={() => setDuplicateInfo(null)}
          onAdjustStock={handleAdjustStock}
        />
      )}

      {/* Stock-adjusted success modal */}
      {stockAdjustedInfo && (
        <StockAdjustedModal
          displayName={stockAdjustedInfo.displayName}
          addedQty={stockAdjustedInfo.addedQty}
          newTotal={stockAdjustedInfo.newTotal}
          unit={stockAdjustedInfo.unit}
          onClose={() => setStockAdjustedInfo(null)}
          onGoToList={() => {
            setStockAdjustedInfo(null);
            router.push('/medicines');
          }}
          onAddAnother={() => {
            setStockAdjustedInfo(null);
            resetForm();
          }}
        />
      )}

      {/* New-medicine success modal */}
      {showSuccessModal && successInfo && (
        <SuccessModal
          info={successInfo}
          onClose={() => setShowSuccessModal(false)}
          onGoToList={() => {
            setShowSuccessModal(false);
            router.push('/medicines');
          }}
          onAddAnother={() => {
            setShowSuccessModal(false);
            resetForm();
          }}
        />
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-950 mb-2">Add Medicines</h1>
              <p className="text-sm sm:text-base text-slate-600">Create a new medicine entry in your inventory</p>
            </div>
            <BackButton href="/medicines" label="Back" position="right" className="shrink-0 mt-1" />
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-slate-700 mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input id="name" type="text" name="name" value={formData.name} onChange={handleInputChange}
              placeholder="e.g., Paracetamol"
              className="w-full px-4 py-2.5 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
              disabled={isSubmitting} required />
          </div>

          {/* Description & Strength */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Description <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              <textarea id="description" name="description" value={formData.description} onChange={handleInputChange}
                placeholder="e.g., 500mg tablets, 100's per box" rows={2}
                className="flex-1 px-4 py-2.5 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none placeholder-slate-400"
                disabled={isSubmitting} required />
              <div className="flex flex-col gap-2">
                <input id="strength" type="text" value={strengthInput} onChange={(e) => setStrengthInput(e.target.value)}
                  placeholder="e.g., 200mg"
                  onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddStrength(); } }}
                  className="px-4 py-2.5 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400 w-40"
                  disabled={isSubmitting || strengthVariants.length >= 1} />
                <button type="button" onClick={handleAddStrength}
                  disabled={isSubmitting || strengthVariants.length >= 1}
                  className="px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Strength Variants */}
          {strengthVariants.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Added Strength Variant:</p>
              <div className="flex flex-wrap gap-2">
                {strengthVariants.map((variant, index) => (
                  <div key={index} className="inline-flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                    <span className="text-sm font-medium text-blue-900">{variant.strength}</span>
                    <button type="button" onClick={() => handleRemoveStrength(index)} disabled={isSubmitting}
                      className="text-blue-400 hover:text-red-500 font-bold transition-colors">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quantity & Unit */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              Quantity & Unit {strengthVariants.length === 0 && <span className="text-red-500">*</span>}
            </label>

            <div className="flex items-stretch rounded-lg overflow-hidden border border-slate-300 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all bg-white">
              <div className="flex flex-col justify-center px-4 py-3 border-r border-slate-200 min-w-25">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Qty</span>
                <input
                  id="quantity" type="text" inputMode="decimal" name="quantity"
                  value={formatNumberWithCommas(formData.quantity)}
                  onChange={handleInputChange}
                  placeholder="0"
                  className="w-full text-lg font-semibold text-slate-900 bg-transparent focus:outline-none placeholder-slate-300"
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex flex-col justify-center px-4 py-3 flex-1 min-w-32.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Unit</span>
                {showCustomUnitInput ? (
                  <span className="text-base font-semibold text-blue-600 truncate">
                    {customUnitInput || 'Custom…'}
                  </span>
                ) : formData.unit && !DEFAULT_UNIT_OPTIONS.includes(formData.unit) ? (
                  <span className="inline-flex items-center gap-1.5 text-base font-semibold text-blue-700">
                    {formData.unit}
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, unit: '' }))}
                      disabled={isSubmitting}
                      title="Remove custom unit"
                      className="text-blue-400 hover:text-red-500 font-bold leading-none transition-colors disabled:opacity-50"
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <select
                    id="unit" name="unit" value={formData.unit}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setShowCustomUnitInput(true);
                        setCustomUnitInput('');
                        setCustomUnitError('');
                        setFormData((prev) => ({ ...prev, unit: '' }));
                      } else {
                        handleInputChange(e);
                      }
                    }}
                    className="w-full text-base font-semibold text-slate-900 bg-transparent focus:outline-none appearance-none cursor-pointer"
                    disabled={isSubmitting} required
                  >
                    <option value="">Select</option>
                    {DEFAULT_UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                    <option value="__custom__">+ Custom Unit…</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Custom unit inline form */}
          {showCustomUnitInput && (
            <div className="flex items-center gap-2 p-3 bg-white border border-blue-200 rounded-lg">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Custom Unit Name</label>
                <input
                  type="text" value={customUnitInput}
                  onChange={(e) => { setCustomUnitInput(e.target.value); setCustomUnitError(''); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const trimmed = customUnitInput.trim();
                      if (!trimmed) { setCustomUnitError('Unit name cannot be empty.'); return; }
                      if (DEFAULT_UNIT_OPTIONS.some((u) => u.toLowerCase() === trimmed.toLowerCase())) {
                        setCustomUnitError('This unit already exists in the list.'); return;
                      }
                      setFormData((prev) => ({ ...prev, unit: trimmed }));
                      setShowCustomUnitInput(false);
                      setCustomUnitInput('');
                    }
                    if (e.key === 'Escape') {
                      setShowCustomUnitInput(false);
                      setCustomUnitInput('');
                      setCustomUnitError('');
                    }
                  }}
                  placeholder="e.g., Suppositories, Patches, Drops"
                  autoFocus disabled={isSubmitting}
                  className="w-full px-3 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
                />
                {customUnitError && <p className="text-xs text-red-600 font-medium">{customUnitError}</p>}
                <p className="text-[11px] text-slate-400">Press Enter to confirm · Esc to cancel</p>
              </div>
              <div className="flex gap-1.5 self-end pb-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = customUnitInput.trim();
                    if (!trimmed) { setCustomUnitError('Unit name cannot be empty.'); return; }
                    if (DEFAULT_UNIT_OPTIONS.some((u) => u.toLowerCase() === trimmed.toLowerCase())) {
                      setCustomUnitError('This unit already exists in the list.'); return;
                    }
                    setFormData((prev) => ({ ...prev, unit: trimmed }));
                    setShowCustomUnitInput(false);
                    setCustomUnitInput('');
                  }}
                  disabled={isSubmitting || !customUnitInput.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCustomUnitInput(false); setCustomUnitInput(''); setCustomUnitError(''); }}
                  className="px-3 py-2 text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {formData.quantity && unitConversion?.conversionFactor && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-slate-900">{formData.quantity}</span>
                <span className="text-slate-400">×</span>
                <span className="font-semibold text-slate-900">{unitConversion.conversionFactor}</span>
                <span className="text-slate-400">=</span>
                <span className="font-bold text-blue-600">{totalPiecesCalculated?.toLocaleString() || '0'} {unitConversion.customUnitName || unitConversion.conversionUnit}</span>
              </div>
              <div className="text-sm text-slate-600">
                Total: <span className="font-semibold text-slate-900">{formData.quantity} {formData.unit}</span>
              </div>
            </div>
          )}

          {/* Unit Conversion Toggle */}
          {formData.unit && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setShowUnitConversion((prev) => {
                    if (prev) setUnitConversion(null);
                    return !prev;
                  });
                }}
                disabled={isSubmitting}
                className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <span className={`w-5 h-5 rounded-full border-2 border-blue-500 flex items-center justify-center transition-colors ${showUnitConversion ? 'bg-blue-500' : 'bg-white group-hover:bg-blue-50'}`}>
                  <svg
                    className={`w-3 h-3 text-white transition-transform duration-200 ${showUnitConversion ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
                {showUnitConversion ? 'Hide Unit Conversion' : 'Add Unit Conversion'}
                {unitConversion?.conversionFactor && !showUnitConversion && (
                  <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                    {unitConversion.conversionFactor} {unitConversion.customUnitName || unitConversion.conversionUnit} / {formData.unit}
                  </span>
                )}
              </button>

              {showUnitConversion && (
                <div className="mt-3">
                  <UnitConversion
                    packagingUnit={formData.unit}
                    conversion={unitConversion}
                    onConversionChange={setUnitConversion}
                    isDisabled={isSubmitting}
                  />
                </div>
              )}
            </div>
          )}

          {/* Brand & Age Group */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="brandModel" className="block text-sm font-semibold text-slate-700 mb-2">
                Brand / Model <span className="text-red-500">*</span>
              </label>
              <input id="brandModel" type="text" name="brandModel" value={formData.brandModel} onChange={handleInputChange}
                placeholder="e.g., Biogesic"
                className="w-full px-4 py-2.5 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
                disabled={isSubmitting} required />
            </div>
            <div>
              <label htmlFor="ageGroup" className="block text-sm font-semibold text-slate-700 mb-2">
                Age Group Category <span className="text-red-500">*</span>
              </label>
              <select id="ageGroup" name="ageGroup" value={formData.ageGroup} onChange={handleInputChange}
                className="w-full px-4 py-2.5 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSubmitting} required>
                <option value="">Select age group</option>
                {AGE_GROUP_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Country */}
          <div>
            <label htmlFor="countryOfOrigin" className="block text-sm font-semibold text-slate-700 mb-2">
              Country of Origin <span className="text-red-500">*</span>
            </label>
            <select id="countryOfOrigin" name="countryOfOrigin" value={formData.countryOfOrigin} onChange={handleInputChange}
              className="w-full px-4 py-2.5 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSubmitting} required>
              <option value="">Select country</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Unit Cost, Selling Price & Total Cost */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <label htmlFor="unitCost" className="block text-sm font-semibold text-slate-700 mb-2">
                Unit Cost <span className="text-slate-500 font-normal text-xs">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-sm select-none pointer-events-none">₱</span>
                <input id="unitCost" type="text" inputMode="decimal" name="unitCost"
                  value={formatNumberWithCommas(formData.unitCost)} onChange={handleInputChange}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2.5 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
                  disabled={isSubmitting} />
              </div>
            </div>
            <div>
              <label htmlFor="sellingPrice" className="block text-sm font-semibold text-slate-700 mb-2">
                Selling Price <span className="text-slate-500 font-normal text-xs">(for POS)</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-sm select-none pointer-events-none">₱</span>
                <input id="sellingPrice" type="text" inputMode="decimal" name="sellingPrice"
                  value={formatNumberWithCommas(formData.sellingPrice)} onChange={handleInputChange}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2.5 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
                  disabled={isSubmitting} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Total Cost <span className="text-slate-500 font-normal text-xs">(auto-calculated)</span>
              </label>
              <div className={`w-full px-4 py-2.5 rounded-lg border text-sm font-semibold flex items-center gap-1.5 select-none ${
                totalCost !== null ? 'bg-blue-50 border-blue-200 text-slate-900' : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                <span className="text-slate-600 font-medium">₱</span>
                {totalCost !== null ? formatPeso(totalCost) : '—'}
              </div>
            </div>
          </div>

          {/* Min Stock & Expiration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="minStock" className="block text-sm font-semibold text-slate-700 mb-2">
                Minimum Stock <span className="text-red-500">*</span>
              </label>
              <input id="minStock" type="text" inputMode="decimal" name="minStock"
                value={formatNumberWithCommas(formData.minStock)} onChange={handleInputChange}
                placeholder="0"
                className="w-full px-4 py-2.5 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
                disabled={isSubmitting} required />
            </div>
            <div>
              <label htmlFor="expirationDate" className="block text-sm font-semibold text-slate-700 mb-2">
                Expiration Date <span className="text-red-500">*</span>
              </label>
              <input id="expirationDate" type="date" name="expirationDate" value={formData.expirationDate} onChange={handleInputChange}
                className="w-full px-4 py-2.5 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSubmitting} required />
            </div>
          </div>

          {/* Image Upload */}
          <div className="pt-4 border-t border-slate-200">
            <label htmlFor="image" className="block text-sm font-semibold text-slate-700 mb-3">
              Medicine Image <span className="text-slate-500 font-normal text-xs">(optional)</span>
            </label>
            <input id="image" type="file" accept="image/*" onChange={handleImageUpload}
              disabled={uploadingImage || isSubmitting} className="hidden" />
            <label htmlFor="image" className="cursor-pointer block">
              {imageUrl ? (
                <div className="relative group">
                  <div className="w-full rounded-lg overflow-hidden bg-slate-50 border border-slate-200 p-4">
                    <Image src={imageUrl} alt="Preview" width={200} height={160} unoptimized
                      className="max-h-40 w-auto mx-auto object-contain" />
                  </div>
                  <div className="mt-2 text-center">
                    <p className="text-sm font-medium text-green-700">✓ Image uploaded</p>
                    <p className="text-xs text-slate-500 mt-1">Click to change</p>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-lg p-8 text-center transition-colors">
                  <div className="text-4xl mb-2 opacity-70">📷</div>
                  <p className="text-sm font-medium text-slate-700">
                    {uploadingImage ? 'Uploading...' : 'Click to upload image'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">PNG, JPG, GIF up to 10MB</p>
                </div>
              )}
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <Link href="/medicines"
              className="flex-1 px-6 py-2.5 border border-slate-300 text-slate-900 font-medium rounded-lg hover:bg-slate-50 transition-colors text-center">
              Cancel
            </Link>
            <button type="submit" disabled={isSubmitting || uploadingImage || !isFormValid}
              className="flex-1 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isSubmitting ? 'Checking & Adding...' : 'Add Medicine'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}