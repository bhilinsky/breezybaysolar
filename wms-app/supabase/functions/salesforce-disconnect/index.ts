// Clears the stored Salesforce connection. Client-side code can't touch
// salesforce_connection directly (no RLS policy grants it access), so
// disconnecting has to go through a function using the service role too.
//
// Deploy: supabase functions deploy salesforce-disconnect

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (_req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { error } = await supabase
    .from('salesforce_connection')
    .update({
      instance_url: null,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      connected_by: null,
      connected_at: null,
      last_synced_at: null,
    })
    .eq('id', true)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
})
