import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import { useBusinessProfile } from './hooks/useBusinessProfile'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Items from './pages/Items'
import Categories from './pages/Categories'
import Inventory from './pages/Inventory'
import Locations from './pages/Locations'
import Storefront from './pages/Storefront'
import Containers from './pages/Containers'
import ScanMove from './pages/ScanMove'
import Receiving from './pages/Receiving'
import Orders from './pages/Orders'
import Suppliers from './pages/Suppliers'
import Customers from './pages/Customers'
import Broadcasts from './pages/Broadcasts'
import Accounting from './pages/Accounting'
import Invoices from './pages/Invoices'
import Bills from './pages/Bills'
import ChartOfAccounts from './pages/ChartOfAccounts'
import JournalEntries from './pages/JournalEntries'
import Reports from './pages/Reports'
import Integrations from './pages/Integrations'
import Employees from './pages/Employees'
import PayRuns from './pages/PayRuns'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="full-screen-loading">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const { businessProfile, loading } = useBusinessProfile()
  if (loading) return <div className="full-screen-loading">Loading…</div>
  if (!businessProfile) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Onboarding />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <RequireOnboarding>
              <Layout />
            </RequireOnboarding>
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="items" element={<Items />} />
        <Route path="categories" element={<Categories />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="locations" element={<Locations />} />
        <Route path="storefront" element={<Storefront />} />
        <Route path="containers" element={<Containers />} />
        <Route path="scan" element={<ScanMove />} />
        <Route path="receiving" element={<Receiving />} />
        <Route path="orders" element={<Orders />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="customers" element={<Customers />} />
        <Route path="broadcasts" element={<Broadcasts />} />
        <Route path="accounting" element={<Accounting />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="bills" element={<Bills />} />
        <Route path="chart-of-accounts" element={<ChartOfAccounts />} />
        <Route path="journal-entries" element={<JournalEntries />} />
        <Route path="reports" element={<Reports />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="employees" element={<Employees />} />
        <Route path="pay-runs" element={<PayRuns />} />
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
