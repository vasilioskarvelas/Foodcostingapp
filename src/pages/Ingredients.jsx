import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useMenuData } from '@/lib/menuData';
import { ingredientCostPerBaseUnit, fmtMoney, fmtPct } from '@/lib/calc';
import { unitOptions, STANDARD_UNITS } from '@/lib/units';
import StatusPill from '@/components/StatusPill';
import { Plus, Search, Loader2, Carrot, X, TrendingUp } from 'lucide-react';

const BASE_UNITS = ['g', 'ml', 'each'];

export default function Ingredients() {
  const { loading, business, units } = useMenuData();
  const symbol = business?.currency_symbol || '$';
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('all');
  const [editing, setEditing] = useState(null);

  useEffect(() => { load(); }, []);
  function load() { base44.entities.Ingredient.list('-updated_date', 500).then((r) => setItems(r || [])).catch(() => setItems([])); }

  async function createNew() {
    const ing = await base44.entities.Ingredient.create({ name: 'New ingredient', base_unit: 'g', pack_size: 1000, pack_unit: 'g', yield_pct: 100, wastage_pct: 0, status: 'active', purchase_price_excl_gst: 0, purchase_price_incl_gst: 0 });
    setItems((p) => [ing, ...p]);
    setEditing(ing);
  }

  const categories = useMemo(() => ['all', ...Array.from(new Set(items.map((i) => i.category).filter(Boolean)))], [items]);
  const filtered = useMemo(() => items.filter((i) => {
    if (cat !== 'all' && i.category !== cat) return false;
    if (query && !i.name.toLowerCase().includes(query.toLowerCase()) && !(i.supplier || '').toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [items, cat, query]);

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ingredients</h1>
          <p className="text-sm text-neutral-500">{items.length} ingredients in your database</p>
        </div>
        <button onClick={createNew} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"><Plus className="w-4 h-4" /> Add ingredient</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ingredients or suppliers…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-200 text-sm outline-none focus:border-emerald-400" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="px-3 py-2 rounded-lg border border-neutral-200 text-sm">{categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}</select>
      </div>

      {loading ? (
        <div className="py-20 text-center text-neutral-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-neutral-200 p-12 text-center">
          <Carrot className="w-8 h-8 text-neutral-300 mx-auto" />
          <p className="mt-3 text-sm text-neutral-500">No ingredients yet. Add ingredients with purchase prices to start costing recipes.</p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Ingredient</th>
                <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Category</th>
                <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Supplier</th>
                <th className="text-right font-medium px-3 py-2.5 hidden sm:table-cell">Pack</th>
                <th className="text-right font-medium px-3 py-2.5">Price ex GST</th>
                <th className="text-right font-medium px-3 py-2.5">Cost/unit</th>
                <th className="text-right font-medium px-3 py-2.5 hidden md:table-cell">Δ</th>
                <th className="px-3 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((i) => {
                const cpu = ingredientCostPerBaseUnit(i);
                return (
                  <tr key={i.id} className="hover:bg-neutral-50 cursor-pointer" onClick={() => setEditing(i)}>
                    <td className="px-4 py-2.5"><div className="font-medium">{i.name}</div><div className="text-xs text-neutral-400">{i.allergens || ''}</div></td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-neutral-600">{i.category || '—'}</td>
                    <td className="px-3 py-2.5 hidden lg:table-cell text-neutral-600">{i.supplier || '—'}</td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-right text-neutral-600">{i.pack_size} {i.pack_unit}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(i.purchase_price_excl_gst, symbol)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{fmtMoney(cpu, symbol)}/{i.base_unit}</td>
                    <td className="px-3 py-2.5 text-right hidden md:table-cell">
                      {i.price_change_pct > 0 ? <span className="inline-flex items-center gap-1 text-rose-600 text-xs font-medium"><TrendingUp className="w-3 h-3" />{fmtPct(i.price_change_pct)}</span> : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right"><StatusPill status={i.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <IngredientEditor ingredient={editing} data={{ business, units }} onClose={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function IngredientEditor({ ingredient, data, onClose }) {
  const { business, units } = data;
  const symbol = business?.currency_symbol || '$';
  const [d, setD] = useState(ingredient);
  const [saved, setSaved] = useState(false);
  const uOpts = useMemo(() => unitOptions(units), [units]);
  const packUnitOpts = Object.keys(STANDARD_UNITS);
  const cpu = ingredientCostPerBaseUnit(d);

  function up(patch) { setD((x) => ({ ...x, ...patch })); }
  async function save() {
    const priceExcl = Number(d.purchase_price_excl_gst) || 0;
    const prev = ingredient.purchase_price_excl_gst || 0;
    const patch = { ...d, cost_per_base_unit: cpu, last_price_update: new Date().toISOString() };
    if (prev && priceExcl && priceExcl !== prev) {
      patch.previous_price = prev;
      patch.price_change_pct = ((priceExcl - prev) / prev) * 100;
      await base44.entities.IngredientPriceHistory.create({
        ingredient_id: d.id, ingredient_name: d.name, old_price: prev, new_price: priceExcl,
        price_change_pct: ((priceExcl - prev) / prev) * 100, changed_date: new Date().toISOString(), source: 'manual'
      });
    }
    await base44.entities.Ingredient.update(d.id, patch);
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  }
  async function del() { if (confirm('Delete this ingredient?')) { await base44.entities.Ingredient.delete(d.id); onClose(); } }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-5 py-4 flex items-center justify-between">
          <input value={d.name} onChange={(e) => up({ name: e.target.value })} className="text-lg font-semibold bg-transparent outline-none focus:bg-neutral-50 rounded px-1 -ml-1 flex-1 min-w-0" />
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 ml-3"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <L label="Category"><input value={d.category || ''} onChange={(e) => up({ category: e.target.value })} className="input" /></L>
            <L label="Base unit"><select value={d.base_unit || 'g'} onChange={(e) => up({ base_unit: e.target.value })} className="input">{BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></L>
            <L label="Supplier"><input value={d.supplier || ''} onChange={(e) => up({ supplier: e.target.value })} className="input" /></L>
            <L label="Supplier product name"><input value={d.supplier_product_name || ''} onChange={(e) => up({ supplier_product_name: e.target.value })} className="input" /></L>
            <L label="Pack size"><input type="number" value={d.pack_size || ''} onChange={(e) => up({ pack_size: Number(e.target.value) })} className="input" /></L>
            <L label="Pack unit"><select value={d.pack_unit || 'g'} onChange={(e) => up({ pack_unit: e.target.value })} className="input">{packUnitOpts.map((u) => <option key={u} value={u}>{u}</option>)}</select></L>
            <L label="Purchase price (ex GST)"><div className="flex items-center gap-1">{symbol}<input type="number" step="0.01" value={d.purchase_price_excl_gst || ''} onChange={(e) => up({ purchase_price_excl_gst: Number(e.target.value) })} className="input" /></div></L>
            <L label="Purchase price (incl GST)"><div className="flex items-center gap-1">{symbol}<input type="number" step="0.01" value={d.purchase_price_incl_gst || ''} onChange={(e) => up({ purchase_price_incl_gst: Number(e.target.value) })} className="input" /></div></L>
            <L label="Preparation yield %"><input type="number" value={d.yield_pct ?? 100} onChange={(e) => up({ yield_pct: Number(e.target.value) })} className="input" /></L>
            <L label="Wastage %"><input type="number" value={d.wastage_pct ?? 0} onChange={(e) => up({ wastage_pct: Number(e.target.value) })} className="input" /></L>
            <L label="Allergens"><input value={d.allergens || ''} onChange={(e) => up({ allergens: e.target.value })} className="input" /></L>
            <L label="Storage notes"><input value={d.storage_notes || ''} onChange={(e) => up({ storage_notes: e.target.value })} className="input" /></L>
            <L label="Preferred supplier"><input value={d.preferred_supplier || ''} onChange={(e) => up({ preferred_supplier: e.target.value })} className="input" /></L>
            <L label="Alternative supplier"><input value={d.alternative_supplier || ''} onChange={(e) => up({ alternative_supplier: e.target.value })} className="input" /></L>
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-emerald-700 font-medium">Usable cost per {d.base_unit}</span>
            <span className="text-lg font-bold text-emerald-700">{fmtMoney(cpu, symbol)}</span>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={del} className="text-sm text-rose-600 hover:text-rose-700 font-medium">Delete</button>
          </div>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
            <button onClick={save} className="text-sm px-4 py-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800">Save ingredient</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function L({ label, children }) {
  return <label className="block"><span className="text-xs font-medium text-neutral-500">{label}</span><div className="mt-0.5">{children}</div></label>;
}