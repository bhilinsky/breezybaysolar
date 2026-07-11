import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import type { BusinessType } from '../types'
import { useBusinessProfile } from '../hooks/useBusinessProfile'

const businessTypes: { value: BusinessType; label: string; description: string }[] = [
  {
    value: 'retailer',
    label: 'Retailer / storefront',
    description: 'A physical shop floor — display cases, showroom windows, a safe or back room.',
  },
  {
    value: 'service',
    label: 'Service business',
    description: 'Jobs, appointments or work orders more than a shelf of inventory.',
  },
  {
    value: 'contractor',
    label: 'Contractor',
    description: 'Jobs and crews out at customer sites, tools and materials more than a shop floor.',
  },
  {
    value: 'manufacturer',
    label: 'Manufacturer',
    description: 'Raw materials, work-in-progress stations, and finished goods.',
  },
  {
    value: 'distributor',
    label: 'Distributor / wholesale',
    description: 'Pallets and cases moving through a warehouse to other businesses.',
  },
  {
    value: 'web_store',
    label: 'Online / web store',
    description: 'Fulfillment out of one or more storage locations, no walk-in floor.',
  },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const { refresh } = useBusinessProfile()
  const [businessType, setBusinessType] = useState<BusinessType | ''>('')
  const [businessName, setBusinessName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!businessType) return setError('Choose the option that fits best.')
    setSaving(true)
    const { error: insertError } = await supabase.from('business_profile').insert({
      id: true,
      business_type: businessType,
      business_name: businessName.trim() || null,
    })
    setSaving(false)
    if (insertError) return setError(insertError.message)
    await logActivity('set', 'business_profile', null, { business_type: businessType })
    await refresh()
    navigate('/', { replace: true })
  }

  return (
    <div className="auth-screen">
      <form className="auth-card onboarding-card" onSubmit={handleSubmit}>
        <div className="auth-brand">
          <div className="brand-name">Welcome</div>
          <div className="brand-sub">Let's set up your workspace</div>
        </div>
        <p className="muted">What kind of business is this? This decides which screens and terms show up.</p>

        <div className="onboarding-options">
          {businessTypes.map((option) => (
            <label
              key={option.value}
              className={'onboarding-option' + (businessType === option.value ? ' selected' : '')}
            >
              <input
                type="radio"
                name="business_type"
                value={option.value}
                checked={businessType === option.value}
                onChange={() => setBusinessType(option.value)}
              />
              <div>
                <div className="onboarding-option-label">{option.label}</div>
                <div className="onboarding-option-desc muted">{option.description}</div>
              </div>
            </label>
          ))}
        </div>

        <label>
          Business name (optional)
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your business name" />
        </label>

        {error && <p className="error-text">{error}</p>}

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
