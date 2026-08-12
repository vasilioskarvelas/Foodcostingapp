import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useMenuData } from '@/lib/menuData';
import { menuItemMetrics, marginStatus, fmtMoney, fmtPct } from '@/lib/calc';
import StatusPill, { MarginPill } from '@/components/StatusPill';
import MenuItemEditor from '@/components/menu/MenuItemEditor';
import { Upload, Plus, Search, Loader2, Check, Sparkles, UtensilsCrossed } from 'lucide-react';

export default function Menu() {
  const data = useMenuData();
  const { ingredientMap, preparedRecipeMap, unitMap, business, loading } = data;
  const gstRate = business?.gst_enabled ? business.tax_rate : 0;
  const symbol = business?.currency_symbol || '$';
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('all');
  const [stat, setStat] = useState('all');

  useEffect(() => { loadItems(); }, []);

  function loadItems() {
    setItemsLoading(true);
    base44.entities.MenuItem.list('-updated_date', 500)
      .then((r) => setItems(r || []))
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false));
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.functions.invoke('extractMenu', { file_url: up.file_url });
      const extracted = res.data.items || [];
      if (!extracted.length) { alert('No menu items found in the file.'); return; }
      const created = await base44.entities.MenuItem.bulkCreate(
        extracted.map((it) => ({
          name: it.name,
          category: it.category || 'Uncategorised',
          description: it.description || '',
          size: it.size || '',
          size_diameter: it.size_diameter || null,
          selling_price_incl_gst: it.selling_price_incl_gst || 0,
          target_food_cost_pct: 30,
          weekly_sales_estimate: 0,
          recipe_lines: [],
          review_status: 'ai_suggested',
          source: 'ai_suggested',
          confidence: it.confidence
        }))
      );
      setItems((prev) => [...(created || []), ...prev]);
      alert(`Imported ${extracted.length} menu items. Review and confirm each one.`);
    } catch (e) {
      alert('Upload failed: ' + e.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function addBlank() {
    const created = await base44.entities.MenuItem.create({ name: 'New menu item', category: 'Uncategorised', selling_price_incl_gst: 0, target_food_cost_pct: 30, recipe_lines: [], review_status: 'confirmed', source: 'manual' });
    setItems((p) => [created, ...p]);
    setEditing(created);
  }

  async function confirmItem(id) {
    await base44.entities.MenuItem.update(id, { review_status: 'confirmed' });
    setItems((p) => p.map((i) => (i.id === id ? { ...i, review_status: 'confirmed' } : i)));
  }

  const categories = useMemo(() => ['all', ...Array.from(new Set(items.map((i) => i.category).filter(Boolean)))], [items]);

  const filtered = useMemo(() => items.filter((i) => {
    if (cat !== 'all' && i.category !== cat) return false;
    if (stat !== 'all' && i.review_status !== stat) return false;
    if (query && !i.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [items, cat, stat, query]);

  const aiCount = items.filter((i) => i.review_status === 'ai_suggested').length;

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
          <p className="text-sm text-neutral-500">{items.length} items · {aiCount} awaiting review</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 cursor-pointer">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Extracting…' : 'Upload menu'}
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          <button onClick={addBlank} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-neutral-200 text-sm font-medium hover:bg-neutral-50">
            <Plus className="w-4 h-4" /> Add item
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-200 text-sm outline-none focus:border-emerald-400" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="px-3 py-2 rounded-lg border border-neutral-200 text-sm">
          {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}
        </select>
        <select value={stat} onChange={(e) => setStat(e.target.value)} className="px-3 py-2 rounded-lg border border-neutral-200 text-sm">
          <option value="all">All statuses</option>
          <option value="ai_suggested">AI suggested</option>
          <option value="needs_review">Needs review</option>
          <option value="confirmed">Confirmed</option>
          <option value="missing_info">Missing info</option>
        </select>
      </div>

      {itemsLoading || loading ? (
        <div className="py-20 text-center text-neutral-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <EmptyMenu onUpload={() => document.querySelector('input[type=file]')?.click()} onAdd={addBlank} />
      ) : (
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item) => {
            const m = menuItemMetrics(item, ingredientMap, preparedRecipeMap, unitMap, gstRate);
            const hasRecipe = (item.recipe_lines || []).length > 0;
            return (
              <button key={item.id} onClick={() => setEditing(item)} className="text-left rounded-xl border border-neutral-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{item.name}</div>
                    <div className="text-xs text-neutral-500">{item.category} {item.size ? `· ${item.size}` : ''}</div>
                  </div>
                  <span className="text-sm font-semibold whitespace-nowrap">{fmtMoney(item.selling_price_incl_gst, symbol)}</span>
                </div>
                <p className="text-xs text-neutral-500 mt-2 line-clamp-2 min-h-[2rem]">{item.description || 'No description'}</p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <StatusPill status={item.review_status} />
                  {hasRecipe ? (
                    <MarginPill foodCostPct={m.foodCostPct} target={m.target} />
                  ) : (
                    <span className="text-xs text-amber-600 font-medium">No recipe</span>
                  )}
                </div>
                {item.review_status === 'ai_suggested' && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span onClick={(e) => { e.stopPropagation(); confirmItem(item.id); }} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md hover:bg-emerald-100">
                      <Check className="w-3 h-3" /> Confirm
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {editing && (
        <MenuItemEditor
          item={editing}
          data={data}
          onClose={() => { setEditing(null); loadItems(); }}
          onDeleted={(id) => setItems((p) => p.filter((i) => i.id !== id))}
          onDuplicated={() => loadItems()}
        />
      )}
    </div>
  );
}

function EmptyMenu({ onUpload, onAdd }) {
  return (
    <div className="mt-6 rounded-2xl border-2 border-dashed border-neutral-200 p-12 text-center">
      <div className="w-12 h-12 rounded-full bg-emerald-50 mx-auto flex items-center justify-center">
        <UtensilsCrossed className="w-6 h-6 text-emerald-600" />
      </div>
      <h3 className="mt-4 font-semibold text-lg">Start by uploading your menu</h3>
      <p className="text-sm text-neutral-500 mt-1 max-w-md mx-auto">Upload a PDF, image, Excel or CSV of your menu. AI extracts every item, size and price into an editable database.</p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <button onClick={onUpload} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
          <Upload className="w-4 h-4" /> Upload menu
        </button>
        <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-neutral-200 text-sm font-medium hover:bg-neutral-50">
          <Plus className="w-4 h-4" /> Add manually
        </button>
      </div>
    </div>
  );
}