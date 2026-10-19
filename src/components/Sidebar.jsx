import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const links = [
  { to: '/',          label: 'Dashboard',    icon: '📊' },
  { to: '/orders',    label: 'Παραγγελίες',  icon: '📦' },
  { to: '/dispatch',  label: 'Dispatch',     icon: '🗂' },
  { to: '/fleet',     label: 'Στόλος',       icon: '🚚' },
  { to: '/clients',   label: 'Πελάτες',      icon: '👥' },
  { to: '/firms',     label: 'Φίρμες',       icon: '🏭' },
  { to: '/calendar',  label: 'Ημερολόγιο',   icon: '📅' },
  { to: '/weekly',    label: 'Εβδ. Πλάνος',  icon: '📋' },
  { to: '/avail',     label: 'Διαθεσιμότητα', icon: '🟢' },
]

export default function Sidebar({ user }) {
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <aside className="w-64 min-h-screen bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚚</span>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Logi-Smart</h1>
            <p className="text-slate-500 text-xs">Ιταλία · Ελλάδα</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {links.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <span className="text-lg">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="text-slate-500 text-xs mb-3 px-2 truncate">{user?.email}</div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-red-400 hover:bg-red-900/30 transition-colors"
        >
          <span>🚪</span> Αποσύνδεση
        </button>
      </div>
    </aside>
  )
}
