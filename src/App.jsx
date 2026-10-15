import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Dispatch from './pages/Dispatch'
import Fleet from './pages/Fleet'
import Clients from './pages/Clients'
import Firms from './pages/Firms'
import Calendar from './pages/Calendar'
import Weekly from './pages/Weekly'

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
   <BrowserRouter basename="/geomar-crm">
      <Routes>
        <Route element={<Layout user={session.user} />}>
          <Route index element={<Dashboard />} />
          <Route path="orders"   element={<Orders />} />
          <Route path="dispatch" element={<Dispatch />} />
          <Route path="fleet"    element={<Fleet />} />
          <Route path="clients"  element={<Clients />} />
          <Route path="firms"    element={<Firms />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="weekly"   element={<Weekly />} />
          <Route path="*"        element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
