'use client';

import Link from 'next/link';

interface BackButtonProps {
  href: string;
  label: string;
  position?: 'left' | 'right';
  className?: string;
}

export default function BackButton({
  href,
  label,
  position = 'left',
  className = 'mb-12',
}: BackButtonProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium transition-colors group ${
        position === 'right' ? 'flex-row-reverse' : ''
      } ${className}`}
    >
      <svg
        className={`w-4 h-4 transition-transform ${
          position === 'right'
            ? 'group-hover:translate-x-1'
            : 'group-hover:-translate-x-1'
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={position === 'right' ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}
        />
      </svg>
      {label}
    </Link>
  );
}
