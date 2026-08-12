import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { menuItemMetrics, recipeLineCost, fmtMoney, fmtPct, marginStatus, STATUS_COLORS, priceIncreaseImpact } from '@/lib/calc';
import { PIZZA_SIZES, scaleRatio, unitOptions, unitConvertsTo } from '@/lib/units';
import StatusPill, { MarginPill } from '@/components/StatusPill';
import { X, Plus, Sparkles, Copy, Scale, Check, Loader2, Trash2, ChevronDown, AlertTriangle } from 'lucide-react';

export default function MenuItemEditor({ item, data, onClose, onDeleted, onDuplicated }) {
  const { ingredientMap, preparedRecipeMap, unitMap, ingredients, preparedRecipes, units, business, reload } = data;
  const gstRate = business?.gst_enabled ? business.tax_rate : 0;
  const symbol = business?.currency_symbol || '$';
  const [draft, setDraft] = useState(item);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [busy, setBusy] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [showImpact, setShowImpact] = useState(false);
  const [impactPct, setImpactPct] = useState(10);
  const [scaleFactor, setScaleFactor] = useState(1);
  const first = useRef(true);
  const timer = useRef(null);

  const metrics = useMemo(
    () => menuItemMetrics(draft, ingredientMap, preparedRecipeMap, unitMap, gstRate),
    [draft, ingredientMap, preparedRecipeMap, unitMap, gstRate]
  );
  const status = marginStatus(metrics.foodCostPct, metrics.target);
  const uOpts = useMemo(() => unitOptions(units), [units]);

  // Autosave
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaveState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await base44.entities.MenuItem.update(draft.id, draft);
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 1500);
      } catch (e) {
        setSaveState('idle');
      }
    }, 700);
    return () => clearTimeout(timer.current);
  }, [draft]);

  function update(patch) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function updateLine(idx, patch) {
    setDraft((d) => {
      const lines = [...(d.recipe_lines || [])];
      lines[idx] = { ...lines[idx], ...patch };
      return { ...d, recipe_lines: lines };
    });
  }

  function addLine() {
    setDraft((d) => ({
      ...d,
      recipe_lines: [...(d.recipe_lines || []), { ingredient_id: '', name: '', unit: 'g', quantity: 0, is_prepared_recipe: false, status: 'needs_review' }]
    }));
  }

  function removeLine(idx) {
    if (!confirm('Remove this ingredient line?')) return;
    setDraft((d) => ({ ...d, recipe_lines: (d.recipe_lines || []).filter((_, i) => i !== idx) }));
  }

  async function suggestRecipe() {
    setBusy(true);
    try {
      const res = await base44.functions.invoke('suggestIngredients', {
        name: draft.name,
        description: draft.description,
        size: draft.size,
        size_diameter: draft.size_diameter
      });
      const suggested = (res.data.lines || []).map((l) => {
        const match = (ingredients || []).find((i) => i.name.toLowerCase() === l.name.toLowerCase());
        return {
          name: l.name,
          ingredient_id: match ? match.id : '',
          unit: l.unit,
          quantity: l.quantity,
          is_prepared_recipe: false,
          confidence: l.confidence,
          status: 'ai_suggested'
        };
      });
      // Auto-create any unmatched suggested ingredients (at $0) so the recipe
      // costs immediately once prices are added, and they surface in the
      // dashboard "missing prices" counter as a clear to-do.
      const unmatchedNames = Array.from(new Set(
        suggested.filter((l) => !l.ingredient_id).map((l) => l.name).filter(Boolean)
      ));
      const createdByName = {};
      if (unmatchedNames.length) {
        const created = await base44.entities.Ingredient.bulkCreate(
          unmatchedNames.map((name) => ({
            name, base_unit: 'g', pack_size: 1000, pack_unit: 'g',
            yield_pct: 100, wastage_pct: 0, status: 'active',
            purchase_price_excl_gst: 0, purchase_price_incl_gst: 0
          }))
        );
        (created || []).forEach((c) => { createdByName[c.name.toLowerCase()] = c; });
      }
      const finalLines = suggested.map((l) => {
        if (l.ingredient_id) return l;
        const c = createdByName[(l.name || '').toLowerCase()];
        return c ? { ...l, ingredient_id: c.id } : l;
      });
      setDraft((d) => ({ ...d, recipe_lines: finalLines, review_status: 'needs_review' }));
      if (unmatchedNames.length && reload) reload();
    } catch (e) {
      alert('Could not generate suggestions: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  function confirmAllLines() {
    setDraft((d) => ({
      ...d,
      recipe_lines: (d.recipe_lines || []).map((l) => ({ ...l, status: 'confirmed' })),
      review_status: 'confirmed'
    }));
  }

  function applyScale() {
    const fromD = draft.size_diameter || 9;
    const ratio = scaleRatio(fromD, fromD, scaleFactor); // pure factor when same size; or use diameter change
    setDraft((d) => ({
      ...d,
      recipe_lines: (d.recipe_lines || []).map((l) => ({ ...l, quantity: Math.round((Number(l.quantity) || 0) * ratio * 100) / 100 }))
    }));
  }

  function scaleToSize(newSize) {
    const preset = PIZZA_SIZES.find((p) => p.name === newSize);
    const fromD = draft.size_diameter || 9;
    const toD = preset?.diameter || fromD;
    const ratio = scaleRatio(fromD, toD, 0.85);
    setDraft((d) => ({
      ...d,
      size: newSize,
      size_diameter: toD,
      recipe_lines: (d.recipe_lines || []).map((l) => ({ ...l, quantity: Math.round((Number(l.quantity) || 0) * ratio * 100) / 100 }))
    }));
  }

  async function duplicate() {
    try {
      const { id, created_date, updated_date, created_by_id, ...rest } = draft;
      const created = await base44.entities.MenuItem.create({ ...rest, name: `${draft.name} (copy)`, review_status: 'confirmed', source: 'manual' });
      onDuplicated && onDuplicated(created);
      alert('Duplicated as "' + created.name + '".');
    } catch (e) { alert('Duplicate failed: ' + e.message); }
  }

  const impact = priceIncreaseImpact(draft, impactPct, ingredientMap, preparedRecipeMap, unitMap, gstRate);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-5 py-4 z-10">
          <div className="flex items-center justify-between">
            <input
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              className="text-lg font-semibold bg-transparent outline-none focus:bg-neutral-50 rounded px-1 -ml-1 flex-1 min-w-0"
            />
            <div className="flex items-center gap-3 ml-3">
              <SaveBadge state={saveState} />
              <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
            <StatusPill status={draft.review_status} />
            <MarginPill foodCostPct={metrics.foodCostPct} target={metrics.target} />
            <span className="text-neutral-400">{draft.category}</span>
          </div>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* Basic fields */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <input value={draft.category || ''} onChange={(e) => update({ category: e.target.value })} className="input" />
            </Field>
            <Field label="Size">
              <div className="flex gap-2">
                <input value={draft.size || ''} onChange={(e) => update({ size: e.target.value })} className="input" placeholder="Large" />
                <select
                  value=""
                  onChange={(e) => e.target.value && scaleToSize(e.target.value)}
                  className="input w-auto"
                >
                  <option value="">Preset…</option>
                  {PIZZA_SIZES.map((p) => <option key={p.name} value={p.name}>{p.name} ({p.diameter}")</option>)}
                </select>
              </div>
            </Field>
            <Field label="Diameter (in)">
              <input type="number" value={draft.size_diameter || ''} onChange={(e) => update({ size_diameter: Number(e.target.value) })} className="input" />
            </Field>
            <Field label="Selling price (incl. GST)">
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">{symbol}</span>
                <input type="number" step="0.01" value={draft.selling_price_incl_gst || ''} onChange={(e) => update({ selling_price_incl_gst: Number(e.target.value) })} className="input" />
              </div>
            </Field>
            <Field label="Target food cost %">
              <input type="number" value={draft.target_food_cost_pct || ''} onChange={(e) => update({ target_food_cost_pct: Number(e.target.value) })} className="input" />
            </Field>
            <Field label="Weekly sales (est.)">
              <input type="number" value={draft.weekly_sales_estimate || ''} onChange={(e) => update({ weekly_sales_estimate: Number(e.target.value) })} className="input" />
            </Field>
          </div>
          <Field label="Description">
            <textarea value={draft.description || ''} onChange={(e) => update({ description: e.target.value })} rows={2} className="input" />
          </Field>

          {/* Recipe lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Recipe</h3>
              <div className="flex items-center gap-2">
                <button onClick={suggestRecipe} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI suggest
                </button>
                <button onClick={addLine} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-neutral-100 text-neutral-700 hover:bg-neutral-200">
                  <Plus className="w-3.5 h-3.5" /> Add line
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-neutral-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Ingredient / Recipe</th>
                    <th className="text-left font-medium px-2 py-2 w-20">Unit</th>
                    <th className="text-right font-medium px-2 py-2 w-20">Qty</th>
                    <th className="text-right font-medium px-2 py-2 w-20">Cost</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {(draft.recipe_lines || []).length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-400 text-sm">No ingredients yet. Use AI suggest or add a line.</td></tr>
                  )}
                  {(draft.recipe_lines || []).map((line, idx) => {
                    const cost = recipeLineCost(line, ingredientMap, preparedRecipeMap, unitMap);
                    const lineIng = line.ingredient_id ? ingredientMap[line.ingredient_id] : null;
                    const mismatch = lineIng && !line.is_prepared_recipe && line.unit && !unitConvertsTo(line.unit, lineIng.base_unit, unitMap);
                    return (
                      <tr key={idx} className="hover:bg-neutral-50">
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={line.is_prepared_recipe ? 'pr' : 'ing'}
                              onChange={(e) => updateLine(idx, { is_prepared_recipe: e.target.value === 'pr', ingredient_id: '', prepared_recipe_id: '' })}
                              className="text-xs border border-neutral-200 rounded px-1 py-1 bg-neutral-50"
                            >
                              <option value="ing">Ing</option>
                              <option value="pr">Rec</option>
                            </select>
                            {line.is_prepared_recipe ? (
                              <select value={line.prepared_recipe_id || ''} onChange={(e) => updateLine(idx, { prepared_recipe_id: e.target.value })} className="flex-1 min-w-0 border-0 bg-transparent outline-none focus:bg-neutral-100 rounded px-1 py-1 text-sm">
                                <option value="">Choose recipe…</option>
                                {preparedRecipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            ) : (
                              <select value={line.ingredient_id || ''} onChange={(e) => updateLine(idx, { ingredient_id: e.target.value })} className="flex-1 min-w-0 border-0 bg-transparent outline-none focus:bg-neutral-100 rounded px-1 py-1 text-sm">
                                <option value="">{line.name ? `${line.name} (unmatched)` : 'Choose ingredient…'}</option>
                                {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                              </select>
                            )}
                          </div>
                          {line.status === 'ai_suggested' && (
                            <span className="ml-9 text-[10px] text-sky-600 font-medium">AI estimate · confirm</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={line.unit || 'g'} onChange={(e) => updateLine(idx, { unit: e.target.value })} className="w-full border-0 bg-transparent outline-none focus:bg-neutral-100 rounded px-1 py-1 text-sm">
                            {uOpts.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.01" value={line.quantity || ''} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value), status: 'confirmed' })} className="w-full text-right border-0 bg-transparent outline-none focus:bg-neutral-100 rounded px-1 py-1 text-sm" />
                        </td>
                        <td className="px-2 py-1.5 text-right text-sm font-medium tabular-nums">
                          <span className="inline-flex items-center gap-1 justify-end">
                            {mismatch && (
                              <span title="This unit can't be costed against the ingredient's base unit. Set a gram/ml equivalent in Settings → Custom units." className="text-amber-500"><AlertTriangle className="w-3.5 h-3.5" /></span>
                            )}
                            {fmtMoney(cost, symbol)}
                          </span>
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <button onClick={() => removeLine(idx)} className="text-neutral-300 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(draft.recipe_lines || []).some((l) => l.status === 'ai_suggested') && (
              <button onClick={confirmAllLines} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                <Check className="w-3.5 h-3.5" /> Confirm all measurements
              </button>
            )}
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Scale className="w-3.5 h-3.5 text-neutral-400" />
              <span className="text-neutral-500">Scale recipe ×</span>
              <input type="number" step="0.05" value={scaleFactor} onChange={(e) => setScaleFactor(Number(e.target.value))} className="w-16 input py-1" />
              <button onClick={applyScale} className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium">Apply</button>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            <Metric label="Food cost" value={fmtMoney(metrics.foodCost, symbol)} />
            <Metric label="Food cost %" value={fmtPct(metrics.foodCostPct)} tone={status} />
            <Metric label="Gross profit" value={fmtMoney(metrics.grossProfit, symbol)} />
            <Metric label="Gross margin" value={fmtPct(metrics.grossMarginPct)} />
            <Metric label="Price (ex GST)" value={fmtMoney(metrics.priceExcl, symbol)} />
            <Metric label="Weekly profit" value={fmtMoney(metrics.weeklyProfit, symbol)} />
            <Metric label="Suggested (ex GST)" value={fmtMoney(metrics.suggestedExcl, symbol)} tone="green" />
            <Metric label="Suggested (incl GST)" value={fmtMoney(metrics.suggestedIncl, symbol)} tone="green" />
            <Metric label="Total direct cost" value={fmtMoney(metrics.totalDirectCost, symbol)} />
          </div>

          {/* Optional costs */}
          <div className="rounded-xl border border-neutral-200">
            <button onClick={() => setShowOptional(!showOptional)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold">
              <span>Packaging & extra costs</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showOptional ? 'rotate-180' : ''}`} />
            </button>
            {showOptional && (
              <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                <NumField label="Packaging cost" value={draft.packaging_cost} onChange={(v) => update({ packaging_cost: v })} symbol={symbol} />
                <NumField label="Labour allowance" value={draft.labour_allowance} onChange={(v) => update({ labour_allowance: v })} symbol={symbol} />
                <NumField label="Utilities allowance" value={draft.utilities_allowance} onChange={(v) => update({ utilities_allowance: v })} symbol={symbol} />
                <NumField label="Delivery commission" value={draft.delivery_commission} onChange={(v) => update({ delivery_commission: v })} symbol={symbol} />
                <NumField label="Loyalty discount" value={draft.loyalty_discount} onChange={(v) => update({ loyalty_discount: v })} symbol={symbol} />
                <NumField label="Promotional discount" value={draft.promotional_discount} onChange={(v) => update({ promotional_discount: v })} symbol={symbol} />
                <NumField label="Wastage %" value={draft.wastage_pct} onChange={(v) => update({ wastage_pct: v })} />
                <NumField label="Merchant fee" value={draft.merchant_fee} onChange={(v) => update({ merchant_fee: v })} symbol={symbol} />
                <div className="col-span-2 text-xs text-neutral-500">
                  Food cost {fmtMoney(metrics.foodCost, symbol)} + extras {fmtMoney(metrics.optionalCosts, symbol)} = contribution margin {fmtMoney(metrics.contributionMargin, symbol)}
                </div>
              </div>
            )}
          </div>

          {/* Price impact */}
          <div className="rounded-xl border border-neutral-200">
            <button onClick={() => setShowImpact(!showImpact)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold">
              <span>Price & portion impact</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showImpact ? 'rotate-180' : ''}`} />
            </button>
            {showImpact && (
              <div className="px-4 pb-4 space-y-3 text-sm">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-neutral-500">If ingredient prices rise</span>
                    <input type="number" value={impactPct} onChange={(e) => setImpactPct(Number(e.target.value))} className="w-16 input py-1" />
                    <span className="text-neutral-500">%</span>
                  </div>
                  <div className="text-xs text-neutral-600">
                    Food cost → {fmtMoney(impact.newFoodCost, symbol)} · margin → {fmtPct(impact.newMarginPct)} · weekly profit change <span className={impact.weeklyDelta < 0 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}>{fmtMoney(impact.weeklyDelta, symbol)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-5 py-3 flex items-center justify-between">
          <button onClick={() => { if (confirm('Delete this menu item?')) { base44.entities.MenuItem.delete(draft.id); onDeleted && onDeleted(draft.id); onClose(); } }} className="text-sm text-rose-600 hover:text-rose-700 font-medium">Delete</button>
          <div className="flex items-center gap-2">
            <button onClick={duplicate} className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50">
              <Copy className="w-4 h-4" /> Duplicate
            </button>
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveBadge({ state }) {
  if (state === 'saving') return <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>;
  if (state === 'saved') return <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="w-3 h-3" /> Saved</span>;
  return null;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

function NumField({ label, value, onChange, symbol }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <div className="mt-0.5 flex items-center gap-1">
        {symbol && <span className="text-neutral-400 text-sm">{symbol}</span>}
        <input type="number" step="0.01" value={value || ''} onChange={(e) => onChange(Number(e.target.value))} className="input py-1.5" />
      </div>
    </label>
  );
}

function Metric({ label, value, tone }) {
  const c = tone ? STATUS_COLORS[tone] : null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-sm font-semibold ${c ? c.text : 'text-neutral-900'}`}>{value}</div>
    </div>
  );
}