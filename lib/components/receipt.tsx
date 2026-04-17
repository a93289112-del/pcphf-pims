'use client';

import { useRef } from 'react';
import { Printer, X, Mail } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface SaleItem {
  medicineId: string;
  medicineName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface Sale {
  id: string;
  date: string;
  total: number;
  amountPaid: number;
  change: number;
  paymentMethod: string;
  items: SaleItem[];
}

interface ReceiptProps {
  sale: Sale;
  onClose: () => void;
}
 {/* POS RECEIPT */}
export default function Receipt({ sale, onClose }: ReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!receiptRef.current) return;

    try {
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`receipt-${sale.id}.pdf`);
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('Failed to generate PDF');
    }
  };

  const saleDate = new Date(sale.date);
  const formattedDate = saleDate.toLocaleDateString();
  const formattedTime = saleDate.toLocaleTimeString();

  return (
    <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center p-4 z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.1)', backdropFilter: 'blur(8px)' }}>
      {/* Receipt Modal */}
      <div className="bg-white bg-opacity-15 border border-white border-opacity-30 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ backdropFilter: 'blur(16px) saturate(180%)' }}>
        {/* Modal Header */}
        <div className="sticky top-0 bg-white bg-opacity-10 backdrop-blur-3xl border-b border-white border-opacity-20 px-6 py-4 flex items-center justify-between" style={{ backdropFilter: 'blur(12px) saturate(180%)' }}>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Receipt</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Receipt Content */}
        <div ref={receiptRef} className="p-10 bg-white" style={{ backgroundImage: 'none' }}>
          {/* Receipt Header */}
          <div className="text-center mb-10 pb-8 border-b border-slate-200">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Primary Pharmacy Health Facility</h1>
            <p className="text-slate-500 text-sm mt-4 space-y-1">
              <span className="block">Passi City, City Hall</span>
              <span className="block">Phone: (+63) 4567891000</span>
            </p>
          </div>

          {/* Receipt Info */}
          <div className="grid grid-cols-2 gap-8 mb-8 pb-6 border-b border-slate-200">
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold letter-spacing-wide">Receipt #</p>
              <p className="font-mono font-semibold text-slate-900 mt-1">{sale.id.slice(-8)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase font-semibold">Date & Time</p>
              <p className="font-mono font-semibold text-slate-900 mt-1">{formattedDate}</p>
              <p className="font-mono text-xs text-slate-600">{formattedTime}</p>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-8">
            <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-slate-600 uppercase mb-4 pb-3 border-b border-slate-200">
              <div className="col-span-6">Item</div>
              <div className="col-span-2 text-center">Qty</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-2 text-right">Total</div>
            </div>

            {sale.items.map((item) => (
              <div
                key={item.medicineId}
                className="grid grid-cols-12 gap-3 py-3 text-sm text-slate-800 border-b border-slate-100"
              >
                <div className="col-span-6">
                  <p className="font-medium text-slate-900">{item.medicineName}</p>
                </div>
                <div className="col-span-2 text-center text-slate-600">{item.quantity}</div>
                <div className="col-span-2 text-right text-slate-600">₱{item.unitPrice.toFixed(2)}</div>
                <div className="col-span-2 text-right font-semibold text-slate-900">
                  ₱{item.subtotal.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Totals Section */}
          <div className="space-y-3 mb-8 pb-6 border-b border-slate-200">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span>₱{sale.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold text-slate-900">
              <span>Total</span>
              <span>₱{sale.total.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Section */}
          <div className="space-y-3 mb-8">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Amount Paid</span>
              <span className="font-medium text-slate-900">₱{sale.amountPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span>Payment Method</span>
              <span className="font-medium text-slate-900 capitalize">{sale.paymentMethod}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-emerald-600 pt-3 border-t border-slate-200">
              <span>Change</span>
              <span>₱{sale.change.toFixed(2)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center space-y-2 pt-4">
            <p className="text-sm font-medium text-slate-700">Thank you for your purchase!</p>
            <p className="text-xs text-slate-500">Please keep this receipt for your records</p>
          </div>
        </div>

        {/* Modal Footer - Actions */}
        <div className="sticky bottom-0 bg-white bg-opacity-10 backdrop-blur-3xl border-t border-white border-opacity-20 px-6 py-4 flex items-center justify-end gap-2" style={{ backdropFilter: 'blur(12px) saturate(180%)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 transition font-medium text-sm"
          >
            Close
          </button>
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
          >
            <Mail size={16} />
            Download PDF
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition font-medium text-sm"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
