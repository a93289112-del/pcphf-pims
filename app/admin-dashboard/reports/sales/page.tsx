'use client';

import BackButton from '@/lib/components/back-button';

export default function SalesReports() {

  return (
    <div className="min-h-screen transition-all duration-300 bg-slate-50/70 ml-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <BackButton href="/admin-dashboard" label="Back to Dashboard" />
        <h1 className="text-4xl font-black tracking-tight text-slate-900 mt-4 mb-2">Sales Analytics Reports</h1>
        <p className="text-slate-500 mb-8">Analyze revenue and sales performance metrics</p>
        
        <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-100 text-center">
          <div className="text-5xl mb-4">📈</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">No Reports Available</h2>
          <p className="text-slate-500 max-w-md mx-auto">Sales data is currently being collected. Detailed reports will be generated once enough data is available.</p>
        </div>
      </div>
    </div>
  );
}
