import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useBusinessProfile } from '../hooks/useBusinessProfile'
import type { AmazonStatus, PartnerApiKeyStatus, PartnerApiScope, QBWCConfigStatus, QBWCSession, SalesforceStatus } from '../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined

function marketplaceGuidance(businessType?: string) {
  if (businessType === 'service' || businessType === 'contractor') {
    return "Marketplace selling usually isn't relevant for service businesses — skip this unless you also sell products."
  }
  if (businessType === 'manufacturer') {
    return "As a manufacturer you may just want the Partner Data API below (so a distributor or storefront can read your stock) rather than selling directly on a marketplace."
  }
  return 'Keeps stock quantities on Amazon in sync with what you actually have on hand.'
}

export default function Integrations() {
  const { businessProfile } = useBusinessProfile()

  return (
    <div>
      <div className="page-header">
        <h1>Integrations</h1>
      </div>
      <SalesforceSection />
      <QuickBooksSection />
      <AmazonSection guidance={marketplaceGuidance(businessProfile?.business_type)} />
      <PartnerApiSection />
    </div>
  )
}

function SalesforceSection() {
  const { user } = useAuth()
  const CLIENT_ID = import.meta.env.VITE_SALESFORCE_CLIENT_ID
  const LOGIN_URL = import.meta.env.VITE_SALESFORCE_LOGIN_URL || 'https://login.salesforce.com'
  const REDIRECT_URI = import.meta.env.VITE_SALESFORCE_REDIRECT_URI

  const [status, setStatus] = useState<SalesforceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('salesforce_status').select('*').maybeSingle()
    setStatus(data ?? { instance_url: null, connected_at: null, last_synced_at: null, connected: false })
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('salesforce')
    if (result === 'connected') setSyncResult('Connected to Salesforce.')
    if (result === 'error') setError('Could not connect to Salesforce — check the Edge Function logs.')
    if (result) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  function connect() {
    if (!CLIENT_ID || !REDIRECT_URI) {
      setError('Set VITE_SALESFORCE_CLIENT_ID and VITE_SALESFORCE_REDIRECT_URI in .env first — see README.')
      return
    }
    const authorizeUrl = new URL(`${LOGIN_URL}/services/oauth2/authorize`)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('client_id', CLIENT_ID)
    authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    authorizeUrl.searchParams.set('scope', 'api refresh_token')
    if (user?.id) authorizeUrl.searchParams.set('state', user.id)
    window.location.href = authorizeUrl.toString()
  }

  async function syncNow() {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    const { data, error: fnError } = await supabase.functions.invoke('salesforce-sync')
    setSyncing(false)
    if (fnError) return setError(fnError.message)
    setSyncResult(`Synced ${data?.synced ?? 0} customer${data?.synced === 1 ? '' : 's'}.`)
    if (data?.errors?.length) setError(`${data.errors.length} failed: ${data.errors.slice(0, 3).join('; ')}`)
    void load()
  }

  async function disconnect() {
    if (!confirm('Disconnect Salesforce? You can reconnect any time.')) return
    const { error: fnError } = await supabase.functions.invoke('salesforce-disconnect')
    if (fnError) return setError(fnError.message)
    void load()
  }

  if (loading) return <section className="panel">Loading…</section>

  return (
    <section className="panel">
      <h2>Salesforce</h2>
      {status?.connected ? (
        <>
          <p>
            Connected to <strong>{status.instance_url}</strong>
            {status.connected_at && <span className="muted"> since {new Date(status.connected_at).toLocaleString()}</span>}
          </p>
          <p className="muted">
            Last synced: {status.last_synced_at ? new Date(status.last_synced_at).toLocaleString() : 'never'}
          </p>
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn-primary" onClick={syncNow} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync customers now'}
            </button>
            <button className="btn-secondary" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Pushes Customers to Salesforce as Contacts, keeping them in sync on every "Sync now". Needs a
            Salesforce Connected App set up first — see the README for the exact steps.
          </p>
          <button className="btn-primary" onClick={connect}>
            Connect to Salesforce
          </button>
        </>
      )}
      {syncResult && <p className="info-text">{syncResult}</p>}
      {error && <p className="error-text">{error}</p>}
    </section>
  )
}

