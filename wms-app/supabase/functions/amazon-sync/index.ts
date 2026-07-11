// Pushes current stock quantity to Amazon listings via the Listings Items
// API — only for items that already have amazon_seller_sku AND
// amazon_product_type set (see the Items page). Both are required by
// Amazon's API and category-specific, so there's no safe way to infer
// them automatically; items missing either are skipped and reported back.
//
// Deploy: supabase functions deploy amazon-sync

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LWA_CLIENT_ID = Deno.env.get('AMAZON_LWA_CLIENT_ID')
const LWA_CLIENT_SECRET = Deno.env.get('AMAZON_LWA_CLIENT_SECRET')
const SP_API_BASE_URL = Deno.env.get('AMAZON_SP_API_BASE_URL') || 'https://sellingpartnerapi-na.amazon.com'

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: LWA_CLIENT_ID || '',
      client_secret: LWA_CLIENT_SECRET || '',
    }),
  })
  if (!res.ok) throw new Error(`token refresh failed: ${await res.text()}`)
  return res.json()
}

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: conn } = await supabase.from('amazon_connection').select('*').eq('id', true).maybeSingle()
    if (!conn || !conn.access_token || !conn.seller_id) {
      return new Response(JSON.stringify({ error: 'Amazon is not connected.' }), { status: 400 })
    }

    let accessToken = conn.access_token as string
    const expired = conn.token_expires_at && new Date(conn.token_expires_at) < new Date()
    if (expired && conn.refresh_token) {
      const refreshed = await refreshAccessToken(conn.refresh_token)
      accessToken = refreshed.access_token
      await supabase
        .from('amazon_connection')
        .update({
          access_token: accessToken,
          token_expires_at: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString(),
        })
        .eq('id', true)
    }

    const [{ data: items }, { data: levels }] = await Promise.all([
      supabase.from('items').select('*').not('amazon_seller_sku', 'is', null),
      supabase.from('inventory_levels').select('item_id, quantity'),
    ])

    const quantityByItem = new Map<string, number>()
    for (const l of levels ?? []) {
      quantityByItem.set(l.item_id, (quantityByItem.get(l.item_id) ?? 0) + l.quantity)
    }

    let synced = 0
    const skipped: string[] = []
    const errors: string[] = []

    for (const item of items ?? []) {
      if (!item.amazon_product_type) {
        skipped.push(`${item.sku}: no amazon_product_type set`)
        continue
      }
      const quantity = quantityByItem.get(item.id) ?? 0
      const endpoint = `${SP_API_BASE_URL}/listings/2021-08-01/items/${conn.seller_id}/${encodeURIComponent(item.amazon_seller_sku)}?marketplaceIds=${conn.marketplace_id}`

      try {
        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productType: item.amazon_product_type,
            patches: [
              {
                op: 'replace',
                path: '/attributes/fulfillment_availability',
                value: [{ fulfillment_channel_code: 'DEFAULT', quantity }],
              },
            ],
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        synced++
      } catch (err) {
        errors.push(`${item.sku}: ${err instanceof Error ? err.message : 'unknown error'}`)
      }
    }

    await supabase.from('amazon_connection').update({ last_synced_at: new Date().toISOString() }).eq('id', true)

    return new Response(JSON.stringify({ synced, skipped, errors }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'unknown error' }), {
      status: 500,
    })
  }
})
