import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { downloadCsv } from '../lib/csv'
import type { GLAccount, JournalEntry, JournalEntryLine } from '../types'

interface LineDraft {
  gl_account_id: string
  debit: string
  credit: string
  memo: string
}

function emptyLine(): LineDraft {
  return { gl_account_id: '', debit: '', credit: '', memo: '' }
}

export default function JournalEntries() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [accounts, setAccounts] = useState<GLAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [memo, setMemo] = useState('')
  const [reference, setReference] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [entriesRes, accountsRes] = await Promise.all([
      supabase.from('journal_entries').select('*').order('entry_date', { ascending: false }),
      supabase.from('gl_accounts').select('*').eq('is_active', true).order('code'),
    ])
    setEntries(entriesRes.data ?? [])
    setAccounts(accountsRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.005

  function resetForm() {
    setMemo('')
    setReference('')
    setLines([emptyLine(), emptyLine()])
    setError(null)
  }

  async function handleSubmit() {
    setError(null)
    if (!balanced) return setError('Debits and credits must balance, and be more than zero.')
    const validLines = lines.filter((l) => l.gl_account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
    if (validLines.length < 2) return setError('Add at least two lines with an account and an amount.')

    setSaving(true)
    const { error: rpcError } = await supabase.rpc('create_journal_entry', {
      p_entry_date: new Date().toISOString().slice(0, 10),
      p_memo: memo.trim() || null,
      p_reference: reference.trim() || null,
      p_source: 'manual',
      p_source_id: null,
      p_lines: validLines.map((l) => ({
        gl_account_id: l.gl_account_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        memo: l.memo.trim() || null,
      })),
    })
    setSaving(false)
    if (rpcError) return setError(rpcError.message)

    resetForm()
    setShowForm(false)
    void load()
  }

  const selectedEntry = entries.find((e) => e.id === selectedId) ?? null

  if (loading) return <p>Loading…</p>

  if (selectedEntry) {
    return (
      <JournalEntryDetail entry={selectedEntry} accounts={accounts} onBack={() => setSelectedId(null)} />
    )
  }

  function exportCsv() {
    downloadCsv('journal-entries.csv', entries, [
      { key: 'entry_number', label: 'Entry #' },
      { key: 'entry_date', label: 'Date' },
      { key: 'memo', label: 'Memo' },
      { key: 'reference', label: 'Reference' },
      { key: 'source', label: 'Source' },
    ])
  }

  return (
    <div>
      <div className="page-header">
        <h1>Journal entries</h1>
        <div className="row-actions">
          <button className="btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + New entry
          </button>
        </div>
      </div>
      <p className="muted">
        Invoices and bills post entries here automatically when they change status — this is also where you can
        record anything else (rent, payroll, owner draws) by hand.
      </p>

      <table>
        <thead>
          <tr>
            <th>Entry #</th>
            <th>Date</th>
            <th>Memo</th>
            <th>Source</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.entry_number}</td>
              <td>{entry.entry_date}</td>
              <td>{entry.memo ?? '—'}</td>
              <td className="muted">{entry.source}</td>
              <td className="row-actions">
                <button className="btn-link" onClick={() => setSelectedId(entry.id)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No journal entries yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showForm && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowForm(false)
            resetForm()
          }}
        >
          <form
            className="modal-card"
            style={{ width: 620 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              void handleSubmit()
            }}
          >
            <h2>New journal entry</h2>
            <div className="form-row">
              <label>
                Memo
                <input value={memo} onChange={(e) => setMemo(e.target.value)} />
              </label>
              <label>
                Reference
                <input value={reference} onChange={(e) => setReference(e.target.value)} />
              </label>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        value={line.gl_account_id}
                        onChange={(e) => updateLine(i, { gl_account_id: e.target.value })}
                      >
                        <option value="">Select account…</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        style={{ width: 90 }}
                        value={line.debit}
                        onChange={(e) => updateLine(i, { debit: e.target.value, credit: '' })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        style={{ width: 90 }}
                        value={line.credit}
                        onChange={(e) => updateLine(i, { credit: e.target.value, debit: '' })}
                      />
                    </td>
                    <td>
                      {lines.length > 2 && (
                        <button type="button" className="btn-link danger" onClick={() => removeLine(i)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button type="button" className="btn-secondary" onClick={addLine} style={{ alignSelf: 'flex-start' }}>
              + Add line
            </button>

            <p className={balanced ? 'info-text' : 'muted'}>
              Debits ${totalDebit.toFixed(2)} · Credits ${totalCredit.toFixed(2)}
              {!balanced && ' — must be equal and greater than zero'}
            </p>

            {error && <p className="error-text">{error}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={!balanced || saving}>
                {saving ? 'Posting…' : 'Post entry'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function JournalEntryDetail({
  entry,
  accounts,
  onBack,
}: {
  entry: JournalEntry
  accounts: GLAccount[]
  onBack: () => void
}) {
  const [lines, setLines] = useState<JournalEntryLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('journal_entry_lines')
      .select('*')
      .eq('journal_entry_id', entry.id)
      .then(({ data }) => {
        setLines(data ?? [])
        setLoading(false)
      })
  }, [entry.id])

  function accountLabel(id: string) {
    const account = accounts.find((a) => a.id === id)
    return account ? `${account.code} — ${account.name}` : id
  }

  return (
    <div>
      <button className="btn-link" onClick={onBack}>
        ← Back to journal entries
      </button>
      <div className="page-header">
        <h1>{entry.entry_number}</h1>
      </div>
      <p className="muted">
        {entry.entry_date} · {entry.memo ?? 'No memo'} {entry.reference ? `· Ref: ${entry.reference}` : ''}
      </p>

      <section className="panel">
        <h2>Lines</h2>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Memo</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{accountLabel(line.gl_account_id)}</td>
                  <td>{line.debit > 0 ? `$${line.debit.toFixed(2)}` : ''}</td>
                  <td>{line.credit > 0 ? `$${line.credit.toFixed(2)}` : ''}</td>
                  <td className="muted">{line.memo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
