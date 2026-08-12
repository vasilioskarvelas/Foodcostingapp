import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useMenuData } from '@/lib/menuData';
import { menuItemMetrics, marginStatus, fmtMoney, fmtPct, STATUS_COLORS } from '@/lib/calc';
import StatusPill, { MarginPill } from '@/components/StatusPill';
import { TrendingUp, AlertTriangle, ChefHat, DollarSign, ArrowUpRight, Target } from 'lucide-react';

export default function Dashboard() {
  const { loading, ingredientMap, preparedRecipeMap, unitMap, business, ingredients } = useMenuData();
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const gstRate = business?.gst_enabled ? business.tax_rate : 0;
  const symbol = business?.currency_symbol || '$';

  useEffect(() => {
    base44.entities.MenuItem.list('-updated_date', 500)
      .then((r) => setItems(r || []))
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false));
  }, []);

  if (loading || itemsLoading) return <PageLoader />;

  const costed = items.filter((i) => (i.recipe_lines || []).length > 0);
  const missingRecipe = items.filter((i) => (i.recipe_lines || []).length === 0);
  const missingPrices = costed.filter((i) =>
    (i.recipe_lines || []).some((l) => !l.is_prepared_recipe && l.ingredient_id && !ingredientMap[l.ingredient_id]?.purchase_price_excl_gst)
  );

  const withMetrics = costed.map((i) => ({ item: i, m: menuItemMetrics(i, ingredientMap, preparedRecipeMap, unitMap, gstRate) }));
  const avgFc = withMetrics.length
    ? withMetrics.reduce((s, x) => s + x.m.foodCostPct, 0) / withMetrics.length
    : 0;
  const belowTarget = withMetrics.filter((x) => marginStatus(x.m.foodCostPct, x.m.target) !== 'green');
  const sorted = [...withMetrics].sort((a, b) => b.m.grossMarginPct - a.m.grossMarginPct);
  const highest = sorted.slice(0, 5);
  const lowest = sorted.slice(-5).reverse();
  const weeklyProfit = withMetrics.reduce((s, x) => s + x.m.weeklyProfit, 0);
  const potential = withMetrics.reduce((s, x) => {
    if (!x.m.suggestedExcl) return s;
    const newProfit = x.m.suggestedExcl - x.m.foodCost - x.m.packaging;
    return s + (newProfit - x.m.grossProfit) * (Number(x.item.weekly_sales_estimate) || 0);
  }, 0);
  const priceIncreases = (ingredients || []).filter((i) => i.price_change_pct && i.price_change_pct > 0);
  const affectedItems = costed.filter((i) =>
    (i.recipe_lines || []).some((l) => !l.is_prepared_recipe && priceIncreases.some((p) => p.id === l.ingredient_id))
  );

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto">
      <Header business={business} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <StatCard label="Avg food cost" value={fmtPct(avgFc)} tone={marginStatus(avgFc, 30)} icon={<Target className="w-4 h-4" />} />
        <StatCard label="Costed items" value={costed.length} tone="neutral" icon={<ChefHat className="w-4 h-4" />} />
        <StatCard label="Est. weekly profit" value={fmtMoney(weeklyProfit, symbol)} tone="green" icon={<DollarSign className="w-4 h-4" />} />
        <StatCard label="Potential uplift" value={fmtMoney(potential, symbol)} tone="amber" icon={<TrendingUp className="w-4 h-4" />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <MiniStat label="Missing recipes" value={missingRecipe.length} tone={missingRecipe.length ? 'red' : 'green'} to="/menu" />
        <MiniStat label="Missing prices" value={missingPrices.length} tone={missingPrices.length ? 'amber' : 'green'} to="/ingredients" />
        <MiniStat label="Below target" value={belowTarget.length} tone={belowTarget.length ? 'amber' : 'green'} to="/menu" />
        <MiniStat label="Price increases" value={priceIncreases.length} tone={priceIncreases.length ? 'red' : 'green'} to="/ingredients" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mt-6">
        <Panel title="Highest-margin items">
          <RankList rows={highest.map((x) => ({ name: x.item.name, sub: `${fmtPct(x.m.grossMarginPct)} margin`, value: fmtMoney(x.m.grossProfit, symbol), status: marginStatus(x.m.foodCostPct, x.m.target) }))} />
        </Panel>
        <Panel title="Lowest-margin items">
          <RankList rows={lowest.map((x) => ({ name: x.item.name, sub: `${fmtPct(x.m.grossMarginPct)} margin`, value: fmtMoney(x.m.grossProfit, symbol), status: marginStatus(x.m.foodCostPct, x.m.target) }))} />
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <Panel title="Items affected by supplier price changes">
          {affectedItems.length === 0 ? (
            <Empty text="No items affected by recent price changes." />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {affectedItems.slice(0, 8).map((i) => {
                const m = menuItemMetrics(i, ingredientMap, preparedRecipeMap, unitMap, gstRate);
                return (
                  <li key={i.id} className="py-2.5 flex items-center justify-between">
                    <span className="text-sm font-medium">{i.name}</span>
                    <MarginPill foodCostPct={m.foodCostPct} target={m.target} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="Items below target margin">
          {belowTarget.length === 0 ? (
            <Empty text="All costed items are within target." />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {belowTarget.slice(0, 8).map(({ item, m }) => (
                <li key={item.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{item.name}</div>
                    <div className="text-xs text-neutral-500">Target {fmtPct(m.target)} · now {fmtPct(m.foodCostPct)}</div>
                  </div>
                  <MarginPill foodCostPct={m.foodCostPct} target={m.target} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Header({ business }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-neutral-500">{business?.name ? `${business.name} · ${business.currency || 'AUD'}` : 'Set up your business in Settings to begin.'}</p>
      </div>
      <Link to="/menu" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
        <ChefHat className="w-4 h-4" /> Cost a menu item
      </Link>
    </div>
  );
}

function StatCard({ label, value, tone, icon }) {
  const c = STATUS_COLORS[tone] || { bg: 'bg-neutral-50', text: 'text-neutral-700', border: 'border-neutral-200' };
  return (
    <div className={`rounded-xl border ${c.border || 'border-neutral-200'} ${c.bg} p-4`}>
      <div className={`flex items-center gap-2 text-xs font-medium ${c.text || 'text-neutral-600'}`}>
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

function MiniStat({ label, value, tone, to }) {
  const c = STATUS_COLORS[tone] || { bg: 'bg-neutral-50', text: 'text-neutral-700', dot: 'bg-neutral-400' };
  return (
    <Link to={to} className={`rounded-xl border border-neutral-200 ${c.bg} p-4 hover:shadow-sm transition-shadow`}>
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
        <span className={`text-xs font-medium ${c.text}`}>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold text-neutral-900">{value}</div>
    </Link>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-800 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function RankList({ rows }) {
  if (!rows.length) return <Empty text="No costed items yet." />;
  return (
    <ul className="divide-y divide-neutral-100">
      {rows.map((r, i) => {
        const c = STATUS_COLORS[r.status];
        return (
          <li key={i} className="py-2.5 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{r.name}</div>
              <div className="text-xs text-neutral-500">{r.sub}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{r.value}</span>
              <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ text }) {
  return <div className="py-8 text-center text-sm text-neutral-400">{text}</div>;
}

function PageLoader() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="h-7 w-48 bg-neutral-100 rounded animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-neutral-50 rounded-xl animate-pulse" />)}
      </div>
    </div>
  );
}