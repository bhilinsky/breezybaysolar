import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity, generateNumber } from '../lib/activity'
import { downloadCsv } from '../lib/csv'
import type { Employee, PayRun, PayRunLine } from '../types'

const emptyForm = { pay_period_start: '', pay_period_end: '', pay_date: '' }

export default function PayRuns() {
  const [payRuns, setPayRuns] = useState<PayRun[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [runsRes, employeesRes] = await Promise.all([
      supabase.from('pay_runs').select('*').order('pay_date', { ascending: false }),
      supabase.from('employees').select('*').order('name'),
    ])
    setPayRuns(runsRes.data ?? [])
    setEmployees(employeesRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.pay_period_start || !form.pay_period_end || !form.pay_date) {
      return setError('Pay period start, end, and pay date are all required.')
    }
    const run_number = generateNumber('PR')
    const { data, error: insertError } = await supabase
      .from('pay_runs')
      .insert({
        run_number,
        pay_period_start: form.pay_period_start,
        pay_period_end: form.pay_period_end,
        pay_date: form.pay_date,
      })
      .select('id')
      .single()
    if (insertError) return setError(insertError.message)
    await logActivity('created', 'pay_run', data.id, { run_number })
    setForm(emptyForm)
    setShowCreate(false)
    await load()
    setSelectedId(data.id)
  }

  function exportCsv() {
    downloadCsv('pay-runs.csv', payRuns, [
      { key: 'run_number', label: 'Run #' },
      { key: 'pay_period_start', label: 'Period start' },
      { key: 'pay_period_end', label: 'Period end' },
      { key: 'pay_date', label: 'Pay date' },
      { key: 'status', label: 'Status' },
    ])
  }

  const selectedRun = payRuns.find((r) => r.id === selectedId) ?? null

  if (loading) return <p>Loading…</p>

  if (selectedRun) {
    return (
      <PayRunDetail
        payRun={selectedRun}
        employees={employees}
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
        <h1>Pay Runs</h1>
        <div className="row-actions">
          <button className="btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + New pay run
          </button>
        </div>
      </div>
      <p className="muted">
        Manual payroll record-keeping — enter gross pay and any deductions you've already calculated per employee.
        This doesn't calculate tax withholding for you.
      </p>

      <table>
        <thead>
          <tr>
            <th>Run #</th>
            <th>Pay period</th>
            <th>Pay date</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {payRuns.map((run) => (
            <tr key={run.id}>
              <td>{run.run_number}</td>
              <td>
                {run.pay_period_start} – {run.pay_period_end}
              </td>
              <td>{run.pay_date}</td>
              <td>
                <span className={`badge ${run.status === 'posted' ? 'badge-paid' : 'badge-draft'}`}>{run.status}</span>
              </td>
              <td className="row-actions">
                <button className="btn-link" onClick={() => setSelectedId(run.id)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
          {payRuns.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No pay runs yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h2>New pay run</h2>
            <div className="form-row">
              <label>
                Period start
                <input
                  type="date"
                  value={form.pay_period_start}
                  onChange={(e) => setForm({ ...form, pay_period_start: e.target.value })}
                  required
                />
              </label>
              <label>
                Period end
                <input
                  type="date"
                  value={form.pay_period_end}
                  onChange={(e) => setForm({ ...form, pay_period_end: e.target.value })}
                  required
                />
              </label>
            </div>
            <label>
              Pay date
              <input
                type="date"
                value={form.pay_date}
                onChange={(e) => setForm({ ...form, pay_date: e.target.value })}
                required
              />
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

function PayRunDetail({
  payRun,
  employees,
  onBack,
  onChanged,
}: {
  payRun: PayRun
  employees: Employee[]
  onBack: () => void
  onChanged: () => Promise<void>
}) {
  const [lines, setLines] = useState<PayRunLine[]>([])
  const [loading, setLoading] = useState(true)
  const [newEmployeeId, setNewEmployeeId] = useState('')
  const [newGross, setNewGross] = useState('')
  const [newDeductions, setNewDeductions] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isDraft = payRun.status === 'draft'

  const loadLines = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('pay_run_lines').select('*').eq('pay_run_id', payRun.id)
    setLines(data ?? [])
    setLoading(false)
  }, [payRun.id])

  useEffect(() => {
    void loadLines()
  }, [loadLines])

  function employeeName(id: string) {
    return employees.find((e) => e.id === id)?.name ?? '—'
  }

  async function addLine() {
    setError(null)
    const gross = Number(newGross)
    if (!newEmployeeId) return setError('Choose an employee.')
    if (!gross || gross < 0) return setError('Enter a valid gross pay amount.')
    const deductions = newDeductions ? Number(newDeductions) : 0
    if (deductions > gross) return setError('Deductions cannot exceed gross pay.')

    const { error: insertError } = await supabase.from('pay_run_lines').insert({
      pay_run_id: payRun.id,
      employee_id: newEmployeeId,
      gross_pay: gross,
      deductions,
    })
    if (insertError) return setError(insertError.message)
    setNewEmployeeId('')
    setNewGross('')
    setNewDeductions('')
    void loadLines()
  }

  async function removeLine(line: PayRunLine) {
    const { error: deleteError } = await supabase.from('pay_run_lines').delete().eq('id', line.id)
    if (deleteError) return alert(deleteError.message)
    void loadLines()
  }

  async function postRun() {
    if (lines.length === 0) return alert('Add at least one pay line before posting.')
    if (!confirm(`Post pay run ${payRun.run_number}? This posts a journal entry to the general ledger and can't be undone.`)) {
      return
    }
    const { error: updateError } = await supabase
      .from('pay_runs')
      .update({ status: 'posted', posted_at: new Date().toISOString() })
      .eq('id', payRun.id)
    if (updateError) return alert(updateError.message)
    await logActivity('posted', 'pay_run', payRun.id, { run_number: payRun.run_number })
    await onChanged()
    onBack()
  }

  const totalGross = lines.reduce((sum, l) => sum + l.gross_pay, 0)
  const totalDeductions = lines.reduce((sum, l) => sum + l.deductions, 0)
  const totalNet = lines.reduce((sum, l) => sum + l.net_pay, 0)

  return (
    <div>
      <button className="btn-link" onClick={onBack}>
        ← Back to pay runs
      </button>
      <div className="page-header">
        <h1>{payRun.run_number}</h1>
        <span className={`badge ${payRun.status === 'posted' ? 'badge-paid' : 'badge-draft'}`}>{payRun.status}</span>
      </div>
      <p className="muted">
        Period {payRun.pay_period_start} – {payRun.pay_period_end}, paid {payRun.pay_date}
      </p>

      <section className="panel">
        <h2>Pay lines</h2>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Gross pay</th>
                <th>Deductions</th>
                <th>Net pay</th>
                {isDraft && <th></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{employeeName(line.employee_id)}</td>
                  <td>${line.gross_pay.toFixed(2)}</td>
                  <td>${line.deductions.toFixed(2)}</td>
                  <td>${line.net_pay.toFixed(2)}</td>
                  {isDraft && (
                    <td>
                      <button className="btn-link danger" onClick={() => removeLine(line)}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={isDraft ? 5 : 4} className="muted">
                    No pay lines yet.
                  </td>
                </tr>
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td>
                    <strong>${totalGross.toFixed(2)}</strong>
                  </td>
                  <td>
                    <strong>${totalDeductions.toFixed(2)}</strong>
                  </td>
                  <td>
                    <strong>${totalNet.toFixed(2)}</strong>
                  </td>
                  {isDraft && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {isDraft && (
          <div className="form-row add-line-row">
            <select value={newEmployeeId} onChange={(e) => setNewEmployeeId(e.target.value)}>
              <option value="">Select employee…</option>
              {employees
                .filter((e) => e.is_active)
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
            </select>
            <input
              type="number"
              step="0.01"
              min={0}
              style={{ width: 110 }}
              value={newGross}
              onChange={(e) => setNewGross(e.target.value)}
              placeholder="Gross pay"
            />
            <input
              type="number"
              step="0.01"
              min={0}
              style={{ width: 110 }}
              value={newDeductions}
              onChange={(e) => setNewDeductions(e.target.value)}
              placeholder="Deductions"
            />
            <button type="button" className="btn-secondary" onClick={addLine}>
              Add line
            </button>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
      </section>

      {isDraft && (
        <section className="panel">
          <h2>Post</h2>
          <p className="muted">
            Posting books a balanced journal entry: debit Salaries &amp; Wages for the gross total, credit Cash for
            net pay, and credit Payroll Liabilities for any deductions (for you to remit separately).
          </p>
          <button className="btn-primary" onClick={postRun}>
            Post pay run
          </button>
        </section>
      )}
    </div>
  )
}
