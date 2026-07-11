// QuickBooks Web Connector (QBWC) SOAP endpoint. QBWC has no JSON/REST
// option — it's a fixed SOAP 1.1 interface, unchanged for years, so this
// hand-rolls request/response XML rather than pulling in a SOAP toolkit
// that doesn't exist for Deno. The interface QBWC calls, in order:
//   authenticate -> sendRequestXML -> receiveResponseXML (repeat until
//   100% done) -> closeConnection. getLastError/connectionError are called
//   on failure instead.
//
// Deploy: supabase functions deploy qbwc-soap --no-verify-jwt
// (QuickBooks Desktop can't send a Supabase auth header — the
// username/password QBWC sends via `authenticate` is what's checked.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/'
const APP_NS = 'http://developer.intuit.com/'

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? match[1] : null
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const blocks: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) blocks.push(m[1])
  return blocks
}

function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function soapResponse(method: string, resultTag: string, resultValue: string, isArray = false) {
  const inner = isArray
    ? `<${resultTag}><string>${xmlEscape(resultValue)}</string><string></string></${resultTag}>`
    : `<${resultTag}>${xmlEscape(resultValue)}</${resultTag}>`
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="${SOAP_NS}">
<soap:Body>
<${method}Response xmlns="${APP_NS}">
${inner}
</${method}Response>
</soap:Body>
</soap:Envelope>`
  return new Response(body, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}

function customerQueryRequest() {
  return `<?xml version="1.0"?>
<?qbxml version="13.0"?>
<QBXML>
<QBXMLMsgsRq onError="stopOnError">
<CustomerQueryRq requestID="1">
<MaxReturned>200</MaxReturned>
</CustomerQueryRq>
</QBXMLMsgsRq>
</QBXML>`
}

function parseCustomerResponse(qbxml: string) {
  return extractAllBlocks(qbxml, 'CustomerRet').map((block) => {
    const addrParts = ['Addr1', 'City', 'State', 'PostalCode']
      .map((t) => extractTag(block, t))
      .filter(Boolean)
    return {
      quickbooks_list_id: extractTag(block, 'ListID'),
      name: extractTag(block, 'FullName') || extractTag(block, 'Name') || 'Unnamed customer',
      email: extractTag(block, 'Email'),
      phone: extractTag(block, 'Phone'),
      address: addrParts.length ? addrParts.join(', ') : null,
    }
  })
}

Deno.serve(async (req) => {
  const body = await req.text()
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  if (body.includes('<serverVersion')) {
    return soapResponse('serverVersion', 'serverVersionResult', '1.0')
  }

  if (body.includes('<clientVersion')) {
    return soapResponse('clientVersion', 'clientVersionResult', '')
  }

  if (body.includes('<authenticate')) {
    const username = extractTag(body, 'strUserName') ?? ''
    const password = extractTag(body, 'strPassword') ?? ''
    const { data: valid } = await supabase.rpc('verify_qbwc_password', { p_username: username, p_password: password })

    if (!valid) {
      return soapResponse('authenticate', 'authenticateResult', 'nvu', true)
    }

    const { data: session } = await supabase
      .from('qbwc_sessions')
      .insert({ username, step: 'customers', status: 'active' })
      .select('id')
      .single()

    return soapResponse('authenticate', 'authenticateResult', session?.id ?? '', true)
  }

  if (body.includes('<sendRequestXML')) {
    const ticket = extractTag(body, 'ticket') ?? ''
    const { data: session } = await supabase.from('qbwc_sessions').select('*').eq('id', ticket).maybeSingle()

    if (!session || session.step === 'done' || session.request_sent) {
      return soapResponse('sendRequestXML', 'sendRequestXMLResult', '')
    }

    await supabase.from('qbwc_sessions').update({ request_sent: true }).eq('id', ticket)
    return soapResponse('sendRequestXML', 'sendRequestXMLResult', customerQueryRequest())
  }

  if (body.includes('<receiveResponseXML')) {
    const ticket = extractTag(body, 'ticket') ?? ''
    const response = extractTag(body, 'response') ?? ''

    const customers = parseCustomerResponse(response)
    let synced = 0
    for (const c of customers) {
      if (!c.quickbooks_list_id) continue
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('quickbooks_list_id', c.quickbooks_list_id)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('customers')
          .update({ name: c.name, email: c.email, phone: c.phone, address: c.address })
          .eq('id', existing.id)
      } else {
        await supabase.from('customers').insert(c)
      }
      synced++
    }

    await supabase
      .from('qbwc_sessions')
      .update({ step: 'done', status: 'completed', records_synced: synced, completed_at: new Date().toISOString() })
      .eq('id', ticket)

    return soapResponse('receiveResponseXML', 'receiveResponseXMLResult', '100')
  }

  if (body.includes('<getLastError')) {
    const ticket = extractTag(body, 'ticket') ?? ''
    const { data: session } = await supabase.from('qbwc_sessions').select('error_message').eq('id', ticket).maybeSingle()
    return soapResponse('getLastError', 'getLastErrorResult', session?.error_message ?? '')
  }

  if (body.includes('<connectionError')) {
    const ticket = extractTag(body, 'ticket') ?? ''
    const message = extractTag(body, 'message') ?? 'connection error'
    await supabase.from('qbwc_sessions').update({ status: 'error', error_message: message }).eq('id', ticket)
    return soapResponse('connectionError', 'connectionErrorResult', 'done')
  }

  if (body.includes('<closeConnection')) {
    return soapResponse('closeConnection', 'closeConnectionResult', 'Sync complete.')
  }

  return new Response('Unknown SOAP method', { status: 400 })
})
