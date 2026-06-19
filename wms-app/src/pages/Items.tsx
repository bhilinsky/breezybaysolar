import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import type { Category, Item } from '../types'

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

  const filtered = items.filter((item) => {
    const q = search.toLowerCase()
    return item.sku.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="page-header">
        <h1>Items</h1>
        <button className="btn-primary" onClick={startCreate}>
          + New item
        </button>
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
