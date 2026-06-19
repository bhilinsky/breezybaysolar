import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import { isSupabaseConfigured } from './lib/supabase'
import Layout from './components/Layout'
import Setup from './pages/Setup'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Items from './pages/Items'
import Categories from './pages/Categories'
import Inventory from './pages/Inventory'
import Locations from './pages/Locations'
import Receiving from './pages/Receiving'
import Orders from './pages/Orders'
import Suppliers from './pages/Suppliers'
import Customers from './pages/Customers'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="full-screen-loading">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireSupabaseConfig({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) return <Navigate to="/setup" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route
        path="/login"
        element={
          <RequireSupabaseConfig>
            <Login />
          </RequireSupabaseConfig>
        }
      />
      <Route
        path="/"
        element={
          <RequireSupabaseConfig>
            <RequireAuth>
              <Layout />
            </RequireAuth>
          </RequireSupabaseConfig>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="items" element={<Items />} />
        <Route path="categories" element={<Categories />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="locations" element={<Locations />} />
        <Route path="receiving" element={<Receiving />} />
        <Route path="orders" element={<Orders />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="customers" element={<Customers />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
