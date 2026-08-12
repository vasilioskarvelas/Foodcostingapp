import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMenuData } from '@/lib/menuData';
import { menuItemMetrics, ingredientCostPerBaseUnit, recipeLineCost, fmtMoney, fmtPct } from '@/lib/calc';
import { FileBarChart, FileSpreadsheet, Mail, Calendar, Download, Loader2, X, Check } from 'lucide-react';
import jsPDF from 'jspdf';

const REPORTS = [
  { id: 'menu_costing', name: 'Full Menu-Costing Report', desc: 'Every item with food cost, margin and profit' },
  { id: 'recipe_cards', name: 'Recipe Cards', desc: 'Per-item ingredient breakdown' },
  { id: 'ingredient_prices', name: 'Ingredient Price List', desc: 'All ingredients with current costs' },
  { id: 'supplier_comparison', name: 'Supplier Price Comparison', desc: 'Ingredients by supplier' },
  { id: 'food_cost', name: 'Food-Cost Report', desc: 'Food cost % per item vs target' },
  { id: 'menu_margin', name: 'Menu Margin Report', desc: 'Gross margin per item' },
  { id: 'engineering', name: 'Menu-Engineering Report', desc: 'Stars, plowhorses, puzzles, dogs' },
  { id: 'allergen_matrix', name: 'Allergen Matrix', desc: 'Items × allergens' },
  { id: 'portion_guide', name: 'Kitchen Portion Guide', desc: 'Portions for kitchen staff' },
  { id: 'price_change', name: 'Price-Change Report', desc: 'Recent ingredient price changes' }
];

function lineName(l, ingredientMap) {
  return l.is_prepared_recipe ? (l.name || 'Prepared recipe') : (ingredientMap[l.ingredient_id]?.name || l.name || '—');
}
function lineCost(l, ingredientMap, preparedRecipeMap, unitMap) {
  return l.is_prepared_recipe
    ? (preparedRecipeMap[l.prepared_recipe_id]?.cost_per_unit || 0) * (Number(l.quantity) || 0)
    : (ingredientMap[l.ingredient_id] ? ingredientCostPerBaseUnit(ingredientMap[l.ingredient_id]) * (Number(l.quantity) || 0) : 0);
}

