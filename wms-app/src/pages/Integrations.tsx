import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { SalesforceStatus } from '../types'

const CLIENT_ID = import.meta.env.VITE_SALESFORCE_CLIENT_ID
const LOGIN_URL = import.meta.env.VITE_SALESFORCE_LOGIN_URL || 'https://login.salesforce.com'
const REDIRECT_URI = import.meta.env.VITE_SALESFORCE_REDIRECT_URI

export default function Integrations() {
  const { user } = useAuth()
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
    </div>
  )
}
