import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import { downloadCsv } from '../lib/csv'
import type { Employee, EmployeeType, PayType } from '../types'

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  employee_type: 'employee' as EmployeeType,
  pay_type: 'hourly' as PayType,
  pay_rate: '',
  start_date: '',
}

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('employees').select('*').order('name')
    setEmployees(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
    setShowForm(true)
  }

  function startEdit(employee: Employee) {
    setEditingId(employee.id)
    setForm({
      name: employee.name,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      employee_type: employee.employee_type,
      pay_type: employee.pay_type,
      pay_rate: employee.pay_rate?.toString() ?? '',
      start_date: employee.start_date ?? '',
    })
    setError(null)
    setShowForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      employee_type: form.employee_type,
      pay_type: form.pay_type,
      pay_rate: form.pay_rate ? Number(form.pay_rate) : null,
      start_date: form.start_date || null,
    }

    if (editingId) {
      const { error: updateError } = await supabase
        .from('employees')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingId)
      if (updateError) return setError(updateError.message)
      await logActivity('updated', 'employee', editingId, { name: payload.name })
    } else {
      const { data, error: insertError } = await supabase.from('employees').insert(payload).select('id').single()
      if (insertError) return setError(insertError.message)
      await logActivity('created', 'employee', data?.id ?? null, { name: payload.name })
    }

    setShowForm(false)
    void load()
  }

  async function toggleActive(employee: Employee) {
    const { error: updateError } = await supabase
      .from('employees')
      .update({ is_active: !employee.is_active, updated_at: new Date().toISOString() })
      .eq('id', employee.id)
    if (updateError) return alert(updateError.message)
    void load()
  }

  function exportCsv() {
    downloadCsv('employees.csv', employees, [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'employee_type', label: 'Type' },
      { key: 'pay_type', label: 'Pay type' },
      { key: 'pay_rate', label: 'Pay rate' },
      { key: 'start_date', label: 'Start date' },
      { key: 'is_active', label: 'Active' },
    ])
  }

  return (
    <div>
      <div className="page-header">
        <h1>Employees</h1>
        <div className="row-actions">
          <button className="btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={startCreate}>
            + New employee
          </button>
        </div>
      </div>
      <p className="muted">
        Employees and 1099 contractors, for use on pay runs. This doesn't calculate tax withholding — see Pay Runs.
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Pay</th>
              <th>Start date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id} style={{ opacity: employee.is_active ? 1 : 0.5 }}>
                <td>{employee.name}</td>
                <td className="muted">{employee.employee_type === 'contractor_1099' ? '1099 contractor' : 'Employee'}</td>
                <td>
                  {employee.pay_rate != null ? `$${employee.pay_rate.toFixed(2)}` : '—'}
                  {employee.pay_rate != null && (employee.pay_type === 'hourly' ? '/hr' : '/yr')}
                </td>
                <td>{employee.start_date ?? '—'}</td>
                <td className="row-actions">
                  <button className="btn-link" onClick={() => startEdit(employee)}>
                    Edit
                  </button>
                  <button className="btn-link" onClick={() => toggleActive(employee)}>
                    {employee.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h2>{editingId ? 'Edit employee' : 'New employee'}</h2>
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <div className="form-row">
              <label>
                Email
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label>
                Phone
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
            </div>
            <div className="form-row">
              <label>
                Type
                <select
                  value={form.employee_type}
                  onChange={(e) => setForm({ ...form, employee_type: e.target.value as EmployeeType })}
                >
                  <option value="employee">Employee</option>
                  <option value="contractor_1099">1099 contractor</option>
                </select>
              </label>
              <label>
                Pay type
                <select value={form.pay_type} onChange={(e) => setForm({ ...form, pay_type: e.target.value as PayType })}>
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary (annual)</option>
                </select>
              </label>
              <label>
                Pay rate
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.pay_rate}
                  onChange={(e) => setForm({ ...form, pay_rate: e.target.value })}
                />
              </label>
            </div>
            <label>
              Start date
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
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
