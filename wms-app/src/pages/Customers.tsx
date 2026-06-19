import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import type { Customer, CustomerNote, LeadStatus } from '../types'

const emptyForm = { name: '', contact_name: '', email: '', phone: '', address: '' }
const leadStatuses: LeadStatus[] = ['lead', 'prospect', 'customer', 'inactive']

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('name')
    setCustomers(data ?? [])
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
    }
    const { data, error: insertError } = await supabase.from('customers').insert(payload).select('id').single()
    if (insertError) return setError(insertError.message)
    await logActivity('created', 'customer', data?.id ?? null, { name: payload.name })
    setForm(emptyForm)
    setShowForm(false)
    void load()
  }

  async function handleDelete(customer: Customer) {
    if (!confirm(`Delete ${customer.name}?`)) return
    const { error: deleteError } = await supabase.from('customers').delete().eq('id', customer.id)
    if (deleteError) return alert(deleteError.message)
    await logActivity('deleted', 'customer', customer.id, { name: customer.name })
    void load()
  }

  const selectedCustomer = customers.find((c) => c.id === selectedId) ?? null

  if (loading) return <p>Loading…</p>

  if (selectedCustomer) {
    return (
      <CustomerDetail
        customer={selectedCustomer}
        onBack={() => {
          setSelectedId(null)
          void load()
        }}
        onChanged={load}
      />
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1>Customers</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + New customer
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Contact</th>
            <th>Phone</th>
            <th>Follow up</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id}>
              <td>{customer.name}</td>
              <td>
                <span className={`badge badge-${customer.lead_status}`}>{customer.lead_status}</span>
              </td>
              <td>{customer.contact_name ?? '—'}</td>
              <td>{customer.phone ?? '—'}</td>
              <td>{customer.follow_up_date ?? '—'}</td>
              <td className="row-actions">
                <button className="btn-link" onClick={() => setSelectedId(customer.id)}>
                  Open
                </button>
                <button className="btn-link danger" onClick={() => handleDelete(customer)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {customers.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                None yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h2>New customer</h2>
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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

function CustomerDetail({
  customer,
  onBack,
  onChanged,
}: {
  customer: Customer
  onBack: () => void
  onChanged: () => Promise<void>
}) {
  const [notes, setNotes] = useState<CustomerNote[]>([])
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [leadStatus, setLeadStatus] = useState<LeadStatus>(customer.lead_status)
  const [followUpDate, setFollowUpDate] = useState(customer.follow_up_date ?? '')

  const loadNotes = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('customer_notes')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
    setNotes(data ?? [])
    setLoading(false)
  }, [customer.id])

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  async function saveStatus(status: LeadStatus) {
    setLeadStatus(status)
    const { error } = await supabase.from('customers').update({ lead_status: status }).eq('id', customer.id)
    if (error) return alert(error.message)
    await onChanged()
  }

  async function saveFollowUp(date: string) {
    setFollowUpDate(date)
    const { error } = await supabase
      .from('customers')
      .update({ follow_up_date: date || null })
      .eq('id', customer.id)
    if (error) return alert(error.message)
    await onChanged()
  }

  async function addNote() {
    if (!newNote.trim()) return
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('customer_notes').insert({
      customer_id: customer.id,
      note: newNote.trim(),
      created_by: userData.user?.id ?? null,
    })
    if (error) return alert(error.message)
    setNewNote('')
    void loadNotes()
  }

  return (
    <div>
      <button className="btn-link" onClick={onBack}>
        ← Back to customers
      </button>
      <div className="page-header">
        <h1>{customer.name}</h1>
        <span className={`badge badge-${leadStatus}`}>{leadStatus}</span>
      </div>

      <section className="panel">
        <h2>Details</h2>
        <p className="muted">Contact: {customer.contact_name ?? '—'}</p>
        <p className="muted">Email: {customer.email ?? '—'}</p>
        <p className="muted">Phone: {customer.phone ?? '—'}</p>
        <p className="muted">Address: {customer.address ?? '—'}</p>

        <div className="form-row">
          <label>
            Lead status
            <select value={leadStatus} onChange={(e) => void saveStatus(e.target.value as LeadStatus)}>
              {leadStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Follow up date
            <input type="date" value={followUpDate} onChange={(e) => void saveFollowUp(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Notes</h2>
        <div className="form-row">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Log a call, email, or visit…"
          />
          <button type="button" className="btn-secondary" onClick={() => void addNote()}>
            Add note
          </button>
        </div>
        {loading ? (
          <p>Loading…</p>
        ) : notes.length === 0 ? (
          <p className="muted">No notes yet.</p>
        ) : (
          <ul className="activity-list">
            {notes.map((note) => (
              <li key={note.id}>
                <span className="activity-time">{new Date(note.created_at).toLocaleString()}</span>
                <div>{note.note}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
