import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { generateNumber, logActivity } from '../lib/activity'
import type { Container, Location } from '../types'

const emptyForm = { code: '', label: '', location_id: '' }

export default function Containers() {
  const [containers, setContainers] = useState<Container[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [containersRes, locationsRes] = await Promise.all([
      supabase.from('containers').select('*').order('code'),
      supabase.from('locations').select('*').order('code'),
    ])
    setContainers(containersRes.data ?? [])
    setLocations(locationsRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function locationName(id: string | null) {
    if (!id) return '—'
    const location = locations.find((l) => l.id === id)
    return location ? `${location.code} — ${location.name}` : id
  }

  function startCreate() {
    setEditingId(null)
    setForm({ ...emptyForm, code: generateNumber('RACK') })
    setError(null)
    setShowForm(true)
  }

  function startEdit(container: Container) {
    setEditingId(container.id)
    setForm({ code: container.code, label: container.label, location_id: container.location_id ?? '' })
    setError(null)
    setShowForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      code: form.code.trim(),
      label: form.label.trim(),
      location_id: form.location_id || null,
    }

    if (editingId) {
      const { error: updateError } = await supabase.from('containers').update(payload).eq('id', editingId)
      if (updateError) return setError(updateError.message)
      if (payload.location_id) {
        await supabase
          .from('inventory_levels')
          .update({ location_id: payload.location_id, updated_at: new Date().toISOString() })
          .eq('container_id', editingId)
      }
      await logActivity('updated', 'container', editingId, { code: payload.code })
    } else {
      const { data, error: insertError } = await supabase.from('containers').insert(payload).select('id').single()
      if (insertError) return setError(insertError.message)
      await logActivity('created', 'container', data?.id ?? null, { code: payload.code })
    }

    setShowForm(false)
    void load()
  }

  async function handleDelete(container: Container) {
    if (!confirm(`Delete rack ${container.code}?`)) return
    const { error: deleteError } = await supabase.from('containers').delete().eq('id', container.id)
    if (deleteError) return alert(deleteError.message)
    await logActivity('deleted', 'container', container.id, { code: container.code })
    void load()
  }

  return (
    <div>
      <div className="page-header">
        <h1>Racks / trays</h1>
        <button className="btn-primary" onClick={startCreate}>
          + New rack
        </button>
      </div>
      <p className="muted">
        A rack (or tray) holds a set of items and moves between locations as a unit — scan its code on the Scan to
        move page to log the move.
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Label</th>
              <th>Current location</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {containers.map((container) => (
              <tr key={container.id}>
                <td>{container.code}</td>
                <td>{container.label}</td>
                <td>{locationName(container.location_id)}</td>
                <td className="row-actions">
                  <button className="btn-link" onClick={() => startEdit(container)}>
                    Edit
                  </button>
                  <button className="btn-link danger" onClick={() => handleDelete(container)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {containers.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No racks yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h2>{editingId ? 'Edit rack' : 'New rack'}</h2>
            <label>
              Code (print this as the scannable barcode/QR tag)
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </label>
            <label>
              Label
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ring tray 3"
                required
              />
            </label>
            <label>
              Current location
              <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
                <option value="">Unassigned</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} — {location.name}
                  </option>
                ))}
              </select>
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
