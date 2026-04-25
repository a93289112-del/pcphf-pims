'use client';

import { useAuth } from '@/lib/auth/auth-context';
import ConfirmationModal from '@/lib/components/confirmation-modal';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useState, useMemo } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, onValue, remove } from 'firebase/database';
import Image from 'next/image';
import logoSrc from '@/app/assets/Logo/pharmacylogo.jpeg.png';
import Processing from '@/lib/components/processing';

interface SaleItem {
  medicineId:   string;
  medicineName: string;
  quantity:     number;
  unitPrice:    number;
  subtotal:     number;
}

interface Sale {
  id:            string;
  date:          string;
  createdAt?:    string;
  total:         number;
  amountPaid:    number;
  change:        number;
  paymentMethod: string;
  itemCount?:    number;
  items:         SaleItem[];
}

type SaleRecord = Omit<Sale, 'id'>;
type ViewMode   = 'table' | 'grid';
type SortMode   = 'date-desc' | 'date-asc' | 'total-desc' | 'total-asc';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return iso; }
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return iso; }
}

function formatPeso(value: number): string {
  return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SaleDetailModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center p-3 sm:p-6"
      style={{ backdropFilter: 'blur(12px)', background: 'rgba(15,23,42,0.65)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-expand bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-linear-to-r from-emerald-600 to-emerald-700 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-full overflow-hidden shrink-0 flex items-center justify-center border border-slate-200 shadow-sm" style={{ width: 44, height: 44 }}>
              <Image src={logoSrc} alt="Pharmacy Logo" width={44} height={44} className="object-cover w-full h-full" priority unoptimized />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-emerald-200 uppercase tracking-widest">POS Sale Receipt</p>
              <h2 className="text-base font-black text-white tracking-tight truncate">Transaction #{sale.id.slice(-8).toUpperCase()}</h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors shrink-0 ml-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-area px-5 py-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Date', value: formatDateShort(sale.date) },
              { label: 'Time', value: new Date(sale.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) },
              { label: 'Payment', value: sale.paymentMethod.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
              { label: 'Items', value: String(sale.items.length) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                <p className="text-sm font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Items Sold</p>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr] px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                {['Medicine', 'Qty', 'Unit Price', 'Subtotal'].map((h) => (
                  <span key={h} className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</span>
                ))}
              </div>
              {sale.items.map((item, i) => (
                <div key={i} className="border-b border-slate-50 last:border-0">
                  <div className="sm:hidden px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.medicineName}</p>
                      <p className="text-xs text-slate-400 mt-0.5">₱{formatPeso(item.unitPrice)} × {item.quantity}</p>
                    </div>
                    <p className="text-sm font-black text-emerald-600 shrink-0">₱{formatPeso(item.subtotal)}</p>
                  </div>
                  <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr] items-center px-4 py-3 hover:bg-slate-50/80 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.medicineName}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{item.medicineId.slice(-8)}</p>
                    </div>
                    <p className="text-sm font-bold text-slate-700">{item.quantity}</p>
                    <p className="text-sm text-slate-600">₱{formatPeso(item.unitPrice)}</p>
                    <p className="text-sm font-black text-emerald-600">₱{formatPeso(item.subtotal)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-3">Payment Summary</p>
            {[
              { label: 'Subtotal',     value: formatPeso(sale.total),      bold: false, color: 'text-slate-700' },
              { label: 'Amount Paid',  value: formatPeso(sale.amountPaid), bold: false, color: 'text-slate-700' },
              { label: 'Change Given', value: formatPeso(sale.change),     bold: false, color: 'text-blue-700'  },
            ].map(({ label, value, bold, color }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{label}</span>
                <span className={`text-sm font-${bold ? 'black' : 'bold'} ${color}`}>₱{value}</span>
              </div>
            ))}
            <div className="border-t border-emerald-200 pt-2.5 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800">Total</span>
              <span className="text-xl font-black text-emerald-700">₱{formatPeso(sale.total)}</span>
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/80 shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-slate-400 font-mono truncate mr-4">ID: {sale.id}</p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={async () => {
                try {
                  const logoPath = typeof logoSrc === 'string' ? logoSrc : logoSrc.src;
                  const logoResponse = await fetch(logoPath);
                  const logoBlob = await logoResponse.blob();
                  const logoBase64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(logoBlob);
                  });

                  const itemRows = sale.items.map((item) => `
                    <tr>
                      <td class="item-name">${item.medicineName}</td>
                      <td class="item-qty">${item.quantity}</td>
                      <td class="item-price">&#8369;${formatPeso(item.unitPrice)}</td>
                      <td class="item-total">&#8369;${formatPeso(item.subtotal)}</td>
                    </tr>
                  `).join('');

                  const txnDate    = new Date(sale.date);
                  const dateStr    = txnDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                  const timeStr    = txnDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                  const printedAt  = new Date().toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                  const paymentLabel = sale.paymentMethod.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

                  const receiptHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Receipt &middot; ${sale.id.slice(-8).toUpperCase()}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      background: #f0f0f0;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      min-height: 100vh;
      padding: 48px 24px 64px;
    }

    .receipt {
      background: #fff;
      width: 100%;
      max-width: 400px;
      padding: 32px 28px 24px;
      position: relative;
    }

    /* Serrated top edge */
    .receipt::before {
      content: '';
      position: absolute;
      top: -9px; left: 0; right: 0;
      height: 9px;
      background:
        radial-gradient(circle at 9px -2px, #f0f0f0 9px, transparent 9px) -9px 0 / 18px 100%,
        radial-gradient(circle at 9px -2px, #fff 9px, transparent 9px) 0 0 / 18px 100%;
    }

    /* Serrated bottom edge */
    .receipt::after {
      content: '';
      position: absolute;
      bottom: -9px; left: 0; right: 0;
      height: 9px;
      background:
        radial-gradient(circle at 9px 11px, #f0f0f0 9px, transparent 9px) -9px 0 / 18px 100%,
        radial-gradient(circle at 9px 11px, #fff 9px, transparent 9px) 0 0 / 18px 100%;
    }

    /* ── Header ── */
    .header {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin-bottom: 22px;
    }

    .logo-wrap {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      overflow: hidden;
      margin-bottom: 10px;
      border: 1.5px solid #e4e4e4;
      flex-shrink: 0;
    }

    .logo-wrap img {
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
    }

    .facility-name {
      font-size: 12.5px;
      font-weight: 600;
      color: #111;
      letter-spacing: -0.01em;
      margin-bottom: 3px;
      line-height: 1.3;
    }

    .facility-sub {
      font-size: 10.5px;
      color: #aaa;
      font-weight: 400;
      line-height: 1.6;
    }

    /* ── Dashed divider ── */
    .dash {
      border: none;
      border-top: 1.5px dashed #e0e0e0;
      margin: 18px 0;
    }

    /* ── Meta block ── */
    .meta-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      row-gap: 5px;
      column-gap: 12px;
      margin-bottom: 4px;
    }

    .meta-label {
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #bbb;
      white-space: nowrap;
      line-height: 1.6;
    }

    .meta-value {
      font-size: 11px;
      font-weight: 500;
      color: #333;
      text-align: right;
      font-family: 'DM Mono', monospace;
      line-height: 1.6;
    }

    .meta-value.receipt-num {
      font-size: 12px;
      color: #111;
      font-weight: 500;
    }

    /* ── Section label ── */
    .section-label {
      font-size: 9.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #ccc;
      margin-bottom: 10px;
    }

    /* ── Items table ── */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 4px;
    }

    .items-table thead th {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #ccc;
      padding-bottom: 8px;
      border-bottom: 1px solid #f0f0f0;
      text-align: left;
    }

    .items-table thead th.r { text-align: right; }

    .items-table tbody td {
      padding: 9px 0;
      border-bottom: 1px solid #f7f7f7;
      vertical-align: top;
    }

    .items-table tbody tr:last-child td {
      border-bottom: none;
    }

    td.item-name {
      font-size: 12px;
      font-weight: 500;
      color: #1a1a1a;
      padding-right: 6px;
      line-height: 1.4;
    }

    td.item-qty {
      font-size: 11px;
      color: #999;
      text-align: right;
      font-family: 'DM Mono', monospace;
      padding-right: 6px;
      white-space: nowrap;
    }

    td.item-price {
      font-size: 11px;
      color: #999;
      text-align: right;
      font-family: 'DM Mono', monospace;
      padding-right: 6px;
      white-space: nowrap;
    }

    td.item-total {
      font-size: 12px;
      font-weight: 500;
      color: #1a1a1a;
      text-align: right;
      font-family: 'DM Mono', monospace;
      white-space: nowrap;
    }

    /* ── Summary ── */
    .summary { margin-bottom: 4px; }

    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 4px 0;
    }

    .s-label {
      font-size: 11px;
      color: #aaa;
      font-weight: 400;
    }

    .s-value {
      font-size: 11px;
      color: #666;
      font-family: 'DM Mono', monospace;
      font-weight: 400;
    }

    .s-value.change-val { color: #2563eb; }

    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 13px 0 0;
      margin-top: 8px;
      border-top: 1.5px solid #111;
    }

    .t-label {
      font-size: 13px;
      font-weight: 600;
      color: #111;
      letter-spacing: -0.01em;
    }

    .t-value {
      font-size: 20px;
      font-weight: 600;
      color: #111;
      font-family: 'DM Mono', monospace;
      letter-spacing: -0.02em;
    }

    /* ── Footer ── */
    .receipt-footer {
      text-align: center;
      padding-top: 18px;
    }

    .footer-msg {
      font-size: 11px;
      color: #ccc;
      font-weight: 400;
      margin-bottom: 5px;
    }

    .footer-id {
      font-size: 9px;
      color: #ddd;
      font-family: 'DM Mono', monospace;
      letter-spacing: 0.03em;
      word-break: break-all;
    }

    @media print {
      html, body { background: white; padding: 0; }
      .receipt { max-width: 100%; padding: 24px 20px 20px; box-shadow: none; }
      .receipt::before, .receipt::after { display: none; }
    }
  </style>
</head>
<body>
  <div class="receipt">

    <div class="header">
      <div class="logo-wrap">
        <img src="${logoBase64}" alt="Logo">
      </div>
      <div class="facility-name">Passi City Primary Health Care Facility</div>
      <div class="facility-sub">Passi City, City Hall<br>Phone: (+63) 4567891000</div>
    </div>

    <hr class="dash">

    <div class="meta-grid">
      <span class="meta-label">Receipt</span>
      <span class="meta-value receipt-num">${sale.id.slice(-8).toUpperCase()}</span>

      <span class="meta-label">Date</span>
      <span class="meta-value">${dateStr}</span>

      <span class="meta-label">Time</span>
      <span class="meta-value">${timeStr}</span>

      <span class="meta-label">Payment</span>
      <span class="meta-value">${paymentLabel}</span>
    </div>

    <hr class="dash">

    <div class="section-label">Items Purchased</div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Item</th>
          <th class="r">Qty</th>
          <th class="r">Price</th>
          <th class="r">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <hr class="dash">

    <div class="summary">
      <div class="summary-row">
        <span class="s-label">Subtotal</span>
        <span class="s-value">&#8369;${formatPeso(sale.total)}</span>
      </div>
      <div class="summary-row">
        <span class="s-label">Amount paid</span>
        <span class="s-value">&#8369;${formatPeso(sale.amountPaid)}</span>
      </div>
      <div class="summary-row">
        <span class="s-label">Change</span>
        <span class="s-value change-val">&#8369;${formatPeso(sale.change)}</span>
      </div>
      <div class="total-row">
        <span class="t-label">Total</span>
        <span class="t-value">&#8369;${formatPeso(sale.total)}</span>
      </div>
    </div>

    <hr class="dash">

    <div class="receipt-footer">
      <div class="footer-msg">Thank you for your purchase</div>
      <div class="footer-id">Printed ${printedAt} &nbsp;&middot;&nbsp; ${sale.id}</div>
    </div>

  </div>
</body>
</html>`;

                  const printWindow = window.open('', '', 'width=560,height=860');
                  printWindow?.document.write(receiptHtml);
                  printWindow?.document.close();
                  setTimeout(() => printWindow?.print(), 400);
                } catch (err) {
                  console.error('Print error:', err);
                  alert('Error preparing receipt for printing');
                }
              }}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
            >
              Print
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemsPanel({ sale }: { sale: Sale }) {
  return (
    <div className="expand-down bg-slate-50 border-t border-slate-100">
      <div className="px-4 sm:px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Items Sold</p>
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr] px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            {['Medicine', 'Qty', 'Unit Price', 'Subtotal'].map((h) => (
              <span key={h} className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{h}</span>
            ))}
          </div>
          {sale.items.map((item, i) => (
            <div key={i} className="border-b border-slate-50 last:border-0">
              <div className="sm:hidden px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.medicineName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">₱{formatPeso(item.unitPrice)} × {item.quantity}</p>
                </div>
                <p className="text-sm font-black text-emerald-600 shrink-0">₱{formatPeso(item.subtotal)}</p>
              </div>
              <div className="medicine-row hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr] items-center px-4 py-3">
                <p className="text-sm font-semibold text-slate-800 truncate pr-2">{item.medicineName}</p>
                <p className="text-sm font-bold text-slate-700">{item.quantity}</p>
                <p className="text-sm text-slate-600">₱{formatPeso(item.unitPrice)}</p>
                <p className="text-sm font-black text-emerald-600">₱{formatPeso(item.subtotal)}</p>
              </div>
            </div>
          ))}
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Total</span>
              <span className="text-sm font-black text-emerald-700">₱{formatPeso(sale.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ searchTerm, onClear }: { searchTerm: string; onClear: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
      <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
      </svg>
      <p className="text-slate-400 font-medium text-sm">
        {searchTerm ? 'No transactions match your search' : 'No POS transactions yet'}
      </p>
      {searchTerm && (
        <button onClick={onClear} className="mt-3 text-xs text-blue-600 hover:underline font-medium">Clear search</button>
      )}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-pulse">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50"><div className="h-3 bg-slate-200 rounded-md w-full" /></div>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="px-5 py-4 border-b border-slate-50 flex items-center gap-4">
          <div className="w-8 h-8 bg-slate-100 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-slate-100 rounded w-28" />
            <div className="h-2.5 bg-slate-100 rounded w-20" />
          </div>
          <div className="h-3 bg-slate-100 rounded w-20 hidden sm:block" />
          <div className="h-3 bg-slate-100 rounded w-16 hidden md:block" />
        </div>
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-slate-100 rounded w-24" />
              <div className="h-2.5 bg-slate-100 rounded w-16" />
            </div>
          </div>
          <div className="h-px bg-slate-100" />
          <div className="space-y-2">
            <div className="h-3 bg-slate-100 rounded w-full" />
            <div className="h-3 bg-slate-100 rounded w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function POSTransactionHistoryPage() {
  const { user, loading } = useAuth();
  const router            = useRouter();

  const [sales,          setSales]          = useState<Sale[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [searchTerm,     setSearchTerm]     = useState('');
  const [sortBy,         setSortBy]         = useState<SortMode>('date-desc');
  const [viewMode,       setViewMode]       = useState<ViewMode>('table');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [detailSale,     setDetailSale]     = useState<Sale | null>(null);

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleteTarget,      setDeleteTarget]      = useState<string | null>(null);
  const [isProcessing,      setIsProcessing]      = useState(false);
  const [notification,      setNotification]      = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => { if (!loading && !user) router.push('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const salesPath = getUserPath(user.uid, 'sales');
    const unsub = onValue(ref(database, salesPath), (snap) => {
      const data = snap.val();
      if (data) {
        const list = Object.entries(data as Record<string, SaleRecord>).map(([id, v]) => ({ id, ...v, items: v.items || [] }));
        setSales(list);
      } else { setSales([]); }
      setIsLoadingSales(false);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(t);
  }, [notification]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetailSale(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const stats = useMemo(() => {
    const total      = sales.reduce((s, sale) => s + sale.total, 0);
    const count      = sales.length;
    const today      = new Date().toDateString();
    const todaySales = sales.filter((s) => new Date(s.date).toDateString() === today);
    const todayTotal = todaySales.reduce((s, sale) => s + sale.total, 0);
    return { total, count, todayTotal, todayCount: todaySales.length };
  }, [sales]);

  const filteredSales = useMemo(() => {
    let f = sales;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      f = f.filter((s) => s.id.toLowerCase().includes(q) || s.items.some((i) => i.medicineName.toLowerCase().includes(q)) || s.paymentMethod.toLowerCase().includes(q));
    }
    if (dateFrom) f = f.filter((s) => new Date(s.date) >= new Date(dateFrom));
    if (dateTo)   f = f.filter((s) => new Date(s.date) <= new Date(dateTo + 'T23:59:59'));
    return f;
  }, [sales, searchTerm, dateFrom, dateTo]);

  const sortedSales = useMemo(() => {
    return [...filteredSales].sort((a, b) => {
      if (sortBy === 'date-desc')  return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortBy === 'date-asc')   return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sortBy === 'total-desc') return b.total - a.total;
      if (sortBy === 'total-asc')  return a.total - b.total;
      return 0;
    });
  }, [filteredSales, sortBy]);

  const handleDelete = async () => {
    if (!deleteTarget || !user) return;
    setIsProcessing(true);
    try {
      await remove(ref(database, getUserPath(user.uid, `sales/${deleteTarget}`)));
      setNotification({ message: 'Transaction deleted successfully', type: 'success' });
      setShowConfirmDelete(false);
      if (expandedId === deleteTarget) setExpandedId(null);
      if (detailSale?.id === deleteTarget) setDetailSale(null);
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      setNotification({ message: 'Failed to delete transaction', type: 'error' });
    } finally { setIsProcessing(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @keyframes slideUp    { from{opacity:0;transform:translateY(16px);}           to{opacity:1;transform:translateY(0);} }
        @keyframes toastIn    { from{opacity:0;transform:translateX(100%);}            to{opacity:1;transform:translateX(0);} }
        @keyframes expandDown { from{opacity:0;transform:translateY(-8px);}            to{opacity:1;transform:translateY(0);} }
        @keyframes pulse-dot  { 0%,100%{transform:scale(1);opacity:1;} 50%{transform:scale(1.4);opacity:.7;} }
        @keyframes rowIn      { from{opacity:0;transform:translateX(-6px);}            to{opacity:1;transform:translateX(0);} }
        @keyframes cardIn     { from{opacity:0;transform:translateY(10px) scale(.98);} to{opacity:1;transform:translateY(0) scale(1);} }
        @keyframes modalExpand{ from{opacity:0;transform:scale(.96) translateY(12px);} to{opacity:1;transform:scale(1) translateY(0);} }

        .slide-up     { animation:slideUp     0.4s cubic-bezier(0.22,1,0.36,1) both; }
        .toast-in     { animation:toastIn     0.4s cubic-bezier(0.22,1,0.36,1) both; }
        .expand-down  { animation:expandDown  0.3s cubic-bezier(0.22,1,0.36,1) both; }
        .row-in       { animation:rowIn       0.3s cubic-bezier(0.22,1,0.36,1) both; }
        .card-in      { animation:cardIn      0.35s cubic-bezier(0.22,1,0.36,1) both; }
        .modal-expand { animation:modalExpand 0.3s cubic-bezier(0.22,1,0.36,1) both; }

        .records-table { width:100%; border-collapse:collapse; table-layout:fixed; }
        .records-table thead tr { background:#f8fafc; border-bottom:1px solid #e2e8f0; }
        .records-table thead th { padding:10px 14px; text-align:left; font-size:10px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:#94a3b8; white-space:nowrap; }
        .records-table thead th:last-child { text-align:right; }
        .records-table tbody tr { border-bottom:1px solid #f1f5f9; transition:background .15s; }
        .records-table tbody tr:last-child { border-bottom:none; }
        .records-table tbody tr:hover { background:#fafbfc; }
        .records-table tbody td { padding:13px 14px; vertical-align:middle; overflow:hidden; }
        .table-expand-row td { padding:0 !important; }

        .col-txn    { width:28%; }
        .col-date   { width:20%; }
        .col-items  { width:22%; }
        .col-total  { width:14%; }
        .col-action { width:16%; }

        @media (max-width:640px) {
          .col-date  { display:none; }
          .col-total { width:18%; }
          .col-txn   { width:38%; }
          .col-items { width:28%; }
          .col-action{ width:16%; }
        }

        .grid-card { transition:box-shadow .2s,border-color .2s,transform .2s; cursor:pointer; }
        .grid-card:hover { box-shadow:0 4px 20px rgba(0,0,0,.07); border-color:#cbd5e1; transform:translateY(-1px); }
        .grid-card.is-expanded { border-color:#94a3b8; box-shadow:0 6px 24px rgba(0,0,0,.09); }

        .sort-chip { transition:all .15s; cursor:pointer; }
        .sort-chip:hover { background:#f1f5f9; }
        .sort-chip.active { background:#0f172a; color:white; border-color:transparent; }

        .delete-btn { transition:all .15s; }
        .delete-btn:hover { background:#fef2f2; border-color:#fecaca; color:#dc2626; }
        .detail-btn { transition:all .15s; }
        .detail-btn:hover { background:#ecfdf5; border-color:#a7f3d0; color:#059669; }

        .view-toggle { transition:all .15s; }
        .view-toggle.active { background:#0f172a; color:white; }
        .view-toggle:not(.active) { color:#94a3b8; }
        .view-toggle:not(.active):hover { color:#475569; background:#f1f5f9; }

        .medicine-row { transition:background .15s; }
        .medicine-row:hover { background:#f8fafc; }
        .chevron-icon { transition:transform .3s cubic-bezier(0.22,1,0.36,1); color:#cbd5e1; }
        .chevron-icon.open { transform:rotate(180deg); color:#64748b; }

        .scroll-area::-webkit-scrollbar { width:4px; }
        .scroll-area::-webkit-scrollbar-track { background:transparent; }
        .scroll-area::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:99px; }
        .scroll-area::-webkit-scrollbar-thumb:hover { background:#cbd5e1; }

        .txn-avatar { background:linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%); color:#065f46; font-weight:700; font-size:11px; }
      `}</style>

      {isProcessing && <Processing message="Deleting transaction..." />}
      {detailSale && <SaleDetailModal sale={detailSale} onClose={() => setDetailSale(null)} />}

      {notification && (
        <div className={`fixed top-5 right-5 z-100 toast-in flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium ${
          notification.type === 'success' ? 'bg-white border-emerald-200 text-emerald-800' : 'bg-white border-red-200 text-red-700'
        }`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ animation: 'pulse-dot 1.5s ease infinite' }} />
          {notification.message}
        </div>
      )}

      <div className="min-h-screen bg-slate-50 transition-all duration-300 ml-0 overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10">

          <div className="mb-8 sm:mb-10 slide-up">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mb-2">Transaction History</h1>
            <p className="text-sm text-slate-500">All POS sales records with full item breakdown</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 slide-up" style={{ animationDelay: '0.04s' }}>
            {[
              { label: 'Total Transactions', value: stats.count.toLocaleString(),      sub: 'all time',     color: 'text-slate-900'   },
              { label: 'Total Revenue',      value: `₱${formatPeso(stats.total)}`,      sub: 'all time',     color: 'text-emerald-700' },
              { label: "Today's Sales",      value: stats.todayCount.toLocaleString(),  sub: 'transactions', color: 'text-blue-700'    },
              { label: "Today's Revenue",    value: `₱${formatPeso(stats.todayTotal)}`, sub: 'earned today', color: 'text-emerald-700' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                <p className={`text-xl font-black ${color} leading-tight`}>{value}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 slide-up" style={{ animationDelay: '0.06s' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-0">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1110.5 3a7.5 7.5 0 016.15 13.65z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by medicine name, transaction ID…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-400 transition"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-0.5 p-1 bg-slate-100 rounded-xl shrink-0">
                {(['table', 'grid'] as const).map((mode) => (
                  <button key={mode} onClick={() => setViewMode(mode)} className={`view-toggle flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${viewMode === mode ? 'active' : ''}`}>
                    {mode === 'table'
                      ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 6h18M3 14h18M3 18h18" /></svg>
                      : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                    }
                    <span className="hidden sm:inline capitalize">{mode}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Sort</span>
              {([
                { value: 'date-desc',  label: 'Newest'     },
                { value: 'date-asc',   label: 'Oldest'     },
                { value: 'total-desc', label: 'Highest ₱'  },
                { value: 'total-asc',  label: 'Lowest ₱'   },
              ] as const).map((o) => (
                <button key={o.value} onClick={() => setSortBy(o.value)} className={`sort-chip text-xs font-medium px-3 py-1 rounded-full border border-slate-200 text-slate-600 ${sortBy === o.value ? 'active' : 'bg-slate-50'}`}>
                  {o.label}
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide sm:mb-2 shrink-0">Date Range</span>
                <div className="flex flex-1 items-end gap-2 flex-wrap sm:flex-nowrap">
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">From</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition cursor-pointer" />
                  </div>
                  <span className="text-slate-300 font-medium shrink-0 pb-2">→</span>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">To</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition cursor-pointer" />
                  </div>
                  {(dateFrom || dateTo) && (
                    <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="shrink-0 flex items-center gap-1 px-3 py-2 text-xs text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 bg-slate-50 hover:bg-red-50 rounded-xl font-medium transition-all">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {!isLoadingSales && (
            <p className="text-xs text-slate-400 font-medium px-1 mb-3">
              Showing <span className="text-slate-600 font-semibold">{sortedSales.length}</span> of {sales.length} transactions
            </p>
          )}

          {viewMode === 'table' && (
            isLoadingSales ? <TableSkeleton /> :
            sortedSales.length === 0 ? <EmptyState searchTerm={searchTerm} onClear={() => setSearchTerm('')} /> : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden slide-up">
                <table className="records-table">
                  <thead>
                    <tr>
                      <th className="col-txn">Transaction</th>
                      <th className="col-date">Date</th>
                      <th className="col-items">Items</th>
                      <th className="col-total">Total</th>
                      <th className="col-action" style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSales.map((sale, idx) => {
                      const isExpanded = expandedId === sale.id;
                      return (
                        <Fragment key={sale.id}>
                          <tr className="row-in" style={{ animationDelay: `${idx * 0.025}s` }}>
                            <td className="col-txn">
                              <div className="flex items-center gap-2.5">
                                <div className="txn-avatar w-8 h-8 rounded-full shrink-0 flex items-center justify-center">₱</div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-900 font-mono truncate">#{sale.id.slice(-8).toUpperCase()}</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{sale.paymentMethod.replace(/-/g, ' ')}</p>
                                </div>
                              </div>
                            </td>
                            <td className="col-date">
                              <p className="text-xs font-medium text-slate-700">{formatDateShort(sale.date)}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{new Date(sale.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                            </td>
                            <td className="col-items">
                              <div className="flex flex-wrap gap-1">
                                {sale.items.slice(0, 2).map((item, i) => (
                                  <span key={i} className="text-[10px] font-medium px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100 truncate max-w-20">{item.medicineName}</span>
                                ))}
                                {sale.items.length > 2 && <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">+{sale.items.length - 2}</span>}
                              </div>
                            </td>
                            <td className="col-total">
                              <p className="text-sm font-black text-emerald-700">₱{formatPeso(sale.total)}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{sale.items.reduce((s, i) => s + i.quantity, 0)} item{sale.items.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''}</p>
                            </td>
                            <td className="col-action">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => setDetailSale(sale)} title="View sale details" className="detail-btn flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg transition-all shrink-0 whitespace-nowrap">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                  View
                                </button>
                                <button onClick={() => setExpandedId(isExpanded ? null : sale.id)} title={isExpanded ? 'Collapse' : 'Expand items'} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all shrink-0">
                                  <svg className={`w-3.5 h-3.5 chevron-icon ${isExpanded ? 'open' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                <button onClick={() => { setDeleteTarget(sale.id); setShowConfirmDelete(true); }} title="Delete transaction" className="delete-btn w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition-all shrink-0">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="table-expand-row"><td colSpan={5}><ItemsPanel sale={sale} /></td></tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {viewMode === 'grid' && (
            isLoadingSales ? <GridSkeleton /> :
            sortedSales.length === 0 ? <EmptyState searchTerm={searchTerm} onClear={() => setSearchTerm('')} /> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {sortedSales.map((sale, idx) => {
                  const isExpanded = expandedId === sale.id;
                  return (
                    <div key={sale.id} className={`grid-card bg-white rounded-2xl border border-slate-200 overflow-hidden card-in ${isExpanded ? 'is-expanded' : ''}`} style={{ animationDelay: `${idx * 0.04}s` }}>
                      <button className="w-full text-left px-4 pt-4 pb-3" onClick={() => setExpandedId(isExpanded ? null : sale.id)}>
                        <div className="flex items-start gap-3">
                          <div className="txn-avatar w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm mt-0.5">₱</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-slate-900 font-mono truncate">#{sale.id.slice(-8).toUpperCase()}</p>
                              <svg className={`chevron-icon w-3.5 h-3.5 shrink-0 ${isExpanded ? 'open' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{sale.paymentMethod.replace(/-/g, ' ')}</p>
                          </div>
                        </div>
                      </button>
                      <div className="px-4 pb-3 grid grid-cols-3 gap-2">
                        {[
                          { val: sale.items.length, lbl: 'Products' },
                          { val: sale.items.reduce((s, i) => s + i.quantity, 0), lbl: 'Units' },
                          { val: formatDateShort(sale.date), lbl: 'Date' },
                        ].map((s, i) => (
                          <div key={i} className="bg-slate-50 rounded-xl px-2 py-2 text-center border border-slate-100">
                            <p className="text-sm font-black text-slate-800 leading-tight truncate">{s.val}</p>
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mt-0.5 truncate">{s.lbl}</p>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 pb-3 flex flex-wrap gap-1">
                        {sale.items.slice(0, 3).map((item, i) => (
                          <span key={i} className="text-[10px] font-medium px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100 truncate max-w-22.5">{item.medicineName}</span>
                        ))}
                        {sale.items.length > 3 && <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">+{sale.items.length - 3}</span>}
                      </div>
                      <div className="px-4 pb-4 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] text-slate-400 font-medium">Total</p>
                          <p className="text-base font-black text-emerald-700">₱{formatPeso(sale.total)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); setDetailSale(sale); }} className="detail-btn flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg transition-all">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            View
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(sale.id); setShowConfirmDelete(true); }} className="delete-btn flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 border border-slate-200 bg-white rounded-lg transition-all">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Delete
                          </button>
                        </div>
                      </div>
                      {isExpanded && <ItemsPanel sale={sale} />}
                    </div>
                  );
                })}
              </div>
            )
          )}

        </div>
      </div>

      <ConfirmationModal
        isOpen={showConfirmDelete}
        title="Delete Transaction?"
        message="Are you sure you want to delete this transaction record? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        onConfirm={handleDelete}
        onCancel={() => { setShowConfirmDelete(false); setDeleteTarget(null); }}
      />
    </>
  );
}