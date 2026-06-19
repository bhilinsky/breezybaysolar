import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    const result = mode === 'signin' ? await signIn(email, password) : await signUp(email, password, fullName)
    setBusy(false)
    if (result.error) {
      setError(result.error)
    } else if (mode === 'signup') {
      setInfo('Account created. Check your email to confirm, then sign in.')
      setMode('signin')
    }
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

        {!isSupabaseConfigured && (
          <p className="warning-banner">
            Supabase isn't configured yet. Copy <code>.env.example</code> to <code>.env</code> and add your project
            URL and anon key.
          </p>
        )}

        <h1>{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>

        {mode === 'signup' && (
          <label>
            Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>

        {error && <p className="error-text">{error}</p>}
        {info && <p className="info-text">{info}</p>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>

        <button
          type="button"
          className="btn-link"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? "Need an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
