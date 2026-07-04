import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import type { Container, InventoryLevel, Item, Location } from '../types'

type ScanResult =
  | { kind: 'container'; container: Container }
  | { kind: 'item'; item: Item; levels: InventoryLevel[] }
  | { kind: 'not_found'; code: string }

interface MovementRow {
  id: string
  container_id: string | null
  item_id: string | null
  quantity: number | null
  from_location_id: string | null
  to_location_id: string
  scan_code: string
  occurred_at: string
}

export default function ScanMove() {
  const [locations, setLocations] = useState<Location[]>([])
  const [recent, setRecent] = useState<MovementRow[]>([])
  const [recentContainers, setRecentContainers] = useState<Pick<Container, 'id' | 'code' | 'label'>[]>([])
  const [recentItems, setRecentItems] = useState<Pick<Item, 'id' | 'sku' | 'name'>[]>([])
  const [scanValue, setScanValue] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [destinationId, setDestinationId] = useState('')
  const [sourceLevelId, setSourceLevelId] = useState('')
  const [moveQty, setMoveQty] = useState(0)
  const [cameraOn, setCameraOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const loadStatic = useCallback(async () => {
    const [locationsRes, recentRes] = await Promise.all([
      supabase.from('locations').select('*').order('code'),
      supabase.from('movements').select('*').order('occurred_at', { ascending: false }).limit(15),
    ])
    const rows = recentRes.data ?? []
    const containerIds = [...new Set(rows.map((r) => r.container_id).filter((v): v is string => Boolean(v)))]
    const itemIds = [...new Set(rows.map((r) => r.item_id).filter((v): v is string => Boolean(v)))]
    const [containersRes, itemsRes] = await Promise.all([
      containerIds.length
        ? supabase.from('containers').select('id, code, label').in('id', containerIds)
        : Promise.resolve({ data: [] }),
      itemIds.length
        ? supabase.from('items').select('id, sku, name').in('id', itemIds)
        : Promise.resolve({ data: [] }),
    ])

    setLocations(locationsRes.data ?? [])
    setRecent(rows)
    setRecentContainers(containersRes.data ?? [])
    setRecentItems(itemsRes.data ?? [])
  }, [])

  useEffect(() => {
    void loadStatic()
  }, [loadStatic])

  useEffect(() => {
    inputRef.current?.focus()
  }, [result, message, error])

  useEffect(() => {
    if (!cameraOn || !videoRef.current) return
    const codeReader = new BrowserMultiFormatReader()
    let cancelled = false
    let controls: IScannerControls | null = null

    codeReader
      .decodeFromVideoDevice(undefined, videoRef.current, (decoded) => {
        if (decoded && !cancelled) {
          setCameraOn(false)
          void handleScan(decoded.getText())
        }
      })
      .then((c) => {
        controls = c
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not start camera.'))

    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [cameraOn])

  function locationName(id: string | null) {
    if (!id) return '—'
    const l = locations.find((loc) => loc.id === id)
    return l ? `${l.code} — ${l.name}` : id
  }

  async function handleScan(code: string) {
    const trimmed = code.trim()
    if (!trimmed) return
    setError(null)
    setMessage(null)
    setScanValue('')

    const { data: container } = await supabase.from('containers').select('*').eq('code', trimmed).maybeSingle()
    if (container) {
      setResult({ kind: 'container', container })
      setDestinationId('')
      return
    }

    const bySku = await supabase.from('items').select('*').eq('sku', trimmed).maybeSingle()
    const byBarcode = bySku.data ? null : await supabase.from('items').select('*').eq('barcode', trimmed).maybeSingle()
    const item = bySku.data ?? byBarcode?.data ?? null

    if (item) {
      const { data: levels } = await supabase.from('inventory_levels').select('*').eq('item_id', item.id)
      const levelRows = levels ?? []
      setResult({ kind: 'item', item, levels: levelRows })
      setDestinationId('')
      setSourceLevelId(levelRows[0]?.id ?? '')
      setMoveQty(levelRows[0]?.quantity ?? 0)
      return
    }

    setResult({ kind: 'not_found', code: trimmed })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleScan(scanValue)
    }
  }

  function selectSourceLevel(levelId: string) {
    setSourceLevelId(levelId)
    if (result?.kind === 'item') {
      const level = result.levels.find((l) => l.id === levelId)
      setMoveQty(level?.quantity ?? 0)
    }
  }

  async function confirmContainerMove() {
    if (result?.kind !== 'container' || !destinationId) return
    setError(null)
    const fromLocationId = result.container.location_id

    const { error: updateError } = await supabase
      .from('containers')
      .update({ location_id: destinationId, updated_at: new Date().toISOString() })
      .eq('id', result.container.id)
    if (updateError) return setError(updateError.message)

    await supabase
      .from('inventory_levels')
      .update({ location_id: destinationId, updated_at: new Date().toISOString() })
      .eq('container_id', result.container.id)

    await supabase.from('movements').insert({
      container_id: result.container.id,
      from_location_id: fromLocationId,
      to_location_id: destinationId,
      scan_code: result.container.code,
    })
    await logActivity('moved', 'container', result.container.id, {
      code: result.container.code,
      to: locationName(destinationId),
    })

    setMessage(`Moved rack ${result.container.code} to ${locationName(destinationId)}.`)
    setResult(null)
    setDestinationId('')
    void loadStatic()
  }

  async function confirmItemMove() {
    if (result?.kind !== 'item' || !destinationId || moveQty <= 0) return
    setError(null)
    const sourceLevel = result.levels.find((l) => l.id === sourceLevelId)
    if (!sourceLevel) return setError('Choose a source location.')
    if (sourceLevel.location_id === destinationId) return setError('Destination is the same as the source.')
    if (moveQty > sourceLevel.quantity) return setError('Quantity exceeds what is on hand there.')

    const remaining = sourceLevel.quantity - moveQty
    const { error: sourceError } = await supabase
      .from('inventory_levels')
      .update({ quantity: remaining, updated_at: new Date().toISOString() })
      .eq('id', sourceLevel.id)
    if (sourceError) return setError(sourceError.message)

    const { data: existingDest } = await supabase
      .from('inventory_levels')
      .select('*')
      .eq('item_id', result.item.id)
      .eq('location_id', destinationId)
      .is('container_id', null)
      .maybeSingle()

    if (existingDest) {
      await supabase
        .from('inventory_levels')
        .update({ quantity: existingDest.quantity + moveQty, updated_at: new Date().toISOString() })
        .eq('id', existingDest.id)
    } else {
      await supabase.from('inventory_levels').insert({
        item_id: result.item.id,
        location_id: destinationId,
        quantity: moveQty,
      })
    }

    await supabase.from('movements').insert({
      item_id: result.item.id,
      quantity: moveQty,
      from_location_id: sourceLevel.location_id,
      to_location_id: destinationId,
      scan_code: result.item.barcode || result.item.sku,
    })
    await logActivity('moved', 'item', result.item.id, {
      sku: result.item.sku,
      quantity: moveQty,
      to: locationName(destinationId),
    })

    setMessage(`Moved ${moveQty} × ${result.item.sku} to ${locationName(destinationId)}.`)
    setResult(null)
    setDestinationId('')
    void loadStatic()
  }

  function movementLabel(m: MovementRow) {
    if (m.container_id) {
      const c = recentContainers.find((rc) => rc.id === m.container_id)
      return `Rack ${c?.code ?? m.container_id}`
    }
    const i = recentItems.find((ri) => ri.id === m.item_id)
    return `${m.quantity ?? ''} × ${i?.sku ?? m.item_id}`
  }

  return (
    <div>
      <div className="page-header">
        <h1>Scan to move</h1>
      </div>
      <p className="muted">
        Scan a rack or item's barcode/QR tag — with the camera below, or a USB/Bluetooth scanner typed into the box
        — then confirm where it moved to.
      </p>

      <div className="panel">
        <label>
          Scan or type a code
          <input
            ref={inputRef}
            className="scan-input"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scan here…"
            autoFocus
          />
        </label>

        <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: '0.75rem' }}>
          <button type="button" className="btn-secondary" onClick={() => setCameraOn((v) => !v)}>
            {cameraOn ? 'Stop camera' : 'Use camera instead'}
          </button>
        </div>

        {cameraOn && (
          <div style={{ marginTop: '0.75rem' }}>
            <video ref={videoRef} className="scan-video" muted />
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
        {message && <p className="info-text">{message}</p>}

        {result?.kind === 'not_found' && (
          <p className="error-text">No rack or item found for code "{result.code}".</p>
        )}

        {result?.kind === 'container' && (
          <div className="scan-result-card">
            <h2>Rack {result.container.code}</h2>
            <p>{result.container.label}</p>
            <p className="muted">Currently at: {locationName(result.container.location_id)}</p>
            <label>
              Move to
              <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
                <option value="">Select destination…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setResult(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={!destinationId} onClick={confirmContainerMove}>
                Confirm move
              </button>
            </div>
          </div>
        )}

        {result?.kind === 'item' && (
          <div className="scan-result-card">
            <h2>
              {result.item.sku} — {result.item.name}
            </h2>
            {result.levels.length === 0 ? (
              <p className="muted">No recorded stock for this item yet — set an initial location on Inventory.</p>
            ) : (
              <>
                <label>
                  Move from
                  <select value={sourceLevelId} onChange={(e) => selectSourceLevel(e.target.value)}>
                    {result.levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {locationName(l.location_id)} ({l.quantity} on hand)
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity to move
                  <input
                    type="number"
                    min={1}
                    max={result.levels.find((l) => l.id === sourceLevelId)?.quantity ?? 1}
                    value={moveQty}
                    onChange={(e) => setMoveQty(Number(e.target.value))}
                  />
                </label>
                <label>
                  Move to
                  <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
                    <option value="">Select destination…</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} — {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setResult(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!destinationId || moveQty <= 0 || result.levels.length === 0}
                onClick={confirmItemMove}
              >
                Confirm move
              </button>
            </div>
          </div>
        )}
      </div>

      <section className="panel">
        <h2>Recent moves</h2>
        {recent.length === 0 ? (
          <p className="muted">No moves logged yet.</p>
        ) : (
          <ul className="activity-list">
            {recent.map((m) => (
              <li key={m.id}>
                <span className="activity-action">{movementLabel(m)}</span>
                <span className="muted">
                  {' '}
                  · {locationName(m.from_location_id)} → {locationName(m.to_location_id)}
                </span>
                <span className="activity-time">{new Date(m.occurred_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
