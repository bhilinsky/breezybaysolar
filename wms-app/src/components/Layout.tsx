import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { clearStoredSupabaseConfig } from '../lib/supabaseConfig'

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/items', label: 'Items' },
  { to: '/categories', label: 'Categories' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/locations', label: 'Locations' },
  { to: '/receiving', label: 'Receiving' },
  { to: '/orders', label: 'Orders' },
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/customers', label: 'Customers' },
]

export default function Layout() {
  const { profile, user, signOut } = useAuth()

  const changeBackend = async () => {
    if (!confirm('Disconnect from this Supabase project and set up a different one?')) return
    await signOut()
    clearStoredSupabaseConfig()
    window.location.href = '/setup'
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">BB</span>
          <div>
            <div className="brand-name">Breezy Bay</div>
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
          <button className="btn-link" onClick={changeBackend}>
            Change Supabase project
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
