import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, isToday, isFuture, isPast, parseISO, addDays } from 'date-fns'
import { el } from 'date-fns/locale'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default icon paths (Vite issue)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Custom truck marker
function truckIcon(label) {
  return L.divIcon({
    className: '',
    html: `<div style="background:#1e40af;color:#fff;border:2px solid #3b82f6;border-radius:8px;padding:2px 6px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.5)">${label}</div>`,
    iconAnchor: [20, 12],
  })
}

// Simple geocoding cache — city name → [lat, lng]
const GEO_CACHE = {}
const KNOWN = {
  'bari': [41.117, 16.872], 'μπαρι': [41.117, 16.872], 'μπάρι': [41.117, 16.872],
  'ancona': [43.616, 13.518], 'ανκονα': [43.616, 13.518], 'ανκόνα': [43.616, 13.518],
  'venice': [45.440, 12.315], 'venezia': [45.440, 12.315], 'βενετια': [45.440, 12.315], 'βενετία': [45.440, 12.315],
  'milan': [45.464, 9.190], 'milano': [45.464, 9.190], 'μιλανο': [45.464, 9.190], 'μιλάνο': [45.464, 9.190],
  'trieste': [45.649, 13.777], 'τριεστε': [45.649, 13.777], 'τριέστε': [45.649, 13.777],
  'bologna': [44.494, 11.342], 'μπολονια': [44.494, 11.342], 'μπολόνια': [44.494, 11.342],
  'rome': [41.902, 12.496], 'roma': [41.902, 12.496], 'ρωμη': [41.902, 12.496], 'ρώμη': [41.902, 12.496],
  'naples': [40.851, 14.268], 'napoli': [40.851, 14.268], 'ναπολη': [40.851, 14.268], 'νάπολη': [40.851, 14.268],
  'athens': [37.979, 23.716], 'αθηνα': [37.979, 23.716], 'αθήνα': [37.979, 23.716],
  'thessaloniki': [40.629, 22.948], 'θεσσαλονικη': [40.629, 22.948], 'θεσσαλονίκη': [40.629, 22.948],
  'patras': [38.246, 21.735], 'πατρα': [38.246, 21.735], 'πάτρα': [38.246, 21.735],
  'igoumenitsa': [39.503, 20.273], 'ηγουμενιτσα': [39.503, 20.273], 'ηγουμενίτσα': [39.503, 20.273],
  'larissa': [39.639, 22.419], 'λαρισα': [39.639, 22.419], 'λάρισα': [39.639, 22.419],
  'volos': [39.365, 22.939], 'βολος': [39.365, 22.939], 'βόλος': [39.365, 22.939],
}

