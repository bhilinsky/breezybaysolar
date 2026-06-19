import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import type { Customer, Supplier } from '../types'

type Contact = Supplier | Customer

const emptyForm = { name: '', contact_name: '', email: '', phone: '', address: '' }

export default function ContactsPage({ table, title, entityType }: { table: 'suppliers' | 'customers'; title: string; entityType: string }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from(table).select('*').order('name')
    setContacts(data ?? [])
    setLoading(false)
  }, [table])

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
    const { data, error: insertError } = await supabase.from(table).insert(payload).select('id').single()
    if (insertError) return setError(insertError.message)
    await logActivity('created', entityType, data?.id ?? null, { name: payload.name })
    setForm(emptyForm)
    setShowForm(false)
    void load()
  }

  async function handleDelete(contact: Contact) {
    if (!confirm(`Delete ${contact.name}?`)) return
    const { error: deleteError } = await supabase.from(table).delete().eq('id', contact.id)
    if (deleteError) return alert(deleteError.message)
    await logActivity('deleted', entityType, contact.id, { name: contact.name })
    void load()
  }

  return (
    <div>
      <div className="page-header">
        <h1>{title}</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + New {entityType}
        </button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Phone</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td>{contact.name}</td>
                <td>{contact.contact_name ?? '—'}</td>
                <td>{contact.email ?? '—'}</td>
                <td>{contact.phone ?? '—'}</td>
                <td className="row-actions">
                  <button className="btn-link danger" onClick={() => handleDelete(contact)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
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
            <h2>New {entityType}</h2>
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
