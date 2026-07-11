import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Bill, Customer, Invoice, Supplier } from '../types'

interface Stats {
  outstandingAR: number
  outstandingAP: number
  paidThisMonth: number
  billedThisMonth: number
}

interface ActivityRow {
  id: string
  action: string
  entity_type: string
  created_at: string
  details: Record<string, unknown> | null
}

function monthStart() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

export default function Accounting() {
  const [stats, setStats] = useState<Stats>({ outstandingAR: 0, outstandingAP: 0, paidThisMonth: 0, billedThisMonth: 0 })
  const [overdueInvoices, setOverdueInvoices] = useState<Invoice[]>([])
  const [overdueBills, setOverdueBills] = useState<Bill[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const since = monthStart()

    const [invoicesRes, billsRes, customersRes, suppliersRes, activityRes] = await Promise.all([
      supabase.from('invoices').select('*'),
      supabase.from('bills').select('*'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
      supabase
        .from('activity_log')
        .select('id, action, entity_type, created_at, details')
        .in('entity_type', ['invoice', 'bill'])
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const invoices = invoicesRes.data ?? []
    const bills = billsRes.data ?? []

    const outstandingAR = invoices.filter((i) => i.status === 'sent').reduce((sum, i) => sum + Number(i.amount), 0)
    const outstandingAP = bills.filter((b) => b.status === 'received').reduce((sum, b) => sum + Number(b.amount), 0)
    const paidThisMonth = invoices
      .filter((i) => i.status === 'paid' && i.paid_at && i.paid_at >= since)
      .reduce((sum, i) => sum + Number(i.amount), 0)
    const billedThisMonth = bills
      .filter((b) => b.status === 'paid' && b.paid_at && b.paid_at >= since)
      .reduce((sum, b) => sum + Number(b.amount), 0)

    setStats({ outstandingAR, outstandingAP, paidThisMonth, billedThisMonth })
    setOverdueInvoices(invoices.filter((i) => i.status === 'sent' && i.due_date && i.due_date < today))
    setOverdueBills(bills.filter((b) => b.status === 'received' && b.due_date && b.due_date < today))
    setCustomers(customersRes.data ?? [])
    setSuppliers(suppliersRes.data ?? [])
    setActivity(activityRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h1>Accounting</h1>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">${stats.outstandingAR.toFixed(2)}</div>
          <div className="stat-label">Outstanding (owed to you)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${stats.outstandingAP.toFixed(2)}</div>
          <div className="stat-label">Outstanding (you owe)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${stats.paidThisMonth.toFixed(2)}</div>
          <div className="stat-label">Collected this month</div>
        </div>
        <div className="stat-card warn">
          <div className="stat-value">${stats.billedThisMonth.toFixed(2)}</div>
          <div className="stat-label">Paid out this month</div>
        </div>
      </div>

      <section className="panel">
        <h2>Overdue invoices</h2>
        {overdueInvoices.length === 0 ? (
          <p className="muted">Nothing overdue.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {overdueInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoice_number}</td>
                  <td>{customers.find((c) => c.id === invoice.customer_id)?.name ?? '—'}</td>
                  <td>${invoice.amount.toFixed(2)}</td>
                  <td>{invoice.due_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ marginTop: '0.75rem' }}>
          <Link to="/invoices" className="btn-link">
            View all invoices →
          </Link>
        </p>
      </section>

      <section className="panel">
        <h2>Overdue bills</h2>
        {overdueBills.length === 0 ? (
          <p className="muted">Nothing overdue.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Supplier</th>
                <th>Amount</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {overdueBills.map((bill) => (
                <tr key={bill.id}>
                  <td>{bill.bill_number}</td>
                  <td>{suppliers.find((s) => s.id === bill.supplier_id)?.name ?? '—'}</td>
                  <td>${bill.amount.toFixed(2)}</td>
                  <td>{bill.due_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ marginTop: '0.75rem' }}>
          <Link to="/bills" className="btn-link">
            View all bills →
          </Link>
        </p>
      </section>

      <section className="panel">
        <h2>Recent accounting activity</h2>
        {activity.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          <ul className="activity-list">
            {activity.map((row) => (
              <li key={row.id}>
                <span className="activity-action">{row.action}</span>
                <span className="muted"> · {row.entity_type}</span>
                <span className="activity-time">{new Date(row.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
