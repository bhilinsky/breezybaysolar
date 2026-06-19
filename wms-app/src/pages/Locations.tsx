import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import type { Location } from '../types'

const emptyForm = { code: '', name: '', description: '' }

export default function Locations() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('locations').select('*').order('code')
    setLocations(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
    }
    const { data, error: insertError } = await supabase.from('locations').insert(payload).select('id').single()
    if (insertError) return setError(insertError.message)
    await logActivity('created', 'location', data?.id ?? null, { code: payload.code })
    setForm(emptyForm)
    setShowForm(false)
    void load()
  }

  async function handleDelete(location: Location) {
    if (!confirm(`Delete location ${location.code}?`)) return
    const { error: deleteError } = await supabase.from('locations').delete().eq('id', location.id)
    if (deleteError) return alert(deleteError.message)
    await logActivity('deleted', 'location', location.id, { code: location.code })
    void load()
  }

  return (
    <div>
      <div className="page-header">
        <h1>Locations</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + New location
        </button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {locations.map((location) => (
              <tr key={location.id}>
                <td>{location.code}</td>
                <td>{location.name}</td>
                <td>{location.description ?? '—'}</td>
                <td className="row-actions">
                  <button className="btn-link danger" onClick={() => handleDelete(location)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {locations.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No locations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h2>New location</h2>
            <label>
              Code
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </label>
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
