import { convertToBase, STANDARD_UNITS } from './units';

export const DEFAULT_GST_RATE = 0.10;

export function gstExclusivePrice(priceInclGst, gstRate = DEFAULT_GST_RATE) {
  if (!priceInclGst) return 0;
  return priceInclGst / (1 + gstRate);
}

export function gstInclusivePrice(priceExclGst, gstRate = DEFAULT_GST_RATE) {
  return (priceExclGst || 0) * (1 + gstRate);
}

export function ingredientCostPerBaseUnit(ing, unitMap) {
  if (!ing) return 0;
  const priceExcl = ing.purchase_price_excl_gst || 0;
  if (!priceExcl) return 0;
  const yieldPct = (ing.yield_pct ?? 100) / 100;
  const wastagePct = (ing.wastage_pct ?? 0) / 100;
  const usableFactor = yieldPct * (1 - wastagePct);
  if (!usableFactor) return 0;
  // Convert the pack quantity from its pack unit into the ingredient's base unit
  // (e.g. a 20 kg bag → 20,000 g) before dividing the purchase price.
  const baseQty = convertToBase(Number(ing.pack_size) || 0, ing.pack_unit || 'each', ing.base_unit || 'each', unitMap || STANDARD_UNITS);
  if (!baseQty) return 0;
  return priceExcl / (baseQty * usableFactor);
}

// Recomputes a prepared recipe's cost per unit live from current ingredient prices,
// so price changes cascade to every menu item that uses the sub-recipe.
export function preparedRecipeCostPerUnit(pr, ingredientMap, preparedRecipeMap, unitMap) {
  if (!pr) return 0;
  const batchCost = (pr.ingredients || []).reduce((s, l) => s + recipeLineCost(l, ingredientMap, preparedRecipeMap, unitMap), 0);
  const yieldQty = Number(pr.usable_yield) || Number(pr.batch_yield) || 0;
  if (!yieldQty) return 0;
  return batchCost / yieldQty;
}

export function recipeLineCost(line, ingredientMap, preparedRecipeMap, unitMap) {
  if (!line) return 0;
  const qty = Number(line.quantity) || 0;
  if (line.is_prepared_recipe) {
    const pr = preparedRecipeMap && preparedRecipeMap[line.prepared_recipe_id];
    if (!pr) return 0;
    return preparedRecipeCostPerUnit(pr, ingredientMap, preparedRecipeMap, unitMap) * qty;
  }
  const ing = ingredientMap && ingredientMap[line.ingredient_id];
  if (!ing) return 0;
  const costPerBase = ingredientCostPerBaseUnit(ing, unitMap);
  const baseQty = convertToBase(qty, line.unit, ing.base_unit, unitMap);
  return costPerBase * baseQty;
}

export function totalFoodCost(recipeLines, ingredientMap, preparedRecipeMap, unitMap) {
  return (recipeLines || []).reduce((sum, l) => sum + recipeLineCost(l, ingredientMap, preparedRecipeMap, unitMap), 0);
}

export function sumOptionalCosts(item, foodCost) {
  const waste = item.wastage_pct ? foodCost * (item.wastage_pct / 100) : 0;
  return (
    (Number(item.labour_allowance) || 0) +
    (Number(item.utilities_allowance) || 0) +
    (Number(item.delivery_commission) || 0) +
    (Number(item.loyalty_discount) || 0) +
    (Number(item.promotional_discount) || 0) +
    (Number(item.merchant_fee) || 0) +
    waste
  );
}

export function menuItemMetrics(item, ingredientMap, preparedRecipeMap, unitMap, gstRate = DEFAULT_GST_RATE) {
  const foodCost = totalFoodCost(item.recipe_lines, ingredientMap, preparedRecipeMap, unitMap);
  const packaging = Number(item.packaging_cost) || 0;
  const priceExcl = gstExclusivePrice(item.selling_price_incl_gst, gstRate);
  const optionalCosts = sumOptionalCosts(item, foodCost);
  const totalDirectCost = foodCost + packaging + optionalCosts;
  const foodCostPct = priceExcl ? (foodCost / priceExcl) * 100 : 0;
  const grossProfit = priceExcl - foodCost - packaging;
  const grossMarginPct = priceExcl ? (grossProfit / priceExcl) * 100 : 0;
  const contributionMargin = priceExcl - totalDirectCost;
  const target = Number(item.target_food_cost_pct) || 30;
  const suggestedExcl = target ? foodCost / (target / 100) : 0;
  const suggestedIncl = suggestedExcl * (1 + gstRate);
  const weeklyProfit = grossProfit * (Number(item.weekly_sales_estimate) || 0);
  return { foodCost, packaging, priceExcl, optionalCosts, totalDirectCost, foodCostPct, grossProfit, grossMarginPct, contributionMargin, target, suggestedExcl, suggestedIncl, weeklyProfit };
}

export function priceIncreaseImpact(item, pct, ingredientMap, preparedRecipeMap, unitMap, gstRate) {
  const m = menuItemMetrics(item, ingredientMap, preparedRecipeMap, unitMap, gstRate);
  const newFoodCost = m.foodCost * (1 + pct / 100);
  const newProfit = m.priceExcl - newFoodCost - m.packaging;
  const weeklyDelta = (newProfit - m.grossProfit) * (Number(item.weekly_sales_estimate) || 0);
  return { newFoodCost, newProfit, weeklyDelta, newMarginPct: m.priceExcl ? (newProfit / m.priceExcl) * 100 : 0 };
}

export function portionImpact(item, factor, ingredientMap, preparedRecipeMap, unitMap, gstRate) {
  const scaled = { ...item, recipe_lines: (item.recipe_lines || []).map((l) => ({ ...l, quantity: (Number(l.quantity) || 0) * factor })) };
  return menuItemMetrics(scaled, ingredientMap, preparedRecipeMap, unitMap, gstRate);
}

export function marginStatus(foodCostPct, target) {
  const t = target || 30;
  const diff = foodCostPct - t;
  if (diff <= 2) return 'green';
  if (diff <= 7) return 'amber';
  return 'red';
}

export const STATUS_COLORS = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
  red: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', border: 'border-rose-200' }
};

export function fmtMoney(n, symbol = '$') {
  if (n == null || isNaN(n)) return `${symbol}0.00`;
  return `${symbol}${Number(n).toFixed(2)}`;
}

export function fmtPct(n) {
  if (n == null || isNaN(n)) return '0%';
  return `${Number(n).toFixed(1)}%`;
}