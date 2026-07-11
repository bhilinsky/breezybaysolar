// Pushes customers to Salesforce as Contacts — creates new ones, updates
// ones already synced (tracked via customers.salesforce_contact_id).
// Refreshes the access token first if it's expired.
//
// Deploy: supabase functions deploy salesforce-sync
// Invoke from the client: supabase.functions.invoke('salesforce-sync')
//
// Next step, not built yet: syncing sales_orders as Opportunities — same
// pattern as below, just a different SObject and field mapping.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('SALESFORCE_CLIENT_ID')
const CLIENT_SECRET = Deno.env.get('SALESFORCE_CLIENT_SECRET')
const LOGIN_URL = Deno.env.get('SALESFORCE_LOGIN_URL') || 'https://login.salesforce.com'
const API_VERSION = 'v59.0'

async function refreshToken(refreshToken: string) {
  const res = await fetch(`${LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID || '',
      client_secret: CLIENT_SECRET || '',
    }),
  })
  if (!res.ok) throw new Error(`token refresh failed: ${await res.text()}`)
  return res.json()
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: conn, error: connError } = await supabase
      .from('salesforce_connection')
      .select('*')
      .eq('id', true)
      .maybeSingle()
    if (connError || !conn || !conn.access_token) {
      return new Response(JSON.stringify({ error: 'Salesforce is not connected.' }), { status: 400 })
    }

    let accessToken = conn.access_token as string
    let instanceUrl = conn.instance_url as string

    const expired = conn.token_expires_at && new Date(conn.token_expires_at) < new Date()
    if (expired && conn.refresh_token) {
      const refreshed = await refreshToken(conn.refresh_token)
      accessToken = refreshed.access_token
      instanceUrl = refreshed.instance_url || instanceUrl
      await supabase
        .from('salesforce_connection')
        .update({
          access_token: accessToken,
          instance_url: instanceUrl,
          token_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', true)
    }

    const { data: customers, error: customersError } = await supabase.from('customers').select('*')
    if (customersError) {
      return new Response(JSON.stringify({ error: customersError.message }), { status: 500 })
    }

    let synced = 0
    const errors: string[] = []

    for (const customer of customers ?? []) {
      const body = {
        LastName: customer.name,
        Email: customer.email || undefined,
        Phone: customer.phone || undefined,
        MailingStreet: customer.address || undefined,
      }

      try {
        if (customer.salesforce_contact_id) {
          const res = await fetch(
            `${instanceUrl}/services/data/${API_VERSION}/sobjects/Contact/${customer.salesforce_contact_id}`,
            {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            },
          )
          if (!res.ok && res.status !== 204) throw new Error(await res.text())
        } else {
          const res = await fetch(`${instanceUrl}/services/data/${API_VERSION}/sobjects/Contact`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (!res.ok) throw new Error(await res.text())
          const created = await res.json()
          await supabase.from('customers').update({ salesforce_contact_id: created.id }).eq('id', customer.id)
        }
        synced++
      } catch (err) {
        errors.push(`${customer.name}: ${err instanceof Error ? err.message : 'unknown error'}`)
      }
    }

    await supabase.from('salesforce_connection').update({ last_synced_at: new Date().toISOString() }).eq('id', true)

    return new Response(JSON.stringify({ synced, errors }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'unknown error' }), {
      status: 500,
    })
  }
})
