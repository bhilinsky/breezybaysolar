import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import { downloadXlsx, parseXlsxRows } from '../lib/xlsx'
import type { Category, Item } from '../types'

const emptyForm = {
  sku: '',
  name: '',
  description: '',
  category_id: '',
  unit: 'each',
  reorder_point: 0,
  default_cost: '',
  barcode: '',
  amazon_seller_sku: '',
  amazon_product_type: '',
}

export default function Items() {
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [showImport, setShowImport] = useState(false)
  const [importHeaders, setImportHeaders] = useState<string[]>([])
  const [importRows, setImportRows] = useState<string[][]>([])
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [itemsRes, categoriesRes] = await Promise.all([
      supabase.from('items').select('*').order('name'),
      supabase.from('categories').select('*').order('name'),
    ])
    setItems(itemsRes.data ?? [])
    setCategories(categoriesRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
    setShowForm(true)
  }

  function startEdit(item: Item) {
    setEditingId(item.id)
    setForm({
      sku: item.sku,
      name: item.name,
      description: item.description ?? '',
      category_id: item.category_id ?? '',
      unit: item.unit,
      reorder_point: item.reorder_point,
      default_cost: item.default_cost?.toString() ?? '',
      barcode: item.barcode ?? '',
      amazon_seller_sku: item.amazon_seller_sku ?? '',
      amazon_product_type: item.amazon_product_type ?? '',
    })
    setError(null)
    setShowForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      category_id: form.category_id || null,
      unit: form.unit.trim() || 'each',
      reorder_point: Number(form.reorder_point) || 0,
      default_cost: form.default_cost ? Number(form.default_cost) : null,
      barcode: form.barcode.trim() || null,
      amazon_seller_sku: form.amazon_seller_sku.trim() || null,
      amazon_product_type: form.amazon_product_type.trim() || null,
    }

    if (editingId) {
      const { error: updateError } = await supabase.from('items').update(payload).eq('id', editingId)
      if (updateError) return setError(updateError.message)
      await logActivity('updated', 'item', editingId, { sku: payload.sku })
    } else {
      const { data, error: insertError } = await supabase.from('items').insert(payload).select('id').single()
      if (insertError) return setError(insertError.message)
      await logActivity('created', 'item', data?.id ?? null, { sku: payload.sku })
    }

    setShowForm(false)
    void load()
  }

  async function handleDelete(item: Item) {
    if (!confirm(`Delete item ${item.sku}?`)) return
    const { error: deleteError } = await supabase.from('items').delete().eq('id', item.id)
    if (deleteError) return alert(deleteError.message)
    await logActivity('deleted', 'item', item.id, { sku: item.sku })
    void load()
  }

  function exportXlsx() {
    void downloadXlsx('items.xlsx', items, [
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'unit', label: 'Unit' },
      { key: 'reorder_point', label: 'Reorder point' },
      { key: 'default_cost', label: 'Default cost' },
      { key: 'barcode', label: 'Barcode' },
    ])
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const rows = await parseXlsxRows(file)
    if (rows.length < 2) {
      setImportError('That file has no data rows.')
      return
    }
    const [hdr, ...dataRows] = rows
    setImportHeaders(hdr)
    setImportRows(dataRows)
    setImportError(null)
    setShowImport(true)
    e.target.value = ''
  }

  const importPreview = useMemo(() => {
    const findCol = (patterns: RegExp[]) => {
      for (const re of patterns) {
        const idx = importHeaders.findIndex((h) => re.test(h))
        if (idx >= 0) return idx
      }
      return -1
    }
    const skuIdx = findCol([/^sku$/i, /sku/i])
    const nameIdx = findCol([/^name$/i, /name/i])
    const categoryIdx = findCol([/categor/i])
    const unitIdx = findCol([/unit/i])
    const reorderIdx = findCol([/reorder/i])
    const costIdx = findCol([/cost/i, /price/i])
    const barcodeIdx = findCol([/barcode/i])

    return importRows
      .map((r) => ({
        sku: skuIdx >= 0 ? (r[skuIdx] ?? '').trim() : '',
        name: nameIdx >= 0 ? (r[nameIdx] ?? '').trim() : '',
        category: categoryIdx >= 0 ? (r[categoryIdx] ?? '').trim() : '',
        unit: unitIdx >= 0 ? (r[unitIdx] ?? '').trim() || 'each' : 'each',
        reorder_point: reorderIdx >= 0 ? Number(r[reorderIdx]) || 0 : 0,
        default_cost: costIdx >= 0 && r[costIdx] ? Number(r[costIdx].replace(/[$,]/g, '')) : null,
        barcode: barcodeIdx >= 0 ? (r[barcodeIdx] ?? '').trim() || null : null,
      }))
      .filter((r) => r.sku && r.name)
  }, [importRows, importHeaders])

  async function confirmImport() {
    setImporting(true)
    setImportError(null)

    const categoryNames = [...new Set(importPreview.map((r) => r.category).filter(Boolean))]
    const categoryIdByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
    const missingNames = categoryNames.filter((n) => !categoryIdByName.has(n.toLowerCase()))
    if (missingNames.length > 0) {
      const { data: created, error: catError } = await supabase
        .from('categories')
        .insert(missingNames.map((name) => ({ name })))
        .select('id, name')
      if (catError) {
        setImporting(false)
        return setImportError(catError.message)
      }
      for (const c of created ?? []) categoryIdByName.set(c.name.toLowerCase(), c.id)
    }

    const payload = importPreview.map((r) => ({
      sku: r.sku,
      name: r.name,
      category_id: r.category ? (categoryIdByName.get(r.category.toLowerCase()) ?? null) : null,
      unit: r.unit,
      reorder_point: r.reorder_point,
      default_cost: r.default_cost,
      barcode: r.barcode,
    }))

    const { error: upsertError } = await supabase.from('items').upsert(payload, { onConflict: 'sku' })
    setImporting(false)
    if (upsertError) return setImportError(upsertError.message)

    await logActivity('imported', 'items', null, { count: payload.length })
    setShowImport(false)
    setImportRows([])
    setImportHeaders([])
    void load()
  }

  const filtered = items.filter((item) => {
    const q = search.toLowerCase()
    return item.sku.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="page-header">
        <h1>Items</h1>
        <div className="row-actions">
          <button className="btn-secondary" onClick={exportXlsx}>
            Export Excel
          </button>
          <button className="btn-secondary" onClick={() => document.getElementById('items-xlsx-input')?.click()}>
            Import Excel
          </button>
          <input
            id="items-xlsx-input"
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={(e) => void handleImportFile(e)}
          />
          <button className="btn-primary" onClick={startCreate}>
            + New item
          </button>
        </div>
      </div>

      <input
        className="search-input"
        placeholder="Search by SKU or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Reorder pt</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td>{item.sku}</td>
                <td>{item.name}</td>
                <td>{categories.find((c) => c.id === item.category_id)?.name ?? '—'}</td>
                <td>{item.unit}</td>
                <td>{item.reorder_point}</td>
                <td className="row-actions">
                  <button className="btn-link" onClick={() => startEdit(item)}>
                    Edit
                  </button>
                  <button className="btn-link danger" onClick={() => handleDelete(item)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h2>{editingId ? 'Edit item' : 'New item'}</h2>
            <label>
              SKU
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
            </label>
            <label>
              Barcode (scan tag, if different from SKU)
              <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </label>
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <label>
              Category
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                Unit
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </label>
              <label>
                Reorder point
                <input
                  type="number"
                  min={0}
                  value={form.reorder_point}
                  onChange={(e) => setForm({ ...form, reorder_point: Number(e.target.value) })}
                />
              </label>
              <label>
                Default cost
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.default_cost}
                  onChange={(e) => setForm({ ...form, default_cost: e.target.value })}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Amazon seller SKU (optional)
                <input
                  value={form.amazon_seller_sku}
                  onChange={(e) => setForm({ ...form, amazon_seller_sku: e.target.value })}
                />
              </label>
              <label>
                Amazon product type (optional)
                <input
                  value={form.amazon_product_type}
                  onChange={(e) => setForm({ ...form, amazon_product_type: e.target.value })}
                  placeholder="e.g. LUGGAGE, HOME"
                />
              </label>
            </div>

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

      {showImport && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowImport(false)
            setImportRows([])
            setImportHeaders([])
          }}
        >
          <div className="modal-card" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
            <h2>Import items</h2>
            <p className="muted">
              Columns are matched automatically by header name (SKU, Name, Category, Unit, Reorder point, Cost,
              Barcode). Existing items are matched and updated by SKU; anything new is created. New categories are
              created automatically if they don't already exist.
            </p>

            <p className="muted">
              {importPreview.length} of {importRows.length} row{importRows.length === 1 ? '' : 's'} ready to import
              {importRows.length - importPreview.length > 0
                ? ` (${importRows.length - importPreview.length} skipped — missing SKU or name)`
                : ''}
              .
            </p>

            {importPreview.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 8).map((r, i) => (
                    <tr key={i}>
                      <td>{r.sku}</td>
                      <td>{r.name}</td>
                      <td>{r.category || '—'}</td>
                      <td>{r.default_cost != null ? r.default_cost.toFixed(2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {importPreview.length > 8 && <p className="muted">…and {importPreview.length - 8} more.</p>}

            {importError && <p className="error-text">{importError}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowImport(false)
                  setImportRows([])
                  setImportHeaders([])
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={importPreview.length === 0 || importing}
                onClick={confirmImport}
              >
                {importing ? 'Importing…' : `Import ${importPreview.length} item${importPreview.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
