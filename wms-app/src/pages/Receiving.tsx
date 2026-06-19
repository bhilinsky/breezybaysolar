import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity, generateNumber } from '../lib/activity'
import type { Item, Location, PurchaseOrder, PurchaseOrderItem, Supplier } from '../types'

export default function Receiving() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [supplierId, setSupplierId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [ordersRes, suppliersRes, itemsRes, locationsRes] = await Promise.all([
      supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('items').select('*').order('name'),
      supabase.from('locations').select('*').order('code'),
    ])
    setOrders(ordersRes.data ?? [])
    setSuppliers(suppliersRes.data ?? [])
    setItems(itemsRes.data ?? [])
    setLocations(locationsRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const po_number = generateNumber('PO')
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({
        po_number,
        supplier_id: supplierId || null,
        expected_date: expectedDate || null,
        notes: notes || null,
        status: 'ordered',
      })
      .select('id')
      .single()
    if (error) return alert(error.message)
    await logActivity('created', 'purchase_order', data.id, { po_number })
    setShowCreate(false)
    setSupplierId('')
    setExpectedDate('')
    setNotes('')
    await load()
    setSelectedId(data.id)
  }

  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null

  if (loading) return <p>Loading…</p>

  if (selectedOrder) {
    return (
      <PurchaseOrderDetail
        order={selectedOrder}
        suppliers={suppliers}
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
        <h1>Receiving</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + New purchase order
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>PO #</th>
            <th>Supplier</th>
            <th>Status</th>
            <th>Expected</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.po_number}</td>
              <td>{suppliers.find((s) => s.id === order.supplier_id)?.name ?? '—'}</td>
              <td>
                <span className={`badge badge-${order.status}`}>{order.status}</span>
              </td>
              <td>{order.expected_date ?? '—'}</td>
              <td className="row-actions">
                <button className="btn-link" onClick={() => setSelectedId(order.id)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No purchase orders yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h2>New purchase order</h2>
            <label>
              Supplier
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Expected date
              <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
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

function PurchaseOrderDetail({
  order,
  suppliers,
  items,
  locations,
  onBack,
  onChanged,
}: {
  order: PurchaseOrder
  suppliers: Supplier[]
  items: Item[]
  locations: Location[]
  onBack: () => void
  onChanged: () => Promise<void>
}) {
  const [lines, setLines] = useState<PurchaseOrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newItemId, setNewItemId] = useState('')
  const [newQty, setNewQty] = useState(1)
  const [newCost, setNewCost] = useState('')
  const [receiveLocationId, setReceiveLocationId] = useState(locations[0]?.id ?? '')
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({})

  const loadLines = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('purchase_order_items').select('*').eq('purchase_order_id', order.id)
    setLines(data ?? [])
    const defaults: Record<string, number> = {}
    for (const line of data ?? []) {
      defaults[line.id] = Math.max(line.quantity_ordered - line.quantity_received, 0)
    }
    setReceiveQty(defaults)
    setLoading(false)
  }, [order.id])

  useEffect(() => {
    void loadLines()
  }, [loadLines])

  async function addLine() {
    if (!newItemId || newQty <= 0) return
    const { error } = await supabase.from('purchase_order_items').insert({
      purchase_order_id: order.id,
      item_id: newItemId,
      quantity_ordered: newQty,
      unit_cost: newCost ? Number(newCost) : null,
    })
    if (error) return alert(error.message)
    setNewItemId('')
    setNewQty(1)
    setNewCost('')
    void loadLines()
  }

  async function receiveLine(line: PurchaseOrderItem) {
    const qty = receiveQty[line.id] ?? 0
    if (qty <= 0) return
    if (!receiveLocationId) return alert('Choose a location to receive into.')

    const remaining = line.quantity_ordered - line.quantity_received
    if (qty > remaining && !confirm(`Receiving ${qty} exceeds the ${remaining} still expected. Continue?`)) return

    const { data: existingLevel } = await supabase
      .from('inventory_levels')
      .select('*')
      .eq('item_id', line.item_id)
      .eq('location_id', receiveLocationId)
      .maybeSingle()

    const newQuantity = (existingLevel?.quantity ?? 0) + qty
    const { error: levelError } = await supabase
      .from('inventory_levels')
      .upsert(
        { item_id: line.item_id, location_id: receiveLocationId, quantity: newQuantity, updated_at: new Date().toISOString() },
        { onConflict: 'item_id,location_id' },
      )
    if (levelError) return alert(levelError.message)

    const newReceived = line.quantity_received + qty
    const { error: lineError } = await supabase
      .from('purchase_order_items')
      .update({ quantity_received: newReceived })
      .eq('id', line.id)
    if (lineError) return alert(lineError.message)

    const item = items.find((i) => i.id === line.item_id)
    await logActivity('received', 'purchase_order_item', line.id, {
      po_number: order.po_number,
      item: item?.sku,
      quantity: qty,
    })

    const { data: freshLines } = await supabase.from('purchase_order_items').select('*').eq('purchase_order_id', order.id)
    const allReceived = (freshLines ?? []).every((l) => l.quantity_received >= l.quantity_ordered)
    const anyReceived = (freshLines ?? []).some((l) => l.quantity_received > 0)
    const newStatus = allReceived ? 'received' : anyReceived ? 'ordered' : order.status
    if (newStatus !== order.status) {
      await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', order.id)
    }

    await loadLines()
    await onChanged()
  }

  return (
    <div>
      <button className="btn-link" onClick={onBack}>
        ← Back to purchase orders
      </button>
      <div className="page-header">
        <h1>{order.po_number}</h1>
        <span className={`badge badge-${order.status}`}>{order.status}</span>
      </div>
      <p className="muted">Supplier: {suppliers.find((s) => s.id === order.supplier_id)?.name ?? '—'}</p>

      <section className="panel">
        <h2>Receive into</h2>
        <select value={receiveLocationId} onChange={(e) => setReceiveLocationId(e.target.value)}>
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
                <th>Received</th>
                <th>Unit cost</th>
                <th>Receive now</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const item = items.find((i) => i.id === line.item_id)
                const remaining = line.quantity_ordered - line.quantity_received
                return (
                  <tr key={line.id}>
                    <td>{item ? `${item.sku} — ${item.name}` : line.item_id}</td>
                    <td>{line.quantity_ordered}</td>
                    <td>{line.quantity_received}</td>
                    <td>{line.unit_cost ?? '—'}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        style={{ width: 80 }}
                        disabled={remaining <= 0}
                        value={receiveQty[line.id] ?? 0}
                        onChange={(e) => setReceiveQty({ ...receiveQty, [line.id]: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <button className="btn-link" disabled={remaining <= 0} onClick={() => receiveLine(line)}>
                        Receive
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
            value={newCost}
            onChange={(e) => setNewCost(e.target.value)}
            placeholder="Unit cost"
          />
          <button type="button" className="btn-secondary" onClick={addLine}>
            Add line
          </button>
        </div>
      </section>
    </div>
  )
}
