import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  Bill,
  Customer,
  GLAccount,
  Invoice,
  Item,
  JournalEntryLine,
  PurchaseOrderItem,
  SalesOrderItem,
  Supplier,
} from '../types'

type ReportId =
  | 'trial_balance'
  | 'gl_detail'
  | 'pl'
  | 'bs'
  | 'ar_aging_summary'
  | 'ar_aging_detail'
  | 'customer_balance'
  | 'ap_aging_summary'
  | 'ap_aging_detail'
  | 'vendor_balance'
  | 'sales_by_customer'
  | 'sales_by_item'
  | 'purchases_by_supplier'
  | 'purchases_by_item'

const reportGroups: { label: string; reports: { id: ReportId; label: string }[] }[] = [
  {
    label: 'Financial statements',
    reports: [
      { id: 'trial_balance', label: 'Trial Balance' },
      { id: 'gl_detail', label: 'General Ledger' },
      { id: 'pl', label: 'Profit & Loss' },
      { id: 'bs', label: 'Balance Sheet' },
    ],
  },
  {
    label: 'Receivables',
    reports: [
      { id: 'ar_aging_summary', label: 'AR Aging Summary' },
      { id: 'ar_aging_detail', label: 'AR Aging Detail' },
      { id: 'customer_balance', label: 'Customer Balances' },
    ],
  },
  {
    label: 'Payables',
    reports: [
      { id: 'ap_aging_summary', label: 'AP Aging Summary' },
      { id: 'ap_aging_detail', label: 'AP Aging Detail' },
      { id: 'vendor_balance', label: 'Vendor Balances' },
    ],
  },
  {
    label: 'Sales & purchasing',
    reports: [
      { id: 'sales_by_customer', label: 'Sales by Customer' },
      { id: 'sales_by_item', label: 'Sales by Item' },
      { id: 'purchases_by_supplier', label: 'Purchases by Supplier' },
      { id: 'purchases_by_item', label: 'Purchases by Item' },
    ],
  },
]

const AGING_BUCKETS = ['Current', '1-30', '31-60', '61-90', '90+'] as const
type AgingBucket = (typeof AGING_BUCKETS)[number]

