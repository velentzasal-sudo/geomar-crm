import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🚚</div>
          <h1 className="text-3xl font-bold text-white">Logi-Smart</h1>
          <p className="text-slate-400 mt-1">Διαχείριση Μεταφορών Ιταλία-Ελλάδα</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-6">Σύνδεση</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="user@example.com"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Κωδικός</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm">
                ❌ {error === 'Invalid login credentials' ? 'Λάθος email ή κωδικός' : error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors"
            >
              {loading ? 'Σύνδεση...' : 'Είσοδος'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
