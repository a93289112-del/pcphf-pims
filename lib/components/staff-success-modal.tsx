'use client';

import { useEffect } from 'react';

interface SuccessInfo {
  staffName: string;
  email: string;
  position: string;
  contactNumber: string;
}

interface StaffSuccessModalProps {
  info: SuccessInfo;
  onClose: () => void;
  onCreateAnother: () => void;
}

export default function StaffSuccessModal({
  info,
  onClose,
  onCreateAnother,
}: StaffSuccessModalProps) {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onClose]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-white rounded-3xl shadow-2xl overflow-hidden max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-300">
        {/* Success Icon Section */}
        <div className="relative px-8 pt-12 pb-6">
          <div className="flex justify-center mb-6">
            <div className="relative w-24 h-24">
              {/* Animated circle background */}
              <div
                className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-full"
                style={{
                  animation: 'circlePop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                }}
              />
              {/* Checkmark SVG */}
              <svg
                className="w-24 h-24 text-emerald-500 absolute inset-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  animation: 'checkDraw 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  strokeDasharray: 'none',
                }}
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>

          {/* Heading */}
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-2">
            Staff Account Created!
          </h2>
          <p className="text-center text-slate-600 text-sm">
            Successfully added to your pharmacy team
          </p>
        </div>

        {/* Info Card */}
        <div className="px-8 py-6 bg-slate-50">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Staff Name
              </p>
              <p className="text-sm font-medium text-slate-900 mt-1">{info.staffName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Email
              </p>
              <p className="text-sm font-medium text-slate-900 mt-1 truncate">{info.email}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Position
              </p>
              <p className="text-sm font-medium text-slate-900 mt-1">{info.position}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Contact Number
              </p>
              <p className="text-sm font-medium text-slate-900 mt-1">{info.contactNumber}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-8 py-6 bg-white border-t border-slate-200 space-y-3">
          <button
            onClick={onCreateAnother}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200"
          >
            Create Another
          </button>
          <button
            onClick={onClose}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold py-3 px-4 rounded-xl transition-colors duration-200"
          >
            Done
          </button>
        </div>
      </div>

      {/* Animations */}
      <style jsx>{`
        @keyframes circlePop {
          0% {
            transform: scale(0);
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
          }
        }

        @keyframes checkDraw {
          0% {
            stroke-dashoffset: 60;
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
