import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity, generateNumber } from '../lib/activity'
import { downloadShipRushCsv } from '../lib/shiprush'
import type { Contractor, Customer, Item, Location, SalesOrder, SalesOrderItem } from '../types'

export default function Orders() {
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [customerId, setCustomerId] = useState('')
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [ordersRes, customersRes, contractorsRes, itemsRes, locationsRes] = await Promise.all([
      supabase.from('sales_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('*').order('name'),
      supabase.from('contractors').select('*').order('name'),
      supabase.from('items').select('*').order('name'),
      supabase.from('locations').select('*').order('code'),
    ])
    setOrders(ordersRes.data ?? [])
    setCustomers(customersRes.data ?? [])
    setContractors(contractorsRes.data ?? [])
    setItems(itemsRes.data ?? [])
    setLocations(locationsRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const order_number = generateNumber('SO')
    const { data, error } = await supabase
      .from('sales_orders')
      .insert({ order_number, customer_id: customerId || null, notes: notes || null, status: 'confirmed' })
      .select('id')
      .single()
    if (error) return alert(error.message)
    await logActivity('created', 'sales_order', data.id, { order_number })
    setShowCreate(false)
    setCustomerId('')
    setNotes('')
    await load()
    setSelectedId(data.id)
  }

  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null

  if (loading) return <p>Loading…</p>

  if (selectedOrder) {
    return (
      <SalesOrderDetail
        order={selectedOrder}
        customers={customers}
        contractors={contractors}
        items={items}
        locations={locations}
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
        <h1>Orders</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + New order
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Order #</th>
            <th>Customer</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.order_number}</td>
              <td>{customers.find((c) => c.id === order.customer_id)?.name ?? '—'}</td>
              <td>
                <span className={`badge badge-${order.status}`}>{order.status}</span>
              </td>
              <td className="row-actions">
                <button className="btn-link" onClick={() => setSelectedId(order.id)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No orders yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h2>New order</h2>
            <label>
              Customer
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">None</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
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

function SalesOrderDetail({
  order,
  customers,
  contractors,
  items,
  locations,
  onBack,
  onChanged,
}: {
  order: SalesOrder
  customers: Customer[]
  contractors: Contractor[]
  items: Item[]
  locations: Location[]
  onBack: () => void
  onChanged: () => Promise<void>
}) {
  const [lines, setLines] = useState<SalesOrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newItemId, setNewItemId] = useState('')
  const [newQty, setNewQty] = useState(1)
  const [newPrice, setNewPrice] = useState('')
  const [fulfillLocationId, setFulfillLocationId] = useState(locations[0]?.id ?? '')
  const [fulfillQty, setFulfillQty] = useState<Record<string, number>>({})
  const [contractorId, setContractorId] = useState(order.contractor_id ?? '')

  const loadLines = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', order.id)
    setLines(data ?? [])
    const defaults: Record<string, number> = {}
    for (const line of data ?? []) {
      defaults[line.id] = Math.max(line.quantity_ordered - line.quantity_fulfilled, 0)
    }
    setFulfillQty(defaults)
    setLoading(false)
  }, [order.id])

  useEffect(() => {
    void loadLines()
  }, [loadLines])

  async function addLine() {
    if (!newItemId || newQty <= 0) return
    const { error } = await supabase.from('sales_order_items').insert({
      sales_order_id: order.id,
      item_id: newItemId,
      quantity_ordered: newQty,
      unit_price: newPrice ? Number(newPrice) : null,
    })
    if (error) return alert(error.message)
    setNewItemId('')
    setNewQty(1)
    setNewPrice('')
    void loadLines()
  }

  async function fulfillLine(line: SalesOrderItem) {
    const qty = fulfillQty[line.id] ?? 0
    if (qty <= 0) return
    if (!fulfillLocationId) return alert('Choose a location to fulfill from.')

    const { data: existingLevel } = await supabase
      .from('inventory_levels')
      .select('*')
      .eq('item_id', line.item_id)
      .eq('location_id', fulfillLocationId)
      .maybeSingle()

    const onHand = existingLevel?.quantity ?? 0
    if (qty > onHand && !confirm(`Only ${onHand} on hand at this location. Fulfill ${qty} anyway (stock will go negative)?`)) {
      return
    }

    const { error: levelError } = await supabase
      .from('inventory_levels')
      .upsert(
        { item_id: line.item_id, location_id: fulfillLocationId, quantity: onHand - qty, updated_at: new Date().toISOString() },
        { onConflict: 'item_id,location_id' },
      )
    if (levelError) return alert(levelError.message)

    const newFulfilled = line.quantity_fulfilled + qty
    const { error: lineError } = await supabase
      .from('sales_order_items')
      .update({ quantity_fulfilled: newFulfilled, location_id: fulfillLocationId })
      .eq('id', line.id)
    if (lineError) return alert(lineError.message)

    const item = items.find((i) => i.id === line.item_id)
    await logActivity('fulfilled', 'sales_order_item', line.id, {
      order_number: order.order_number,
      item: item?.sku,
      quantity: qty,
    })

    const { data: freshLines } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', order.id)
    const allFulfilled = (freshLines ?? []).every((l) => l.quantity_fulfilled >= l.quantity_ordered)
    if (allFulfilled && order.status !== 'fulfilled') {
      await supabase.from('sales_orders').update({ status: 'fulfilled' }).eq('id', order.id)
    }

    await loadLines()
    await onChanged()
  }

  async function assignContractor(id: string) {
    setContractorId(id)
    const { error } = await supabase
      .from('sales_orders')
      .update({ contractor_id: id || null })
      .eq('id', order.id)
    if (error) return alert(error.message)
    await onChanged()
  }

  function exportShipRush() {
    const customer = customers.find((c) => c.id === order.customer_id) ?? null
    downloadShipRushCsv(order, customer, lines, items)
  }

  return (
    <div>
      <button className="btn-link" onClick={onBack}>
        ← Back to orders
      </button>
      <div className="page-header">
        <h1>{order.order_number}</h1>
        <span className={`badge badge-${order.status}`}>{order.status}</span>
      </div>
      <p className="muted">Customer: {customers.find((c) => c.id === order.customer_id)?.name ?? '—'}</p>

      <section className="panel">
        <h2>Install crew / contractor</h2>
        <div className="form-row">
          <select value={contractorId} onChange={(e) => void assignContractor(e.target.value)}>
            <option value="">Unassigned</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.trade ? ` — ${c.trade}` : ''}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={exportShipRush}>
            Export for ShipRush
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Fulfill from</h2>
        <select value={fulfillLocationId} onChange={(e) => setFulfillLocationId(e.target.value)}>
          <option value="">Select location…</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} — {l.name}
            </option>
          ))}
        </select>
      </section>

      <section className="panel">
        <h2>Line items</h2>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Ordered</th>
                <th>Fulfilled</th>
                <th>Unit price</th>
                <th>Fulfill now</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const item = items.find((i) => i.id === line.item_id)
                const remaining = line.quantity_ordered - line.quantity_fulfilled
                return (
                  <tr key={line.id}>
                    <td>{item ? `${item.sku} — ${item.name}` : line.item_id}</td>
                    <td>{line.quantity_ordered}</td>
                    <td>{line.quantity_fulfilled}</td>
                    <td>{line.unit_price ?? '—'}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        style={{ width: 80 }}
                        disabled={remaining <= 0}
                        value={fulfillQty[line.id] ?? 0}
                        onChange={(e) => setFulfillQty({ ...fulfillQty, [line.id]: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <button className="btn-link" disabled={remaining <= 0} onClick={() => fulfillLine(line)}>
                        Fulfill
                      </button>
                    </td>
                  </tr>
                )
              })}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No line items yet.
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
          <input
            type="number"
            step="0.01"
            min={0}
            style={{ width: 100 }}
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="Unit price"
          />
          <button type="button" className="btn-secondary" onClick={addLine}>
            Add line
          </button>
        </div>
      </section>
    </div>
  )
}
