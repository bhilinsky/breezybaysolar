import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import type { Category } from '../types'

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('categories').select('*').order('name')
    setCategories(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { data, error: insertError } = await supabase
      .from('categories')
      .insert({ name: name.trim() })
      .select('id')
      .single()
    if (insertError) return setError(insertError.message)
    await logActivity('created', 'category', data?.id ?? null, { name })
    setName('')
    void load()
  }

  async function handleDelete(category: Category) {
    if (!confirm(`Delete category ${category.name}?`)) return
    const { error: deleteError } = await supabase.from('categories').delete().eq('id', category.id)
    if (deleteError) return alert(deleteError.message)
    await logActivity('deleted', 'category', category.id, { name: category.name })
    void load()
  }

  return (
    <div>
      <h1>Categories</h1>

      <form className="inline-form" onSubmit={handleSubmit}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" required />
        <button className="btn-primary" type="submit">
          Add
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td className="row-actions">
                  <button className="btn-link danger" onClick={() => handleDelete(category)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={2} className="muted">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