function QuickBooksSection() {
  const QBWC_SOAP_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/qbwc-soap` : ''

  const [qbwcStatus, setQbwcStatus] = useState<QBWCConfigStatus | null>(null)
  const [qbwcSessions, setQbwcSessions] = useState<QBWCSession[]>([])
  const [qbwcUsername, setQbwcUsername] = useState('')
  const [qbwcPassword, setQbwcPassword] = useState('')
  const [qbwcSaving, setQbwcSaving] = useState(false)
  const [qbwcError, setQbwcError] = useState<string | null>(null)
  const [qbwcMessage, setQbwcMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [qbwcRes, sessionsRes] = await Promise.all([
      supabase.from('qbwc_config_status').select('*').maybeSingle(),
      supabase.from('qbwc_sessions').select('*').order('started_at', { ascending: false }).limit(10),
    ])
    setQbwcStatus(qbwcRes.data ?? null)
    setQbwcSessions(sessionsRes.data ?? [])
    if (qbwcRes.data) setQbwcUsername(qbwcRes.data.username)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveQbwcCredentials(e: FormEvent) {
    e.preventDefault()
    setQbwcError(null)
    setQbwcMessage(null)
    if (!qbwcUsername.trim() || !qbwcPassword) return setQbwcError('Username and password are both required.')
    setQbwcSaving(true)
    const { error: rpcError } = await supabase.rpc('set_qbwc_password', {
      p_username: qbwcUsername.trim(),
      p_password: qbwcPassword,
    })
    setQbwcSaving(false)
    if (rpcError) return setQbwcError(rpcError.message)
    setQbwcPassword('')
    setQbwcMessage('Saved. Download the .qwc file below and use this same password when Web Connector asks for it.')
    void load()
  }

  function downloadQwc() {
    if (!qbwcStatus || !QBWC_SOAP_URL) {
      setQbwcError('Set VITE_SUPABASE_URL in .env first.')
      return
    }
    const qwc = `<?xml version="1.0"?>
<QBWCXML>
<AppName>${qbwcStatus.app_name}</AppName>
<AppID></AppID>
<AppURL>${QBWC_SOAP_URL}</AppURL>
<AppDescription>Syncs QuickBooks customers into WMS</AppDescription>
<AppSupport>${SUPABASE_URL}</AppSupport>
<UserName>${qbwcStatus.username}</UserName>
<OwnerID>{${qbwcStatus.owner_id}}</OwnerID>
<FileID>{${qbwcStatus.file_id}}</FileID>
<QBType>QBFS</QBType>
<Scheduler>
<RunEveryNMinutes>60</RunEveryNMinutes>
</Scheduler>
<IsReadOnly>false</IsReadOnly>
</QBWCXML>`
    const blob = new Blob([qwc], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'wms-quickbooks.qwc'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <section className="panel">Loading…</section>

  return (
    <section className="panel">
      <h2>QuickBooks Desktop</h2>
      <p className="muted">
        QuickBooks Desktop has no REST API — the only way in is Web Connector, a small app QuickBooks ships that
        periodically pulls a config file (.qwc) you generate here, then polls this system for work. Set a
        username/password below (this is what you'll type into Web Connector, not your QuickBooks login),
        download the .qwc file, then in QuickBooks go to File → App Management → Update Web Services and add it.
      </p>

      <form onSubmit={saveQbwcCredentials} className="form-row" style={{ alignItems: 'flex-end' }}>
        <label>
          Username
          <input value={qbwcUsername} onChange={(e) => setQbwcUsername(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={qbwcPassword}
            onChange={(e) => setQbwcPassword(e.target.value)}
            placeholder={qbwcStatus?.configured ? '••••••••' : 'set a password'}
          />
        </label>
        <button type="submit" className="btn-secondary" disabled={qbwcSaving}>
          {qbwcSaving ? 'Saving…' : 'Save credentials'}
        </button>
      </form>

      <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: '0.75rem' }}>
        <button className="btn-primary" onClick={downloadQwc} disabled={!qbwcStatus?.configured}>
          Download .qwc file
        </button>
      </div>
      {!qbwcStatus?.configured && (
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          Save credentials first — Web Connector needs a password set before the file is any use.
        </p>
      )}

      {qbwcMessage && <p className="info-text">{qbwcMessage}</p>}
      {qbwcError && <p className="error-text">{qbwcError}</p>}

      {qbwcSessions.length > 0 && (
        <>
          <h3 style={{ fontSize: '0.9rem', margin: '1rem 0 0.5rem' }}>Recent syncs</h3>
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th>Customers synced</th>
              </tr>
            </thead>
            <tbody>
              {qbwcSessions.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.started_at).toLocaleString()}</td>
                  <td>
                    <span
                      className={`badge ${s.status === 'completed' ? 'badge-paid' : s.status === 'error' ? 'badge-cancelled' : 'badge-sent'}`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td>{s.records_synced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

function AmazonSection({ guidance }: { guidance: string }) {
  const { user } = useAuth()
  const APP_ID = import.meta.env.VITE_AMAZON_APP_ID
  const REDIRECT_URI = import.meta.env.VITE_AMAZON_REDIRECT_URI

  const [status, setStatus] = useState<AmazonStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('amazon_status').select('*').maybeSingle()
    setStatus(data ?? { seller_id: null, marketplace_id: null, region: 'na', connected_at: null, last_synced_at: null, connected: false })
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('amazon')
    if (result === 'connected') setSyncResult('Connected to Amazon.')
    if (result === 'error') setError('Could not connect to Amazon — check the Edge Function logs.')
    if (result) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  function connect() {
    if (!APP_ID || !REDIRECT_URI) {
      setError('Set VITE_AMAZON_APP_ID and VITE_AMAZON_REDIRECT_URI in .env first — see README.')
      return
    }
    const authorizeUrl = new URL('https://sellercentral.amazon.com/apps/authorize/consent')
    authorizeUrl.searchParams.set('application_id', APP_ID)
    authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    if (user?.id) authorizeUrl.searchParams.set('state', user.id)
    window.location.href = authorizeUrl.toString()
  }

  async function syncNow() {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    const { data, error: fnError } = await supabase.functions.invoke('amazon-sync')
    setSyncing(false)
    if (fnError) return setError(fnError.message)
    setSyncResult(`Synced ${data?.synced ?? 0} listing${data?.synced === 1 ? '' : 's'}.`)
    if (data?.skipped?.length) setSyncResult((prev) => `${prev} ${data.skipped.length} skipped (missing Amazon fields on the item).`)
    if (data?.errors?.length) setError(`${data.errors.length} failed: ${data.errors.slice(0, 3).join('; ')}`)
    void load()
  }

  async function disconnect() {
    if (!confirm('Disconnect Amazon? You can reconnect any time.')) return
    const { error: fnError } = await supabase.functions.invoke('amazon-disconnect')
    if (fnError) return setError(fnError.message)
    void load()
  }

  if (loading) return <section className="panel">Loading…</section>

  return (
    <section className="panel">
      <h2>Amazon Marketplace</h2>
      <p className="muted">{guidance}</p>
      {status?.connected ? (
        <>
          <p>
            Connected as seller <strong>{status.seller_id}</strong>
            {status.connected_at && <span className="muted"> since {new Date(status.connected_at).toLocaleString()}</span>}
          </p>
          <p className="muted">
            Last synced: {status.last_synced_at ? new Date(status.last_synced_at).toLocaleString() : 'never'}
          </p>
          <p className="muted">
            Only pushes to listings where the item has both an Amazon seller SKU and product type set (Items
            page) — Amazon requires those and there's no safe way to infer them.
          </p>
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn-primary" onClick={syncNow} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync stock quantities now'}
            </button>
            <button className="btn-secondary" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Needs an approved Amazon Seller Central + SP-API developer application first — see the README. This
            keeps stock levels in sync on listings that already exist; it doesn't create new listings.
          </p>
          <button className="btn-primary" onClick={connect}>
            Connect to Amazon
          </button>
        </>
      )}
      {syncResult && <p className="info-text">{syncResult}</p>}
      {error && <p className="error-text">{error}</p>}
    </section>
  )
}

const scopeOptions: { value: PartnerApiScope; label: string }[] = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'customers', label: 'Customers' },
]

function PartnerApiSection() {
  const [keys, setKeys] = useState<PartnerApiKeyStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState('')
  const [scopes, setScopes] = useState<PartnerApiScope[]>(['inventory'])
  const [newKey, setNewKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('partner_api_keys_status').select('*').order('created_at', { ascending: false })
    setKeys(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function toggleScope(scope: PartnerApiScope) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]))
  }

  async function createKey(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNewKey(null)
    if (!label.trim() || scopes.length === 0) return setError('Give it a label and at least one scope.')
    setCreating(true)
    const { data, error: rpcError } = await supabase.rpc('create_partner_api_key', {
      p_label: label.trim(),
      p_scopes: scopes,
    })
    setCreating(false)
    if (rpcError) return setError(rpcError.message)
    setNewKey(data)
    setLabel('')
    setScopes(['inventory'])
    void load()
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this API key? Anything using it will stop working immediately.')) return
    const { error: rpcError } = await supabase.rpc('revoke_partner_api_key', { p_id: id })
    if (rpcError) return setError(rpcError.message)
    void load()
  }

  const inventoryUrl = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/partner-api/inventory` : ''
  const customersUrl = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/partner-api/customers` : ''

  if (loading) return <section className="panel">Loading…</section>

  return (
    <section className="panel">
      <h2>Partner Data API</h2>
      <p className="muted">
        A plain HTTPS + API key endpoint for reading current inventory and/or customers from any outside system —
        something on AWS, a marketplace sync job, a spreadsheet macro, anything with an HTTP client. It doesn't
        need to run on AWS to be reachable from AWS.
      </p>
      <p className="muted" style={{ fontFamily: 'var(--mono, monospace)', fontSize: '0.8rem' }}>
        GET {inventoryUrl || '<set VITE_SUPABASE_URL>/functions/v1/partner-api/inventory'}
        <br />
        GET {customersUrl || '<set VITE_SUPABASE_URL>/functions/v1/partner-api/customers'}
        <br />
        Header: Authorization: Bearer &lt;key&gt;
      </p>

      <form onSubmit={createKey} className="form-row" style={{ alignItems: 'flex-end' }}>
        <label>
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. AWS inventory sync" />
        </label>
        <label>
          Scopes
          <span style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.4rem' }}>
            {scopeOptions.map((opt) => (
              <label key={opt.value} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.3rem' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={scopes.includes(opt.value)}
                  onChange={() => toggleScope(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </span>
        </label>
        <button type="submit" className="btn-primary" disabled={creating}>
          {creating ? 'Creating…' : '+ New key'}
        </button>
      </form>

      {newKey && (
        <div className="scan-result-card" style={{ marginTop: '0.75rem' }}>
          <strong>Copy this now — it won't be shown again:</strong>
          <p style={{ fontFamily: 'var(--mono, monospace)', wordBreak: 'break-all' }}>{newKey}</p>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      <table style={{ marginTop: '1rem' }}>
        <thead>
          <tr>
            <th>Label</th>
            <th>Scopes</th>
            <th>Last used</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} style={{ opacity: k.revoked_at ? 0.5 : 1 }}>
              <td>{k.label}</td>
              <td className="muted">{k.scopes.join(', ')}</td>
              <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'never'}</td>
              <td className="row-actions">
                {!k.revoked_at && (
                  <button className="btn-link danger" onClick={() => revokeKey(k.id)}>
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
          {keys.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No API keys yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
