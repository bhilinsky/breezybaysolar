import { useState, type FormEvent } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getStoredSupabaseConfig, setStoredSupabaseConfig } from '../lib/supabaseConfig'
import migration0001 from '../../supabase/migrations/0001_init.sql?raw'
import migration0002 from '../../supabase/migrations/0002_crm_contractors_shipping.sql?raw'

const setupSql = `${migration0001}\n\n${migration0002}`

export default function Setup() {
  const existing = getStoredSupabaseConfig()
  const [url, setUrl] = useState(existing?.url ?? '')
  const [anonKey, setAnonKey] = useState(existing?.anonKey ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [copied, setCopied] = useState(false)

  const checkSchema = async (trimmedUrl: string, trimmedKey: string) => {
    const probe = createClient(trimmedUrl, trimmedKey)
    const { error: schemaError } = await probe.from('items').select('id').limit(1)
    return !schemaError || !/does not exist/i.test(schemaError.message)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedUrl = url.trim().replace(/\/+$/, '')
    const trimmedKey = anonKey.trim()
    if (!/^https?:\/\/.+/.test(trimmedUrl)) {
      setError('Project URL should look like https://your-project.supabase.co')
      return
    }
    if (trimmedKey.length < 20) {
      setError("That doesn't look like a full anon key — check you copied the whole thing.")
      return
    }

    setBusy(true)
    try {
      const res = await fetch(`${trimmedUrl}/auth/v1/health`, { headers: { apikey: trimmedKey } })
      if (!res.ok) {
        setError("Couldn't reach that Supabase project with this key. Double-check both values.")
        return
      }
    } catch {
      setError("Couldn't reach that URL. Check your internet connection and the Project URL.")
      return
    } finally {
      setBusy(false)
    }

    const schemaReady = await checkSchema(trimmedUrl, trimmedKey)
    if (!schemaReady) {
      setNeedsMigration(true)
      return
    }

    setStoredSupabaseConfig({ url: trimmedUrl, anonKey: trimmedKey })
    window.location.href = '/'
  }

  const recheckSchema = async () => {
    const trimmedUrl = url.trim().replace(/\/+$/, '')
    const trimmedKey = anonKey.trim()
    setBusy(true)
    const schemaReady = await checkSchema(trimmedUrl, trimmedKey)
    setBusy(false)
    if (!schemaReady) {
      setError("Still can't find the app's tables — make sure you ran the whole script above with no errors.")
      return
    }
    setStoredSupabaseConfig({ url: trimmedUrl, anonKey: trimmedKey })
    window.location.href = '/'
  }

  const copySql = async () => {
    await navigator.clipboard.writeText(setupSql)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (needsMigration) {
    return (
      <div className="auth-screen">
        <div className="auth-card" style={{ width: 640 }}>
          <div className="brand auth-brand">
            <span className="brand-mark">BB</span>
            <div>
              <div className="brand-name">Breezy Bay</div>
              <div className="brand-sub">WMS</div>
            </div>
          </div>

          <h1>One-time database setup</h1>
          <p className="muted">
            Your project's reachable, but it doesn't have the app's tables yet. Open your Supabase project's{' '}
            <strong>SQL Editor</strong>, paste the script below, and run it — then come back here.
          </p>

          <textarea readOnly value={setupSql} rows={10} style={{ fontFamily: 'monospace', fontSize: '0.78rem' }} />

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setNeedsMigration(false)}>
              Back
            </button>
            <button type="button" className="btn-secondary" onClick={copySql}>
              {copied ? 'Copied!' : 'Copy SQL'}
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={recheckSchema}>
              {busy ? 'Checking…' : "I ran it — check again"}
            </button>
          </div>

          {error && <p className="error-text">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="brand auth-brand">
          <span className="brand-mark">BB</span>
          <div>
            <div className="brand-name">Breezy Bay</div>
            <div className="brand-sub">WMS</div>
          </div>
        </div>

        <h1>Connect your Supabase project</h1>
        <p className="muted">
          Create a free project at{' '}
          <a href="https://supabase.com" target="_blank" rel="noreferrer">
            supabase.com
          </a>
          , then paste its API details below. If it's a brand-new project we'll walk you through the one-time
          database setup next.
        </p>

        <label>
          Project URL
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-project.supabase.co"
            required
          />
        </label>
        <label>
          Anon public key
          <input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} placeholder="eyJhbGci..." required />
        </label>

        {error && <p className="error-text">{error}</p>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Save & continue'}
        </button>
      </form>
    </div>
  )
}
