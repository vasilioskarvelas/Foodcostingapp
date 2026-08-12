import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useMenuData } from '@/lib/menuData';
import { unitOptions } from '@/lib/units';
import { ListChecks, Printer, Loader2, Lock } from 'lucide-react';

export default function PortionGuides() {
  const { loading, ingredientMap, unitMap, units } = useMenuData();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => { base44.entities.MenuItem.list('-updated_date', 500).then((r) => setItems((r || []).filter((i) => (i.recipe_lines || []).length > 0))).catch(() => setItems([])); }, []);
  const uOpts = useMemo(() => unitOptions(units), [units]);
  const filtered = items.filter((i) => !query || i.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kitchen Portion Guides</h1>
          <p className="text-sm text-neutral-500">Exact portions for kitchen staff — no financial information shown.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-neutral-200 text-sm font-medium hover:bg-neutral-50"><Printer className="w-4 h-4" /> Print / PDF</button>
        </div>
      </div>

      <div className="inline-flex items-center gap-1.5 text-xs text-neutral-400 mt-3"><Lock className="w-3.5 h-3.5" /> Financial data is hidden in this view.</div>

      {loading ? (
        <div className="py-20 text-center text-neutral-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-neutral-200 p-12 text-center">
          <ListChecks className="w-8 h-8 text-neutral-300 mx-auto" />
          <p className="mt-3 text-sm text-neutral-500">No recipes to show yet. Cost a menu item first.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-4 print:space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="rounded-xl border border-neutral-200 bg-white p-4 print:border-neutral-300 print:break-inside-avoid">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{item.name}</h3>
                {item.size && <span className="text-xs font-medium text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full">{item.size}{item.size_diameter ? ` · ${item.size_diameter}"` : ''}</span>}
              </div>
              {item.description && <p className="text-xs text-neutral-500 mt-1">{item.description}</p>}
              <table className="w-full text-sm mt-3">
                <thead className="text-xs text-neutral-400"><tr><th className="text-left font-medium pb-1">Ingredient</th><th className="text-left font-medium pb-1">Portion</th><th className="text-left font-medium pb-1">Measure</th></tr></thead>
                <tbody className="divide-y divide-neutral-100">
                  {(item.recipe_lines || []).map((l, i) => {
                    const name = l.is_prepared_recipe ? `Prepared: ${l.name || ''}` : (ingredientMap[l.ingredient_id]?.name || l.name || '—');
                    return (
                      <tr key={i}>
                        <td className="py-1.5 font-medium">{name}</td>
                        <td className="py-1.5">{l.quantity} {l.unit}</td>
                        <td className="py-1.5 text-neutral-500">{uOpts.find((u) => u.name === l.unit)?.type === 'kitchen' ? l.unit : 'scales'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}