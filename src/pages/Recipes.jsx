import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useMenuData } from '@/lib/menuData';
import { recipeLineCost, ingredientCostPerBaseUnit, fmtMoney, fmtPct } from '@/lib/calc';
import { unitOptions } from '@/lib/units';
import { Plus, Search, Loader2, ChefHat, Trash2, X } from 'lucide-react';

export default function Recipes() {
  const { loading, ingredientMap, ingredients, units, business } = useMenuData();
  const symbol = business?.currency_symbol || '$';
  const [recipes, setRecipes] = useState([]);
  const [editing, setEditing] = useState(null);

  useEffect(() => { load(); }, []);
  function load() {
    base44.entities.PreparedRecipe.list('-updated_date', 200).then((r) => setRecipes(r || [])).catch(() => setRecipes([]));
  }

  async function createNew() {
    const r = await base44.entities.PreparedRecipe.create({ name: 'New prepared recipe', ingredients: [], batch_yield: 1000, usable_yield: 900, unit: 'g', wastage_pct: 10, instructions: '', status: 'active' });
    setRecipes((p) => [r, ...p]);
    setEditing(r);
  }

  return (
    <div className="p-5 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prepared Recipes</h1>
          <p className="text-sm text-neutral-500">Sub-recipes like pizza dough, sauces and marinades — reused across menu items.</p>
        </div>
        <button onClick={createNew} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New recipe
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-neutral-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : recipes.length === 0 ? (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-neutral-200 p-12 text-center">
          <ChefHat className="w-8 h-8 text-neutral-300 mx-auto" />
          <p className="mt-3 text-sm text-neutral-500">No prepared recipes yet. Create pizza dough, sauces and marinades to reuse across menu items.</p>
        </div>
      ) : (
        <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {recipes.map((r) => {
            const batchCost = (r.ingredients || []).reduce((s, l) => s + recipeLineCost(l, ingredientMap, {}, {}), 0);
            const cpu = r.usable_yield ? batchCost / r.usable_yield : 0;
            return (
              <button key={r.id} onClick={() => setEditing({ ...r, cost_per_unit: cpu })} className="text-left rounded-xl border border-neutral-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm">
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-neutral-500 mt-1">{(r.ingredients || []).length} ingredients · batch {fmtMoney(batchCost, symbol)}</div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-emerald-700">{fmtMoney(cpu, symbol)}/{r.unit}</span>
                  <span className="text-xs text-neutral-400">Yield {r.usable_yield || 0}{r.unit}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {editing && (
        <RecipeEditor
          recipe={editing}
          data={{ ingredients, units, ingredientMap, business }}
          onClose={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function RecipeEditor({ recipe, data, onClose }) {
  const { ingredients, units, ingredientMap, business } = data;
  const symbol = business?.currency_symbol || '$';
  const [draft, setDraft] = useState(recipe);
  const [saved, setSaved] = useState(false);
  const uOpts = useMemo(() => unitOptions(units), [units]);

  const batchCost = useMemo(() => (draft.ingredients || []).reduce((s, l) => s + recipeLineCost(l, ingredientMap, {}, {}), 0), [draft, ingredientMap]);
  const cpu = draft.usable_yield ? batchCost / draft.usable_yield : 0;

  function update(patch) { setDraft((d) => ({ ...d, ...patch })); }
  function updateLine(i, patch) {
    setDraft((d) => {
      const lines = [...(d.ingredients || [])];
      lines[i] = { ...lines[i], ...patch };
      return { ...d, ingredients: lines };
    });
  }
  function addLine() { setDraft((d) => ({ ...d, ingredients: [...(d.ingredients || []), { ingredient_id: '', unit: 'g', quantity: 0 }] })); }
  function removeLine(i) { setDraft((d) => ({ ...d, ingredients: (d.ingredients || []).filter((_, x) => x !== i) })); }

  async function save() {
    setDraft((d) => ({ ...d, cost_per_unit: cpu }));
    await base44.entities.PreparedRecipe.update(draft.id, { ...draft, cost_per_unit: cpu });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  async function del() {
    if (!confirm('Delete this prepared recipe?')) return;
    await base44.entities.PreparedRecipe.delete(draft.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-5 py-4 flex items-center justify-between">
          <input value={draft.name} onChange={(e) => update({ name: e.target.value })} className="text-lg font-semibold bg-transparent outline-none focus:bg-neutral-50 rounded px-1 -ml-1 flex-1 min-w-0" />
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 ml-3"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-medium text-neutral-500">Batch yield</span>
              <input type="number" value={draft.batch_yield || ''} onChange={(e) => update({ batch_yield: Number(e.target.value) })} className="input mt-0.5" /></label>
            <label className="block"><span className="text-xs font-medium text-neutral-500">Usable yield</span>
              <input type="number" value={draft.usable_yield || ''} onChange={(e) => update({ usable_yield: Number(e.target.value) })} className="input mt-0.5" /></label>
            <label className="block"><span className="text-xs font-medium text-neutral-500">Unit</span>
              <select value={draft.unit || 'g'} onChange={(e) => update({ unit: e.target.value })} className="input mt-0.5">
                {uOpts.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
              </select></label>
            <label className="block"><span className="text-xs font-medium text-neutral-500">Wastage %</span>
              <input type="number" value={draft.wastage_pct || ''} onChange={(e) => update({ wastage_pct: Number(e.target.value) })} className="input mt-0.5" /></label>
          </div>
          <label className="block"><span className="text-xs font-medium text-neutral-500">Instructions</span>
            <textarea value={draft.instructions || ''} onChange={(e) => update({ instructions: e.target.value })} rows={3} className="input mt-0.5" /></label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Batch ingredients</h3>
              <button onClick={addLine} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-neutral-100 text-neutral-700 hover:bg-neutral-200"><Plus className="w-3.5 h-3.5" /> Add</button>
            </div>
            <div className="rounded-xl border border-neutral-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500"><tr><th className="text-left font-medium px-3 py-2">Ingredient</th><th className="text-left font-medium px-2 py-2 w-20">Unit</th><th className="text-right font-medium px-2 py-2 w-20">Qty</th><th className="text-right font-medium px-2 py-2 w-20">Cost</th><th className="w-8"></th></tr></thead>
                <tbody className="divide-y divide-neutral-100">
                  {(draft.ingredients || []).length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-400">No ingredients</td></tr>}
                  {(draft.ingredients || []).map((line, i) => {
                    const cost = recipeLineCost(line, ingredientMap, {}, {});
                    return (
                      <tr key={i}>
                        <td className="px-2 py-1.5">
                          <select value={line.ingredient_id || ''} onChange={(e) => updateLine(i, { ingredient_id: e.target.value })} className="w-full border-0 bg-transparent outline-none focus:bg-neutral-100 rounded px-1 py-1 text-sm">
                            <option value="">Choose…</option>
                            {ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5"><select value={line.unit || 'g'} onChange={(e) => updateLine(i, { unit: e.target.value })} className="w-full border-0 bg-transparent outline-none focus:bg-neutral-100 rounded px-1 py-1 text-sm">{uOpts.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}</select></td>
                        <td className="px-2 py-1.5"><input type="number" step="0.01" value={line.quantity || ''} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} className="w-full text-right border-0 bg-transparent outline-none focus:bg-neutral-100 rounded px-1 py-1 text-sm" /></td>
                        <td className="px-2 py-1.5 text-right text-sm font-medium tabular-nums">{fmtMoney(cost, symbol)}</td>
                        <td className="px-1 py-1.5 text-center"><button onClick={() => removeLine(i)} className="text-neutral-300 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2"><div className="text-xs text-neutral-500">Batch cost</div><div className="text-sm font-semibold">{fmtMoney(batchCost, symbol)}</div></div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2"><div className="text-xs text-emerald-600">Cost / {draft.unit}</div><div className="text-sm font-semibold text-emerald-700">{fmtMoney(cpu, symbol)}</div></div>
            <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2"><div className="text-xs text-neutral-500">Wastage</div><div className="text-sm font-semibold">{fmtPct(draft.wastage_pct || 0)}</div></div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-5 py-3 flex items-center justify-between">
          <button onClick={del} className="text-sm text-rose-600 hover:text-rose-700 font-medium">Delete</button>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
            <button onClick={save} className="text-sm px-4 py-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800">Save recipe</button>
          </div>
        </div>
      </div>
    </div>
  );
}