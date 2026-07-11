// Sends a broadcast to every customer with an email on file, via Resend.
// Runs server-side so RESEND_API_KEY never reaches the browser.
//
// Deploy: supabase functions deploy send-broadcast
// Secrets: supabase secrets set RESEND_API_KEY=... RESEND_FROM="Your Business <updates@yourdomain.com>"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM = Deno.env.get('RESEND_FROM')

Deno.serve(async (req) => {
  try {
    const { broadcastId } = await req.json()
    if (!broadcastId) {
      return new Response(JSON.stringify({ error: 'broadcastId is required' }), { status: 400 })
    }
    if (!RESEND_API_KEY || !RESEND_FROM) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY / RESEND_FROM are not configured on this project' }),
        { status: 500 },
      )
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: broadcast, error: broadcastError } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('id', broadcastId)
      .single()
    if (broadcastError || !broadcast) {
      return new Response(JSON.stringify({ error: 'broadcast not found' }), { status: 404 })
    }

    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('email')
      .not('email', 'is', null)
    if (customersError) {
      return new Response(JSON.stringify({ error: customersError.message }), { status: 500 })
    }

    const recipients = (customers ?? []).map((c) => c.email).filter((email): email is string => Boolean(email))

    if (recipients.length === 0) {
      await supabase
        .from('broadcasts')
        .update({ status: 'failed', error_message: 'No customers with an email on file.' })
        .eq('id', broadcastId)
      return new Response(JSON.stringify({ error: 'No customers with an email on file.' }), { status: 400 })
    }

    await supabase.from('broadcasts').update({ status: 'sending' }).eq('id', broadcastId)

    // BCC the whole list from a single message so recipients never see each other's addresses.
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: RESEND_FROM,
        bcc: recipients,
        subject: broadcast.subject,
        text: broadcast.body,
      }),
    })

    if (!resendRes.ok) {
      const detail = (await resendRes.text()).slice(0, 500)
      await supabase.from('broadcasts').update({ status: 'failed', error_message: detail }).eq('id', broadcastId)
      return new Response(JSON.stringify({ error: detail }), { status: 502 })
    }

    await supabase
      .from('broadcasts')
      .update({ status: 'sent', recipient_count: recipients.length, sent_at: new Date().toISOString() })
      .eq('id', broadcastId)

    return new Response(JSON.stringify({ ok: true, recipient_count: recipients.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'unknown error' }), {
      status: 500,
    })
  }
})
