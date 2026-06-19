import { useState, type FormEvent } from 'react'
import { getStoredSupabaseConfig, setStoredSupabaseConfig } from '../lib/supabaseConfig'

export default function Setup() {
  const existing = getStoredSupabaseConfig()
  const [url, setUrl] = useState(existing?.url ?? '')
  const [anonKey, setAnonKey] = useState(existing?.anonKey ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        setBusy(false)
        return
      }
    } catch {
      setError("Couldn't reach that URL. Check your internet connection and the Project URL.")
      setBusy(false)
      return
    }

    setStoredSupabaseConfig({ url: trimmedUrl, anonKey: trimmedKey })
    window.location.href = '/'
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
          , run the migration from this app's repo, then paste your project's API details below.
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
