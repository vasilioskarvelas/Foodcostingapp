import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMenuData } from '@/lib/menuData';
import { ingredientCostPerBaseUnit, fmtMoney, fmtPct } from '@/lib/calc';
import StatusPill from '@/components/StatusPill';
import { Upload, Loader2, Check, Receipt, AlertTriangle, X } from 'lucide-react';

export default function SupplierInvoices() {
  const { ingredients, ingredientMap, business } = useMenuData();
  const symbol = business?.currency_symbol || '$';
  const [invoices, setInvoices] = useState([]);
  const [lines, setLines] = useState([]);
  const [activeInvoice, setActiveInvoice] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => { load(); }, []);
  function load() {
    base44.entities.SupplierInvoice.list('-created_date', 100).then((r) => setInvoices(r || [])).catch(() => setInvoices([]));
  }
  function loadLines(invoiceId) {
    base44.entities.SupplierInvoiceLine.filter({ invoice_id: invoiceId }).then((r) => { setLines(r || []); setActiveInvoice(invoiceId); }).catch(() => setLines([]));
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.functions.invoke('extractInvoice', { file_url: up.file_url });
      const data = res.data;
      const inv = await base44.entities.SupplierInvoice.create({
        supplier_name: data.supplier_name || 'Unknown supplier',
        invoice_date: data.invoice_date || new Date().toISOString(),
        total: data.total || 0,
        status: 'needs_review',
        confidence: 0.75
      });
      const createdLines = await base44.entities.SupplierInvoiceLine.bulkCreate(
        (data.lines || []).map((l) => {
          const match = (ingredients || []).find((i) => i.name.toLowerCase() === l.product_name.toLowerCase() || i.supplier_product_name?.toLowerCase() === l.product_name.toLowerCase());
          return {
            invoice_id: inv.id,
            product_name: l.product_name,
            pack_size: l.pack_size,
            quantity: l.quantity,
            unit_price: l.unit_price,
            gst: l.gst,
            total_price: l.total_price,
            matched_ingredient_id: match ? match.id : '',
            matched_ingredient_name: match ? match.name : '',
            match_status: match ? 'ai_suggested' : 'needs_review',
            confidence: l.confidence
          };
        })
      );
      setInvoices((p) => [inv, ...p]);
      setLines(createdLines || []);
      setActiveInvoice(inv.id);
    } catch (e2) {
      alert('Invoice upload failed: ' + e2.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function updateLine(idx, patch) {
    setLines((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function saveLine(idx) {
    const l = lines[idx];
    await base44.entities.SupplierInvoiceLine.update(l.id, { matched_ingredient_id: l.matched_ingredient_id, match_status: l.match_status });
  }

  async function applyPrices() {
    if (!confirm('Apply confirmed invoice prices to matched ingredients? This updates ingredient prices and recalculates affected menu items.')) return;
    setApplying(true);
    try {
      const affected = [];
      for (const l of lines) {
        if (l.match_status === 'confirmed' && l.matched_ingredient_id) {
          const ing = ingredientMap[l.matched_ingredient_id];
          if (!ing) continue;
          const oldPrice = ing.purchase_price_excl_gst || 0;
          const newPrice = l.unit_price || 0;
          if (!newPrice || newPrice === oldPrice) continue;
          await base44.entities.Ingredient.update(ing.id, {
            purchase_price_excl_gst: newPrice,
            purchase_price_incl_gst: newPrice * (1 + (business?.gst_enabled ? business.tax_rate : 0)),
            previous_price: oldPrice,
            price_change_pct: oldPrice ? ((newPrice - oldPrice) / oldPrice) * 100 : 0,
            last_price_update: new Date().toISOString(),
            supplier: invoices.find((i) => i.id === activeInvoice)?.supplier_name || ing.supplier
          });
          await base44.entities.IngredientPriceHistory.create({
            ingredient_id: ing.id, ingredient_name: ing.name, old_price: oldPrice, new_price: newPrice,
            price_change_pct: oldPrice ? ((newPrice - oldPrice) / oldPrice) * 100 : 0, changed_date: new Date().toISOString(), source: 'invoice'
          });
          if (!affected.includes(ing.id)) affected.push(ing.id);
        }
      }
      await base44.entities.SupplierInvoice.update(activeInvoice, { status: 'confirmed' });
      alert(`Prices updated for ${affected.length} ingredients. Menu items using them are recalculated on the Dashboard & Menu pages.`);
      load();
      if (activeInvoice) loadLines(activeInvoice);
    } catch (e) {
      alert('Apply failed: ' + e.message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Supplier Invoices</h1>
          <p className="text-sm text-neutral-500">Upload invoices to update ingredient prices automatically.</p>
        </div>
        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 cursor-pointer">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Extracting…' : 'Upload invoice'}
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.csv" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <div className="lg:col-span-1 space-y-2">
          {invoices.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-neutral-200 p-10 text-center">
              <Receipt className="w-7 h-7 text-neutral-300 mx-auto" />
              <p className="mt-3 text-sm text-neutral-500">No invoices yet.</p>
            </div>
          ) : invoices.map((inv) => (
            <button key={inv.id} onClick={() => loadLines(inv.id)} className={`w-full text-left rounded-xl border p-4 ${activeInvoice === inv.id ? 'border-emerald-400 bg-emerald-50' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{inv.supplier_name}</span>
                <StatusPill status={inv.status} />
              </div>
              <div className="text-xs text-neutral-500 mt-1">{new Date(inv.invoice_date).toLocaleDateString()} · {fmtMoney(inv.total, symbol)}</div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2">
          {!activeInvoice ? (
            <div className="rounded-2xl border-2 border-dashed border-neutral-200 p-12 text-center text-sm text-neutral-400">Select an invoice to review matched ingredients.</div>
          ) : (
            <div className="rounded-xl border border-neutral-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50">
                <h3 className="text-sm font-semibold">Invoice lines</h3>
                <button onClick={applyPrices} disabled={applying} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50">
                  {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Apply confirmed prices
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs text-neutral-500"><tr><th className="text-left font-medium px-3 py-2">Product</th><th className="text-left font-medium px-3 py-2 hidden md:table-cell">Pack</th><th className="text-right font-medium px-2 py-2">Qty</th><th className="text-right font-medium px-2 py-2">Unit price</th><th className="text-left font-medium px-3 py-2">Match</th><th className="px-2 py-2 w-24"></th></tr></thead>
                  <tbody className="divide-y divide-neutral-100">
                    {lines.map((l, idx) => {
                      const ing = ingredientMap[l.matched_ingredient_id];
                      const priceUp = ing && l.unit_price && ing.purchase_price_excl_gst && l.unit_price > ing.purchase_price_excl_gst;
                      return (
                        <tr key={l.id}>
                          <td className="px-3 py-2 font-medium">{l.product_name}{priceUp && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline ml-1" />}</td>
                          <td className="px-3 py-2 hidden md:table-cell text-neutral-600">{l.pack_size}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{l.quantity}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(l.unit_price, symbol)}</td>
                          <td className="px-2 py-2">
                            <select value={l.matched_ingredient_id || ''} onChange={(e) => updateLine(idx, { matched_ingredient_id: e.target.value, match_status: e.target.value ? 'confirmed' : 'needs_review' })} onBlur={() => saveLine(idx)} className="w-full text-sm border border-neutral-200 rounded px-1.5 py-1">
                              <option value="">No match</option>
                              {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-2 text-center"><StatusPill status={l.match_status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2 text-xs text-neutral-400">Set each match to confirm, then "Apply confirmed prices" to update ingredients and recalculate menu items.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}