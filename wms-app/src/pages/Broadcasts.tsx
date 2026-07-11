import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import type { Broadcast } from '../types'

const emptyForm = { subject: '', body: '' }

const statusBadge: Record<Broadcast['status'], string> = {
  draft: 'badge-draft',
  sending: 'badge-confirmed',
  sent: 'badge-fulfilled',
  failed: 'badge-cancelled',
}

export default function Broadcasts() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [recipientCount, setRecipientCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [broadcastsRes, recipientsRes] = await Promise.all([
      supabase.from('broadcasts').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('id', { count: 'exact', head: true }).not('email', 'is', null),
    ])
    setBroadcasts(broadcastsRes.data ?? [])
    setRecipientCount(recipientsRes.count ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.subject.trim() || !form.body.trim()) return setError('Subject and message are required.')
    setSending(true)

    const { data, error: insertError } = await supabase
      .from('broadcasts')
      .insert({ subject: form.subject.trim(), body: form.body.trim() })
      .select('id')
      .single()
    if (insertError) {
      setSending(false)
      return setError(insertError.message)
    }

    const { error: sendError } = await supabase.functions.invoke('send-broadcast', {
      body: { broadcastId: data.id },
    })
    setSending(false)
    if (sendError) {
      setError(`Saved as a draft, but sending failed: ${sendError.message}`)
    } else {
      await logActivity('sent', 'broadcast', data.id, { subject: form.subject.trim() })
    }

    setForm(emptyForm)
    setShowForm(false)
    void load()
  }

  return (
    <div>
      <div className="page-header">
        <h1>Broadcasts</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + New broadcast
        </button>
      </div>
      <p className="muted">
        Send a message to every customer with an email on file ({recipientCount} right now) — for sales,
        new services, or anything else worth letting them know about.
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Status</th>
              <th>Recipients</th>
              <th>Sent</th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((b) => (
              <tr key={b.id}>
                <td>{b.subject}</td>
                <td>
                  <span className={`badge ${statusBadge[b.status]}`}>{b.status}</span>
                  {b.status === 'failed' && b.error_message && (
                    <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      {b.error_message}
                    </div>
                  )}
                </td>
                <td>{b.recipient_count ?? '—'}</td>
                <td>{b.sent_at ? new Date(b.sent_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {broadcasts.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No broadcasts sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => !sending && setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h2>New broadcast</h2>
            <p className="muted" style={{ margin: 0 }}>
              Goes out to {recipientCount} customer{recipientCount === 1 ? '' : 's'} with an email on file.
            </p>
            <label>
              Subject
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
            </label>
            <label>
              Message
              <textarea
                rows={6}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                required
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)} disabled={sending}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={sending}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
