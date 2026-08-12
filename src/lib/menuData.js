import { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { buildUnitMap } from './units';

// Loads the shared catalog data used by calculations across pages.
export function useMenuData() {
  const [data, setData] = useState({
    loading: true,
    ingredients: [],
    preparedRecipes: [],
    units: [],
    business: null,
    ingredientMap: {},
    preparedRecipeMap: {},
    unitMap: {},
    error: null
  });

  const load = useCallback(async () => {
    try {
      const [ingredients, preparedRecipes, units, businesses] = await Promise.all([
        base44.entities.Ingredient.list('-updated_date', 500),
        base44.entities.PreparedRecipe.list('-updated_date', 200),
        base44.entities.IngredientUnit.list('-updated_date', 200),
        base44.entities.Business.list('-updated_date', 10)
      ]);
      const ingredientMap = {};
      (ingredients || []).forEach((i) => { ingredientMap[i.id] = i; });
      const preparedRecipeMap = {};
      (preparedRecipes || []).forEach((p) => { preparedRecipeMap[p.id] = p; });
      const unitMap = buildUnitMap(units || []);
      setData({
        loading: false,
        ingredients: ingredients || [],
        preparedRecipes: preparedRecipes || [],
        units: units || [],
        business: (businesses && businesses[0]) || null,
        ingredientMap,
        preparedRecipeMap,
        unitMap,
        error: null
      });
    } catch (e) {
      setData((d) => ({ ...d, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...data, reload: load };
}

export function useToastSafe() {
  return useState(null);
}