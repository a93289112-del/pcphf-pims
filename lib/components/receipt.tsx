'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import logoSrc from '@/app/assets/Logo/pharmacylogo.jpeg.png';

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
  phDate?:       string;
  total:         number;
  amountPaid:    number;
  change:        number;
  paymentMethod: string;
  itemCount?:    number;
  items:         SaleItem[];
}

interface ReceiptProps {
  sale:       Sale;
  onClose:    () => void;
  autoPrint?: boolean; // when true, triggers window.print() on mount (used by history page)
}

function formatPeso(value: number): string {
  return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPayment(method: string): string {
  return method.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Receipt({ sale, onClose, autoPrint = false }: ReceiptProps) {
  const txnDate     = new Date(sale.date);
  const dateStr     = txnDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr     = txnDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const printedAt   = new Date().toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const receiptNum  = sale.id.slice(-8).toUpperCase();
  const payLabel    = formatPayment(sale.paymentMethod);

  /* ── Auto-print support (used from history page) ── */
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [autoPrint]);

  /* ── Print handler (manual) ── */
  const handlePrint = async () => {
    try {
      const logoPath     = typeof logoSrc === 'string' ? logoSrc : (logoSrc as { src: string }).src;
      const logoResponse = await fetch(logoPath);
      const logoBlob     = await logoResponse.blob();
      const logoBase64   = await new Promise<string>((resolve) => {
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

      const receiptHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt &middot; ${receiptNum}</title>
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
    body { display:flex; align-items:flex-start; justify-content:center; min-height:100vh; padding:48px 24px 64px; }
    .receipt { background:#fff; width:100%; max-width:400px; padding:32px 28px 24px; position:relative; }
    .receipt::before {
      content:''; position:absolute; top:-9px; left:0; right:0; height:9px;
      background: radial-gradient(circle at 9px -2px,#f0f0f0 9px,transparent 9px) -9px 0/18px 100%,
                  radial-gradient(circle at 9px -2px,#fff 9px,transparent 9px) 0 0/18px 100%;
    }
    .receipt::after {
      content:''; position:absolute; bottom:-9px; left:0; right:0; height:9px;
      background: radial-gradient(circle at 9px 11px,#f0f0f0 9px,transparent 9px) -9px 0/18px 100%,
                  radial-gradient(circle at 9px 11px,#fff 9px,transparent 9px) 0 0/18px 100%;
    }
    .header { display:flex; flex-direction:column; align-items:center; text-align:center; margin-bottom:22px; }
    .logo-wrap { width:46px; height:46px; border-radius:50%; overflow:hidden; margin-bottom:10px; border:1.5px solid #e4e4e4; flex-shrink:0; }
    .logo-wrap img { width:100%; height:100%; object-fit:cover; display:block; }
    .facility-name { font-size:12.5px; font-weight:600; color:#111; letter-spacing:-0.01em; margin-bottom:3px; line-height:1.3; }
    .facility-sub { font-size:10.5px; color:#aaa; font-weight:400; line-height:1.6; }
    .dash { border:none; border-top:1.5px dashed #e0e0e0; margin:18px 0; }
    .meta-grid { display:grid; grid-template-columns:auto 1fr; row-gap:5px; column-gap:12px; margin-bottom:4px; }
    .meta-label { font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.07em; color:#bbb; white-space:nowrap; line-height:1.6; }
    .meta-value { font-size:11px; font-weight:500; color:#333; text-align:right; font-family:'DM Mono',monospace; line-height:1.6; }
    .meta-value.receipt-num { font-size:12px; color:#111; font-weight:500; }
    .section-label { font-size:9.5px; font-weight:600; text-transform:uppercase; letter-spacing:0.1em; color:#ccc; margin-bottom:10px; }
    .items-table { width:100%; border-collapse:collapse; margin-bottom:4px; }
    .items-table thead th { font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#ccc; padding-bottom:8px; border-bottom:1px solid #f0f0f0; text-align:left; }
    .items-table thead th.r { text-align:right; }
    .items-table tbody td { padding:9px 0; border-bottom:1px solid #f7f7f7; vertical-align:top; }
    .items-table tbody tr:last-child td { border-bottom:none; }
    td.item-name { font-size:12px; font-weight:500; color:#1a1a1a; padding-right:6px; line-height:1.4; }
    td.item-qty  { font-size:11px; color:#999; text-align:right; font-family:'DM Mono',monospace; padding-right:6px; white-space:nowrap; }
    td.item-price{ font-size:11px; color:#999; text-align:right; font-family:'DM Mono',monospace; padding-right:6px; white-space:nowrap; }
    td.item-total{ font-size:12px; font-weight:500; color:#1a1a1a; text-align:right; font-family:'DM Mono',monospace; white-space:nowrap; }
    .summary { margin-bottom:4px; }
    .summary-row { display:flex; justify-content:space-between; align-items:baseline; padding:4px 0; }
    .s-label { font-size:11px; color:#aaa; font-weight:400; }
    .s-value { font-size:11px; color:#666; font-family:'DM Mono',monospace; font-weight:400; }
    .s-value.change-val { color:#2563eb; }
    .total-row { display:flex; justify-content:space-between; align-items:baseline; padding:13px 0 0; margin-top:8px; border-top:1.5px solid #111; }
    .t-label { font-size:13px; font-weight:600; color:#111; letter-spacing:-0.01em; }
    .t-value { font-size:20px; font-weight:600; color:#111; font-family:'DM Mono',monospace; letter-spacing:-0.02em; }
    .receipt-footer { text-align:center; padding-top:18px; }
    .footer-msg { font-size:11px; color:#ccc; font-weight:400; margin-bottom:5px; }
    .footer-id { font-size:9px; color:#ddd; font-family:'DM Mono',monospace; letter-spacing:0.03em; word-break:break-all; }
    @media print {
      html, body { background:white; padding:0; }
      .receipt { max-width:100%; padding:24px 20px 20px; box-shadow:none; }
      .receipt::before, .receipt::after { display:none; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="logo-wrap"><img src="${logoBase64}" alt="Logo"></div>
      <div class="facility-name">Passi City Primary Health Care Facility</div>
      <div class="facility-sub">Passi City, City Hall<br>Phone: (+63) 4567891000</div>
    </div>
    <hr class="dash">
    <div class="meta-grid">
      <span class="meta-label">Receipt</span>
      <span class="meta-value receipt-num">${receiptNum}</span>
      <span class="meta-label">Date</span>
      <span class="meta-value">${dateStr}</span>
      <span class="meta-label">Time</span>
      <span class="meta-value">${timeStr}</span>
      <span class="meta-label">Payment</span>
      <span class="meta-value">${payLabel}</span>
    </div>
    <hr class="dash">
    <div class="section-label">Items Purchased</div>
    <table class="items-table">
      <thead>
        <tr>
          <th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
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

      const pw = window.open('', '', 'width=560,height=860');
      pw?.document.write(receiptHtml);
      pw?.document.close();
      setTimeout(() => pw?.print(), 400);
    } catch (err) {
      console.error('Print error:', err);
      alert('Error preparing receipt for printing.');
    }
  };

  /* ── Download PDF (opens print dialog with PDF save option) ── */
  const handleDownloadPDF = handlePrint;

  /* ────────────────────────────────────────────────────────────────────
     MODAL — styled to match the print output exactly:
     logo · facility · dashed dividers · meta grid · items table ·
     payment summary · footer
  ──────────────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&family=DM+Mono:wght@400;500&display=swap');

        .rcpt-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(15,23,42,0.55);
          backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: center;
          padding: 12px;
          animation: rcptFadeIn 0.2s ease both;
        }
        @keyframes rcptFadeIn { from{opacity:0} to{opacity:1} }

        .rcpt-sheet {
          background: #fff;
          width: 100%;
          max-width: 440px;
          /* Leave room for topbar (~45px) + actions (~58px) + safe gap */
          max-height: min(92vh, 720px);
          border-radius: 6px;
          box-shadow: 0 32px 80px -8px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.06);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          position: relative;
          animation: rcptSlideUp 0.28s cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes rcptSlideUp { from{opacity:0;transform:translateY(14px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }

        /* Top bar: "RECEIPT" label + close */
        .rcpt-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 13px 16px 12px;
          border-bottom: 1px solid #f1f5f9;
          flex-shrink: 0;
          min-height: 46px;
        }
        .rcpt-topbar-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: #94a3b8;
        }
        .rcpt-close {
          width: 28px; height: 28px; border-radius: 8px;
          border: none; background: #f1f5f9; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #64748b; transition: background 0.15s, color 0.15s;
          flex-shrink: 0;
        }
        .rcpt-close:hover { background: #e2e8f0; color: #0f172a; }

        /* Scrollable body — takes all remaining height between topbar and actions */
        .rcpt-body {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 24px 24px 20px;
          /* Ensure content at bottom is always reachable */
          overscroll-behavior: contain;
        }
        .rcpt-body::-webkit-scrollbar { width: 4px; }
        .rcpt-body::-webkit-scrollbar-track { background: transparent; }
        .rcpt-body::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
        .rcpt-body::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }

        /* Header: logo + facility */
        .rcpt-header { text-align: center; margin-bottom: 20px; }
        .rcpt-logo-wrap {
          width: 48px; height: 48px; border-radius: 50%; overflow: hidden;
          margin: 0 auto 10px; border: 1.5px solid #e4e4e4;
        }
        .rcpt-logo-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .rcpt-facility-name {
          font-size: 13px; font-weight: 600; color: #111;
          letter-spacing: -0.01em; margin-bottom: 3px; line-height: 1.3;
        }
        .rcpt-facility-sub { font-size: 10.5px; color: #aaa; line-height: 1.65; }

        /* Dashed divider */
        .rcpt-dash {
          border: none; border-top: 1.5px dashed #e0e0e0; margin: 16px 0;
        }

        /* Meta grid (receipt #, date, time, payment) */
        .rcpt-meta {
          display: grid; grid-template-columns: auto 1fr;
          row-gap: 5px; column-gap: 12px;
        }
        .rcpt-meta-label {
          font-size: 10px; font-weight: 500; text-transform: uppercase;
          letter-spacing: 0.07em; color: #bbb; white-space: nowrap; line-height: 1.65;
        }
        .rcpt-meta-value {
          font-size: 11px; font-weight: 500; color: #333;
          text-align: right; font-family: 'DM Mono', monospace; line-height: 1.65;
        }
        .rcpt-meta-value.num { font-size: 12px; color: #111; }

        /* Section label */
        .rcpt-section-label {
          font-size: 9.5px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.1em; color: #ccc; margin-bottom: 10px;
        }

        /* Items table */
        .rcpt-table { width: 100%; border-collapse: collapse; }
        .rcpt-table thead th {
          font-size: 9px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.08em; color: #ccc; padding-bottom: 8px;
          border-bottom: 1px solid #f0f0f0; text-align: left;
        }
        .rcpt-table thead th.r { text-align: right; }
        .rcpt-table tbody td {
          padding: 9px 0; border-bottom: 1px solid #f7f7f7; vertical-align: top;
        }
        .rcpt-table tbody tr:last-child td { border-bottom: none; }
        .rcpt-td-name  { font-size: 12px; font-weight: 500; color: #1a1a1a; padding-right: 6px; line-height: 1.4; }
        .rcpt-td-qty   { font-size: 11px; color: #999; text-align: right; font-family: 'DM Mono', monospace; padding-right: 6px; white-space: nowrap; }
        .rcpt-td-price { font-size: 11px; color: #999; text-align: right; font-family: 'DM Mono', monospace; padding-right: 6px; white-space: nowrap; }
        .rcpt-td-total { font-size: 12px; font-weight: 500; color: #1a1a1a; text-align: right; font-family: 'DM Mono', monospace; white-space: nowrap; }

        /* Summary rows */
        .rcpt-summary-row {
          display: flex; justify-content: space-between; align-items: baseline; padding: 4px 0;
        }
        .rcpt-s-label { font-size: 11px; color: #aaa; }
        .rcpt-s-value { font-size: 11px; color: #666; font-family: 'DM Mono', monospace; }
        .rcpt-s-value.change { color: #2563eb; }

        /* Total row */
        .rcpt-total-row {
          display: flex; justify-content: space-between; align-items: baseline;
          padding: 13px 0 0; margin-top: 8px; border-top: 1.5px solid #111;
        }
        .rcpt-total-label { font-size: 13px; font-weight: 600; color: #111; }
        .rcpt-total-value {
          font-size: 22px; font-weight: 600; color: #111;
          font-family: 'DM Mono', monospace; letter-spacing: -0.02em;
        }

        /* Footer text */
        .rcpt-footer { text-align: center; padding: 16px 0 20px; }
        .rcpt-footer-msg { font-size: 11px; color: #ccc; margin-bottom: 4px; }
        .rcpt-footer-id  { font-size: 9px; color: #ddd; font-family: 'DM Mono', monospace; letter-spacing: 0.03em; word-break: break-all; }

        /* Action bar */
        .rcpt-actions {
          display: flex; align-items: center; justify-content: flex-end; gap: 8px;
          padding: 14px 18px; border-top: 1px solid #f1f5f9; flex-shrink: 0;
          background: #fafafa;
        }
        .rcpt-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 18px; border-radius: 10px; font-size: 12px; font-weight: 700;
          border: none; cursor: pointer; transition: all 0.15s;
          font-family: 'DM Sans', sans-serif;
        }
        .rcpt-btn-ghost {
          background: transparent; color: #64748b; border: 1px solid #e2e8f0;
        }
        .rcpt-btn-ghost:hover { background: #f1f5f9; color: #0f172a; }
        .rcpt-btn-pdf {
          background: #2563eb; color: #fff;
        }
        .rcpt-btn-pdf:hover { background: #1d4ed8; }
        .rcpt-btn-print {
          background: #0f172a; color: #fff;
        }
        .rcpt-btn-print:hover { background: #1e40af; }

        @media print {
          .rcpt-overlay, .rcpt-sheet, .rcpt-topbar, .rcpt-actions { display: none !important; }
        }
      `}</style>

      <div className="rcpt-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="rcpt-sheet">

          {/* ── Top bar ── */}
          <div className="rcpt-topbar">
            <span className="rcpt-topbar-label">Receipt</span>
            <button className="rcpt-close" onClick={onClose} aria-label="Close">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Scrollable receipt body ── */}
          <div className="rcpt-body">

            {/* Header */}
            <div className="rcpt-header">
              <div className="rcpt-logo-wrap">
                <Image src={logoSrc} alt="Logo" width={48} height={48} className="object-cover" priority unoptimized />
              </div>
              <div className="rcpt-facility-name">Passi City Primary Health Care Facility</div>
              <div className="rcpt-facility-sub">Passi City, City Hall<br />Phone: (+63) 4567891000</div>
            </div>

            <hr className="rcpt-dash" />

            {/* Meta: receipt #, date, time, payment */}
            <div className="rcpt-meta">
              <span className="rcpt-meta-label">Receipt</span>
              <span className="rcpt-meta-value num">{receiptNum}</span>

              <span className="rcpt-meta-label">Date</span>
              <span className="rcpt-meta-value">{dateStr}</span>

              <span className="rcpt-meta-label">Time</span>
              <span className="rcpt-meta-value">{timeStr}</span>

              <span className="rcpt-meta-label">Payment</span>
              <span className="rcpt-meta-value">{payLabel}</span>
            </div>

            <hr className="rcpt-dash" />

            {/* Items */}
            <div className="rcpt-section-label">Items Purchased</div>
            <table className="rcpt-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="r">Qty</th>
                  <th className="r">Price</th>
                  <th className="r">Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, i) => (
                  <tr key={i}>
                    <td className="rcpt-td-name">{item.medicineName}</td>
                    <td className="rcpt-td-qty">{item.quantity}</td>
                    <td className="rcpt-td-price">₱{formatPeso(item.unitPrice)}</td>
                    <td className="rcpt-td-total">₱{formatPeso(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <hr className="rcpt-dash" />

            {/* Payment summary */}
            <div>
              <div className="rcpt-summary-row">
                <span className="rcpt-s-label">Subtotal</span>
                <span className="rcpt-s-value">₱{formatPeso(sale.total)}</span>
              </div>
              <div className="rcpt-summary-row">
                <span className="rcpt-s-label">Amount paid</span>
                <span className="rcpt-s-value">₱{formatPeso(sale.amountPaid)}</span>
              </div>
              <div className="rcpt-summary-row">
                <span className="rcpt-s-label">Change</span>
                <span className="rcpt-s-value change">₱{formatPeso(sale.change)}</span>
              </div>
              <div className="rcpt-total-row">
                <span className="rcpt-total-label">Total</span>
                <span className="rcpt-total-value">₱{formatPeso(sale.total)}</span>
              </div>
            </div>

            <hr className="rcpt-dash" />

            {/* Footer */}
            <div className="rcpt-footer">
              <div className="rcpt-footer-msg">Thank you for your purchase</div>
              <div className="rcpt-footer-id">Printed {printedAt} &nbsp;·&nbsp; {sale.id}</div>
            </div>

          </div>
          {/* end rcpt-body */}

          {/* ── Action buttons ── */}
          <div className="rcpt-actions">
            <button className="rcpt-btn rcpt-btn-ghost" onClick={onClose}>Close</button>
            <button className="rcpt-btn rcpt-btn-pdf" onClick={handleDownloadPDF}>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download PDF
            </button>
            <button className="rcpt-btn rcpt-btn-print" onClick={handlePrint}>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2m-2 0H8m8 0v4H8v-4" />
              </svg>
              Print
            </button>
          </div>

        </div>
      </div>
    </>
  );
}