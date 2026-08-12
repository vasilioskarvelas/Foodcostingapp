import React from 'react';
import { STATUS_COLORS } from '@/lib/calc';

export default function StatusPill({ status, label }) {
  const map = {
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-rose-100 text-rose-700',
    ai_suggested: 'bg-sky-100 text-sky-700',
    needs_review: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-emerald-100 text-emerald-700',
    missing_info: 'bg-rose-100 text-rose-700',
    active: 'bg-emerald-100 text-emerald-700',
    archived: 'bg-neutral-200 text-neutral-600',
    no_match: 'bg-neutral-200 text-neutral-600'
  };
  const text = label || status;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-neutral-100 text-neutral-600'}`}>
      {text?.replace(/_/g, ' ')}
    </span>
  );
}

export function MarginPill({ foodCostPct, target }) {
  const diff = foodCostPct - (target || 30);
  const status = diff <= 2 ? 'green' : diff <= 7 ? 'amber' : 'red';
  const c = STATUS_COLORS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {Number(foodCostPct).toFixed(1)}% FC
    </span>
  );
}