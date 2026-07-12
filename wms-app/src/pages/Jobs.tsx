import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity, generateNumber } from '../lib/activity'
import { downloadCsv } from '../lib/csv'
import type { Customer, Item, Job, JobMaterial, JobStatus, JobType } from '../types'

const jobTypeLabels: Record<JobType, string> = {
  general: 'General',
  installation: 'Installation',
  repair: 'Repair',
  maintenance: 'Maintenance',
  consultation: 'Consultation',
}

const statusOrder: JobStatus[] = ['new', 'quoted', 'scheduled', 'in_progress', 'completed']
const nextStatusLabel: Partial<Record<JobStatus, string>> = {
  new: 'Mark quoted',
  quoted: 'Mark scheduled',
  scheduled: 'Start job',
  in_progress: 'Mark completed',
}

const emptyForm = {
  customer_id: '',
  site_address: '',
  job_type: 'general' as JobType,
  start_date: '',
  target_end_date: '',
  notes: '',
}

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const [jobsRes, customersRes, itemsRes] = await Promise.all([
      supabase.from('jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('*').order('name'),
      supabase.from('items').select('*').order('name'),
    ])
    setJobs(jobsRes.data ?? [])
    setCustomers(customersRes.data ?? [])
    setItems(itemsRes.data ?? [])
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
    const job_number = generateNumber('JOB')
    const { data, error: insertError } = await supabase
      .from('jobs')
      .insert({
        job_number,
        customer_id: form.customer_id || null,
        site_address: form.site_address.trim() || null,
        job_type: form.job_type,
        start_date: form.start_date || null,
        target_end_date: form.target_end_date || null,
        notes: form.notes.trim() || null,
      })
      .select('id')
      .single()
    if (insertError) return setError(insertError.message)
    await logActivity('created', 'job', data.id, { job_number })
    setForm(emptyForm)
    setShowCreate(false)
    await load()
    setSelectedId(data.id)
  }

  function exportCsv() {
    downloadCsv(
      'jobs.csv',
      jobs.map((j) => ({ ...j, customer_name: customerName(j.customer_id) })),
      [
        { key: 'job_number', label: 'Job #' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'job_type', label: 'Type' },
        { key: 'status', label: 'Status' },
        { key: 'site_address', label: 'Site address' },
        { key: 'start_date', label: 'Start date' },
        { key: 'target_end_date', label: 'Target end' },
      ],
    )
  }

  const filteredJobs = statusFilter === 'all' ? jobs : jobs.filter((j) => j.status === statusFilter)
  const selectedJob = jobs.find((j) => j.id === selectedId) ?? null

  if (loading) return <p>Loading…</p>

  if (selectedJob) {
    return (
      <JobDetail
        job={selectedJob}
        customers={customers}
        items={items}
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
        <h1>Jobs</h1>
        <div className="row-actions">
          <button className="btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + New job
          </button>
        </div>
      </div>
      <p className="muted">
        Install and service work — one record per job, from first contact through completion, with materials,
        quotes, change orders, time, and photos all rolled up in one place.
      </p>

      <div className="row-actions" style={{ marginBottom: 12 }}>
        {(['all', ...statusOrder, 'cancelled'] as const).map((s) => (
          <button
            key={s}
            className={statusFilter === s ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setStatusFilter(s as JobStatus | 'all')}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>Job #</th>
            <th>Customer</th>
            <th>Type</th>
            <th>Site</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filteredJobs.map((job) => (
            <tr key={job.id}>
              <td>{job.job_number}</td>
              <td>{customerName(job.customer_id)}</td>
              <td className="muted">{jobTypeLabels[job.job_type]}</td>
              <td>{job.site_address ?? '—'}</td>
              <td>
                <span className={`badge badge-${job.status}`}>{job.status.replace('_', ' ')}</span>
              </td>
              <td className="row-actions">
                <button className="btn-link" onClick={() => setSelectedId(job.id)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
          {filteredJobs.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No jobs here.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h2>New job</h2>
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
              Site address
              <input value={form.site_address} onChange={(e) => setForm({ ...form, site_address: e.target.value })} />
            </label>
            <div className="form-row">
              <label>
                Job type
                <select value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value as JobType })}>
                  {Object.entries(jobTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Start date
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </label>
              <label>
                Target end
                <input
                  type="date"
                  value={form.target_end_date}
                  onChange={(e) => setForm({ ...form, target_end_date: e.target.value })}
                />
              </label>
            </div>
            <label>
              Notes
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
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

function JobDetail({
  job,
  customers,
  items,
  onBack,
  onChanged,
}: {
  job: Job
  customers: Customer[]
  items: Item[]
  onBack: () => void
  onChanged: () => Promise<void>
}) {
  const [materials, setMaterials] = useState<JobMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [newItemId, setNewItemId] = useState('')
  const [newQty, setNewQty] = useState(1)

  const loadMaterials = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('job_materials').select('*').eq('job_id', job.id)
    setMaterials(data ?? [])
    setLoading(false)
  }, [job.id])

  useEffect(() => {
    void loadMaterials()
  }, [loadMaterials])

  async function addMaterial() {
    if (!newItemId || newQty <= 0) return
    const { error } = await supabase.from('job_materials').insert({
      job_id: job.id,
      item_id: newItemId,
      quantity: newQty,
    })
    if (error) return alert(error.message)
    setNewItemId('')
    setNewQty(1)
    void loadMaterials()
  }

  async function toggleOrdered(material: JobMaterial) {
    const { error } = await supabase.from('job_materials').update({ ordered: !material.ordered }).eq('id', material.id)
    if (error) return alert(error.message)
    void loadMaterials()
  }

  async function removeMaterial(material: JobMaterial) {
    const { error } = await supabase.from('job_materials').delete().eq('id', material.id)
    if (error) return alert(error.message)
    void loadMaterials()
  }

  async function setStatus(status: JobStatus) {
    const { error } = await supabase.from('jobs').update({ status, updated_at: new Date().toISOString() }).eq('id', job.id)
    if (error) return alert(error.message)
    await logActivity(status, 'job', job.id, { job_number: job.job_number })
    await onChanged()
  }

  const currentIndex = statusOrder.indexOf(job.status)
  const nextStatus = currentIndex >= 0 && currentIndex < statusOrder.length - 1 ? statusOrder[currentIndex + 1] : null

  return (
    <div>
      <button className="btn-link" onClick={onBack}>
        ← Back to jobs
      </button>
      <div className="page-header">
        <h1>{job.job_number}</h1>
        <span className={`badge badge-${job.status}`}>{job.status.replace('_', ' ')}</span>
      </div>
      <p className="muted">
        {customers.find((c) => c.id === job.customer_id)?.name ?? 'No customer'}
        {job.site_address ? ` · ${job.site_address}` : ''}
        {job.start_date ? ` · Starts ${job.start_date}` : ''}
      </p>
      {job.notes && <p className="muted">{job.notes}</p>}

      {job.status !== 'completed' && job.status !== 'cancelled' && (
        <div className="row-actions" style={{ marginBottom: 16 }}>
          {nextStatus && nextStatusLabel[job.status] && (
            <button className="btn-primary" onClick={() => setStatus(nextStatus)}>
              {nextStatusLabel[job.status]}
            </button>
          )}
          <button className="btn-secondary" onClick={() => setStatus('cancelled')}>
            Cancel job
          </button>
        </div>
      )}

      <section className="panel">
        <h2>Materials</h2>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Ordered</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => {
                const item = items.find((i) => i.id === m.item_id)
                return (
                  <tr key={m.id}>
                    <td>{item ? `${item.sku} — ${item.name}` : m.item_id}</td>
                    <td>{m.quantity}</td>
                    <td>
                      <button className="btn-link" onClick={() => toggleOrdered(m)}>
                        {m.ordered ? 'Ordered ✓' : 'Not ordered'}
                      </button>
                    </td>
                    <td>
                      <button className="btn-link danger" onClick={() => removeMaterial(m)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
              {materials.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No materials added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <div className="form-row add-line-row">
          <select value={newItemId} onChange={(e) => setNewItemId(e.target.value)}>
            <option value="">Select item to add…</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} — {item.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            style={{ width: 80 }}
            value={newQty}
            onChange={(e) => setNewQty(Number(e.target.value))}
            placeholder="Qty"
          />
          <button type="button" className="btn-secondary" onClick={addMaterial}>
            Add material
          </button>
        </div>
      </section>
    </div>
  )
}
