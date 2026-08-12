// Unit registry, conversions and pizza surface-area scaling (frontend copy).

export const STANDARD_UNITS = {
  g: { base: 'g', factor: 1, type: 'weight' },
  kg: { base: 'g', factor: 1000, type: 'weight' },
  ml: { base: 'ml', factor: 1, type: 'volume' },
  l: { base: 'ml', factor: 1000, type: 'volume' },
  each: { base: 'each', factor: 1, type: 'count' },
  slice: { base: 'each', factor: 1, type: 'count' },
  piece: { base: 'each', factor: 1, type: 'count' },
  portion: { base: 'each', factor: 1, type: 'count' },
  teaspoon: { base: 'ml', factor: 5, type: 'kitchen' },
  tablespoon: { base: 'ml', factor: 15, type: 'kitchen' },
  cup: { base: 'ml', factor: 250, type: 'kitchen' },
  handful: { base: 'each', factor: 1, type: 'kitchen' },
  pinch: { base: 'each', factor: 1, type: 'kitchen' },
  scoop: { base: 'each', factor: 1, type: 'kitchen' },
  ladle: { base: 'each', factor: 1, type: 'kitchen' },
  pump: { base: 'each', factor: 1, type: 'kitchen' },
  batch: { base: 'each', factor: 1, type: 'count' },
  tray: { base: 'each', factor: 1, type: 'count' },
  box: { base: 'each', factor: 1, type: 'count' },
  carton: { base: 'each', factor: 1, type: 'count' },
  bag: { base: 'each', factor: 1, type: 'count' },
  bottle: { base: 'each', factor: 1, type: 'count' },
  can: { base: 'each', factor: 1, type: 'count' },
  tub: { base: 'each', factor: 1, type: 'count' },
  packet: { base: 'each', factor: 1, type: 'count' }
};

export const PIZZA_SIZES = [
  { name: 'Small', diameter: 9 },
  { name: 'Large', diameter: 13 },
  { name: 'Family', diameter: 15 }
];

export function pizzaArea(diameter) {
  return Math.PI * Math.pow(diameter / 2, 2);
}

export function scaleRatio(fromDiameter, toDiameter, factor = 1) {
  if (!fromDiameter || !toDiameter) return 1;
  const baseRatio = pizzaArea(toDiameter) / pizzaArea(fromDiameter);
  return 1 + (baseRatio - 1) * factor;
}

export function buildUnitMap(customUnits = []) {
  const map = { ...STANDARD_UNITS };
  (customUnits || []).forEach((u) => {
    if (u && u.name && u.base_amount) {
      map[u.name.toLowerCase()] = { base: u.base_unit || 'each', factor: u.base_amount, type: u.type || 'kitchen' };
    }
  });
  return map;
}

export function unitOptions(customUnits = []) {
  const map = buildUnitMap(customUnits);
  return Object.keys(map).map((k) => ({ name: k, ...map[k] }));
}

export function convertToBase(quantity, unit, ingredientBaseUnit, unitMap) {
  if (quantity == null) return 0;
  const u = unitMap[(unit || '').toLowerCase()];
  if (!u) return quantity;
  let baseQty = quantity * (u.factor || 1);
  if (u.base === ingredientBaseUnit) return baseQty;
  if ((u.base === 'ml' && ingredientBaseUnit === 'g') || (u.base === 'g' && ingredientBaseUnit === 'ml')) {
    return baseQty;
  }
  return quantity;
}