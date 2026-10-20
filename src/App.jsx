import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './Pages/Login'
import Dashboard from './Pages/Dashboard'
import Orders from './Pages/Orders'
import Fleet from './Pages/Fleet'
import Clients from './Pages/Clients'
import Firms from './Pages/Firms'
import Calendar from './Pages/Calendar'
import Weekly from './Pages/Weekly'
import Ferries from './Pages/Ferries'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-lg">Φόρτωση...</div>
      </div>
    )
  }

  if (!session) return <Login />

  return (
   <BrowserRouter>
      <Routes>
        <Route element={<Layout user={session.user} />}>
          <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="orders"   element={<ErrorBoundary><Orders /></ErrorBoundary>} />
          <Route path="fleet"    element={<ErrorBoundary><Fleet /></ErrorBoundary>} />
          <Route path="clients"  element={<ErrorBoundary><Clients /></ErrorBoundary>} />
          <Route path="firms"    element={<ErrorBoundary><Firms /></ErrorBoundary>} />
          <Route path="calendar" element={<ErrorBoundary><Calendar /></ErrorBoundary>} />
          <Route path="weekly"   element={<ErrorBoundary><Weekly /></ErrorBoundary>} />
          <Route path="ferries"  element={<ErrorBoundary><Ferries /></ErrorBoundary>} />
<Route path="*"             element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
