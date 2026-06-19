import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LowStockItem } from '../types'

interface Stats {
  itemCount: number
  openOrders: number
  openPOs: number
}

interface ActivityRow {
  id: string
  action: string
  entity_type: string
  created_at: string
  details: Record<string, unknown> | null
}

export default function Dashboard() {
  const [lowStock, setLowStock] = useState<LowStockItem[]>([])
  const [stats, setStats] = useState<Stats>({ itemCount: 0, openOrders: 0, openPOs: 0 })
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [lowStockRes, itemsRes, ordersRes, posRes, activityRes] = await Promise.all([
      supabase.from('low_stock_items').select('*').order('sku'),
      supabase.from('items').select('id', { count: 'exact', head: true }),
      supabase
        .from('sales_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['draft', 'confirmed']),
      supabase
        .from('purchase_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['draft', 'ordered']),
      supabase
        .from('activity_log')
        .select('id, action, entity_type, created_at, details')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    setLowStock(lowStockRes.data ?? [])
    setStats({
      itemCount: itemsRes.count ?? 0,
      openOrders: ordersRes.count ?? 0,
      openPOs: posRes.count ?? 0,
    })
    setActivity(activityRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h1>Dashboard</h1>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.itemCount}</div>
          <div className="stat-label">Items tracked</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.openOrders}</div>
          <div className="stat-label">Open sales orders</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.openPOs}</div>
          <div className="stat-label">Open purchase orders</div>
        </div>
        <div className="stat-card warn">
          <div className="stat-value">{lowStock.length}</div>
          <div className="stat-label">Low stock items</div>
        </div>
      </div>

      <section className="panel">
        <h2>Low stock</h2>
        {lowStock.length === 0 ? (
          <p className="muted">Nothing below reorder point.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>On hand</th>
                <th>Reorder point</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((item) => (
                <tr key={item.id}>
                  <td>{item.sku}</td>
                  <td>{item.name}</td>
                  <td>{item.total_quantity}</td>
                  <td>{item.reorder_point}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Recent activity</h2>
        {activity.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          <ul className="activity-list">
            {activity.map((row) => (
              <li key={row.id}>
                <span className="activity-action">{row.action}</span>
                <span className="muted"> · {row.entity_type}</span>
                <span className="activity-time">{new Date(row.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
