import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useBusinessProfile } from '../hooks/useBusinessProfile'
import type { BusinessType } from '../types'

function floorLabel(businessType?: BusinessType) {
  if (businessType === 'manufacturer') return 'Work in Progress'
  if (businessType === 'distributor') return 'Staging Floor'
  return 'Storefront'
}

function rackLabel(businessType?: BusinessType) {
  if (businessType === 'manufacturer') return 'Carts / Bins'
  if (businessType === 'distributor') return 'Pallets'
  return 'Racks'
}

const baseLinks = [
  { to: '/', label: 'Dashboard' },
  { to: '/items', label: 'Items' },
  { to: '/categories', label: 'Categories' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/locations', label: 'Locations' },
]

const tailLinks = [
  { to: '/scan', label: 'Scan to move' },
  { to: '/receiving', label: 'Receiving' },
  { to: '/orders', label: 'Orders' },
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/customers', label: 'Customers' },
]

export default function Layout() {
  const { profile, user, signOut } = useAuth()
  const { businessProfile } = useBusinessProfile()

  const links = [
    ...baseLinks,
    { to: '/storefront', label: floorLabel(businessProfile?.business_type) },
    { to: '/containers', label: rackLabel(businessProfile?.business_type) },
    ...tailLinks,
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">BB</span>
          <div>
            <div className="brand-name">{businessProfile?.business_name || 'Breezy Bay'}</div>
            <div className="brand-sub">WMS</div>
          </div>
        </div>
        <nav className="nav-links-vertical">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
              end={link.to === '/'}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-name">{profile?.full_name || user?.email}</div>
          <button className="btn-secondary" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