export default function Reports() {
  const { loading, ingredientMap, preparedRecipeMap, unitMap, business, ingredients } = useMenuData();
  const gstRate = business?.gst_enabled ? business.tax_rate : 0;
  const symbol = business?.currency_symbol || '$';
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [email, setEmail] = useState(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    base44.entities.MenuItem.list('-updated_date', 500).then((r) => setItems(r || [])).catch(() => setItems([]));
    base44.entities.IngredientPriceHistory.list('-changed_date', 200).then((r) => setHistory(r || [])).catch(() => setHistory([]));
    base44.entities.EmailReportSchedule.list('-updated_date', 50).then((r) => setSchedules(r || [])).catch(() => setSchedules([]));
  }, []);

  function buildRows(type) {
    const costed = items.filter((i) => (i.recipe_lines || []).length > 0);
    let cols = [];
    let rows = [];
    if (type === 'menu_costing') {
      cols = ['Item', 'Category', 'Price ex GST', 'Food cost', 'Food cost %', 'Gross profit', 'Margin %', 'Weekly profit'];
      rows = costed.map((i) => {
        const m = menuItemMetrics(i, ingredientMap, preparedRecipeMap, unitMap, gstRate);
        return [i.name, i.category, fmtMoney(m.priceExcl, symbol), fmtMoney(m.foodCost, symbol), fmtPct(m.foodCostPct), fmtMoney(m.grossProfit, symbol), fmtPct(m.grossMarginPct), fmtMoney(m.weeklyProfit, symbol)];
      });
    } else if (type === 'recipe_cards') {
      cols = ['Item', 'Ingredient', 'Qty', 'Unit', 'Cost'];
      rows = [];
      costed.forEach((i) => (i.recipe_lines || []).forEach((l) => {
        rows.push([i.name, lineName(l, ingredientMap), l.quantity, l.unit, fmtMoney(lineCost(l, ingredientMap, preparedRecipeMap, unitMap), symbol)]);
      }));
    } else if (type === 'ingredient_prices') {
      cols = ['Ingredient', 'Category', 'Supplier', 'Pack', 'Price ex GST', 'Cost/unit'];
      rows = (ingredients || []).map((i) => [i.name, i.category, i.supplier, `${i.pack_size} ${i.pack_unit}`, fmtMoney(i.purchase_price_excl_gst, symbol), fmtMoney(ingredientCostPerBaseUnit(i), symbol)]);
    } else if (type === 'supplier_comparison') {
      cols = ['Ingredient', 'Preferred supplier', 'Alternative', 'Price ex GST'];
      rows = (ingredients || []).map((i) => [i.name, i.preferred_supplier || i.supplier, i.alternative_supplier, fmtMoney(i.purchase_price_excl_gst, symbol)]);
    } else if (type === 'food_cost') {
      cols = ['Item', 'Food cost', 'Food cost %', 'Target', 'Status'];
      rows = costed.map((i) => {
        const m = menuItemMetrics(i, ingredientMap, preparedRecipeMap, unitMap, gstRate);
        const diff = m.foodCostPct - m.target;
        return [i.name, fmtMoney(m.foodCost, symbol), fmtPct(m.foodCostPct), fmtPct(m.target), diff <= 2 ? 'Within' : diff <= 7 ? 'Close' : 'Over'];
      });
    } else if (type === 'menu_margin') {
      cols = ['Item', 'Gross profit', 'Margin %', 'Weekly profit'];
      rows = costed.map((i) => {
        const m = menuItemMetrics(i, ingredientMap, preparedRecipeMap, unitMap, gstRate);
        return [i.name, fmtMoney(m.grossProfit, symbol), fmtPct(m.grossMarginPct), fmtMoney(m.weeklyProfit, symbol)];
      });
    } else if (type === 'engineering') {
      cols = ['Item', 'Margin %', 'Sales/wk', 'Class'];
      rows = costed.map((i) => {
        const m = menuItemMetrics(i, ingredientMap, preparedRecipeMap, unitMap, gstRate);
        const prof = m.grossMarginPct >= 60, pop = (i.weekly_sales_estimate || 0) >= 20;
        const c = prof && pop ? 'Star' : !prof && pop ? 'Plowhorse' : prof && !pop ? 'Puzzle' : 'Dog';
        return [i.name, fmtPct(m.grossMarginPct), i.weekly_sales_estimate || 0, c];
      });
    } else if (type === 'allergen_matrix') {
      cols = ['Item', 'Allergens (from ingredients)'];
      rows = costed.map((i) => {
        const allergens = new Set();
        (i.recipe_lines || []).forEach((l) => {
          const ing = ingredientMap[l.ingredient_id];
          if (ing && ing.allergens) ing.allergens.split(',').forEach((a) => allergens.add(a.trim()));
        });
        return [i.name, [...allergens].join(', ') || 'None'];
      });
    } else if (type === 'portion_guide') {
      cols = ['Item', 'Size', 'Ingredient', 'Portion'];
      rows = [];
      costed.forEach((i) => (i.recipe_lines || []).forEach((l) => {
        rows.push([i.name, i.size || '', lineName(l, ingredientMap), `${l.quantity} ${l.unit}`]);
      }));
    } else if (type === 'price_change') {
      cols = ['Ingredient', 'Old price', 'New price', 'Change %', 'Date'];
      rows = history.map((h) => [h.ingredient_name, fmtMoney(h.old_price, symbol), fmtMoney(h.new_price, symbol), fmtPct(h.price_change_pct), h.changed_date ? new Date(h.changed_date).toLocaleDateString() : '']);
    }
    return { cols, rows };
  }

  function downloadCSV(type) {
    const { cols, rows } = buildRows(type);
    const csv = [cols, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${type}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function downloadPDF(type) {
    const { cols, rows } = buildRows(type);
    const doc = new jsPDF({ orientation: 'landscape' });
    const name = REPORTS.find((r) => r.id === type)?.name || type;
    doc.setFontSize(14); doc.text(name, 14, 16);
    doc.setFontSize(9);
    const colW = Math.floor(280 / cols.length);
    cols.forEach((c, i) => doc.text(String(c), 14 + i * colW, 24));
    rows.slice(0, 45).forEach((r, ri) => r.forEach((c, ci) => doc.text(String(c ?? '').slice(0, 22), 14 + ci * colW, 30 + ri * 6)));
    if (rows.length > 45) doc.text(`... ${rows.length - 45} more rows`, 14, 30 + 45 * 6 + 6);
    doc.save(`${type}.pdf`);
  }

  async function sendEmail(type, recipients, subject, message) {
    setSending(true);
    try {
      const { rows } = buildRows(type);
      const reportName = REPORTS.find((r) => r.id === type).name;
      const body = `${message}\n\n${reportName}\n\n${rows.map((r) => r.join(' | ')).join('\n')}`;
      const list = recipients.split(',').map((s) => s.trim()).filter(Boolean);
      for (const to of list) {
        await base44.integrations.Core.SendEmail({ to, subject, body });
      }
      alert(`Sent to ${list.length} recipient(s). Only registered app users can receive email.`);
    } catch (e) {
      alert('Email failed: ' + e.message);
    } finally { setSending(false); setEmail(null); }
  }

  async function addSchedule() {
    const s = await base44.entities.EmailReportSchedule.create({ name: 'New schedule', report_type: 'menu_costing', recipients: '', frequency: 'weekly', day_of_week: 'Monday', active: true });
    setSchedules((p) => [s, ...p]);
  }
  async function saveSchedule(s) {
    setBusy(s.id);
    await base44.entities.EmailReportSchedule.update(s.id, s);
    setBusy(''); alert('Schedule saved. Automated delivery requires enabling a scheduled workflow.');
  }
  async function delSchedule(id) { if (confirm('Delete schedule?')) { await base44.entities.EmailReportSchedule.delete(id); setSchedules((p) => p.filter((x) => x.id !== id)); } }

  return (
    <div className="p-5 md:p-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-neutral-500">Generate, download and email cost reports.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mt-5">
        {REPORTS.map((r) => (
          <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-sm">{r.name}</div>
                <div className="text-xs text-neutral-500 mt-0.5">{r.desc}</div>
              </div>
              <FileBarChart className="w-4 h-4 text-neutral-300" />
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => downloadPDF(r.id)} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100"><FileSpreadsheet className="w-3.5 h-3.5" /> PDF</button>
              <button onClick={() => downloadCSV(r.id)} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><Download className="w-3.5 h-3.5" /> CSV</button>
              <button onClick={() => setEmail({ type: r.id, recipients: '', subject: r.name, message: '' })} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100"><Mail className="w-3.5 h-3.5" /> Email</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Calendar className="w-4 h-4" /> Scheduled reports</h2>
          <button onClick={addSchedule} className="text-sm font-medium text-emerald-700">+ Add schedule</button>
        </div>
        <div className="mt-3 space-y-2">
          {schedules.length === 0 && <p className="text-sm text-neutral-400">No schedules yet.</p>}
          {schedules.map((s) => (
            <div key={s.id} className="rounded-xl border border-neutral-200 bg-white p-3 flex flex-wrap items-center gap-2">
              <input value={s.name} onChange={(e) => setSchedules((p) => p.map((x) => x.id === s.id ? { ...x, name: e.target.value } : x))} className="input py-1.5 w-40" />
              <select value={s.report_type} onChange={(e) => setSchedules((p) => p.map((x) => x.id === s.id ? { ...x, report_type: e.target.value } : x))} className="input py-1.5 w-auto">{REPORTS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <select value={s.frequency} onChange={(e) => setSchedules((p) => p.map((x) => x.id === s.id ? { ...x, frequency: e.target.value } : x))} className="input py-1.5 w-auto"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
              <input value={s.day_of_week || ''} onChange={(e) => setSchedules((p) => p.map((x) => x.id === s.id ? { ...x, day_of_week: e.target.value } : x))} placeholder="Day" className="input py-1.5 w-28" />
              <input value={s.recipients || ''} onChange={(e) => setSchedules((p) => p.map((x) => x.id === s.id ? { ...x, recipients: e.target.value } : x))} placeholder="email(s)" className="input py-1.5 flex-1 min-w-[160px]" />
              <button onClick={() => saveSchedule(s)} disabled={busy === s.id} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-neutral-900 text-white">{busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save</button>
              <button onClick={() => delSchedule(s.id)} className="text-rose-500 text-xs font-medium">Delete</button>
            </div>
          ))}
        </div>
      </div>

      {email && <EmailModal email={email} setEmail={setEmail} sending={sending} onSend={sendEmail} />}
    </div>
  );
}

function EmailModal({ email, setEmail, sending, onSend }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => setEmail(null)} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Email report</h3>
          <button onClick={() => setEmail(null)} className="text-neutral-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <label className="block"><span className="text-xs font-medium text-neutral-500">Recipients (comma-separated, registered users only)</span>
            <input value={email.recipients} onChange={(e) => setEmail({ ...email, recipients: e.target.value })} className="input mt-0.5" placeholder="chef@restaurant.com.au" /></label>
          <label className="block"><span className="text-xs font-medium text-neutral-500">Subject</span>
            <input value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} className="input mt-0.5" /></label>
          <label className="block"><span className="text-xs font-medium text-neutral-500">Message</span>
            <textarea value={email.message} onChange={(e) => setEmail({ ...email, message: e.target.value })} rows={3} className="input mt-0.5" /></label>
          <p className="text-xs text-neutral-400">Report data is included in the email body. Only registered app users can receive email.</p>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setEmail(null)} className="text-sm px-3 py-2 rounded-lg border border-neutral-200">Cancel</button>
          <button onClick={() => onSend(email.type, email.recipients, email.subject, email.message)} disabled={sending} className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-neutral-900 text-white">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send</button>
        </div>
      </div>
    </div>
  );
}