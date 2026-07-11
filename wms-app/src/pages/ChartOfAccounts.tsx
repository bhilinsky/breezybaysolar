import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import { downloadCsv } from '../lib/csv'
import type { GLAccount, GLAccountType } from '../types'

const typeLabels: Record<GLAccountType, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  income: 'Income',
  cogs: 'Cost of goods sold',
  expense: 'Expense',
}

const emptyForm = { code: '', name: '', type: 'expense' as GLAccountType, normal_balance: 'debit' as 'debit' | 'credit' }

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<GLAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('gl_accounts').select('*').order('code')
    setAccounts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      type: form.type,
      normal_balance: form.normal_balance,
    }
    const { data, error: insertError } = await supabase.from('gl_accounts').insert(payload).select('id').single()
    if (insertError) return setError(insertError.message)
    await logActivity('created', 'gl_account', data?.id ?? null, { code: payload.code })
    setForm(emptyForm)
    setShowForm(false)
    void load()
  }

  async function toggleActive(account: GLAccount) {
    const { error: updateError } = await supabase
      .from('gl_accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id)
    if (updateError) return alert(updateError.message)
    void load()
  }

  function exportCsv() {
    downloadCsv(
      'chart-of-accounts.csv',
      accounts.map((a) => ({ ...a, type: typeLabels[a.type] })),
      [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Name' },
        { key: 'type', label: 'Type' },
        { key: 'normal_balance', label: 'Normal balance' },
        { key: 'role', label: 'Role' },
        { key: 'is_active', label: 'Active' },
      ],
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1>Chart of accounts</h1>
        <div className="row-actions">
          <button className="btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + New account
          </button>
        </div>
      </div>
      <p className="muted">
        Cash, AR, AP, Sales Revenue and Operating Expenses are pre-set so invoices and bills post themselves
        automatically — add more accounts here for anything else you want to track.
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Normal balance</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id} style={{ opacity: account.is_active ? 1 : 0.5 }}>
                <td>{account.code}</td>
                <td>{account.name}</td>
                <td>{typeLabels[account.type]}</td>
                <td style={{ textTransform: 'capitalize' }}>{account.normal_balance}</td>
                <td className="muted">{account.role ?? '—'}</td>
                <td className="row-actions">
                  <button className="btn-link" onClick={() => toggleActive(account)}>
                    {account.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h2>New account</h2>
            <label>
              Code
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </label>
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <div className="form-row">
              <label>
                Type
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as GLAccountType })}>
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Normal balance
                <select
                  value={form.normal_balance}
                  onChange={(e) => setForm({ ...form, normal_balance: e.target.value as 'debit' | 'credit' })}
                >
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select>
              </label>
            </div>
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
