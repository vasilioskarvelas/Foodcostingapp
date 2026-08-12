import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Suggests ingredients + portion quantities for a menu item based on standard portions.
// Input: { name, description, size, size_diameter }
// Output: { lines: [{name, unit, quantity, confidence}], notes }
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const name = body && body.name;
    if (!name) return Response.json({ error: 'name is required' }, { status: 400 });

    const prompt = `You are a restaurant costing assistant. Suggest the likely ingredients and estimated quantities (light-to-medium portion) for this menu item, based on standard restaurant portion sizes${body.size_diameter ? ' scaled by pizza surface area' : ''}.

Menu item: ${name}
Description: ${body.description || 'n/a'}
Size: ${body.size || 'standard'}${body.size_diameter ? ` (${body.size_diameter} inch)` : ''}

Return JSON with a "lines" array. Each line: { "name": ingredient name, "unit": one of g|kg|ml|l|each|slice|piece|teaspoon|tablespoon|cup|handful|pinch|scoop|ladle, "quantity": number, "confidence": 0-1 }. Quantities are estimates for a light-to-medium portion. Include a "notes" string with any caveats. Respond ONLY with the JSON object.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                unit: { type: 'string' },
                quantity: { type: 'number' },
                confidence: { type: 'number' }
              },
              required: ['name', 'unit', 'quantity']
            }
          },
          notes: { type: 'string' }
        },
        required: ['lines']
      }
    });

    const lines = (result && result.lines) || [];
    return Response.json({
      lines: lines.map((l) => ({
        name: String(l.name || '').trim(),
        unit: (l.unit || 'g').toLowerCase(),
        quantity: Number(l.quantity) || 0,
        confidence: Number(l.confidence) || 0.6,
        is_prepared_recipe: false,
        status: 'ai_suggested'
      })),
      notes: (result && result.notes) || 'AI estimates based on standard portions. Confirm quantities before finalising.'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}