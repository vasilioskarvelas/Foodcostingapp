import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useMenuData } from '@/lib/menuData';
import { menuItemMetrics, fmtMoney, fmtPct } from '@/lib/calc';
import { Star, TrendingUp, Puzzle, Dog } from 'lucide-react';

const QUADS = {
  star: { label: 'Stars', desc: 'Popular & profitable', icon: Star, border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', sub: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  plowhorse: { label: 'Plowhorses', desc: 'Popular, low margin', icon: TrendingUp, border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', sub: 'text-amber-600', badge: 'bg-amber-100 text-amber-700' },
  puzzle: { label: 'Puzzles', desc: 'Profitable, low sales', icon: Puzzle, border: 'border-sky-200', bg: 'bg-sky-50', text: 'text-sky-700', sub: 'text-sky-600', badge: 'bg-sky-100 text-sky-700' },
  dog: { label: 'Dogs', desc: 'Low sales & margin', icon: Dog, border: 'border-rose-200', bg: 'bg-rose-50', text: 'text-rose-700', sub: 'text-rose-600', badge: 'bg-rose-100 text-rose-700' }
};

const ADVICE = {
  star: 'Keep prominent on menu. Train staff to upsell.',
  plowhorse: 'Reduce portion slightly or renegotiate supplier cost to lift margin.',
  puzzle: 'Reposition on menu, feature in promotions, or re-price to drive sales.',
  dog: 'Redesign, replace ingredients, or remove from the menu.'
};

export default function MenuEngineering() {
  const { loading, ingredientMap, preparedRecipeMap, unitMap, business } = useMenuData();
  const gstRate = business?.gst_enabled ? business.tax_rate : 0;
  const symbol = business?.currency_symbol || '$';
  const [items, setItems] = useState([]);

  useEffect(() => { base44.entities.MenuItem.list('-updated_date', 500).then((r) => setItems(r || [])).catch(() => setItems([])); }, []);

  const withMetrics = useMemo(() => items.filter((i) => (i.recipe_lines || []).length > 0).map((i) => ({ item: i, m: menuItemMetrics(i, ingredientMap, preparedRecipeMap, unitMap, gstRate) })), [items, ingredientMap, preparedRecipeMap, unitMap, gstRate]);

  const medMargin = withMetrics.length ? withMetrics.map((x) => x.m.grossMarginPct).sort((a, b) => a - b)[Math.floor(withMetrics.length / 2)] : 60;
  const medSales = withMetrics.length ? withMetrics.map((x) => Number(x.item.weekly_sales_estimate) || 0).sort((a, b) => a - b)[Math.floor(withMetrics.length / 2)] : 20;

  function classify(x) {
    const prof = x.m.grossMarginPct >= medMargin;
    const pop = (Number(x.item.weekly_sales_estimate) || 0) >= medSales;
    if (prof && pop) return 'star';
    if (!prof && pop) return 'plowhorse';
    if (prof && !pop) return 'puzzle';
    return 'dog';
  }

  const groups = useMemo(() => {
    const g = { star: [], plowhorse: [], puzzle: [], dog: [] };
    withMetrics.forEach((x) => g[classify(x)].push(x));
    return g;
  }, [withMetrics]);

  async function setSales(item, val) {
    const v = Number(val) || 0;
    await base44.entities.MenuItem.update(item.id, { weekly_sales_estimate: v });
    setItems((p) => p.map((i) => (i.id === item.id ? { ...i, weekly_sales_estimate: v } : i)));
  }

  if (loading) return <div className="p-8 text-center text-neutral-400">Loading…</div>;

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Menu Engineering</h1>
        <p className="text-sm text-neutral-500">Classified by profitability (margin) and popularity (weekly sales). Thresholds: margin ≥ {fmtPct(medMargin)}, sales ≥ {medSales}/wk.</p>
      </div>

      <div className="grid lg:grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
        {Object.keys(QUADS).map((key) => {
          const q = QUADS[key];
          const Icon = q.icon;
          return (
            <div key={key} className={`rounded-xl border ${q.border} ${q.bg} p-4`}>
              <div className={`flex items-center gap-2 ${q.text}`}>
                <Icon className="w-4 h-4" /><span className="font-semibold text-sm">{q.label}</span>
                <span className="ml-auto text-xs bg-white/60 px-2 py-0.5 rounded-full">{groups[key].length}</span>
              </div>
              <p className={`text-xs ${q.sub} mt-1`}>{q.desc}</p>
              <ul className="mt-3 space-y-1.5">
                {groups[key].length === 0 && <li className="text-xs text-neutral-400">No items</li>}
                {groups[key].map(({ item, m }) => (
                  <li key={item.id} className="bg-white rounded-lg p-2 border border-neutral-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{item.name}</span>
                      <span className="text-xs text-neutral-500">{fmtPct(m.grossMarginPct)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-neutral-400">{fmtMoney(m.weeklyProfit, symbol)}/wk</span>
                      <label className="text-[10px] text-neutral-400">sales
                        <input type="number" value={item.weekly_sales_estimate || 0} onChange={(e) => setSales(item, e.target.value)} className="w-14 ml-1 px-1 py-0.5 text-xs border border-neutral-200 rounded" />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
              <p className={`mt-3 text-[11px] ${q.text} bg-white/60 rounded p-2`}>{ADVICE[key]}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-neutral-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500"><tr><th className="text-left font-medium px-4 py-2">Item</th><th className="text-right font-medium px-2 py-2">Margin</th><th className="text-right font-medium px-2 py-2">Food cost</th><th className="text-right font-medium px-2 py-2">Sales/wk</th><th className="text-right font-medium px-2 py-2">Weekly profit</th><th className="px-2 py-2">Class</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {withMetrics.map(({ item, m }) => {
              const c = classify({ item, m });
              return (
                <tr key={item.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 font-medium">{item.name}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtPct(m.grossMarginPct)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtPct(m.foodCostPct)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{item.weekly_sales_estimate || 0}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(m.weeklyProfit, symbol)}</td>
                  <td className="px-2 py-2"><span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${QUADS[c].badge}`}>{QUADS[c].label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}