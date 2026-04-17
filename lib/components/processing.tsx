'use client';

import React, { useEffect, useState } from 'react';

interface ProcessingProps {
  message?: string;
  className?: string;
}

const Processing: React.FC<ProcessingProps> = ({
  message = 'Processing...',
  className,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div className={`fixed inset-0 z-500 flex items-center justify-center pointer-events-none ${className || ''}`}>
      {/* No backdrop - modal only */}
      
      <div
        className={`pointer-events-auto flex flex-col items-center gap-5 px-10 py-8 rounded-3xl transition-all duration-300 relative ${
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{
          minWidth: 280,
          maxWidth: 360,
          background: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2), 0 4px 16px rgba(0, 0, 0, 0.1), inset 0 0 20px rgba(255, 255, 255, 0.3)',
        }}
      >
        {/* Spinner */}
        <div className="relative w-14 h-14">
          <svg
            className="absolute inset-0 w-full h-full animate-spin"
            viewBox="0 0 56 56"
            fill="none"
          >
            <circle cx="28" cy="28" r="24" stroke="#DBEAFE" strokeWidth="4" />
            <path
              d="M28 4a24 24 0 0 1 24 24"
              stroke="#2563EB"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
          </div>
        </div>

        {/* Message */}
        <div className="text-center">
          <p className="text-base font-bold text-slate-800">{message}</p>
          <p className="text-xs text-slate-400 mt-1">Please wait a moment</p>
        </div>

        {/* Animated progress bar */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full animate-progress" />
        </div>
      </div>

      <style jsx>{`
        @keyframes progress {
          0%   { width: 0%;  margin-left: 0%; }
          50%  { width: 60%; margin-left: 20%; }
          100% { width: 0%;  margin-left: 100%; }
        }
        .animate-progress {
          animation: progress 1.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default Processing;