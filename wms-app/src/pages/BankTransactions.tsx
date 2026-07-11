import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import { parseCsv } from '../lib/csv'
import type { BankTransaction, GLAccount } from '../types'

interface ParsedRow {
  date: string | null
  description: string
  amount: number | null
}

function parseAmount(raw: string): number | null {
  if (!raw) return null
  let s = raw.trim().replace(/[$,]/g, '')
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  const n = Number(s)
  if (Number.isNaN(n)) return null
  return negative ? -Math.abs(n) : n
}

function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const mdY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdY) {
    const [, m, d, y] = mdY
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return null
}

export default function BankTransactions() {
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [accounts, setAccounts] = useState<GLAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'unreviewed' | 'categorized' | 'ignored' | 'all'>('unreviewed')
  const [categorizing, setCategorizing] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const [showImport, setShowImport] = useState(false)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [dateCol, setDateCol] = useState('')
  const [descCol, setDescCol] = useState('')
  const [separateDebitCredit, setSeparateDebitCredit] = useState(false)
  const [amountCol, setAmountCol] = useState('')
  const [debitCol, setDebitCol] = useState('')
  const [creditCol, setCreditCol] = useState('')
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [txRes, accountsRes] = await Promise.all([
      supabase.from('bank_transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('gl_accounts').select('*').eq('is_active', true).order('code'),
    ])
    setTransactions(txRes.data ?? [])
    setAccounts(accountsRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const cashAccount = accounts.find((a) => a.role === 'cash') ?? null

  function accountLabel(id: string | null) {
    if (!id) return '—'
    const a = accounts.find((acc) => acc.id === id)
    return a ? `${a.code} — ${a.name}` : id
  }

  function guessColumn(candidates: RegExp[], hdrs: string[]): string {
    for (const re of candidates) {
      const match = hdrs.find((h) => re.test(h))
      if (match) return match
    }
    return ''
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = parseCsv(text)
      if (parsed.length < 2) {
        setError('That file has no data rows.')
        return
      }
      const [hdr, ...dataRows] = parsed
      setHeaders(hdr)
      setRows(dataRows)
      setDateCol(guessColumn([/date/i], hdr))
      setDescCol(guessColumn([/desc/i, /memo/i, /payee/i, /name/i], hdr))
      setAmountCol(guessColumn([/^amount$/i, /amount/i], hdr))
      setDebitCol(guessColumn([/debit/i], hdr))
      setCreditCol(guessColumn([/credit/i], hdr))
      setError(null)
      setShowImport(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const parsedRows: ParsedRow[] = useMemo(() => {
    if (!dateCol || !descCol) return []
    const dateIdx = headers.indexOf(dateCol)
    const descIdx = headers.indexOf(descCol)
    const amountIdx = headers.indexOf(amountCol)
    const debitIdx = headers.indexOf(debitCol)
    const creditIdx = headers.indexOf(creditCol)

    return rows.map((r) => {
      const date = dateIdx >= 0 ? parseDate(r[dateIdx] ?? '') : null
      const description = descIdx >= 0 ? (r[descIdx] ?? '').trim() : ''
      let amount: number | null
      if (separateDebitCredit) {
        const debit = debitIdx >= 0 ? parseAmount(r[debitIdx] ?? '') ?? 0 : 0
        const credit = creditIdx >= 0 ? parseAmount(r[creditIdx] ?? '') ?? 0 : 0
        amount = credit - debit
      } else {
        amount = amountIdx >= 0 ? parseAmount(r[amountIdx] ?? '') : null
      }
      return { date, description, amount }
    })
  }, [rows, headers, dateCol, descCol, amountCol, debitCol, creditCol, separateDebitCredit])

  const validRows = parsedRows.filter((r) => r.date && r.amount !== null && r.description)
  const invalidCount = parsedRows.length - validRows.length

  async function confirmImport() {
    if (validRows.length === 0) return
    setImporting(true)
    const { data: userData } = await supabase.auth.getUser()
    const payload = validRows.map((r) => ({
      transaction_date: r.date,
      description: r.description,
      amount: r.amount,
      imported_by: userData.user?.id ?? null,
    }))
    const { error: insertError } = await supabase.from('bank_transactions').insert(payload)
    setImporting(false)
    if (insertError) return setError(insertError.message)
    await logActivity('imported', 'bank_transactions', null, { count: payload.length })
    setShowImport(false)
    setRows([])
    setHeaders([])
    void load()
  }

  async function categorize(tx: BankTransaction) {
    const glAccountId = categorizing[tx.id]
    if (!glAccountId) return
    if (!cashAccount) return alert('No account with role "cash" found in your Chart of Accounts.')

    const amt = Math.abs(tx.amount)
    const lines =
      tx.amount >= 0
        ? [
            { gl_account_id: cashAccount.id, debit: amt, credit: 0 },
            { gl_account_id: glAccountId, debit: 0, credit: amt },
          ]
        : [
            { gl_account_id: glAccountId, debit: amt, credit: 0 },
            { gl_account_id: cashAccount.id, debit: 0, credit: amt },
          ]

    const { data: jeId, error: rpcError } = await supabase.rpc('create_journal_entry', {
      p_entry_date: tx.transaction_date,
      p_memo: tx.description,
      p_reference: tx.external_ref,
      p_source: 'bank_import',
      p_source_id: tx.id,
      p_lines: lines,
    })
    if (rpcError) return alert(rpcError.message)

    const { error: updateError } = await supabase
      .from('bank_transactions')
      .update({ status: 'categorized', gl_account_id: glAccountId, journal_entry_id: jeId })
      .eq('id', tx.id)
    if (updateError) return alert(updateError.message)

    void load()
  }

  async function ignoreTx(tx: BankTransaction) {
    const { error: updateError } = await supabase.from('bank_transactions').update({ status: 'ignored' }).eq('id', tx.id)
    if (updateError) return alert(updateError.message)
    void load()
  }

  const filtered = filter === 'all' ? transactions : transactions.filter((t) => t.status === filter)

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <div className="page-header">
        <h1>Bank Transactions</h1>
        <button className="btn-primary" onClick={() => document.getElementById('bank-csv-input')?.click()}>
          + Import CSV
        </button>
        <input id="bank-csv-input" type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
      </div>
      <p className="muted">
        Import a CSV export from your bank (most banks offer this from their online statement page), then categorize
        each transaction against a GL account to post it. This reads a file you export — it doesn't connect to your
        bank automatically.
      </p>

      {!cashAccount && (
        <p className="error-text">
          No account with role "cash" is set in your Chart of Accounts — categorizing will fail until one exists.
        </p>
      )}

      <div className="row-actions" style={{ marginBottom: 12 }}>
        {(['unreviewed', 'categorized', 'ignored', 'all'] as const).map((f) => (
          <button
            key={f}
            className={filter === f ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setFilter(f)}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Category</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((tx) => (
            <tr key={tx.id}>
              <td>{tx.transaction_date}</td>
              <td>{tx.description}</td>
              <td className={tx.amount >= 0 ? 'info-text' : ''}>
                {tx.amount >= 0 ? '+' : ''}
                {tx.amount.toFixed(2)}
              </td>
              <td>
                <span
                  className={`badge ${tx.status === 'categorized' ? 'badge-paid' : tx.status === 'ignored' ? 'badge-cancelled' : 'badge-draft'}`}
                >
                  {tx.status}
                </span>
              </td>
              <td>
                {tx.status === 'unreviewed' ? (
                  <select
                    value={categorizing[tx.id] ?? ''}
                    onChange={(e) => setCategorizing({ ...categorizing, [tx.id]: e.target.value })}
                  >
                    <option value="">Select account…</option>
                    {accounts
                      .filter((a) => a.role !== 'cash')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                  </select>
                ) : (
                  accountLabel(tx.gl_account_id)
                )}
              </td>
              <td className="row-actions">
                {tx.status === 'unreviewed' && (
                  <>
                    <button className="btn-link" disabled={!categorizing[tx.id]} onClick={() => categorize(tx)}>
                      Post
                    </button>
                    <button className="btn-link danger" onClick={() => ignoreTx(tx)}>
                      Ignore
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No transactions here.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showImport && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowImport(false)
            setRows([])
            setHeaders([])
          }}
        >
          <div className="modal-card" style={{ width: 720 }} onClick={(e) => e.stopPropagation()}>
            <h2>Import bank transactions</h2>
            <p className="muted">Match up the columns from your file, then review before importing.</p>

            <div className="form-row">
              <label>
                Date column
                <select value={dateCol} onChange={(e) => setDateCol(e.target.value)}>
                  <option value="">Select…</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Description column
                <select value={descCol} onChange={(e) => setDescCol(e.target.value)}>
                  <option value="">Select…</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={separateDebitCredit}
                  onChange={(e) => setSeparateDebitCredit(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                This file has separate Debit and Credit columns (instead of one signed Amount column)
              </span>
            </label>

            {separateDebitCredit ? (
              <div className="form-row">
                <label>
                  Debit column
                  <select value={debitCol} onChange={(e) => setDebitCol(e.target.value)}>
                    <option value="">Select…</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Credit column
                  <select value={creditCol} onChange={(e) => setCreditCol(e.target.value)}>
                    <option value="">Select…</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <label>
                Amount column (positive = money in, negative = money out)
                <select value={amountCol} onChange={(e) => setAmountCol(e.target.value)}>
                  <option value="">Select…</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <p className="muted">
              {validRows.length} row{validRows.length === 1 ? '' : 's'} ready to import
              {invalidCount > 0 ? `, ${invalidCount} skipped (couldn't read date/amount/description)` : ''}.
            </p>

            {validRows.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {validRows.slice(0, 8).map((r, i) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td>{r.description}</td>
                      <td>{r.amount?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {validRows.length > 8 && <p className="muted">…and {validRows.length - 8} more.</p>}

            {error && <p className="error-text">{error}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowImport(false)
                  setRows([])
                  setHeaders([])
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={validRows.length === 0 || importing}
                onClick={confirmImport}
              >
                {importing ? 'Importing…' : `Import ${validRows.length} transaction${validRows.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
