// Salesforce redirects here after the user approves the Connected App,
// with ?code=... in the query string. Exchanges that code for tokens and
// stores them — this is the only place SALESFORCE_CLIENT_SECRET is used.
//
// Deploy: supabase functions deploy salesforce-oauth-callback --no-verify-jwt
// (--no-verify-jwt because Salesforce calls this directly, with no Supabase
// auth header — the "state" param below is what ties the callback back to
// a signed-in WMS user instead.)
//
// Secrets:
//   supabase secrets set SALESFORCE_CLIENT_ID=... SALESFORCE_CLIENT_SECRET=... \
//     SALESFORCE_LOGIN_URL=https://login.salesforce.com \
//     SALESFORCE_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/salesforce-oauth-callback \
//     WMS_APP_URL=https://your-deployed-app.example.com

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('SALESFORCE_CLIENT_ID')
const CLIENT_SECRET = Deno.env.get('SALESFORCE_CLIENT_SECRET')
const LOGIN_URL = Deno.env.get('SALESFORCE_LOGIN_URL') || 'https://login.salesforce.com'
const REDIRECT_URI = Deno.env.get('SALESFORCE_REDIRECT_URI')
const APP_URL = Deno.env.get('WMS_APP_URL') || '/'

function redirectTo(path: string) {
  return new Response(null, { status: 302, headers: { Location: `${APP_URL}${path}` } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code) return redirectTo('/integrations?salesforce=error')
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return new Response('Salesforce Connected App is not configured on this project.', { status: 500 })
  }

  try {
    const tokenRes = await fetch(`${LOGIN_URL}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }),
    })

    if (!tokenRes.ok) {
      console.error('salesforce token exchange failed', await tokenRes.text())
      return redirectTo('/integrations?salesforce=error')
    }

    const token = await tokenRes.json()
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    await supabase
      .from('salesforce_connection')
      .upsert({
        id: true,
        instance_url: token.instance_url,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_expires_at: token.issued_at ? new Date(Number(token.issued_at) + 2 * 60 * 60 * 1000).toISOString() : null,
        connected_by: state || null,
        connected_at: new Date().toISOString(),
      })

    return redirectTo('/integrations?salesforce=connected')
  } catch (err) {
    console.error('salesforce oauth callback error', err)
    return redirectTo('/integrations?salesforce=error')
  }
})
