import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity, generateNumber } from '../lib/activity'
import type { Bill, BillStatus, PurchaseOrder, Supplier } from '../types'

const emptyForm = { supplier_id: '', purchase_order_id: '', amount: '', due_date: '', notes: '' }

const statusBadge: Record<BillStatus, string> = {
  draft: 'badge-draft',
  received: 'badge-sent',
  paid: 'badge-paid',
  cancelled: 'badge-cancelled',
}

function isOverdue(bill: Bill) {
  return bill.status === 'received' && !!bill.due_date && bill.due_date < new Date().toISOString().slice(0, 10)
}

export default function Bills() {
  const [bills, setBills] = useState<Bill[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [billsRes, suppliersRes, ordersRes] = await Promise.all([
      supabase.from('bills').select('*').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('purchase_orders').select('*').order('po_number'),
    ])
    setBills(billsRes.data ?? [])
    setSuppliers(suppliersRes.data ?? [])
    setOrders(ordersRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function supplierName(id: string | null) {
    return suppliers.find((s) => s.id === id)?.name ?? '—'
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const amount = Number(form.amount)
    if (!amount || amount < 0) return setError('Enter a valid amount.')

    const bill_number = generateNumber('BILL')
    const { data, error: insertError } = await supabase
      .from('bills')
      .insert({
        bill_number,
        supplier_id: form.supplier_id || null,
        purchase_order_id: form.purchase_order_id || null,
        amount,
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
      })
      .select('id')
      .single()
    if (insertError) return setError(insertError.message)
    await logActivity('created', 'bill', data.id, { bill_number, amount })
    setForm(emptyForm)
    setShowForm(false)
    void load()
  }

  async function setStatus(bill: Bill, status: BillStatus) {
    const payload: { status: BillStatus; updated_at: string; paid_at?: string } = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'paid') payload.paid_at = new Date().toISOString()
    const { error: updateError } = await supabase.from('bills').update(payload).eq('id', bill.id)
    if (updateError) return alert(updateError.message)
    await logActivity(status, 'bill', bill.id, { bill_number: bill.bill_number })
    void load()
  }

  async function handleDelete(bill: Bill) {
    if (!confirm(`Delete bill ${bill.bill_number}?`)) return
    const { error: deleteError } = await supabase.from('bills').delete().eq('id', bill.id)
    if (deleteError) return alert(deleteError.message)
    await logActivity('deleted', 'bill', bill.id, { bill_number: bill.bill_number })
    void load()
  }

  return (
    <div>
      <div className="page-header">
        <h1>Bills</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + New bill
        </button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Supplier</th>
              <th>Amount</th>
              <th>Due</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr key={bill.id}>
                <td>{bill.bill_number}</td>
                <td>{supplierName(bill.supplier_id)}</td>
                <td>${bill.amount.toFixed(2)}</td>
                <td>{bill.due_date ?? '—'}</td>
                <td>
                  <span className={`badge ${isOverdue(bill) ? 'badge-overdue' : statusBadge[bill.status]}`}>
                    {isOverdue(bill) ? 'overdue' : bill.status}
                  </span>
                </td>
                <td className="row-actions">
                  {bill.status === 'draft' && (
                    <button className="btn-link" onClick={() => setStatus(bill, 'received')}>
                      Mark received
                    </button>
                  )}
                  {bill.status === 'received' && (
                    <button className="btn-link" onClick={() => setStatus(bill, 'paid')}>
                      Mark paid
                    </button>
                  )}
                  <button className="btn-link danger" onClick={() => handleDelete(bill)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {bills.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No bills yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h2>New bill</h2>
            <label>
              Supplier
              <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Linked purchase order (optional)
              <select
                value={form.purchase_order_id}
                onChange={(e) => setForm({ ...form, purchase_order_id: e.target.value })}
              >
                <option value="">None</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.po_number}
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
