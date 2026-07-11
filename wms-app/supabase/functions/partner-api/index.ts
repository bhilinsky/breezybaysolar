// Partner Data API — a plain HTTPS + API key REST endpoint for external
// systems (a marketplace sync job, something on AWS, anything) to read
// current inventory and/or customers. Doesn't need to run on AWS to be
// reachable from AWS: any HTTPS client anywhere can call this.
//
// Deploy: supabase functions deploy partner-api --no-verify-jwt
// (partner systems authenticate with their own API key, not a Supabase
// session — see Authorization header handling below.)
//
// GET /partner-api/inventory  — requires a key with the "inventory" scope
// GET /partner-api/customers  — requires a key with the "customers" scope

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const resource = segments[segments.length - 1]

  const authHeader = req.headers.get('Authorization') || ''
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers.get('X-Api-Key')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing API key (Authorization: Bearer <key>)' }), { status: 401 })
  }

  if (resource !== 'inventory' && resource !== 'customers') {
    return new Response(JSON.stringify({ error: 'Unknown resource — use /inventory or /customers' }), {
      status: 404,
    })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: valid } = await supabase.rpc('verify_partner_api_key', { p_key: apiKey, p_scope: resource })
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid, revoked, or out-of-scope API key' }), { status: 403 })
  }

  if (resource === 'inventory') {
    const [{ data: items }, { data: levels }] = await Promise.all([
      supabase.from('items').select('id, sku, name, barcode, unit, reorder_point'),
      supabase.from('inventory_levels').select('item_id, quantity'),
    ])
    const quantityByItem = new Map<string, number>()
    for (const l of levels ?? []) {
      quantityByItem.set(l.item_id, (quantityByItem.get(l.item_id) ?? 0) + l.quantity)
    }
    const payload = (items ?? []).map((item) => ({
      sku: item.sku,
      name: item.name,
      barcode: item.barcode,
      unit: item.unit,
      quantity_on_hand: quantityByItem.get(item.id) ?? 0,
      reorder_point: item.reorder_point,
    }))
    return new Response(JSON.stringify({ inventory: payload }), { headers: { 'Content-Type': 'application/json' } })
  }

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, contact_name, email, phone, address')
  return new Response(JSON.stringify({ customers: customers ?? [] }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
