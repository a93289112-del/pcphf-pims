'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, onValue, push, set } from 'firebase/database';
import Link from 'next/link';
import Image from 'next/image';
import {
  Plus, Minus, ShoppingCart, Grid3x3,
  CheckCircle2, AlertCircle, Search, X,
  ArrowRight, ChevronRight, Package, Banknote, PanelRightClose,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { getEffectiveStock, deductStockBatch, getTrueEarliestExpiration } from '@/lib/services/stock-management';
import { logActivity } from '@/lib/services/activity-logs';
import Processing from '@/lib/components/processing';

const Receipt = dynamic(() => import('@/lib/components/receipt'), { ssr: false });

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

interface Medicine {
  id: string;
  name?: string;
  baseName?: string;
  category?: string;
  brand?: string;
  brandModel?: string;
  strength?: string;
  image?: string;
  quantity?: number;
  stockPerUnit?: number;
  stockPerPieces?: number;
  piecesPerUnit?: number;
  minStock?: number;
  expirationDate?: string;
  batches?: Record<string, MedicineBatch>; // FIFO batches with individual expirations
  sellingPrice?: number;
  costPrice?: number;
  unitCost?: number;
  unit?: string;
  ageGroup?: string;
}
interface CartItem { medicine: Medicine; quantity: number; }
interface Sale {
  id: string; date: string; phDate: string; total: number; amountPaid: number;
  change: number; paymentMethod: string;
  items: Array<{ medicineId: string; medicineName: string; quantity: number; unitPrice: number; subtotal: number; }>;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const getDisplayName  = (m: Medicine) => m.baseName || m.name || '—';
const getDisplayBrand = (m: Medicine) => m.brandModel || m.brand || '';
const getMinStock     = (m: Medicine) => m.minStock ?? 0;

const getMedicineStatus = (medicine: Medicine) => {
  const stock    = getEffectiveStock(medicine);
  const minStock = getMinStock(medicine);
  const exp      = medicine.expirationDate ? new Date(medicine.expirationDate) : null;
  const now      = new Date();
  if (stock === 0)       return { label: 'Out of Stock', variant: 'out'      as const };
  if (exp && exp < now)  return { label: 'Expired',      variant: 'expired'  as const };
  if (exp) {
    const days = Math.floor((exp.getTime() - now.getTime()) / 86400000);
    if (days <= 30) return { label: `Exp. ${days}d`, variant: 'expiring' as const };
  }
  if (minStock > 0 && stock <= minStock) return { label: 'Low Stock', variant: 'low' as const };
  return { label: 'In Stock', variant: 'in' as const };
};

const getExpirationDisplay = (expirationDate?: string): string | null => {
  if (!expirationDate) return null;
  const exp = new Date(expirationDate);
  const now = new Date();
  const days = Math.floor((exp.getTime() - now.getTime()) / 86400000);
  if (days < 0) return 'Expired';
  if (days === 0) return 'Expires today';
  if (days <= 30) return `Expires in ${days}d`;
  return exp.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const statusConfig: Record<string, { dot: string; text: string; bg: string }> = {
  out:      { dot: 'bg-slate-400',   text: 'text-slate-500',   bg: 'bg-slate-100'  },
  expired:  { dot: 'bg-red-500',     text: 'text-red-600',     bg: 'bg-red-50'     },
  expiring: { dot: 'bg-amber-500',   text: 'text-amber-600',   bg: 'bg-amber-50'   },
  low:      { dot: 'bg-yellow-500',  text: 'text-yellow-700',  bg: 'bg-yellow-50'  },
  in:       { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
};

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function POSPage() {
  const { user, role, loading, staffName, adminName } = useAuth();
  const router            = useRouter();

  const [medicines,          setMedicines]          = useState<Medicine[]>([]);
  const [loadingMedicines,   setLoadingMedicines]   = useState(true);
  const [searchQuery,        setSearchQuery]         = useState('');
  const [cart,               setCart]                = useState<CartItem[]>([]);
  const [lastSale,           setLastSale]            = useState<Sale | null>(null);
  const [showReceipt,        setShowReceipt]         = useState(false);
  const [viewMode,           setViewMode]            = useState<'grid' | 'table'>('grid');
  const [amountPaid,         setAmountPaid]          = useState('');
  const [isProcessing,       setIsProcessing]        = useState(false);
  const [paymentError,       setPaymentError]        = useState('');
  const [panel,              setPanel]               = useState<'cart' | 'payment'>('cart');
  const [cartMinimized,      setCartMinimized]       = useState(false);
  const [qtyInputs,          setQtyInputs]           = useState<Record<string, string>>({});
  const [filterUnit,         setFilterUnit]          = useState<'all' | string>('all');
  const [filterStock,        setFilterStock]         = useState<'all' | 'in' | 'low' | 'expiring' | 'expired' | 'out'>('all');
  const [filterAgeGroup,      setFilterAgeGroup]      = useState<'all' | string>('all');
  const [quickSelectBaseName, setQuickSelectBaseName] = useState('');
  const [quickSelectStrength, setQuickSelectStrength] = useState('');
  const [availableUnits,     setAvailableUnits]      = useState<string[]>([]);
  const [availableAgeGroups, setAvailableAgeGroups]  = useState<string[]>([]);
  const [availableStrengths, setAvailableStrengths]  = useState<Array<{ strength: string | undefined; medicine: Medicine }>>([]);

  /* Load medicines from user scope */
  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (user) {
      const unsub = onValue(ref(database, getUserPath(user.uid, 'medicines')), (snap) => {
        const data = snap.val();
        setMedicines(data
          ? Object.entries(data).map(([key, val]) => ({ id: key, ...(val as Omit<Medicine, 'id'>) }))
          : []);
        setLoadingMedicines(false);
      });
      return () => unsub();
    }
  }, [user, loading, router]);

  const medicinesByBaseName = useMemo(() => {
    const map = new Map<string, Medicine[]>();
    medicines.forEach((m) => {
      const key = m.baseName || m.name || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return map;
  }, [medicines]);

  const uniqueMedicineNames = useMemo(
    () => Array.from(medicinesByBaseName.keys()).sort(),
    [medicinesByBaseName],
  );

  useEffect(() => {
    const units = new Set<string>();
    medicines.forEach((m) => {
      if (m.unit)     units.add(m.unit);
      if (m.category) units.add(m.category);
    });
    setAvailableUnits(Array.from(units).sort());
  }, [medicines]);

  useEffect(() => {
    const ageGroups = new Set<string>();
    medicines.forEach((m) => {
      if (m.ageGroup) ageGroups.add(m.ageGroup);
    });
    setAvailableAgeGroups(Array.from(ageGroups).sort());
  }, [medicines]);

  useEffect(() => {
    if (!quickSelectBaseName) { setAvailableStrengths([]); return; }
    const variants = medicines.filter((m) => (m.baseName || m.name) === quickSelectBaseName);
    setAvailableStrengths(variants.map((m) => ({ strength: m.strength || 'Standard', medicine: m })));
  }, [quickSelectBaseName, medicines]);

  const filteredMedicines = useMemo(() => {
    let f = medicines;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      f = f.filter((m) =>
        [m.baseName, m.name, m.brand, m.strength, m.category].some((v) => v?.toLowerCase().includes(q)),
      );
    }
    if (filterUnit  !== 'all') f = f.filter((m) => (m.unit || m.category) === filterUnit);
    if (filterStock !== 'all') f = f.filter((m) => getMedicineStatus(m).variant === filterStock);
    if (filterAgeGroup !== 'all') f = f.filter((m) => m.ageGroup === filterAgeGroup);
    if (quickSelectBaseName)   f = f.filter((m) => (m.baseName || m.name) === quickSelectBaseName);
    if (quickSelectStrength)   f = f.filter((m) => (m.strength || 'Standard') === quickSelectStrength);
    return f;
  }, [medicines, searchQuery, filterUnit, filterStock, filterAgeGroup, quickSelectBaseName, quickSelectStrength]);

  const cartTotal  = useMemo(() => cart.reduce((s, i) => s + (i.medicine.sellingPrice || 0) * i.quantity, 0), [cart]);
  const paidNum    = parseFloat(amountPaid || '0');
  const change     = Math.max(0, paidNum - cartTotal);
  const canPay     = paidNum >= cartTotal && cart.length > 0;
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  /* Cart operations */
  const addToCart = useCallback((medicine: Medicine) => {
    const status = getMedicineStatus(medicine);
    if (status.variant === 'out' || status.variant === 'expired') return;
    setCart((prev) => {
      const ex = prev.find((i) => i.medicine.id === medicine.id);
      if (ex) {
        const nq = ex.quantity + 1;
        if (nq > getEffectiveStock(medicine)) return prev;
        setQtyInputs((qi) => ({ ...qi, [medicine.id]: String(nq) }));
        return prev.map((i) => i.medicine.id === medicine.id ? { ...i, quantity: nq } : i);
      }
      setQtyInputs((qi) => ({ ...qi, [medicine.id]: '1' }));
      return [...prev, { medicine, quantity: 1 }];
    });
  }, []);

  const updateQty = useCallback((id: string, qty: number) => {
    setCart((prev) => {
      if (qty <= 0) {
        setQtyInputs((qi) => { const n = { ...qi }; delete n[id]; return n; });
        return prev.filter((i) => i.medicine.id !== id);
      }
      const med = medicines.find((m) => m.id === id);
      if (!med || qty > getEffectiveStock(med)) return prev;
      setQtyInputs((qi) => ({ ...qi, [id]: String(qty) }));
      return prev.map((i) => i.medicine.id === id ? { ...i, quantity: qty } : i);
    });
  }, [medicines]);

  const removeFromCart = useCallback((id: string) => {
    setCart((prev) => prev.filter((i) => i.medicine.id !== id));
    setQtyInputs((qi) => { const n = { ...qi }; delete n[id]; return n; });
  }, []);

  const handleQtyInputChange = useCallback((id: string, rawValue: string) => {
    setQtyInputs((qi) => ({ ...qi, [id]: rawValue }));
    const parsed = parseInt(rawValue, 10);
    if (isNaN(parsed) || parsed < 1) return;
    setCart((prev) => {
      const med = medicines.find((m) => m.id === id);
      if (!med) return prev;
      const maxStock = getEffectiveStock(med);
      const clamped  = Math.min(parsed, maxStock);
      if (clamped !== parsed) setQtyInputs((qi) => ({ ...qi, [id]: String(clamped) }));
      return prev.map((i) => i.medicine.id === id ? { ...i, quantity: clamped } : i);
    });
  }, [medicines]);

  const handleQtyInputBlur = useCallback((id: string, currentQty: number) => {
    setQtyInputs((qi) => {
      const raw    = qi[id];
      const parsed = parseInt(raw, 10);
      if (!raw || isNaN(parsed) || parsed < 1) return { ...qi, [id]: String(currentQty) };
      return qi;
    });
  }, []);

  /* Checkout */
  const handleCheckout = async () => {
    if (!canPay) return;
    if (!user) {
      setPaymentError('Authentication error. Please re-login.');
      return;
    }
    setIsProcessing(true);
    setPaymentError('');
    try {
      const salesPath = getUserPath(user.uid, 'sales');
      const saleRef   = push(ref(database, salesPath));
      const saleId    = saleRef.key!;
      const now       = new Date();

      const saleData = {
        date:          now.toISOString(),
        // ▼ Store the PH date explicitly so reports always group correctly
        phDate:        now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
        total:         cartTotal,
        amountPaid:    paidNum,
        change,
        paymentMethod: 'over-the-counter',
        itemCount:     cart.length,
        items: cart.map((i) => ({
          medicineId:   i.medicine.id,
          medicineName: (i.medicine.baseName || i.medicine.name || 'Unknown') as string,
          quantity:     i.quantity,
          unitPrice:    i.medicine.sellingPrice || 0,
          subtotal:     (i.medicine.sellingPrice || 0) * i.quantity,
          unit:         i.medicine.unit || '',
          category:     i.medicine.category || '',
        })),
        createdAt: now.toISOString(),
        userId: user.uid, // Add userId to sale data
      };

      await set(saleRef, saleData);

      // Capture stock before deduction for logging
      const stockBefore = Object.fromEntries(
        cart.map(item => [item.medicine.id, getEffectiveStock(item.medicine)])
      );

      const result = await deductStockBatch(
        cart.map((i) => ({
          medicineId:  i.medicine.id,
          quantity:    i.quantity,
          type:        'sale' as const,
          referenceId: saleId,
          unitPrice:   i.medicine.sellingPrice || 0,
          userId:      user.uid, // Pass userId for stock management
        })),
        saleId,
      );

      if (!result.success) { setPaymentError(`Stock error: ${result.error}`); return; }

      // Log activity for each medicine sold
      for (let i = 0; i < cart.length; i++) {
        const item = cart[i];
        const stockResult = result.results[i];
        const before = stockBefore[item.medicine.id] || 0;
        const after = stockResult.newStock;

        // Log medicine sold activity
        await logActivity(
          'medicine_sold',
          user.uid,
          user.email || '',
          `Sold ${item.quantity} ${item.medicine.unit || 'unit'} of ${item.medicine.baseName || item.medicine.name || 'Unknown'}`,
          {
            medicineId: item.medicine.id,
            medicineName: item.medicine.baseName || item.medicine.name,
            quantity: item.quantity,
            unitPrice: item.medicine.sellingPrice || 0,
            subtotal: (item.medicine.sellingPrice || 0) * item.quantity,
            saleId,
          },
          staffName || adminName || undefined,
          role || undefined,
        );

        // Log stock deduction activity
        await logActivity(
          'stock_deducted',
          user.uid,
          user.email || '',
          `Stock deducted for ${item.medicine.baseName || item.medicine.name}: ${before} → ${after} (${item.quantity} units)`,
          {
            medicineId: item.medicine.id,
            medicineName: item.medicine.baseName || item.medicine.name,
            quantity: item.quantity,
            previousValue: before,
            newValue: after,
            reason: `Sold via POS transaction`,
            saleId,
          },
          staffName || adminName || undefined,
          role || undefined,
        );
      }

      setLastSale({ id: saleId, ...saleData });
      setCart([]);
      setQtyInputs({});
      setPanel('cart');
      setAmountPaid('');
      setCartMinimized(false);
      setShowReceipt(true);
      setTimeout(() => setShowReceipt(false), 10000);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setIsProcessing(false);
    }
  };

  /* Loading */
  if (loading || loadingMedicines) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-12 h-12">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin" />
          </div>
          <p className="text-slate-600">Loading POS…</p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 transition-all duration-300 ml-0">
      <style jsx global>{`
        .pos-card { transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
        .pos-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px -4px rgba(0,0,0,0.1); }
        .pos-card.in-cart { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.12), 0 4px 16px -2px rgba(59,130,246,0.15); }
        .cart-item-enter { animation: cartSlide 0.25s cubic-bezier(0.34,1.56,0.64,1) both; }
        @keyframes cartSlide { from { opacity:0; transform:translateX(12px) scale(0.97); } to { opacity:1; transform:translateX(0) scale(1); } }
        .panel-transition { animation: panelFade 0.22s ease both; }
        @keyframes panelFade { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .cart-fab { position:fixed; bottom:28px; right:28px; z-index:50; transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease; }
        .cart-fab.hidden-fab { opacity:0; transform:scale(0.6) translateY(12px); pointer-events:none; }
        .cart-fab.visible-fab { opacity:1; transform:scale(1) translateY(0); }
        .cart-fab button { position:relative; width:56px; height:56px; border-radius:18px; background:#0f172a; color:white; display:flex; align-items:center; justify-content:center; box-shadow:0 8px 24px -4px rgba(0,0,0,0.35); cursor:pointer; border:none; transition:background 0.15s, transform 0.15s; }
        .cart-fab button:hover { background:#1e40af; transform:translateY(-2px); }
        .cart-fab button:active { transform:scale(0.95); }
        .fab-badge { position:absolute; top:-6px; right:-6px; min-width:22px; height:22px; padding:0 5px; background:#2563eb; color:white; font-size:11px; font-weight:700; border-radius:99px; display:flex; align-items:center; justify-content:center; border:2px solid white; }
        .fab-total { position:absolute; bottom:-10px; left:50%; transform:translateX(-50%); white-space:nowrap; background:#0f172a; color:#94a3b8; font-size:10px; font-weight:700; padding:2px 7px; border-radius:99px; border:2px solid white; pointer-events:none; }
        .qty-btn { width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:background 0.15s, color 0.15s, transform 0.1s; flex-shrink:0; }
        .qty-btn:hover { transform:scale(1.12); }
        .qty-btn:active { transform:scale(0.94); }
        .cart-qty-input { width:44px; text-align:center; font-size:12px; font-weight:700; color:#0f172a; background:white; border:1.5px solid #cbd5e1; border-radius:8px; padding:2px 4px; outline:none; transition:border-color 0.15s, box-shadow 0.15s; -moz-appearance:textfield; }
        .cart-qty-input:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,0.18); }
        .cart-qty-input::-webkit-inner-spin-button, .cart-qty-input::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
        .amount-input:focus { box-shadow:0 0 0 3px rgba(16,185,129,0.2); }
        .quick-btn:hover { transform:translateY(-1px); }
        .stagger > * { animation:fadeUp 0.3s cubic-bezier(0.22,1,0.36,1) both; }
        .stagger > *:nth-child(1){animation-delay:0.03s} .stagger > *:nth-child(2){animation-delay:0.06s}
        .stagger > *:nth-child(3){animation-delay:0.09s} .stagger > *:nth-child(4){animation-delay:0.12s}
        .stagger > *:nth-child(5){animation-delay:0.15s} .stagger > *:nth-child(6){animation-delay:0.18s}
        .stagger > *:nth-child(7){animation-delay:0.21s} .stagger > *:nth-child(8){animation-delay:0.24s}
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .filter-chip { transition:all 0.15s ease; cursor:pointer; }
        .filter-chip:hover { background:#e2e8f0; }
        .filter-chip.active { background:#1e40af; color:white; border-color:transparent; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#dde1ea; border-radius:99px; }
        ::-webkit-scrollbar-thumb:hover { background:#b8bfcc; }
      `}</style>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* ── LEFT: Product Catalog ── */}
          <div className="w-full flex-1 min-w-0">

            {/* Page header */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-950">Point of Sale</h1>
                  <p className="text-sm sm:text-base text-slate-600 mt-2">{filteredMedicines.length} products available</p>
                </div>
                <Link
                  href="/staff-dashboard"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:border-blue-200"
                >
                  ← Dashboard
                </Link>
              </div>

              {/* Search + view toggle */}
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by name, brand, strength…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-9 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 text-slate-800 placeholder-slate-400 transition"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
                  {(['grid', 'table'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setViewMode(v)}
                      className={`p-1.5 rounded-lg transition ${viewMode === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
                      title={`${v} view`}
                    >
                      {v === 'grid' ? <Grid3x3 size={16} /> : <List size={16} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="mb-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Quick Select</span>
                    {(quickSelectBaseName || quickSelectStrength) && (
                      <button
                        type="button"
                        onClick={() => { setQuickSelectBaseName(''); setQuickSelectStrength(''); }}
                        className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        Clear filter
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={quickSelectBaseName}
                      onChange={(e) => { setQuickSelectBaseName(e.target.value); setQuickSelectStrength(''); }}
                      className={`px-3 py-2 border rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${quickSelectBaseName ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-slate-50 border-slate-200'}`}
                    >
                      <option value="">Medicine...</option>
                      {uniqueMedicineNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select
                      value={quickSelectStrength}
                      onChange={(e) => setQuickSelectStrength(e.target.value)}
                      disabled={!quickSelectBaseName}
                      className={`px-3 py-2 border rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${quickSelectStrength ? 'bg-purple-50 border-purple-300 text-purple-800' : 'bg-slate-50 border-slate-200'}`}
                    >
                      <option value="">{quickSelectBaseName ? 'All Strengths' : '\u2014'}</option>
                      {quickSelectBaseName && availableStrengths.map((item, idx) => {
                        const stock = getEffectiveStock(item.medicine);
                        return (
                          <option key={idx} value={item.strength || 'Standard'} disabled={stock === 0}>
                            {item.strength} ({stock} {item.medicine.unit || 'units'})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  {quickSelectBaseName && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-[10px] text-slate-400 font-medium">Filtering:</span>
                      <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">{quickSelectBaseName}</span>
                      {quickSelectStrength && (
                        <>
                          <span className="text-[10px] text-slate-300">·</span>
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">{quickSelectStrength}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-200 pt-4 mt-4 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Status</span>
                    {(['all', 'in', 'low', 'expiring', 'expired', 'out'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setFilterStock(s)}
                        className={`filter-chip text-xs font-medium px-3 py-1 rounded-full border border-slate-200 text-slate-600 transition-all cursor-pointer ${filterStock === s ? 'active bg-blue-600 text-white border-blue-600' : 'bg-slate-50 hover:bg-slate-100'}`}
                      >
                        {s === 'all' ? 'All' : s === 'in' ? 'In Stock' : s === 'low' ? 'Low' : s === 'expiring' ? 'Expiring' : s === 'expired' ? 'Expired' : 'Out'}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Unit</span>
                    <select
                      value={filterUnit}
                      onChange={(e) => setFilterUnit(e.target.value)}
                      className={`px-3 py-2 border rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${filterUnit !== 'all' ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-slate-50 border-slate-200'}`}
                    >
                      <option value="all">All Units</option>
                      {availableUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Age Group</span>
                    <select
                      value={filterAgeGroup}
                      onChange={(e) => setFilterAgeGroup(e.target.value)}
                      className={`px-3 py-2 border rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${filterAgeGroup !== 'all' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-slate-50 border-slate-200'}`}
                    >
                      <option value="all">All Categories</option>
                      {availableAgeGroups.map((ag) => <option key={ag} value={ag}>{ag}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Products */}
            <div className="pb-12">
              {filteredMedicines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <Package size={28} className="text-slate-400" />
                  </div>
                  <p className="font-semibold text-slate-700">No medicines found</p>
                  <p className="text-sm text-slate-400 mt-1">Try adjusting your search</p>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="stagger grid gap-4 grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredMedicines.map((medicine) => {
                    const stock      = getEffectiveStock(medicine);
                    const status     = getMedicineStatus(medicine);
                    const sc         = statusConfig[status.variant];
                    const inCart     = cart.some((d) => d.medicine.id === medicine.id);
                    const cartQty    = cart.find((d) => d.medicine.id === medicine.id)?.quantity || 0;
                    const outOfStock = status.variant === 'out';
                    const isExpired  = status.variant === 'expired';
                    const cannotAdd  = outOfStock || isExpired;
                    return (
                      <div
                        key={medicine.id}
                        className={`pos-card bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col cursor-pointer select-none ${inCart ? 'in-cart' : ''} ${cannotAdd ? 'opacity-60 grayscale-[0.5]' : ''}`}
                        onClick={() => !cannotAdd && addToCart(medicine)}
                      >
                        <div className="relative h-28 bg-linear-to-br from-slate-50 to-slate-100 overflow-hidden flex items-center justify-center">
                          {medicine.image
                            ? <Image src={medicine.image} alt={getDisplayName(medicine)} width={112} height={112} className="object-contain w-full h-full p-3" unoptimized />
                            : <div className="text-4xl opacity-50">💊</div>
                          }
                          <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.bg} ${sc.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {status.label}
                          </div>
                          {inCart && (
                            <div className="absolute top-2 left-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shadow-md">
                              <CheckCircle2 size={14} className="text-white" />
                            </div>
                          )}
                        </div>
                        <div className="p-3 flex flex-col gap-2 flex-1">
                          <div>
                            <p className="font-bold text-slate-900 text-sm leading-tight line-clamp-2">{getDisplayName(medicine)}</p>
                            {getDisplayBrand(medicine) && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{getDisplayBrand(medicine)}</p>}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {medicine.unit     && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded-md border border-blue-100">{medicine.unit}</span>}
                            {medicine.strength && <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 text-[10px] font-semibold rounded-md border border-violet-100">{medicine.strength}</span>}
                            {medicine.ageGroup && <span className="px-1.5 py-0.5 bg-green-50 text-green-700 text-[10px] font-semibold rounded-md border border-green-100">{medicine.ageGroup}</span>}
                          </div>
                          <div className="flex flex-col gap-1 mt-auto pt-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-[10px] text-slate-400">Stock: {stock}</p>
                                <p className="text-base font-extrabold text-emerald-600">&#8369;{(medicine.sellingPrice || 0).toFixed(2)}</p>
                              </div>
                              {inCart ? (
                                <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-xl px-1.5 py-1" onClick={(e) => e.stopPropagation()}>
                                  <button className="qty-btn text-blue-600 hover:bg-blue-100" onClick={() => updateQty(medicine.id, cartQty - 1)}><Minus size={13} strokeWidth={2.5} /></button>
                                  <span className="w-6 text-center text-sm font-bold text-blue-700">{cartQty}</span>
                                  <button className="qty-btn text-blue-600 hover:bg-blue-100" onClick={() => updateQty(medicine.id, cartQty + 1)}><Plus size={13} strokeWidth={2.5} /></button>
                                </div>
                              ) : (
                                <div className={`qty-btn ${outOfStock ? 'text-slate-300' : 'bg-slate-900 text-white hover:bg-blue-600'} shadow-sm`}>
                                  <Plus size={15} strokeWidth={2.5} />
                                </div>
                              )}
                            </div>
                            {getExpirationDisplay(getTrueEarliestExpiration(medicine)) && (
                              <p className={`text-[9px] font-medium ${
                                getTrueEarliestExpiration(medicine) && new Date(getTrueEarliestExpiration(medicine)!) < new Date() ? 'text-red-600' :
                                getTrueEarliestExpiration(medicine) && Math.floor((new Date(getTrueEarliestExpiration(medicine)!).getTime() - new Date().getTime()) / 86400000) <= 30 ? 'text-amber-600' :
                                'text-slate-500'
                              }`}>Exp: {getExpirationDisplay(getTrueEarliestExpiration(medicine))}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {['Product', 'Unit / Strength', 'Price', 'Stock', 'Status', ''].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-700">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMedicines.map((medicine) => {
                        const stock   = getEffectiveStock(medicine);
                        const status  = getMedicineStatus(medicine);
                        const sc      = statusConfig[status.variant];
                        const inCart  = cart.some((d) => d.medicine.id === medicine.id);
                        const cartQty = cart.find((d) => d.medicine.id === medicine.id)?.quantity || 0;
                        return (
                          <tr key={medicine.id} className={`hover:bg-slate-50/80 transition-colors ${inCart ? 'bg-blue-50/40' : ''}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 text-base">
                                  {medicine.image ? <Image src={medicine.image} alt="" width={36} height={36} className="object-cover" unoptimized /> : '💊'}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-900 text-xs">{getDisplayName(medicine)}</p>
                                  {getDisplayBrand(medicine) && <p className="text-[10px] text-slate-400">{getDisplayBrand(medicine)}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              <div className="flex gap-1 flex-wrap">
                                {medicine.unit     && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">{medicine.unit}</span>}
                                {medicine.strength && <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded text-[10px] font-semibold">{medicine.strength}</span>}
                                {medicine.ageGroup && <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-semibold">{medicine.ageGroup}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm font-extrabold text-emerald-600">&#8369;{(medicine.sellingPrice || 0).toFixed(2)}</td>
                            <td className="px-4 py-3 text-xs font-medium text-slate-700">{stock}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.bg} ${sc.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                                {status.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {inCart ? (
                                <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-1.5 py-1 w-fit">
                                  <button className="qty-btn text-blue-600 hover:bg-blue-100" onClick={() => updateQty(medicine.id, cartQty - 1)}><Minus size={12} /></button>
                                  <span className="w-5 text-center text-xs font-bold text-blue-700">{cartQty}</span>
                                  <button className="qty-btn text-blue-600 hover:bg-blue-100" onClick={() => updateQty(medicine.id, cartQty + 1)}><Plus size={12} /></button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => addToCart(medicine)}
                                  disabled={status.variant === 'out' || status.variant === 'expired'}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${status.variant !== 'out' && status.variant !== 'expired' ? 'bg-slate-900 text-white hover:bg-blue-600' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                >
                                  Add
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
          {/* end LEFT */}

          {/* ── RIGHT: Cart / Payment Panel (sticky) ── */}
          {!cartMinimized && (
            <div
              className="w-full lg:w-95 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] overflow-hidden"
            >
              {/* Tabs */}
              <div className="flex items-center border-b border-slate-200 shrink-0">
                <button
                  onClick={() => setPanel('cart')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-colors border-b-2 ${panel === 'cart' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
                >
                  <ShoppingCart size={15} />
                  Cart
                  {cart.length > 0 && (
                    <span className="min-w-5 h-5 px-1 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {cart.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => { if (cart.length > 0) setPanel('payment'); }}
                  disabled={cart.length === 0}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-colors border-b-2 ${panel === 'payment' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Banknote size={15} />
                  Payment
                </button>
                <button
                  onClick={() => { if (confirm('Clear all items from cart?')) { setCart([]); setQtyInputs({}); } }}
                  disabled={cart.length === 0}
                  className="px-3 py-3.5 text-slate-400 hover:text-red-500 hover:bg-red-50 border-b-2 border-transparent transition shrink-0 disabled:opacity-0"
                  title="Clear cart"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={() => setCartMinimized(true)}
                  className="px-3 py-3.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 border-b-2 border-transparent transition shrink-0"
                  title="Minimize cart"
                >
                  <PanelRightClose size={16} />
                </button>
              </div>

              {/* Cart */}
              {panel === 'cart' && (
                <div className="flex flex-col flex-1 overflow-hidden panel-transition">
                  <div className="flex-1 overflow-y-auto">
                    {cart.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full py-20 text-center px-6">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                          <ShoppingCart size={28} className="text-slate-300" />
                        </div>
                        <p className="font-semibold text-slate-500 text-sm">Your cart is empty</p>
                        <p className="text-xs text-slate-400 mt-1">Click a product to add it</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {cart.map((item) => {
                          const subtotal = (item.medicine.sellingPrice || 0) * item.quantity;
                          const maxStock = getEffectiveStock(item.medicine);
                          const rawInput = qtyInputs[item.medicine.id] ?? String(item.quantity);
                          return (
                            <div key={item.medicine.id} className="px-4 py-3.5 cart-item-enter group hover:bg-slate-50/80 transition-colors">
                              <div className="flex gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 text-base">
                                  {item.medicine.image
                                    ? <Image src={item.medicine.image} alt="" width={40} height={40} className="object-cover" unoptimized />
                                    : '💊'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="font-semibold text-slate-900 text-xs leading-tight truncate">{getDisplayName(item.medicine)}</p>
                                    <button onClick={() => removeFromCart(item.medicine.id)} className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition p-0.5 rounded">
                                      <X size={14} />
                                    </button>
                                  </div>
                                  {item.medicine.strength && <p className="text-[10px] text-slate-400 mt-0.5">{item.medicine.strength}</p>}
                                  <div className="flex items-center justify-between mt-2">
                                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg px-1 py-0.5">
                                      <button className="qty-btn text-slate-600 hover:bg-white hover:text-slate-900" onClick={() => updateQty(item.medicine.id, item.quantity - 1)}>
                                        <Minus size={12} strokeWidth={2.5} />
                                      </button>
                                      <input
                                        type="number"
                                        className="cart-qty-input"
                                        value={rawInput}
                                        min={1}
                                        max={maxStock}
                                        onChange={(e) => handleQtyInputChange(item.medicine.id, e.target.value)}
                                        onFocus={(e) => e.target.select()}
                                        onBlur={() => handleQtyInputBlur(item.medicine.id, item.quantity)}
                                      />
                                      <button className="qty-btn text-slate-600 hover:bg-white hover:text-slate-900" onClick={() => updateQty(item.medicine.id, item.quantity + 1)}>
                                        <Plus size={12} strokeWidth={2.5} />
                                      </button>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[10px] text-slate-400">&#8369;{(item.medicine.sellingPrice || 0).toFixed(2)} x {item.quantity}</p>
                                      <p className="text-sm font-extrabold text-emerald-600">&#8369;{subtotal.toFixed(2)}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {cart.length > 0 && (
                    <div className="border-t border-slate-200 p-4 space-y-3 shrink-0 bg-slate-50/60">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Subtotal</span>
                          <span className="font-semibold text-slate-700">&#8369;{cartTotal.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                        <span className="text-sm font-bold text-slate-900">Total</span>
                        <span className="text-xl font-extrabold text-slate-900">&#8369;{cartTotal.toFixed(2)}</span>
                      </div>
                      <button
                        onClick={() => setPanel('payment')}
                        className="w-full bg-slate-900 hover:bg-blue-600 text-white text-sm font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-md hover:shadow-blue-500/25"
                      >
                        Proceed to Payment
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Payment */}
              {panel === 'payment' && (
                <div className="flex flex-col flex-1 overflow-hidden panel-transition">
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Order Summary</p>
                      {cart.map((item) => (
                        <div key={item.medicine.id} className="flex justify-between items-center text-xs">
                          <span className="text-slate-600 truncate max-w-42.5">{getDisplayName(item.medicine)} <span className="text-slate-400">x{item.quantity}</span></span>
                          <span className="font-semibold text-slate-800">&#8369;{((item.medicine.sellingPrice || 0) * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="border-t border-slate-200 pt-2 mt-1 flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-700">Total</span>
                        <span className="text-base font-extrabold text-slate-900">&#8369;{cartTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                      <div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center">
                        <Banknote size={14} className="text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-emerald-900">Cash Payment</p>
                        <p className="text-[10px] text-emerald-700">Over the Counter</p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Amount Received</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-lg pointer-events-none">&#8369;</span>
                        <input
                          type="number" step="0.01" min="0"
                          value={amountPaid}
                          onChange={(e) => setAmountPaid(e.target.value)}
                          placeholder="0.00"
                          className="amount-input w-full pl-9 pr-4 py-3.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-emerald-400 text-slate-900 text-2xl font-extrabold transition"
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Quick Amounts</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[100, 200, 500, 1000, 2000, 5000].map((amt) => (
                          <button
                            key={amt}
                            onClick={() => setAmountPaid(amt.toString())}
                            className={`quick-btn py-2 rounded-xl text-xs font-bold border transition ${parseFloat(amountPaid) === amt ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50'}`}
                          >
                            &#8369;{amt >= 1000 ? `${amt / 1000}k` : amt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={`rounded-xl border p-3.5 transition ${canPay ? 'bg-emerald-50 border-emerald-200' : amountPaid ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-[10px] font-bold uppercase tracking-widest ${canPay ? 'text-emerald-600' : amountPaid ? 'text-red-500' : 'text-slate-400'}`}>Change</p>
                          {amountPaid && !canPay && <p className="text-[10px] text-red-500 mt-0.5">Short by &#8369;{(cartTotal - paidNum).toFixed(2)}</p>}
                        </div>
                        <span className={`text-3xl font-extrabold ${canPay ? 'text-emerald-600' : amountPaid ? 'text-red-500' : 'text-slate-300'}`}>
                          &#8369;{change.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {amountPaid && (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${canPay ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                        {canPay
                          ? <><CheckCircle2 size={15} /> Payment amount is sufficient</>
                          : <><AlertCircle size={15} /> Insufficient amount entered</>
                        }
                      </div>
                    )}

                    {paymentError && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-xs font-medium">
                        <AlertCircle size={15} className="shrink-0 mt-0.5" />
                        <p>{paymentError}</p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 p-4 space-y-2 shrink-0 bg-slate-50/60">
                    <button
                      onClick={handleCheckout}
                      disabled={!canPay || isProcessing}
                      className={`w-full font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2 text-sm ${canPay && !isProcessing ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-emerald-500/30' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                    >
                      {canPay
                        ? <><Zap size={16} /> Complete Sale &middot; Change &#8369;{change.toFixed(2)}</>
                        : 'Enter Valid Amount'
                      }
                    </button>
                    <button
                      onClick={() => setPanel('cart')}
                      disabled={isProcessing}
                      className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5"
                    >
                      <ChevronRight size={13} className="rotate-180" />
                      Back to Cart
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* end RIGHT */}

        </div>
      </div>

      {/* Floating cart FAB */}
      <div className={`cart-fab ${cartMinimized ? 'visible-fab' : 'hidden-fab'}`}>
        <button onClick={() => setCartMinimized(false)} title="Open cart" aria-label="Open cart">
          <ShoppingCart size={22} />
          {totalItems > 0 && <span className="fab-badge">{totalItems}</span>}
          {cart.length > 0 && <span className="fab-total">&#8369;{cartTotal.toFixed(0)}</span>}
        </button>
      </div>

      {isProcessing && <Processing />}
      {showReceipt && lastSale && <Receipt sale={lastSale as Sale} onClose={() => setShowReceipt(false)} />}
    </div>
  );
}