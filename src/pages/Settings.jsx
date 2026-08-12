import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMenuData } from '@/lib/menuData';
import { Plus, Check, Loader2, MapPin, Scale, Users, Trash2 } from 'lucide-react';

const CURRENCIES = [
  { code: 'AUD', symbol: '$' }, { code: 'NZD', symbol: '$' }, { code: 'USD', symbol: '$' }, { code: 'GBP', symbol: '£' }, { code: 'EUR', symbol: '€' }
];

const ROLES = [
  { role: 'Owner', access: 'Full access to everything' },
  { role: 'Manager', access: 'Recipes, ingredients, invoices and reports' },
  { role: 'Kitchen staff', access: 'Recipes and portion guides only' },
  { role: 'Accountant', access: 'Costs, reports and exports' },
  { role: 'Read-only user', access: 'View only' }
];

export default function Settings() {
  const { business, units, reload } = useMenuData();
  const [form, setForm] = useState(null);
  const [locations, setLocations] = useState([]);
  const [saved, setSaved] = useState(false);
  const [newUnit, setNewUnit] = useState({ name: '', type: 'kitchen', base_unit: 'g', base_amount: 1 });

  useEffect(() => {
    if (business) setForm(business);
    base44.entities.Location.list('-updated_date', 50).then((r) => setLocations(r || [])).catch(() => setLocations([]));
  }, [business]);

  async function saveBusiness() {
    if (form.id) {
      await base44.entities.Business.update(form.id, { ...form, onboarded: true });
    } else {
      const created = await base44.entities.Business.create({ ...form, onboarded: true });
      setForm(created);
    }
    setSaved(true); setTimeout(() => setSaved(false), 1500);
    reload();
  }

  async function addLocation() {
    const l = await base44.entities.Location.create({ name: 'New location', business_id: form?.id || '' });
    setLocations((p) => [l, ...p]);
  }
  async function saveLoc(l) { await base44.entities.Location.update(l.id, l); }
  async function delLoc(id) { if (confirm('Delete location?')) { await base44.entities.Location.delete(id); setLocations((p) => p.filter((x) => x.id !== id)); } }

  async function addUnit() {
    if (!newUnit.name) return;
    await base44.entities.IngredientUnit.create({ ...newUnit, name: newUnit.name.toLowerCase(), active: true });
    setNewUnit({ name: '', type: 'kitchen', base_unit: 'g', base_amount: 1 });
    reload();
  }

  if (!form) return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="h-48 bg-neutral-50 rounded-xl animate-pulse" />
    </div>
  );

  return (
    <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-neutral-500">{business?.onboarded ? 'Your business is set up.' : 'Complete onboarding to begin costing menus.'}</p>
      </div>

      {/* Business */}
      <Section icon={<Scale className="w-4 h-4" />} title="Business">
        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2"><span className="text-xs font-medium text-neutral-500">Business name</span>
            <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input mt-0.5" /></label>
          <label className="block"><span className="text-xs font-medium text-neutral-500">Currency</span>
            <select value={form.currency || 'AUD'} onChange={(e) => { const c = CURRENCIES.find((x) => x.code === e.target.value); setForm({ ...form, currency: c.code, currency_symbol: c.symbol }); }} className="input mt-0.5">
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}
            </select></label>
          <label className="block"><span className="text-xs font-medium text-neutral-500">Tax rate</span>
            <div className="flex items-center gap-1 mt-0.5"><input type="number" step="0.01" value={form.tax_rate ?? 0.1} onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })} className="input" /></div></label>
          <label className="flex items-center gap-2 col-span-2 mt-1">
            <input type="checkbox" checked={form.gst_enabled ?? true} onChange={(e) => setForm({ ...form, gst_enabled: e.target.checked })} className="w-4 h-4 rounded" />
            <span className="text-sm">GST enabled (Australian GST defaults to 10%)</span>
          </label>
        </div>
        <div className="flex justify-end items-center gap-2 mt-3">
          {saved && <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>}
          <button onClick={saveBusiness} className="text-sm px-4 py-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800">Save business</button>
        </div>
      </Section>

      {/* Locations */}
      <Section icon={<MapPin className="w-4 h-4" />} title="Locations" action={<button onClick={addLocation} className="text-sm font-medium text-emerald-700 flex items-center gap-1"><Plus className="w-4 h-4" /> Add</button>}>
        {locations.length === 0 ? <p className="text-sm text-neutral-400">No locations yet.</p> : (
          <div className="space-y-2">
            {locations.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2">
                <input value={l.name} onChange={(e) => setLocations((p) => p.map((x) => x.id === l.id ? { ...x, name: e.target.value } : x))} className="input py-1.5 w-40" placeholder="Name" />
                <input value={l.address || ''} onChange={(e) => setLocations((p) => p.map((x) => x.id === l.id ? { ...x, address: e.target.value } : x))} className="input py-1.5 flex-1 min-w-[160px]" placeholder="Address" />
                <button onClick={() => saveLoc(l)} className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-neutral-900 text-white">Save</button>
                <button onClick={() => delLoc(l.id)} className="text-rose-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Units */}
      <Section icon={<Scale className="w-4 h-4" />} title="Custom measurement units">
        <p className="text-xs text-neutral-500 mb-3">Kitchen units (scoop, ladle, handful…) need a gram or millilitre equivalent. Standard units are pre-installed.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block"><span className="text-xs font-medium text-neutral-500">Name</span><input value={newUnit.name} onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })} className="input py-1.5 w-32" placeholder="scoop" /></label>
          <label className="block"><span className="text-xs font-medium text-neutral-500">Type</span>
            <select value={newUnit.type} onChange={(e) => setNewUnit({ ...newUnit, type: e.target.value })} className="input py-1.5"><option value="kitchen">kitchen</option><option value="count">count</option><option value="weight">weight</option><option value="volume">volume</option></select></label>
          <label className="block"><span className="text-xs font-medium text-neutral-500">Base unit</span>
            <select value={newUnit.base_unit} onChange={(e) => setNewUnit({ ...newUnit, base_unit: e.target.value })} className="input py-1.5"><option value="g">g</option><option value="ml">ml</option><option value="each">each</option></select></label>
          <label className="block"><span className="text-xs font-medium text-neutral-500">Equivalent</span><input type="number" value={newUnit.base_amount} onChange={(e) => setNewUnit({ ...newUnit, base_amount: Number(e.target.value) })} className="input py-1.5 w-24" /></label>
          <button onClick={addUnit} className="inline-flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-lg bg-emerald-600 text-white"><Plus className="w-4 h-4" /> Add unit</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(units || []).filter((u) => u.type === 'kitchen' || u.type === 'count').map((u) => (
            <span key={u.id} className="text-xs bg-neutral-100 text-neutral-600 px-2 py-1 rounded-full">{u.name} = {u.base_amount}{u.base_unit}</span>
          ))}
        </div>
      </Section>

      {/* Roles */}
      <Section icon={<Users className="w-4 h-4" />} title="User roles & permissions">
        <p className="text-xs text-neutral-500 mb-3">Invite users from the dashboard Users panel and assign a role. Each business and location keeps its data private and separated.</p>
        <ul className="divide-y divide-neutral-100">
          {ROLES.map((r) => (
            <li key={r.role} className="py-2 flex items-center justify-between">
              <span className="text-sm font-medium">{r.role}</span>
              <span className="text-xs text-neutral-500">{r.access}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ icon, title, action, children }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">{icon} {title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}