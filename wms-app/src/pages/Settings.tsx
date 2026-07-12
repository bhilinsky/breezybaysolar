import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import { defaultWarehouseBusinessTypes, type BusinessType } from '../types'
import { useBusinessProfile } from '../hooks/useBusinessProfile'

const crmToolOptions = ['Salesforce', 'HubSpot', 'Zoho', 'Pipedrive']
const shippingServiceOptions = ['UPS', 'FedEx', 'USPS', 'DHL', 'ShipStation']

const businessTypes: { value: BusinessType; label: string }[] = [
  { value: 'retailer', label: 'Retailer / storefront' },
  { value: 'service', label: 'Service business' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'distributor', label: 'Distributor / wholesale' },
  { value: 'web_store', label: 'Online / web store' },
]

export default function Settings() {
  const { businessProfile, refresh } = useBusinessProfile()
  const [businessType, setBusinessType] = useState<BusinessType>('service')
  const [businessName, setBusinessName] = useState('')
  const [needsWarehouse, setNeedsWarehouse] = useState(false)
  const [needsBinLocations, setNeedsBinLocations] = useState(false)
  const [crmTools, setCrmTools] = useState<string[]>([])
  const [crmOther, setCrmOther] = useState('')
  const [shippingServices, setShippingServices] = useState<string[]>([])
  const [shippingOther, setShippingOther] = useState('')
  const [approxEmployees, setApproxEmployees] = useState('')
  const [has1099, setHas1099] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!businessProfile) return
    setBusinessType(businessProfile.business_type)
    setBusinessName(businessProfile.business_name ?? '')
    setNeedsWarehouse(businessProfile.needs_warehouse)
    setNeedsBinLocations(businessProfile.needs_bin_locations)
    setCrmTools(businessProfile.crm_tools ?? [])
    setCrmOther(businessProfile.crm_other ?? '')
    setShippingServices(businessProfile.shipping_services ?? [])
    setShippingOther(businessProfile.shipping_other ?? '')
    setApproxEmployees(businessProfile.approx_employees?.toString() ?? '')
    setHas1099(businessProfile.has_1099_contractors)
  }, [businessProfile])

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setSaving(true)
    const { error: updateError } = await supabase
      .from('business_profile')
      .update({
        business_type: businessType,
        business_name: businessName.trim() || null,
        needs_warehouse: needsWarehouse,
        needs_bin_locations: needsWarehouse && needsBinLocations,
        crm_tools: crmTools,
        crm_other: crmOther.trim() || null,
        shipping_services: shippingServices,
        shipping_other: shippingOther.trim() || null,
        approx_employees: approxEmployees ? Number(approxEmployees) : null,
        has_1099_contractors: has1099,
      })
      .eq('id', true)
    setSaving(false)
    if (updateError) return setError(updateError.message)
    await logActivity('updated', 'business_profile', null, { business_type: businessType })
    await refresh()
    setSaved(true)
  }

  if (!businessProfile) return <p>Loading…</p>

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>
      <p className="muted">
        Change how this workspace is set up any time — for example, a contractor who started without warehouse
        tracking can turn it on later once they need it, without losing anything already entered.
      </p>

      <form className="panel" onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
        <h2>Business</h2>
        <label>
          Business type
          <select value={businessType} onChange={(e) => setBusinessType(e.target.value as BusinessType)}>
            {businessTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Business name
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </label>

        <h2>Warehouse &amp; storage</h2>
        <label>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={needsWarehouse}
              onChange={(e) => {
                setNeedsWarehouse(e.target.checked)
                if (!e.target.checked) setNeedsBinLocations(false)
              }}
              style={{ width: 'auto' }}
            />
            Track warehouse / storage locations
          </span>
        </label>
        <p className="muted" style={{ marginTop: 0 }}>
          Adds Inventory, Locations, Storefront, Racks, Scan to move, Receiving and Suppliers to the nav.{' '}
          {defaultWarehouseBusinessTypes.includes(businessType)
            ? ''
            : "Most businesses like yours don't need this, but it's here if a job ever calls for tracked stock."}
        </p>
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

        <h2>Tools you use</h2>
        <label>
          CRM tools
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
        <input value={crmOther} onChange={(e) => setCrmOther(e.target.value)} placeholder="Other CRM tool" />

        <label>
          Shipping services
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
          placeholder="Other shipping service"
        />

        <h2>Team</h2>
        <div className="form-row">
          <label>
            Approximate employees
            <input type="number" min={0} value={approxEmployees} onChange={(e) => setApproxEmployees(e.target.value)} />
          </label>
          <label>
            Any 1099 contractors?
            <select
              value={has1099 === null ? '' : has1099 ? 'yes' : 'no'}
              onChange={(e) => setHas1099(e.target.value === '' ? null : e.target.value === 'yes')}
            >
              <option value="">Not sure</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>

        {error && <p className="error-text">{error}</p>}
        {saved && <p className="info-text">Saved.</p>}

        <button type="submit" className="btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
