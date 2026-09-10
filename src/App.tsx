import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import ProtectedRoute from './components/ProtectedRoute'
import Nav from './components/Nav'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import LogPage from './pages/LogPage'
import LedgerPage from './pages/LedgerPage'
import TargetsPage from './pages/TargetsPage'
import PartnerPage from './pages/PartnerPage'
import SettingsPage from './pages/SettingsPage'
import { useAuth } from './hooks/useAuth'
import { useLocalReminder } from './hooks/useLocalReminder'
import { supabase } from './lib/supabaseClient'
import { todayString } from './lib/dates'

function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [loggedToday, setLoggedToday] = useState(true) // assume logged until we know otherwise, to avoid a spurious notification on first paint

  useEffect(() => {
    if (!user) return
    supabase
      .from('daily_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('log_date', todayString())
      .maybeSingle()
      .then(({ data }) => setLoggedToday(Boolean(data)))
  }, [user])

  // Mounted for the lifetime of any protected page, so the reminder can
  // fire no matter which tab of the app is open (as long as one is).
  useLocalReminder(loggedToday)

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 pb-24 sm:pb-6">{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Shell>
              <Dashboard />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/log"
        element={
          <ProtectedRoute>
            <Shell>
              <LogPage />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/ledger"
        element={
          <ProtectedRoute>
            <Shell>
              <LedgerPage />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/targets"
        element={
          <ProtectedRoute>
            <Shell>
              <TargetsPage />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/partner"
        element={
          <ProtectedRoute>
            <Shell>
              <PartnerPage />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Shell>
              <SettingsPage />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
