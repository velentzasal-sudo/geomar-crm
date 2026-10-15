import Sidebar from './Sidebar'
import { Outlet } from 'react-router-dom'

export default function Layout({ user }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <main className="flex-1 overflow-auto bg-slate-900">
        <Outlet />
      </main>
    </div>
  )
}
