import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GLAccount, JournalEntryLine } from '../types'

type ReportTab = 'trial_balance' | 'pl' | 'bs'

const tabs: { value: ReportTab; label: string }[] = [
  { value: 'trial_balance', label: 'Trial balance' },
  { value: 'pl', label: 'Profit & loss' },
  { value: 'bs', label: 'Balance sheet' },
]

export default function Reports() {
  const [tab, setTab] = useState<ReportTab>('trial_balance')
  const [accounts, setAccounts] = useState<GLAccount[]>([])
  const [lines, setLines] = useState<JournalEntryLine[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [accountsRes, linesRes] = await Promise.all([
      supabase.from('gl_accounts').select('*').order('code'),
      supabase.from('journal_entry_lines').select('*'),
    ])
    setAccounts(accountsRes.data ?? [])
    setLines(linesRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function balanceOf(account: GLAccount) {
    const accountLines = lines.filter((l) => l.gl_account_id === account.id)
    const dr = accountLines.reduce((sum, l) => sum + Number(l.debit), 0)
    const cr = accountLines.reduce((sum, l) => sum + Number(l.credit), 0)
    return account.normal_balance === 'debit' ? dr - cr : cr - dr
  }

  if (loading) return <p>Loading…</p>

  const income = accounts.filter((a) => a.type === 'income')
  const cogs = accounts.filter((a) => a.type === 'cogs')
  const expense = accounts.filter((a) => a.type === 'expense')
  const totalIncome = income.reduce((s, a) => s + balanceOf(a), 0)
  const totalCogs = cogs.reduce((s, a) => s + balanceOf(a), 0)
  const totalExpense = expense.reduce((s, a) => s + balanceOf(a), 0)
  const netIncome = totalIncome - totalCogs - totalExpense

  const assets = accounts.filter((a) => a.type === 'asset')
  const liabilities = accounts.filter((a) => a.type === 'liability')
  const equity = accounts.filter((a) => a.type === 'equity')
  const totalAssets = assets.reduce((s, a) => s + balanceOf(a), 0)
  const totalLiabilities = liabilities.reduce((s, a) => s + balanceOf(a), 0)
  const totalEquity = equity.reduce((s, a) => s + balanceOf(a), 0) + netIncome

  const totalDebits = accounts.reduce((s, a) => {
    const bal = balanceOf(a)
    return s + (bal > 0 && a.normal_balance === 'debit' ? bal : bal < 0 && a.normal_balance === 'credit' ? -bal : 0)
  }, 0)
  const totalCredits = accounts.reduce((s, a) => {
    const bal = balanceOf(a)
    return s + (bal > 0 && a.normal_balance === 'credit' ? bal : bal < 0 && a.normal_balance === 'debit' ? -bal : 0)
  }, 0)

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
      </div>

      <div className="inline-form" style={{ maxWidth: 'none' }}>
        {tabs.map((t) => (
          <button
            key={t.value}
            className={t.value === tab ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'trial_balance' && (
        <section className="panel">
          <h2>Trial balance</h2>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Account</th>
                <th>Debit</th>
                <th>Credit</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const bal = balanceOf(a)
                const isDebitCol = a.normal_balance === 'debit' ? bal >= 0 : bal < 0
                return (
                  <tr key={a.id}>
                    <td>{a.code}</td>
                    <td>{a.name}</td>
                    <td>{isDebitCol && bal !== 0 ? `$${Math.abs(bal).toFixed(2)}` : ''}</td>
                    <td>{!isDebitCol && bal !== 0 ? `$${Math.abs(bal).toFixed(2)}` : ''}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ fontWeight: 700 }}>
                  Total
                </td>
                <td style={{ fontWeight: 700 }}>${totalDebits.toFixed(2)}</td>
                <td style={{ fontWeight: 700 }}>${totalCredits.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          {Math.abs(totalDebits - totalCredits) > 0.005 && (
            <p className="error-text">
              Out of balance by ${Math.abs(totalDebits - totalCredits).toFixed(2)} — this should never happen if
              every entry went through Journal Entries.
            </p>
          )}
        </section>
      )}

      {tab === 'pl' && (
        <section className="panel">
          <h2>Profit &amp; loss</h2>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700 }}>Income</td>
                <td></td>
              </tr>
              {income.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>${balanceOf(a).toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 700 }}>Cost of goods sold</td>
                <td></td>
              </tr>
              {cogs.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>${balanceOf(a).toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 700 }}>Gross profit</td>
                <td style={{ fontWeight: 700 }}>${(totalIncome - totalCogs).toFixed(2)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>Operating expenses</td>
                <td></td>
              </tr>
              {expense.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>${balanceOf(a).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ fontWeight: 700 }}>Net income</td>
                <td style={{ fontWeight: 700 }}>${netIncome.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {tab === 'bs' && (
        <section className="panel">
          <h2>Balance sheet</h2>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700 }}>Assets</td>
                <td></td>
              </tr>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>${balanceOf(a).toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 700 }}>Total assets</td>
                <td style={{ fontWeight: 700 }}>${totalAssets.toFixed(2)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>Liabilities</td>
                <td></td>
              </tr>
              {liabilities.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>${balanceOf(a).toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 700 }}>Equity</td>
                <td></td>
              </tr>
              {equity.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>${balanceOf(a).toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td>Net income (current)</td>
                <td>${netIncome.toFixed(2)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td style={{ fontWeight: 700 }}>Total liabilities &amp; equity</td>
                <td style={{ fontWeight: 700 }}>${(totalLiabilities + totalEquity).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}
    </div>
  )
}
