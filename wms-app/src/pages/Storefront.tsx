import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Container, Location } from '../types'

interface LevelRow {
  id: string
  item_id: string
  location_id: string
  container_id: string | null
  quantity: number
  items: { sku: string; name: string } | null
}

const displayTypes = ['display_case', 'storefront_floor']

export default function Storefront() {
  const [locations, setLocations] = useState<Location[]>([])
  const [containers, setContainers] = useState<Container[]>([])
  const [levels, setLevels] = useState<LevelRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const locationsRes = await supabase.from('locations').select('*').in('type', displayTypes).order('code')
    const locs = locationsRes.data ?? []
    const locIds = locs.map((l) => l.id)

    const [containersRes, levelsRes] = await Promise.all([
      locIds.length
        ? supabase.from('containers').select('*').in('location_id', locIds)
        : Promise.resolve({ data: [] }),
      locIds.length
        ? supabase.from('inventory_levels').select('*, items(sku, name)').in('location_id', locIds)
        : Promise.resolve({ data: [] }),
    ])

    setLocations(locs)
    setContainers(containersRes.data ?? [])
    setLevels((levelsRes.data as LevelRow[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <div className="page-header">
        <h1>Storefront</h1>
      </div>
      <p className="muted">What's currently on the retail floor and in display cases, by location.</p>

      {locations.length === 0 && (
        <p className="muted">
          No display locations yet. Mark a location as "Display case" or "Storefront floor" on the Locations page.
        </p>
      )}

      {locations.map((location) => {
        const locContainers = containers.filter((c) => c.location_id === location.id)
        const looseItems = levels.filter((l) => l.location_id === location.id && !l.container_id)

        return (
          <section className="panel" key={location.id}>
            <h2>
              {location.code} — {location.name}
            </h2>

            {locContainers.map((container) => {
              const containerItems = levels.filter((l) => l.container_id === container.id)
              return (
                <div key={container.id} className="storefront-container">
                  <div className="storefront-container-label">
                    Rack <strong>{container.code}</strong> — {container.label}
                  </div>
                  {containerItems.length === 0 ? (
                    <p className="muted">Empty.</p>
                  ) : (
                    <ul className="activity-list">
                      {containerItems.map((l) => (
                        <li key={l.id}>
                          {l.items?.sku} — {l.items?.name}
                          <span className="activity-time">{l.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}

            {looseItems.length > 0 && (
              <ul className="activity-list">
                {looseItems.map((l) => (
                  <li key={l.id}>
                    {l.items?.sku} — {l.items?.name}
                    <span className="activity-time">{l.quantity}</span>
                  </li>
                ))}
              </ul>
            )}

            {locContainers.length === 0 && looseItems.length === 0 && <p className="muted">Nothing here yet.</p>}
          </section>
        )
      })}
    </div>
  )
}
