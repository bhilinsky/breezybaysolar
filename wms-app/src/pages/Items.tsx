import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import { parseCsv } from '../lib/csv'
import type { Category, Item } from '../types'

const CSV_COLUMNS = ['sku', 'name', 'description', 'category', 'unit', 'reorder_point', 'default_cost', 'weight_lbs']

const emptyForm = {
  sku: '',
  name: '',
  description: '',
  category_id: '',
  unit: 'each',
  reorder_point: 0,
  default_cost: '',
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
  const [importResult, setImportResult] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function handleImportFile(file: File) {
    setImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length < 2) {
        setImportResult('CSV has no data rows.')
        return
      }

      const header = rows[0].map((h) => h.trim().toLowerCase())
      const colIndex = (col: string) => header.indexOf(col)
      const skuIdx = colIndex('sku')
      const nameIdx = colIndex('name')
      if (skuIdx === -1 || nameIdx === -1) {
        setImportResult(`Header row must include at least "sku" and "name". Found: ${header.join(', ')}`)
        return
      }

      const dataRows = rows.slice(1).filter((r) => (r[skuIdx] ?? '').trim() !== '')
      const categoryNames = [
        ...new Set(
          dataRows
            .map((r) => (colIndex('category') !== -1 ? (r[colIndex('category')] ?? '').trim() : ''))
            .filter((name) => name !== ''),
        ),
      ]

      const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]))
      const missingCategories = categoryNames.filter((name) => !categoryIdByName.has(name))
      if (missingCategories.length > 0) {
        const { data: createdCategories, error: categoryError } = await supabase
          .from('categories')
          .insert(missingCategories.map((name) => ({ name })))
          .select('id, name')
        if (categoryError) {
          setImportResult(`Failed creating categories: ${categoryError.message}`)
          return
        }
        for (const c of createdCategories ?? []) categoryIdByName.set(c.name, c.id)
      }

      const payload = dataRows.map((r) => {
        const get = (col: string) => (colIndex(col) !== -1 ? (r[colIndex(col)] ?? '').trim() : '')
        const categoryName = get('category')
        return {
          sku: get('sku'),
          name: get('name') || get('sku'),
          description: get('description') || null,
          category_id: categoryName ? categoryIdByName.get(categoryName) ?? null : null,
          unit: get('unit') || 'each',
          reorder_point: get('reorder_point') ? Number(get('reorder_point')) : 0,
          default_cost: get('default_cost') ? Number(get('default_cost')) : null,
          weight_lbs: get('weight_lbs') ? Number(get('weight_lbs')) : null,
        }
      })

      const { error: upsertError } = await supabase.from('items').upsert(payload, { onConflict: 'sku' })
      if (upsertError) {
        setImportResult(`Import failed: ${upsertError.message}`)
        return
      }

      await logActivity('imported', 'item', null, { count: payload.length })
      setImportResult(`Imported ${payload.length} item${payload.length === 1 ? '' : 's'}.`)
      void load()
    } finally {
      setImporting(false)
    }
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
          <button className="btn-secondary" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button className="btn-primary" onClick={startCreate}>
            + New item
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleImportFile(file)
          e.target.value = ''
        }}
      />
      {importResult && (
        <p className="muted">
          {importResult}{' '}
          <button type="button" className="btn-link" onClick={() => setImportResult(null)}>
            dismiss
          </button>
        </p>
      )}
      <p className="muted">
        CSV columns: {CSV_COLUMNS.join(', ')} — only sku and name are required; category is matched/created by name.
      </p>

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
