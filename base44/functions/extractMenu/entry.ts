import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Extracts menu items from an uploaded menu file (PDF/image/Excel/CSV/Word).
// Input: { file_url }
// Output: { items: [{name, category, description, size, size_diameter, selling_price_incl_gst, confidence}] }
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const file_url = body && body.file_url;
    if (!file_url) return Response.json({ error: 'file_url is required' }, { status: 400 });

    const json_schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              category: { type: 'string' },
              description: { type: 'string' },
              size: { type: 'string' },
              size_diameter: { type: 'number' },
              selling_price_incl_gst: { type: 'number' }
            },
            required: ['name']
          }
        }
      },
      required: ['items']
    };

    const result = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema
    });

    const items = (result && result.output && result.output.items) || (Array.isArray(result.output) ? result.output : []) || [];
    const cleaned = items.map((it) => ({
      name: String(it.name || '').trim(),
      category: it.category || 'Uncategorised',
      description: it.description || '',
      size: it.size || '',
      size_diameter: Number(it.size_diameter) || null,
      selling_price_incl_gst: Number(String(it.selling_price_incl_gst).replace(/[^0-9.]/g, '')) || 0,
      confidence: 0.8
    })).filter((it) => it.name);

    return Response.json({ items: cleaned });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}