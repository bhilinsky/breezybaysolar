import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import type { InventoryLevel, Item, Location } from '../types'

export default function Inventory() {
  const [levels, setLevels] = useState<InventoryLevel[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [itemId, setItemId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [quantity, setQuantity] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [levelsRes, itemsRes, locationsRes] = await Promise.all([
      supabase.from('inventory_levels').select('*'),
      supabase.from('items').select('*').order('name'),
      supabase.from('locations').select('*').order('code'),
    ])
    setLevels(levelsRes.data ?? [])
    setItems(itemsRes.data ?? [])
    setLocations(locationsRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function itemName(id: string) {
    const item = items.find((i) => i.id === id)
    return item ? `${item.sku} — ${item.name}` : id
  }

  function locationName(id: string) {
    const location = locations.find((l) => l.id === id)
    return location ? `${location.code} — ${location.name}` : id
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!itemId || !locationId) return setError('Choose an item and a location.')

    const { error: upsertError } = await supabase
      .from('inventory_levels')
      .upsert(
        { item_id: itemId, location_id: locationId, quantity, updated_at: new Date().toISOString() },
        { onConflict: 'item_id,location_id' },
      )
    if (upsertError) return setError(upsertError.message)

    await logActivity('adjusted', 'inventory_level', null, {
      item: itemName(itemId),
      location: locationName(locationId),
      quantity,
    })
    setShowForm(false)
    setItemId('')
    setLocationId('')
    setQuantity(0)
    void load()
  }

  return (
    <div>
      <div className="page-header">
        <h1>Inventory</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + Adjust stock
        </button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Location</th>
              <th>Quantity</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level) => (
              <tr key={level.id}>
                <td>{itemName(level.item_id)}</td>
                <td>{locationName(level.location_id)}</td>
                <td>{level.quantity}</td>
                <td>{new Date(level.updated_at).toLocaleString()}</td>
              </tr>
            ))}
            {levels.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No stock recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h2>Adjust stock</h2>
            <label>
              Item
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                <option value="">Select item…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} — {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Location
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
                <option value="">Select location…</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} — {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity on hand
              <input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                required
              />
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
