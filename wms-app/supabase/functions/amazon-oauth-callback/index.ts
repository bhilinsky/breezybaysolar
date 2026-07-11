// Amazon redirects here after the seller approves the app, with
// ?spapi_oauth_code=...&selling_partner_id=...&state=... in the query
// string. Exchanges that code for LWA tokens via Amazon's OAuth endpoint.
//
// Deploy: supabase functions deploy amazon-oauth-callback --no-verify-jwt
//
// Secrets:
//   supabase secrets set AMAZON_LWA_CLIENT_ID=... AMAZON_LWA_CLIENT_SECRET=... \
//     AMAZON_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/amazon-oauth-callback \
//     AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER \
//     WMS_APP_URL=https://your-deployed-app.example.com
// (AMAZON_MARKETPLACE_ID defaults below to the US marketplace — see
// Amazon's marketplace ID reference for other countries.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LWA_CLIENT_ID = Deno.env.get('AMAZON_LWA_CLIENT_ID')
const LWA_CLIENT_SECRET = Deno.env.get('AMAZON_LWA_CLIENT_SECRET')
const REDIRECT_URI = Deno.env.get('AMAZON_REDIRECT_URI')
const MARKETPLACE_ID = Deno.env.get('AMAZON_MARKETPLACE_ID') || 'ATVPDKIKX0DER'
const APP_URL = Deno.env.get('WMS_APP_URL') || '/'

function redirectTo(path: string) {
  return new Response(null, { status: 302, headers: { Location: `${APP_URL}${path}` } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('spapi_oauth_code')
  const sellingPartnerId = url.searchParams.get('selling_partner_id')
  const state = url.searchParams.get('state')

  if (!code) return redirectTo('/integrations?amazon=error')
  if (!LWA_CLIENT_ID || !LWA_CLIENT_SECRET || !REDIRECT_URI) {
    return new Response('Amazon app credentials are not configured on this project.', { status: 500 })
  }

  try {
    const tokenRes = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: LWA_CLIENT_ID,
        client_secret: LWA_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }),
    })

    if (!tokenRes.ok) {
      console.error('amazon token exchange failed', await tokenRes.text())
      return redirectTo('/integrations?amazon=error')
    }

    const token = await tokenRes.json()
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    await supabase.from('amazon_connection').upsert({
      id: true,
      seller_id: sellingPartnerId,
      marketplace_id: MARKETPLACE_ID,
      refresh_token: token.refresh_token,
      access_token: token.access_token,
      token_expires_at: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
      connected_by: state || null,
      connected_at: new Date().toISOString(),
    })

    return redirectTo('/integrations?amazon=connected')
  } catch (err) {
    console.error('amazon oauth callback error', err)
    return redirectTo('/integrations?amazon=error')
  }
})
