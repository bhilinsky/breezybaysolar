import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import type { Contractor, ContractorStatus } from '../types'

const emptyForm = { name: '', contact_name: '', email: '', phone: '', address: '', trade: '' }

export default function Contractors() {
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('contractors').select('*').order('name')
    setContractors(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      trade: form.trade.trim() || null,
    }
    const { data, error: insertError } = await supabase.from('contractors').insert(payload).select('id').single()
    if (insertError) return setError(insertError.message)
    await logActivity('created', 'contractor', data?.id ?? null, { name: payload.name })
    setForm(emptyForm)
    setShowForm(false)
    void load()
  }

  async function toggleStatus(contractor: Contractor) {
    const next: ContractorStatus = contractor.status === 'active' ? 'inactive' : 'active'
    const { error: updateError } = await supabase.from('contractors').update({ status: next }).eq('id', contractor.id)
    if (updateError) return alert(updateError.message)
    void load()
  }

  async function handleDelete(contractor: Contractor) {
    if (!confirm(`Delete ${contractor.name}?`)) return
    const { error: deleteError } = await supabase.from('contractors').delete().eq('id', contractor.id)
    if (deleteError) return alert(deleteError.message)
    await logActivity('deleted', 'contractor', contractor.id, { name: contractor.name })
    void load()
  }

  return (
    <div>
      <div className="page-header">
        <h1>Contractors</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + New contractor
        </button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Trade</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contractors.map((contractor) => (
              <tr key={contractor.id}>
                <td>{contractor.name}</td>
                <td>{contractor.trade ?? '—'}</td>
                <td>{contractor.contact_name ?? '—'}</td>
                <td>{contractor.phone ?? '—'}</td>
                <td>
                  <button className="btn-link" onClick={() => toggleStatus(contractor)}>
                    <span className={`badge badge-${contractor.status}`}>{contractor.status}</span>
                  </button>
                </td>
                <td className="row-actions">
                  <button className="btn-link danger" onClick={() => handleDelete(contractor)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {contractors.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  None yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h2>New contractor</h2>
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Trade
              <input
                value={form.trade}
                onChange={(e) => setForm({ ...form, trade: e.target.value })}
                placeholder="e.g. Electrical, Roofing, Install crew"
              />
            </label>
            <label>
              Contact name
              <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </label>
            <label>
              Email
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>
              Address
              <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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
