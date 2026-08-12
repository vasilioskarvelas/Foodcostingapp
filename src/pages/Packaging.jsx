import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMenuData } from '@/lib/menuData';
import { fmtMoney } from '@/lib/calc';
import StatusPill from '@/components/StatusPill';
import { Plus, Search, Loader2, Package, X } from 'lucide-react';

export default function Packaging() {
  const { business } = useMenuData();
  const symbol = business?.currency_symbol || '$';
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  function load() { setLoading(true); base44.entities.PackagingItem.list('-updated_date', 200).then((r) => setItems(r || [])).catch(() => setItems([])).finally(() => setLoading(false)); }

  async function createNew() {
    const p = await base44.entities.PackagingItem.create({ name: 'New packaging', unit: 'each', cost_per_unit: 0, status: 'active', category: '' });
    setItems((x) => [p, ...x]); setEditing(p);
  }

  const filtered = items.filter((i) => !query || i.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="p-5 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Packaging</h1>
          <p className="text-sm text-neutral-500">Boxes, containers and disposables — added per menu item.</p>
        </div>
        <button onClick={createNew} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"><Plus className="w-4 h-4" /> Add packaging</button>
      </div>

      <div className="relative mt-5 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-200 text-sm outline-none focus:border-emerald-400" />
      </div>

      {loading ? (
        <div className="py-20 text-center text-neutral-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-neutral-200 p-12 text-center">
          <Package className="w-8 h-8 text-neutral-300 mx-auto" />
          <p className="mt-3 text-sm text-neutral-500">No packaging items yet.</p>
        </div>
      ) : (
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => setEditing(p)} className="text-left rounded-xl border border-neutral-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{p.name}</div>
                <StatusPill status={p.status} />
              </div>
              <div className="text-xs text-neutral-500 mt-1">{p.category || '—'} {p.suitable_sizes ? `· ${p.suitable_sizes}` : ''}</div>
              <div className="mt-2 text-sm font-semibold text-emerald-700">{fmtMoney(p.cost_per_unit, symbol)} / {p.unit}</div>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <PackagingEditor item={editing} symbol={symbol} onClose={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function PackagingEditor({ item, symbol, onClose }) {
  const [d, setD] = useState(item);
  const [saved, setSaved] = useState(false);
  function up(p) { setD((x) => ({ ...x, ...p })); }
  async function save() { await base44.entities.PackagingItem.update(d.id, d); setSaved(true); setTimeout(() => setSaved(false), 1500); }
  async function del() { if (confirm('Delete?')) { await base44.entities.PackagingItem.delete(d.id); onClose(); } }
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-5 py-4 flex items-center justify-between">
          <input value={d.name} onChange={(e) => up({ name: e.target.value })} className="text-lg font-semibold bg-transparent outline-none focus:bg-neutral-50 rounded px-1 -ml-1 flex-1 min-w-0" />
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 ml-3"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3 flex-1">
          {[['Category', 'category'], ['Order type', 'order_type'], ['Suitable sizes', 'suitable_sizes'], ['Unit', 'unit']].map(([l, k]) => (
            <label key={k} className="block"><span className="text-xs font-medium text-neutral-500">{l}</span>
              <input value={d[k] || ''} onChange={(e) => up({ [k]: e.target.value })} className="input mt-0.5" /></label>
          ))}
          <label className="block"><span className="text-xs font-medium text-neutral-500">Cost per unit</span>
            <div className="flex items-center gap-1 mt-0.5">{symbol}<input type="number" step="0.01" value={d.cost_per_unit || ''} onChange={(e) => up({ cost_per_unit: Number(e.target.value) })} className="input" /></div></label>
          <label className="block"><span className="text-xs font-medium text-neutral-500">Status</span>
            <select value={d.status} onChange={(e) => up({ status: e.target.value })} className="input mt-0.5"><option value="active">active</option><option value="archived">archived</option></select></label>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-5 py-3 flex items-center justify-between">
          <button onClick={del} className="text-sm text-rose-600 hover:text-rose-700 font-medium">Delete</button>
          <div className="flex items-center gap-2">{saved && <span className="text-xs text-emerald-600 font-medium">Saved</span>}<button onClick={save} className="text-sm px-4 py-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800">Save</button></div>
        </div>
      </div>
    </div>
  );
}