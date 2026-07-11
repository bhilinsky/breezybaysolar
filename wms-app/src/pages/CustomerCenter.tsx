import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import { downloadCsv } from '../lib/csv'
import type {
  CRMActivity,
  CRMActivityType,
  CRMTask,
  Customer,
  Invoice,
  Opportunity,
  OpportunityStage,
  SalesOrder,
} from '../types'

const emptyCustomerForm = { name: '', contact_name: '', email: '', phone: '', address: '' }

export default function CustomerCenter() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyCustomerForm)
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

  async function handleCreate(e: FormEvent) {
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
    setForm(emptyCustomerForm)
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

  if (selectedCustomer) {
    return (
      <CustomerDetail
        customer={selectedCustomer}
        onBack={() => {
          setSelectedId(null)
          void load()
        }}
      />
    )
  }

  function exportCsv() {
    downloadCsv('customers.csv', customers, [
      { key: 'name', label: 'Name' },
      { key: 'contact_name', label: 'Contact' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'address', label: 'Address' },
    ])
  }

  return (
    <div>
      <div className="page-header">
        <h1>Customer Center</h1>
        <div className="row-actions">
          <button className="btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + New customer
          </button>
        </div>
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
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.name}</td>
                <td>{customer.contact_name ?? '—'}</td>
                <td>{customer.email ?? '—'}</td>
                <td>{customer.phone ?? '—'}</td>
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
                <td colSpan={5} className="muted">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
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

const activityTypeLabels: Record<CRMActivityType, string> = {
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  note: 'Note',
}

const stageLabels: Record<OpportunityStage, string> = {
  prospecting: 'Prospecting',
  qualified: 'Qualified',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
}

const stageBadge: Record<OpportunityStage, string> = {
  prospecting: 'badge-draft',
  qualified: 'badge-sent',
  proposal: 'badge-sent',
  won: 'badge-paid',
  lost: 'badge-cancelled',
}

function CustomerDetail({ customer, onBack }: { customer: Customer; onBack: () => void }) {
  const [activities, setActivities] = useState<CRMActivity[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [tasks, setTasks] = useState<CRMTask[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [loading, setLoading] = useState(true)

  const [showActivityForm, setShowActivityForm] = useState(false)
  const [activityType, setActivityType] = useState<CRMActivityType>('note')
  const [activitySubject, setActivitySubject] = useState('')
  const [activityNotes, setActivityNotes] = useState('')

  const [showOppForm, setShowOppForm] = useState(false)
  const [oppName, setOppName] = useState('')
  const [oppValue, setOppValue] = useState('')
  const [oppCloseDate, setOppCloseDate] = useState('')

  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskOpportunityId, setTaskOpportunityId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [activitiesRes, opportunitiesRes, tasksRes, invoicesRes, ordersRes] = await Promise.all([
      supabase.from('crm_activities').select('*').eq('customer_id', customer.id).order('occurred_at', { ascending: false }),
      supabase.from('opportunities').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
      supabase.from('crm_tasks').select('*').eq('customer_id', customer.id).order('due_date', { ascending: true }),
      supabase.from('invoices').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
      supabase.from('sales_orders').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
    ])
    setActivities(activitiesRes.data ?? [])
    setOpportunities(opportunitiesRes.data ?? [])
    setTasks(tasksRes.data ?? [])
    setInvoices(invoicesRes.data ?? [])
    setOrders(ordersRes.data ?? [])
    setLoading(false)
  }, [customer.id])

  useEffect(() => {
    void load()
  }, [load])

  async function logNewActivity(e: FormEvent) {
    e.preventDefault()
    if (!activitySubject.trim()) return
    const { error } = await supabase.from('crm_activities').insert({
      customer_id: customer.id,
      type: activityType,
      subject: activitySubject.trim(),
      notes: activityNotes.trim() || null,
    })
    if (error) return alert(error.message)
    setActivitySubject('')
    setActivityNotes('')
    setActivityType('note')
    setShowActivityForm(false)
    void load()
  }

  async function createOpportunity(e: FormEvent) {
    e.preventDefault()
    if (!oppName.trim()) return
    const { error } = await supabase.from('opportunities').insert({
      customer_id: customer.id,
      name: oppName.trim(),
      value: oppValue ? Number(oppValue) : null,
      expected_close_date: oppCloseDate || null,
    })
    if (error) return alert(error.message)
    setOppName('')
    setOppValue('')
    setOppCloseDate('')
    setShowOppForm(false)
    void load()
  }

  async function setOppStage(opp: Opportunity, stage: OpportunityStage) {
    const { error } = await supabase
      .from('opportunities')
      .update({ stage, updated_at: new Date().toISOString() })
      .eq('id', opp.id)
    if (error) return alert(error.message)
    void load()
  }

  async function createTask(e: FormEvent) {
    e.preventDefault()
    if (!taskTitle.trim()) return
    const { error } = await supabase.from('crm_tasks').insert({
      customer_id: customer.id,
      opportunity_id: taskOpportunityId || null,
      title: taskTitle.trim(),
      due_date: taskDueDate || null,
    })
    if (error) return alert(error.message)
    setTaskTitle('')
    setTaskDueDate('')
    setTaskOpportunityId('')
    setShowTaskForm(false)
    void load()
  }

  async function toggleTaskDone(task: CRMTask) {
    const done = task.status !== 'done'
    const { error } = await supabase
      .from('crm_tasks')
      .update({ status: done ? 'done' : 'open', completed_at: done ? new Date().toISOString() : null })
      .eq('id', task.id)
    if (error) return alert(error.message)
    void load()
  }

  const today = new Date().toISOString().slice(0, 10)

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <button className="btn-link" onClick={onBack}>
        ← Back to Customer Center
      </button>
      <div className="page-header">
        <h1>{customer.name}</h1>
      </div>
      <p className="muted">
        {customer.contact_name && `${customer.contact_name} · `}
        {customer.email ?? 'No email'} · {customer.phone ?? 'No phone'}
      </p>
      {customer.address && <p className="muted">{customer.address}</p>}

      <section className="panel">
        <div className="page-header">
          <h2>Pipeline</h2>
          <button className="btn-secondary" onClick={() => setShowOppForm(true)}>
            + New opportunity
          </button>
        </div>
        {opportunities.length === 0 ? (
          <p className="muted">No opportunities yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Stage</th>
                <th>Value</th>
                <th>Expected close</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opp) => (
                <tr key={opp.id}>
                  <td>{opp.name}</td>
                  <td>
                    <select
                      value={opp.stage}
                      onChange={(e) => setOppStage(opp, e.target.value as OpportunityStage)}
                      className={`badge ${stageBadge[opp.stage]}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                    >
                      {Object.entries(stageLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{opp.value != null ? `$${opp.value.toFixed(2)}` : '—'}</td>
                  <td>{opp.expected_close_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <div className="page-header">
          <h2>Tasks</h2>
          <button className="btn-secondary" onClick={() => setShowTaskForm(true)}>
            + New task
          </button>
        </div>
        {tasks.length === 0 ? (
          <p className="muted">No tasks yet.</p>
        ) : (
          <ul className="activity-list">
            {tasks.map((task) => (
              <li key={task.id}>
                <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', display: 'inline-flex' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={task.status === 'done'}
                    onChange={() => toggleTaskDone(task)}
                  />
                  <span
                    className="activity-action"
                    style={{ textDecoration: task.status === 'done' ? 'line-through' : 'none' }}
                  >
                    {task.title}
                  </span>
                </label>
                {task.due_date && (
                  <span className={task.status === 'open' && task.due_date < today ? 'error-text' : 'muted'}>
                    {' '}
                    · due {task.due_date}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="page-header">
          <h2>Activity</h2>
          <button className="btn-secondary" onClick={() => setShowActivityForm(true)}>
            + Log activity
          </button>
        </div>
        {activities.length === 0 ? (
          <p className="muted">No activity logged yet.</p>
        ) : (
          <ul className="activity-list">
            {activities.map((a) => (
              <li key={a.id}>
                <span className="activity-action">
                  {activityTypeLabels[a.type]}: {a.subject}
                </span>
                {a.notes && <div className="muted">{a.notes}</div>}
                <span className="activity-time">{new Date(a.occurred_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Invoices</h2>
        {invoices.length === 0 ? (
          <p className="muted">No invoices yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.invoice_number}</td>
                  <td>${inv.amount.toFixed(2)}</td>
                  <td className="muted">{inv.status}</td>
                  <td>{inv.due_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Orders</h2>
        {orders.length === 0 ? (
          <p className="muted">No orders yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.order_number}</td>
                  <td className="muted">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {showActivityForm && (
        <div className="modal-overlay" onClick={() => setShowActivityForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={logNewActivity}>
            <h2>Log activity</h2>
            <label>
              Type
              <select value={activityType} onChange={(e) => setActivityType(e.target.value as CRMActivityType)}>
                {Object.entries(activityTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subject
              <input value={activitySubject} onChange={(e) => setActivitySubject(e.target.value)} required />
            </label>
            <label>
              Notes
              <textarea value={activityNotes} onChange={(e) => setActivityNotes(e.target.value)} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowActivityForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {showOppForm && (
        <div className="modal-overlay" onClick={() => setShowOppForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={createOpportunity}>
            <h2>New opportunity</h2>
            <label>
              Name
              <input value={oppName} onChange={(e) => setOppName(e.target.value)} required />
            </label>
            <div className="form-row">
              <label>
                Value
                <input type="number" step="0.01" min={0} value={oppValue} onChange={(e) => setOppValue(e.target.value)} />
              </label>
              <label>
                Expected close
                <input type="date" value={oppCloseDate} onChange={(e) => setOppCloseDate(e.target.value)} />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowOppForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {showTaskForm && (
        <div className="modal-overlay" onClick={() => setShowTaskForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={createTask}>
            <h2>New task</h2>
            <label>
              Title
              <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required />
            </label>
            <div className="form-row">
              <label>
                Due date
                <input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
              </label>
              <label>
                Linked opportunity (optional)
                <select value={taskOpportunityId} onChange={(e) => setTaskOpportunityId(e.target.value)}>
                  <option value="">None</option>
                  {opportunities.map((opp) => (
                    <option key={opp.id} value={opp.id}>
                      {opp.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowTaskForm(false)}>
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