async function geocode(location) {
  if (!location) return null
  const key = location.toLowerCase().trim()
  if (GEO_CACHE[key]) return GEO_CACHE[key]
  // Check known cities first
  for (const [city, coords] of Object.entries(KNOWN)) {
    if (key.includes(city)) { GEO_CACHE[key] = coords; return coords }
  }
  // Nominatim fallback
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'el,en' }
    })
    const data = await res.json()
    if (data[0]) {
      const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)]
      GEO_CACHE[key] = coords
      return coords
    }
  } catch {}
  return null
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [orders,   setOrders]   = useState([])
  const [clients,  setClients]  = useState([])
  const [payments, setPayments] = useState([])
  const [memo,     setMemo]     = useState('')
  const [memoId,   setMemoId]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [trucks,   setTrucks]   = useState([])
  const [avail,    setAvail]    = useState([])
  const [editModal,  setEditModal]  = useState(null)
  const [editForm,   setEditForm]   = useState({ status: 'Εν κινήσει', location: '', notes: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [truckPins,  setTruckPins]  = useState([]) // [{ tr, alias, lat, lng, status, location, notes }]

  const AVAIL_STATUSES = [
    { key: 'Διαθέσιμο',  color: 'bg-green-900/60 text-green-300 border-green-700' },
    { key: 'Εν κινήσει', color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700' },
    { key: 'Service',    color: 'bg-red-900/60 text-red-300 border-red-700' },
  ]

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const [{ data: ord }, { data: cli }, { data: mem }, { data: pay }, { data: trk }, { data: av }] = await Promise.all([
      supabase.from('orders').select('*').not('status', 'eq', 'Delivered'),
      supabase.from('clients').select('id,name,next_card_date,total_debt'),
      supabase.from('memos').select('*').limit(1).maybeSingle(),
      supabase.from('payments').select('*').eq('paid', false).order('due_date'),
      supabase.from('trucks').select('tr,alias'),
      supabase.from('avail').select('*').eq('fr', todayStr),
    ])
    setOrders(ord || [])
    setClients(cli || [])
    setPayments(pay || [])
    setTrucks(trk || [])
    const avData = av || []
    setAvail(avData)
    if (mem) { setMemo(mem.content || ''); setMemoId(mem.id) }
    setLoading(false)
    // Geocode truck locations for map
    buildPins(trk || [], avData, ord || [])
  }

  async function buildPins(trk, avData, ord) {
    // Merge avail + orders για τοποθεσία
    const availMap = {}
    avData.forEach(a => { availMap[a.tr] = a })

    const pins = []
    for (const t of trk) {
      const rec = availMap[t.tr]
      const loc = rec?.ct || (() => {
        const o = ord.find(o => o.truck === t.tr && ['Μεταφορά','Ανατεθειμένη','Παράδοση'].includes(o.status))
        return o ? (o.to || o.from || '') : ''
      })()
      if (!loc) continue
      const coords = await geocode(loc)
      if (!coords) continue
      pins.push({
        tr: t.tr,
        alias: t.alias || t.tr,
        lat: coords[0],
        lng: coords[1],
        status: rec?.nt || 'Εν κινήσει',
        location: loc,
        notes: rec?.co || '',
      })
    }
    setTruckPins(pins)
  }

  function openEdit(truck) {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const rec = avail.find(a => a.tr === truck.tr)
    setEditForm({
      status:   rec?.nt || 'Εν κινήσει',
      location: rec?.ct || '',
      notes:    rec?.co || '',
    })
    setEditModal({ tr: truck.tr, alias: truck.alias, availId: rec?.id || null, todayStr })
  }

  async function saveEdit() {
    if (!editModal) return
    setEditSaving(true)
    const payload = { tr: editModal.tr, fr: editModal.todayStr, nt: editForm.status, ct: editForm.location, co: editForm.notes }
    if (editModal.availId) {
      await supabase.from('avail').update(payload).eq('id', editModal.availId)
    } else {
      await supabase.from('avail').insert([payload])
    }
    setEditSaving(false)
    setEditModal(null)
    loadAll()
  }

  async function saveMemo() {
    if (memoId) {
      await supabase.from('memos').update({ content: memo }).eq('id', memoId)
    } else {
      const { data } = await supabase.from('memos').insert([{ content: memo }]).select().single()
      setMemoId(data?.id)
    }
  }

  const today   = new Date()
  const in7days = addDays(today, 7)
  const todayStr = format(today, 'yyyy-MM-dd')

  // Σήμερα: φορτώσεις & παραδόσεις
  const loadingToday   = orders.filter(o => (o.load_date || o.rdy || '').substring(0,10) === todayStr)
  const deliveryToday  = orders.filter(o => (o.delivery_date || '').substring(0,10) === todayStr)

  // Ανοιχτές παραγγελίες (όχι Delivered)
  const openOrders = orders.filter(o => o.status !== 'Delivered')

  // Επόμενες 7 μέρες
  const cardsOverdue = clients.filter(c => {
    if (!c.next_card_date) return false
    const d = parseISO(c.next_card_date)
    return isToday(d) || isPast(d)
  }).sort((a,b) => parseISO(a.next_card_date) - parseISO(b.next_card_date))

  const cardsSoon = clients.filter(c => {
    if (!c.next_card_date) return false
    const d = parseISO(c.next_card_date)
    return isFuture(d) && d <= in7days
  }).sort((a,b) => parseISO(a.next_card_date) - parseISO(b.next_card_date))

  const overduePayments = payments.filter(p =>
    p.due_date && isPast(parseISO(p.due_date)) && !isToday(parseISO(p.due_date))
  )
  const soonPayments = payments.filter(p => {
    if (!p.due_date) return false
    const d = parseISO(p.due_date)
    return (isToday(d) || isFuture(d)) && d <= in7days
  })

  const totalPending = payments.reduce((s,p) => s + (parseFloat(p.amount)||0), 0)
  const hasAlerts = cardsOverdue.length > 0 || overduePayments.length > 0

  // Map center: Ιόνιο (ανάμεσα Ελλάδα-Ιταλία)
  const mapCenter = truckPins.length > 0
    ? [truckPins.reduce((s,p)=>s+p.lat,0)/truckPins.length, truckPins.reduce((s,p)=>s+p.lng,0)/truckPins.length]
    : [40.5, 17.5]

  return (
    <div className="p-4 md:p-5 space-y-4 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-500 text-xs md:text-sm">{format(today, 'EEE d MMM yyyy', { locale: el })}</p>
      </div>

      {/* ── 1. ΣΗΜΕΡΑ ── */}
      {(loadingToday.length > 0 || deliveryToday.length > 0) && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
          <p className="text-white font-bold text-sm mb-3">📅 Σήμερα</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {loadingToday.length > 0 && (
              <div>
                <p className="text-blue-400 text-xs font-medium uppercase tracking-wide mb-2">📦 Φορτώσεις</p>
                <div className="space-y-1.5">
                  {loadingToday.map(o => (
                    <button key={o.id} onClick={() => navigate(`/orders?open=${o.id}`)}
                      className="w-full text-left bg-slate-700 hover:bg-slate-600 rounded-xl px-3 py-2 transition-colors">
                      <p className="text-white text-sm font-medium truncate">{o.client}</p>
                      <p className="text-slate-400 text-xs truncate">{o.from} → {o.to}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {deliveryToday.length > 0 && (
              <div>
                <p className="text-green-400 text-xs font-medium uppercase tracking-wide mb-2">🏁 Παραδόσεις</p>
                <div className="space-y-1.5">
                  {deliveryToday.map(o => (
                    <button key={o.id} onClick={() => navigate(`/orders?open=${o.id}`)}
                      className="w-full text-left bg-slate-700 hover:bg-slate-600 rounded-xl px-3 py-2 transition-colors">
                      <p className="text-white text-sm font-medium truncate">{o.client}</p>
                      <p className="text-slate-400 text-xs truncate">{o.to}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 2. ΑΝΟΙΧΤΕΣ ΠΑΡΑΓΓΕΛΙΕΣ ── */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-white font-bold text-sm">📦 Ανοιχτές Παραγγελίες</p>
          <span className="text-slate-400 text-xs">{openOrders.length}</span>
        </div>
        {loading ? (
          <p className="text-slate-500 text-sm">Φόρτωση...</p>
        ) : openOrders.length === 0 ? (
          <p className="text-slate-500 text-sm">Δεν υπάρχουν</p>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {openOrders.map(o => (
              <button key={o.id} onClick={() => navigate(`/orders?open=${o.id}`)}
                className="w-full bg-slate-700 hover:bg-slate-600 rounded-xl px-3 py-2 flex items-center gap-2 text-left transition-colors">
                <StatusBadge status={o.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{o.client}</p>
                  <p className="text-slate-400 text-xs truncate">{o.from} → {o.to}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-slate-400 text-xs">{o.qty} {o.pal === 'E' ? 'EPAL' : o.pal}</p>
                  {o.truck && <p className="text-slate-500 text-xs">🚚 {o.truck}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. ΧΑΡΤΗΣ ΦΟΡΤΗΓΩΝ ── */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-white font-bold text-sm">🗺️ Τοποθεσία Φορτηγών</p>
          <div className="flex gap-2">
            {trucks.map(t => (
              <button key={t.tr} onClick={() => openEdit(t)}
                className="text-xs bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 px-2 py-1 rounded-lg transition-colors">
                ✏️ {t.alias || t.tr}
              </button>
            ))}
          </div>
        </div>
        {truckPins.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
            <span className="text-3xl">🗺️</span>
            <p>Βάλε τοποθεσία στα φορτηγά για να εμφανιστούν στον χάρτη</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ height: 280 }}>
            <MapContainer
              center={mapCenter}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
              />
              {truckPins.map(p => (
                <Marker key={p.tr} position={[p.lat, p.lng]} icon={truckIcon(p.alias || p.tr)}>
                  <Popup>
                    <div style={{ minWidth: 120 }}>
                      <p style={{ fontWeight: 700, margin: 0 }}>🚛 {p.alias || p.tr}</p>
                      <p style={{ margin: '2px 0', color: '#64748b', fontSize: 12 }}>{p.location}</p>
                      {p.notes && <p style={{ margin: 0, fontSize: 12 }}>{p.notes}</p>}
                      <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600 }}>{p.status}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}
      </div>

      {/* ── 4. ΕΠΟΜΕΝΕΣ 7 ΜΕΡΕΣ ── */}
      {(cardsSoon.length > 0 || soonPayments.length > 0) && (
        <div className="bg-amber-950/40 border border-amber-700/40 rounded-2xl p-4">
          <p className="text-amber-400 font-semibold text-xs uppercase tracking-wide mb-2">⏰ Επόμενες 7 ημέρες</p>
          <div className="space-y-1.5">
            {cardsSoon.map(c => (
              <div key={c.id} className="flex justify-between bg-slate-800 rounded-xl px-3 py-2">
                <span className="text-slate-200 text-sm truncate">📅 {c.name}</span>
                <span className="text-amber-400 text-xs shrink-0 ml-2">{format(parseISO(c.next_card_date), 'EEE d MMM', { locale: el })}</span>
              </div>
            ))}
            {soonPayments.map(p => (
              <div key={p.id} className="flex justify-between bg-slate-800 rounded-xl px-3 py-2">
                <span className="text-slate-200 text-sm truncate">💰 {p.client_name}</span>
                <span className="text-amber-400 text-xs shrink-0 ml-2">€{(parseFloat(p.amount)||0).toLocaleString('el-GR')} · {format(parseISO(p.due_date), 'EEE d MMM', { locale: el })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. ALERTS ── */}
      {hasAlerts && (
        <div className="bg-red-950/60 border border-red-700/70 rounded-2xl p-4">
          <p className="text-red-300 font-bold text-xs uppercase tracking-wide mb-2">🚨 Απαιτείται ενέργεια</p>
          <div className="space-y-1.5">
            {cardsOverdue.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-red-900/30 rounded-xl px-3 py-2">
                <span className="text-white text-sm">📅 <span className="font-semibold">{c.name}</span></span>
                <span className="text-red-400 text-xs font-medium shrink-0 ml-2">{format(parseISO(c.next_card_date), 'd MMM', { locale: el })}</span>
              </div>
            ))}
            {overduePayments.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-red-900/30 rounded-xl px-3 py-2">
                <span className="text-white text-sm">💰 <span className="font-semibold">{p.client_name}</span></span>
                <span className="text-red-400 text-xs font-medium shrink-0 ml-2">€{(parseFloat(p.amount)||0).toLocaleString('el-GR')} · {format(parseISO(p.due_date), 'd MMM', { locale: el })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 6. ΕΚΚΡΕΜΕΙΣ ΠΛΗΡΩΜΕΣ ── */}
      {payments.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-bold text-sm">💰 Εκκρεμείς Πληρωμές</p>
            <span className="text-purple-400 font-bold text-sm">€{totalPending.toLocaleString('el-GR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {payments.map(p => {
              const overdue = p.due_date && isPast(parseISO(p.due_date)) && !isToday(parseISO(p.due_date))
              return (
                <div key={p.id} className={`flex items-center justify-between rounded-xl px-3 py-2 ${overdue ? 'bg-red-900/20' : 'bg-slate-700'}`}>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{p.client_name}</p>
                    {p.notes && <p className="text-slate-400 text-xs truncate">{p.notes}</p>}
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-green-400 text-sm font-bold">€{(parseFloat(p.amount)||0).toLocaleString('el-GR', { minimumFractionDigits: 2 })}</p>
                    {p.due_date && (
                      <p className={`text-xs ${overdue ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
                        {overdue ? '⚠️ ' : ''}{format(parseISO(p.due_date), 'd MMM', { locale: el })}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 7. MEMO ── */}
      <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
        <h2 className="text-sm font-bold text-white mb-2">📌 Σημείωμα</h2>
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          rows={4}
          placeholder="Σημειώσεις ημέρας..."
          className="w-full bg-slate-700 rounded-xl p-3 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
        />
        <button onClick={saveMemo}
          className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-medium">
          💾 Αποθήκευση
        </button>
      </div>

      {/* ── EDIT AVAIL MODAL ── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setEditModal(null) }}>
          <div className="bg-slate-800 rounded-t-3xl sm:rounded-3xl border border-slate-700 w-full sm:max-w-sm p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">🚛 {editModal.alias || editModal.tr}</h2>
                <p className="text-slate-400 text-sm">Τοποθεσία σήμερα</p>
              </div>
              <button onClick={() => setEditModal(null)} className="text-slate-500 hover:text-white text-xl leading-none">✕</button>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Κατάσταση</label>
              <div className="grid grid-cols-3 gap-2">
                {AVAIL_STATUSES.map(s => (
                  <button key={s.key}
                    onClick={() => setEditForm(f => ({ ...f, status: s.key }))}
                    className={`py-2 px-2 rounded-xl text-xs border transition-colors ${
                      editForm.status === s.key ? s.color + ' font-bold' : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                    }`}
                  >{s.key}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Τοποθεσία</label>
              <input
                value={editForm.location}
                onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                placeholder="π.χ. Μπολόνια, Μιλάνο..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Σημειώσεις</label>
              <input
                value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="π.χ. Πελάτης, φορτίο..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditModal(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 rounded-xl text-sm transition-colors">
                Ακύρωση
              </button>
              <button onClick={saveEdit} disabled={editSaving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                {editSaving ? '...' : '💾 Αποθήκευση'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    'Open':           'bg-blue-900/60 text-blue-300',
    'Ανατεθειμένη':  'bg-orange-900/60 text-orange-300',
    'Μεταφορά':       'bg-green-900/60 text-green-300',
    'Παράδοση':       'bg-purple-900/60 text-purple-300',
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-md shrink-0 ${map[status] || 'bg-slate-600 text-slate-300'}`}>
      {status}
    </span>
  )
}
