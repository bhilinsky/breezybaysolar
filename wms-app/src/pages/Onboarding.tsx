import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import { defaultWarehouseBusinessTypes, type BusinessType } from '../types'
import { useBusinessProfile } from '../hooks/useBusinessProfile'

const crmToolOptions = ['Salesforce', 'HubSpot', 'Zoho', 'Pipedrive']
const shippingServiceOptions = ['UPS', 'FedEx', 'USPS', 'DHL', 'ShipStation']

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
  const [needsWarehouse, setNeedsWarehouse] = useState<boolean | null>(null)
  const [needsBinLocations, setNeedsBinLocations] = useState(false)
  const [crmTools, setCrmTools] = useState<string[]>([])
  const [crmOther, setCrmOther] = useState('')
  const [shippingServices, setShippingServices] = useState<string[]>([])
  const [shippingOther, setShippingOther] = useState('')
  const [approxEmployees, setApproxEmployees] = useState('')
  const [has1099, setHas1099] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function selectBusinessType(value: BusinessType) {
    setBusinessType(value)
    setNeedsWarehouse(defaultWarehouseBusinessTypes.includes(value))
  }

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!businessType) return setError('Choose the option that fits best.')
    setSaving(true)
    const { error: insertError } = await supabase.from('business_profile').insert({
      id: true,
      business_type: businessType,
      business_name: businessName.trim() || null,
      needs_warehouse: needsWarehouse ?? false,
      needs_bin_locations: (needsWarehouse ?? false) && needsBinLocations,
      crm_tools: crmTools,
      crm_other: crmOther.trim() || null,
      shipping_services: shippingServices,
      shipping_other: shippingOther.trim() || null,
      approx_employees: approxEmployees ? Number(approxEmployees) : null,
      has_1099_contractors: has1099,
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
                onChange={() => selectBusinessType(option.value)}
              />
              <div>
                <div className="onboarding-option-label">{option.label}</div>
                <div className="onboarding-option-desc muted">{option.description}</div>
              </div>
            </label>
          ))}
        </div>

        {businessType && (
          <>
            <div className="onboarding-options">
              <label className={'onboarding-option' + (needsWarehouse === true ? ' selected' : '')}>
                <input
                  type="radio"
                  name="needs_warehouse"
                  checked={needsWarehouse === true}
                  onChange={() => setNeedsWarehouse(true)}
                />
                <div>
                  <div className="onboarding-option-label">Yes, track warehouse / storage locations</div>
                  <div className="onboarding-option-desc muted">
                    Shows Inventory, Locations, Storefront, Racks, Scan to move, Receiving and Suppliers.
                  </div>
                </div>
              </label>
              <label className={'onboarding-option' + (needsWarehouse === false ? ' selected' : '')}>
                <input
                  type="radio"
                  name="needs_warehouse"
                  checked={needsWarehouse === false}
                  onChange={() => setNeedsWarehouse(false)}
                />
                <div>
                  <div className="onboarding-option-label">No, just jobs / orders and customers</div>
                  <div className="onboarding-option-desc muted">Keeps the nav focused on Items, Orders and Customers.</div>
                </div>
              </label>
            </div>

            {needsWarehouse && (
              <label>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={needsBinLocations}
                    onChange={(e) => setNeedsBinLocations(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  Map individual bin locations (aisle / shelf / bin) within each storage location
                </span>
              </label>
            )}
          </>
        )}

        <label>
          Business name (optional)
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your business name" />
        </label>

        <p className="muted" style={{ margin: 0 }}>
          The rest is optional — it just helps point you at the right integrations and features later, nothing
          here blocks setup.
        </p>

        <label>
          Do you already use a CRM?
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.4rem' }}>
            {crmToolOptions.map((tool) => (
              <label key={tool} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.3rem' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={crmTools.includes(tool)}
                  onChange={() => toggle(crmTools, setCrmTools, tool)}
                />
                {tool}
              </label>
            ))}
          </span>
        </label>
        <input value={crmOther} onChange={(e) => setCrmOther(e.target.value)} placeholder="Other CRM tool (optional)" />

        <label>
          Which shipping services do you use?
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.4rem' }}>
            {shippingServiceOptions.map((svc) => (
              <label key={svc} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.3rem' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={shippingServices.includes(svc)}
                  onChange={() => toggle(shippingServices, setShippingServices, svc)}
                />
                {svc}
              </label>
            ))}
          </span>
        </label>
        <input
          value={shippingOther}
          onChange={(e) => setShippingOther(e.target.value)}
          placeholder="Other shipping service (optional)"
        />

        <div className="form-row">
          <label>
            Approximate employees
            <input
              type="number"
              min={0}
              value={approxEmployees}
              onChange={(e) => setApproxEmployees(e.target.value)}
            />
          </label>
          <label>
            Any 1099 contractors?
            <select
              value={has1099 === null ? '' : has1099 ? 'yes' : 'no'}
              onChange={(e) => setHas1099(e.target.value === '' ? null : e.target.value === 'yes')}
            >
              <option value="">Not sure / skip</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>

        {error && <p className="error-text">{error}</p>}

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
