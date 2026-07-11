// Clears the stored Amazon connection — client-side code can't touch
// amazon_connection directly, so disconnecting goes through the service
// role too, same as salesforce-disconnect.
//
// Deploy: supabase functions deploy amazon-disconnect

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (_req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { error } = await supabase
    .from('amazon_connection')
    .update({
      seller_id: null,
      marketplace_id: null,
      refresh_token: null,
      access_token: null,
      token_expires_at: null,
      connected_by: null,
      connected_at: null,
      last_synced_at: null,
    })
    .eq('id', true)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
})
