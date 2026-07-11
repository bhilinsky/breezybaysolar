import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity, generateNumber } from '../lib/activity'
import { downloadCsv } from '../lib/csv'
import type { Customer, Invoice, InvoiceStatus, SalesOrder } from '../types'

const emptyForm = { customer_id: '', sales_order_id: '', amount: '', due_date: '', notes: '' }

const statusBadge: Record<InvoiceStatus, string> = {
  draft: 'badge-draft',
  sent: 'badge-sent',
  paid: 'badge-paid',
  cancelled: 'badge-cancelled',
}

function isOverdue(invoice: Invoice) {
  return invoice.status === 'sent' && !!invoice.due_date && invoice.due_date < new Date().toISOString().slice(0, 10)
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [invoicesRes, customersRes, ordersRes] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('*').order('name'),
      supabase.from('sales_orders').select('*').order('order_number'),
    ])
    setInvoices(invoicesRes.data ?? [])
    setCustomers(customersRes.data ?? [])
    setOrders(ordersRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function customerName(id: string | null) {
    return customers.find((c) => c.id === id)?.name ?? '—'
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const amount = Number(form.amount)
    if (!amount || amount < 0) return setError('Enter a valid amount.')

    const invoice_number = generateNumber('INV')
    const { data, error: insertError } = await supabase
      .from('invoices')
      .insert({
        invoice_number,
        customer_id: form.customer_id || null,
        sales_order_id: form.sales_order_id || null,
        amount,
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
      })
      .select('id')
      .single()
    if (insertError) return setError(insertError.message)
    await logActivity('created', 'invoice', data.id, { invoice_number, amount })
    setForm(emptyForm)
    setShowForm(false)
    void load()
  }

  async function setStatus(invoice: Invoice, status: InvoiceStatus) {
    const payload: { status: InvoiceStatus; updated_at: string; paid_at?: string } = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'paid') payload.paid_at = new Date().toISOString()
    const { error: updateError } = await supabase.from('invoices').update(payload).eq('id', invoice.id)
    if (updateError) return alert(updateError.message)
    await logActivity(status, 'invoice', invoice.id, { invoice_number: invoice.invoice_number })
    void load()
  }

  async function handleDelete(invoice: Invoice) {
    if (!confirm(`Delete invoice ${invoice.invoice_number}?`)) return
    const { error: deleteError } = await supabase.from('invoices').delete().eq('id', invoice.id)
    if (deleteError) return alert(deleteError.message)
    await logActivity('deleted', 'invoice', invoice.id, { invoice_number: invoice.invoice_number })
    void load()
  }

  function exportCsv() {
    downloadCsv(
      'invoices.csv',
      invoices.map((inv) => ({ ...inv, customer_name: customerName(inv.customer_id) })),
      [
        { key: 'invoice_number', label: 'Invoice #' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'amount', label: 'Amount' },
        { key: 'status', label: 'Status' },
        { key: 'due_date', label: 'Due date' },
        { key: 'created_at', label: 'Created' },
      ],
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1>Invoices</h1>
        <div className="row-actions">
          <button className="btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + New invoice
          </button>
        </div>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Due</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.invoice_number}</td>
                <td>{customerName(invoice.customer_id)}</td>
                <td>${invoice.amount.toFixed(2)}</td>
                <td>{invoice.due_date ?? '—'}</td>
                <td>
                  <span className={`badge ${isOverdue(invoice) ? 'badge-overdue' : statusBadge[invoice.status]}`}>
                    {isOverdue(invoice) ? 'overdue' : invoice.status}
                  </span>
                </td>
                <td className="row-actions">
                  {invoice.status === 'draft' && (
                    <button className="btn-link" onClick={() => setStatus(invoice, 'sent')}>
                      Mark sent
                    </button>
                  )}
                  {invoice.status === 'sent' && (
                    <button className="btn-link" onClick={() => setStatus(invoice, 'paid')}>
                      Mark paid
                    </button>
                  )}
                  <button className="btn-link danger" onClick={() => handleDelete(invoice)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h2>New invoice</h2>
            <label>
              Customer
              <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">None</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Linked sales order (optional)
              <select
                value={form.sales_order_id}
                onChange={(e) => setForm({ ...form, sales_order_id: e.target.value })}
              >
                <option value="">None</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.order_number}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                Amount
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </label>
            </div>
            <label>
              Notes
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
