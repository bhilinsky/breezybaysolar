import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { QBWCConfigStatus, QBWCSession, SalesforceStatus } from '../types'

const CLIENT_ID = import.meta.env.VITE_SALESFORCE_CLIENT_ID
const LOGIN_URL = import.meta.env.VITE_SALESFORCE_LOGIN_URL || 'https://login.salesforce.com'
const REDIRECT_URI = import.meta.env.VITE_SALESFORCE_REDIRECT_URI
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const QBWC_SOAP_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/qbwc-soap` : ''

export default function Integrations() {
  const { user } = useAuth()
  const [status, setStatus] = useState<SalesforceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [qbwcStatus, setQbwcStatus] = useState<QBWCConfigStatus | null>(null)
  const [qbwcSessions, setQbwcSessions] = useState<QBWCSession[]>([])
  const [qbwcUsername, setQbwcUsername] = useState('')
  const [qbwcPassword, setQbwcPassword] = useState('')
  const [qbwcSaving, setQbwcSaving] = useState(false)
  const [qbwcError, setQbwcError] = useState<string | null>(null)
  const [qbwcMessage, setQbwcMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [sfRes, qbwcRes, sessionsRes] = await Promise.all([
      supabase.from('salesforce_status').select('*').maybeSingle(),
      supabase.from('qbwc_config_status').select('*').maybeSingle(),
      supabase.from('qbwc_sessions').select('*').order('started_at', { ascending: false }).limit(10),
    ])
    setStatus(sfRes.data ?? { instance_url: null, connected_at: null, last_synced_at: null, connected: false })
    setQbwcStatus(qbwcRes.data ?? null)
    setQbwcSessions(sessionsRes.data ?? [])
    if (qbwcRes.data) setQbwcUsername(qbwcRes.data.username)
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

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <div className="page-header">
        <h1>Integrations</h1>
      </div>

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

      <section className="panel">
        <h2>QuickBooks Desktop</h2>
        <p className="muted">
          QuickBooks Desktop has no REST API — the only way in is Web Connector, a small app QuickBooks ships
          that periodically pulls a config file (.qwc) you generate here, then polls this system for work. Set
          a username/password below (this is what you'll type into Web Connector, not your QuickBooks login),
          download the .qwc file, then in QuickBooks go to File → App Management → Update Web Services and add
          it.
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
    </div>
  )
}
