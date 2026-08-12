import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Extracts line items from a supplier invoice file.
// Input: { file_url }
// Output: { supplier_name, invoice_date, lines: [{product_name, pack_size, quantity, unit_price, gst, total_price, confidence}], total }
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
        supplier_name: { type: 'string' },
        invoice_date: { type: 'string' },
        total: { type: 'number' },
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_name: { type: 'string' },
              pack_size: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number' },
              gst: { type: 'number' },
              total_price: { type: 'number' }
            },
            required: ['product_name']
          }
        }
      },
      required: ['lines']
    };

    const result = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema
    });

    const out = (result && result.output) || {};
    const lines = (out.lines || []).map((l) => ({
      product_name: String(l.product_name || '').trim(),
      pack_size: l.pack_size || '',
      quantity: Number(l.quantity) || 1,
      unit_price: Number(String(l.unit_price).replace(/[^0-9.]/g, '')) || 0,
      gst: Number(l.gst) || 0,
      total_price: Number(l.total_price) || (Number(l.quantity) || 1) * (Number(l.unit_price) || 0),
      confidence: 0.75
    })).filter((l) => l.product_name);

    return Response.json({
      supplier_name: out.supplier_name || '',
      invoice_date: out.invoice_date || new Date().toISOString(),
      total: Number(out.total) || lines.reduce((s, l) => s + l.total_price, 0),
      lines
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}