function agingBucket(dueDate: string | null, today: string): AgingBucket {
  if (!dueDate || dueDate >= today) return 'Current'
  const days = Math.floor((Date.parse(today) - Date.parse(dueDate)) / 86400000)
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

export default function Reports() {
  const [report, setReport] = useState<ReportId>('trial_balance')
  const [loading, setLoading] = useState(true)

  const [accounts, setAccounts] = useState<GLAccount[]>([])
  const [lines, setLines] = useState<JournalEntryLine[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [soLines, setSoLines] = useState<SalesOrderItem[]>([])
  const [poLines, setPoLines] = useState<PurchaseOrderItem[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [
      accountsRes,
      linesRes,
      invoicesRes,
      billsRes,
      customersRes,
      suppliersRes,
      itemsRes,
      soLinesRes,
      poLinesRes,
    ] = await Promise.all([
      supabase.from('gl_accounts').select('*').order('code'),
      supabase.from('journal_entry_lines').select('*'),
      supabase.from('invoices').select('*'),
      supabase.from('bills').select('*'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('items').select('*'),
      supabase.from('sales_order_items').select('*'),
      supabase.from('purchase_order_items').select('*'),
    ])
    setAccounts(accountsRes.data ?? [])
    setLines(linesRes.data ?? [])
    setInvoices(invoicesRes.data ?? [])
    setBills(billsRes.data ?? [])
    setCustomers(customersRes.data ?? [])
    setSuppliers(suppliersRes.data ?? [])
    setItems(itemsRes.data ?? [])
    setSoLines(soLinesRes.data ?? [])
    setPoLines(poLinesRes.data ?? [])
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

  function customerName(id: string | null) {
    return customers.find((c) => c.id === id)?.name ?? '—'
  }

  function supplierName(id: string | null) {
    return suppliers.find((s) => s.id === id)?.name ?? '—'
  }

  function itemLabel(id: string) {
    const item = items.find((i) => i.id === id)
    return item ? `${item.sku} — ${item.name}` : id
  }

  if (loading) return <p>Loading…</p>

  const today = new Date().toISOString().slice(0, 10)
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

  const openInvoices = invoices.filter((i) => i.status === 'sent')
  const openBills = bills.filter((b) => b.status === 'received')

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        <nav style={{ width: 200, flexShrink: 0 }}>
          {reportGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: '1rem' }}>
              <div className="stat-label" style={{ marginBottom: '0.3rem' }}>
                {group.label}
              </div>
              <div className="nav-links-vertical">
                {group.reports.map((r) => (
                  <button
                    key={r.id}
                    className={'nav-link' + (report === r.id ? ' active' : '')}
                    style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer' }}
                    onClick={() => setReport(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div style={{ flex: 1, minWidth: 0 }}>
          {report === 'trial_balance' && (
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

          {report === 'gl_detail' && (
            <section className="panel">
              <h2>General ledger</h2>
              {accounts.map((a) => {
                const accountLines = lines.filter((l) => l.gl_account_id === a.id)
                if (accountLines.length === 0) return null
                let running = 0
                return (
                  <div key={a.id} style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.4rem' }}>
                      {a.code} — {a.name}
                    </h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Debit</th>
                          <th>Credit</th>
                          <th>Memo</th>
                          <th>Running balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accountLines.map((l) => {
                          running += a.normal_balance === 'debit' ? l.debit - l.credit : l.credit - l.debit
                          return (
                            <tr key={l.id}>
                              <td>{l.debit > 0 ? `$${l.debit.toFixed(2)}` : ''}</td>
                              <td>{l.credit > 0 ? `$${l.credit.toFixed(2)}` : ''}</td>
                              <td className="muted">{l.memo ?? '—'}</td>
                              <td>${running.toFixed(2)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </section>
          )}

          {report === 'pl' && (
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

          {report === 'bs' && (
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

          {(report === 'ar_aging_summary' || report === 'ap_aging_summary') && (
            <AgingSummary
              title={report === 'ar_aging_summary' ? 'AR aging summary' : 'AP aging summary'}
              rows={(report === 'ar_aging_summary' ? openInvoices : openBills).map((doc) => ({
                partyName: report === 'ar_aging_summary' ? customerName((doc as Invoice).customer_id) : supplierName((doc as Bill).supplier_id),
                amount: doc.amount,
                bucket: agingBucket(doc.due_date, today),
              }))}
            />
          )}

          {report === 'ar_aging_detail' && (
            <AgingDetail
              title="AR aging detail"
              docNumberLabel="Invoice #"
              rows={openInvoices.map((inv) => ({
                docNumber: inv.invoice_number,
                partyName: customerName(inv.customer_id),
                amount: inv.amount,
                dueDate: inv.due_date,
                bucket: agingBucket(inv.due_date, today),
              }))}
            />
          )}

          {report === 'ap_aging_detail' && (
            <AgingDetail
              title="AP aging detail"
              docNumberLabel="Bill #"
              rows={openBills.map((bill) => ({
                docNumber: bill.bill_number,
                partyName: supplierName(bill.supplier_id),
                amount: bill.amount,
                dueDate: bill.due_date,
                bucket: agingBucket(bill.due_date, today),
              }))}
            />
          )}

          {report === 'customer_balance' && (
            <BalanceSummary
              title="Customer balances"
              partyLabel="Customer"
              parties={customers}
              docs={openInvoices}
              partyIdKey="customer_id"
            />
          )}

          {report === 'vendor_balance' && (
            <BalanceSummary
              title="Vendor balances"
              partyLabel="Vendor"
              parties={suppliers}
              docs={openBills}
              partyIdKey="supplier_id"
            />
          )}

          {report === 'sales_by_customer' && (
            <SalesByParty
              title="Sales by customer"
              partyLabel="Customer"
              docs={invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled')}
              nameFor={(id) => customerName(id)}
              partyIdKey="customer_id"
            />
          )}

          {report === 'purchases_by_supplier' && (
            <SalesByParty
              title="Purchases by supplier"
              partyLabel="Supplier"
              docs={bills.filter((b) => b.status !== 'draft' && b.status !== 'cancelled')}
              nameFor={(id) => supplierName(id)}
              partyIdKey="supplier_id"
            />
          )}

          {report === 'sales_by_item' && (
            <ItemBreakdown
              title="Sales by item"
              lines={soLines}
              amountOf={(l) => l.quantity_ordered * (l.unit_price ?? 0)}
              itemLabel={itemLabel}
            />
          )}

          {report === 'purchases_by_item' && (
            <ItemBreakdown
              title="Purchases by item"
              lines={poLines}
              amountOf={(l) => l.quantity_ordered * (l.unit_cost ?? 0)}
              itemLabel={itemLabel}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function AgingSummary({ title, rows }: { title: string; rows: { partyName: string; amount: number; bucket: AgingBucket }[] }) {
  const parties = [...new Set(rows.map((r) => r.partyName))].sort()
  return (
    <section className="panel">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Party</th>
            {AGING_BUCKETS.map((b) => (
              <th key={b}>{b}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {parties.map((party) => {
            const partyRows = rows.filter((r) => r.partyName === party)
            const total = partyRows.reduce((s, r) => s + r.amount, 0)
            return (
              <tr key={party}>
                <td>{party}</td>
                {AGING_BUCKETS.map((b) => {
                  const sum = partyRows.filter((r) => r.bucket === b).reduce((s, r) => s + r.amount, 0)
                  return <td key={b}>{sum > 0 ? `$${sum.toFixed(2)}` : ''}</td>
                })}
                <td style={{ fontWeight: 700 }}>${total.toFixed(2)}</td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={AGING_BUCKETS.length + 2} className="muted">
                Nothing outstanding.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}

function AgingDetail({
  title,
  docNumberLabel,
  rows,
}: {
  title: string
  docNumberLabel: string
  rows: { docNumber: string; partyName: string; amount: number; dueDate: string | null; bucket: AgingBucket }[]
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>{docNumberLabel}</th>
            <th>Party</th>
            <th>Amount</th>
            <th>Due</th>
            <th>Bucket</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.docNumber}>
              <td>{r.docNumber}</td>
              <td>{r.partyName}</td>
              <td>${r.amount.toFixed(2)}</td>
              <td>{r.dueDate ?? '—'}</td>
              <td>
                <span className={r.bucket === 'Current' ? 'badge badge-draft' : 'badge badge-overdue'}>
                  {r.bucket}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Nothing outstanding.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}

function BalanceSummary({
  title,
  partyLabel,
  parties,
  docs,
  partyIdKey,
}: {
  title: string
  partyLabel: string
  parties: { id: string; name: string }[]
  docs: (Invoice | Bill)[]
  partyIdKey: 'customer_id' | 'supplier_id'
}) {
  const rows = parties
    .map((party) => ({
      name: party.name,
      total: docs
        .filter((d) => (d as unknown as Record<string, string | null>)[partyIdKey] === party.id)
        .reduce((s, d) => s + d.amount, 0),
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)

  return (
    <section className="panel">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>{partyLabel}</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>${r.total.toFixed(2)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="muted">
                Nothing outstanding.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}

function SalesByParty({
  title,
  partyLabel,
  docs,
  nameFor,
  partyIdKey,
}: {
  title: string
  partyLabel: string
  docs: (Invoice | Bill)[]
  nameFor: (id: string | null) => string
  partyIdKey: 'customer_id' | 'supplier_id'
}) {
  const byParty = new Map<string, number>()
  for (const doc of docs) {
    const id = (doc as unknown as Record<string, string | null>)[partyIdKey]
    const name = nameFor(id)
    byParty.set(name, (byParty.get(name) ?? 0) + doc.amount)
  }
  const rows = [...byParty.entries()].sort((a, b) => b[1] - a[1])

  return (
    <section className="panel">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>{partyLabel}</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, total]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>${total.toFixed(2)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="muted">
                No activity yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}

function ItemBreakdown<T extends { item_id: string }>({
  title,
  lines,
  amountOf,
  itemLabel,
}: {
  title: string
  lines: T[]
  amountOf: (line: T) => number
  itemLabel: (id: string) => string
}) {
  const byItem = new Map<string, number>()
  for (const line of lines) {
    byItem.set(line.item_id, (byItem.get(line.item_id) ?? 0) + amountOf(line))
  }
  const rows = [...byItem.entries()].sort((a, b) => b[1] - a[1])

  return (
    <section className="panel">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([itemId, total]) => (
            <tr key={itemId}>
              <td>{itemLabel(itemId)}</td>
              <td>${total.toFixed(2)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="muted">
                No activity yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
