import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const TLDM = 13.20
const LDM_FACTORS = { E: 0.40, B: 0.50, P: 0.60, M: 1.00 }

const STATUS_COLORS = {
  'Open':          'bg-blue-900/50 text-blue-300',
  'Ανατεθειμένη': 'bg-orange-900/50 text-orange-300',
  'Μεταφορά':      'bg-green-900/50 text-green-300',
  'Παράδοση':      'bg-purple-900/50 text-purple-300',
}

export default function Dispatch() {
  const [orders, setOrders] = useState([])
  const [trucks, setTrucks] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTruck, setSelectedTruck] = useState(null)
  const [assigningOrder, setAssigningOrder] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ord }, { data: tr }] = await Promise.all([
      supabase.from('orders').select('*').not('status', 'eq', 'Delivered').order('created_at', { ascending: false }),
      supabase.from('trucks').select('*').order('tr'),
    ])
    setOrders(ord || [])
    setTrucks(tr || [])
    setLoading(false)
  }

  async function assignOrder(orderId, truckId) {
    const truck = trucks.find(t => t.id === truckId)
    await supabase.from('orders').update({
      truck: truck?.tr || '',
      status: 'Ανατεθειμένη'
    }).eq('id', orderId)
    setAssigningOrder(null)
    loadAll()
  }

  async function unassignOrder(orderId) {
    await supabase.from('orders').update({ truck: '', status: 'Open' }).eq('id', orderId)
    loadAll()
  }

  async function cycleStatus(order) {
    const statuses = ['Open', 'Ανατεθειμένη', 'Μεταφορά', 'Παράδοση', 'Delivered']
    const idx = statuses.indexOf(order.status)
    const next = statuses[(idx + 1) % statuses.length]
    await supabase.from('orders').update({ status: next }).eq('id', order.id)
    loadAll()
  }

  // Unassigned orders
  const unassigned = orders.filter(o => !o.truck || o.status === 'Open')

  // Orders per truck
  const truckOrders = {}
  trucks.forEach(t => {
    truckOrders[t.tr] = orders.filter(o => o.truck === t.tr)
  })

  function truckLdm(truckName) {
    return truckOrders[truckName]?.reduce((s, o) => s + (parseFloat(o.ldm) || 0), 0) || 0
  }

  if (loading) return <div className="p-6 text-slate-400">Φόρτωση...</div>

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold text-white">🗂 Dispatch</h1>

      {/* Unassigned orders */}
      <div className="bg-slate-800 border border-slate-700 rounded-3xl p-5">
        <h2 className="text-lg font-bold text-white mb-4">
          📦 Αναθέτεσαι
          <span className="ml-2 text-sm bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded-full">{unassigned.length}</span>
        </h2>
        {unassigned.length === 0 ? (
          <p className="text-slate-500 text-sm">Δεν υπάρχουν ανοιχτές παραγγελίες</p>
        ) : (
          <div className="space-y-2">
            {unassigned.map(o => (
              <div key={o.id} className="bg-slate-700 rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{o.client}</p>
                  <p className="text-slate-400 text-xs">{o.from} → {o.to} · {o.qty} {o.pal} · {parseFloat(o.ldm).toFixed(2)} LDM</p>
                </div>
                {assigningOrder === o.id ? (
                  <div className="flex gap-2 items-center flex-wrap">
                    {trucks.map(t => {
                      const ldm = truckLdm(t.tr)
                      const remaining = (parseFloat(t.ldm) || TLDM) - ldm
                      const fits = remaining >= (parseFloat(o.ldm) || 0)
                      return (
                        <button
                          key={t.id}
                          onClick={() => assignOrder(o.id, t.id)}
                          className={`text-xs px-3 py-1.5 rounded-xl border transition-colors ${fits ? 'border-green-700 bg-green-900/30 text-green-300 hover:bg-green-900/50' : 'border-red-700 bg-red-900/30 text-red-300 hover:bg-red-900/50'}`}
                        >
                          {t.tr} ({remaining.toFixed(1)} LDM)
                        </button>
                      )
                    })}
                    <button onClick={() => setAssigningOrder(null)} className="text-xs text-slate-400 hover:text-white px-2">✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAssigningOrder(o.id)}
                    className="shrink-0 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl"
                  >
                    Ανάθεση →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Truck columns */}
      <div className="grid grid-cols-1 gap-4">
        {trucks.map(t => {
          const tOrders = truckOrders[t.tr] || []
          const ldm = truckLdm(t.tr)
          const cap = parseFloat(t.ldm) || TLDM
          const pct = Math.min(100, (ldm / cap) * 100)
          const over = ldm > cap

          return (
            <div key={t.id} className={`bg-slate-800 border rounded-3xl p-5 ${over ? 'border-red-700' : 'border-slate-700'}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-white font-bold text-lg">🚚 {t.tr}</h3>
                  <p className="text-slate-400 text-xs">{t.driver}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${over ? 'text-red-400' : 'text-green-400'}`}>
                    {ldm.toFixed(2)} / {cap} LDM {over ? '⚠️' : ''}
                  </p>
                </div>
              </div>

              {/* LDM bar */}
              <div className="w-full bg-slate-700 rounded-full h-2 mb-4">
                <div
                  className={`h-2 rounded-full transition-all ${over ? 'bg-red-500' : pct >= 80 ? 'bg-orange-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>

              {tOrders.length === 0 ? (
                <p className="text-slate-600 text-sm">Χωρίς παραγγελίες</p>
              ) : (
                <div className="space-y-2">
                  {tOrders.map(o => (
                    <div key={o.id} className="bg-slate-700 rounded-xl px-3 py-2 flex items-center gap-2">
                      <button
                        onClick={() => cycleStatus(o)}
                        className={`text-xs px-2 py-0.5 rounded-lg shrink-0 ${STATUS_COLORS[o.status] || 'bg-slate-600 text-slate-300'}`}
                        title="Αλλαγή status"
                      >
                        {o.status}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">{o.client}</p>
                        <p className="text-slate-400 text-xs">{o.from} → {o.to} · {parseFloat(o.ldm).toFixed(2)} LDM</p>
                      </div>
                      <button
                        onClick={() => unassignOrder(o.id)}
                        className="text-slate-500 hover:text-red-400 text-xs shrink-0"
                        title="Αφαίρεση"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
