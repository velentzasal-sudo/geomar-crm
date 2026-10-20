import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, startOfWeek, addDays, isToday, parseISO } from 'date-fns'
import { el } from 'date-fns/locale'

const DAYS = ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ']
const TLDM = 13.20
const LDM_FACTORS = { E: 0.40, B: 0.50, P: 0.60, M: 1.00 }

const AVAIL_STATUSES = [
  { key: 'Διαθέσιμο',  label: 'Διαθέσιμο',  color: 'bg-green-900/60 text-green-300 border-green-700' },
  { key: 'Εν κινήσει', label: 'Εν κινήσει', color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700' },
  { key: 'Service',    label: 'Service',     color: 'bg-red-900/60 text-red-300 border-red-700' },
]

export default function Weekly() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [trucks, setTrucks]     = useState([])
  const [avail, setAvail]       = useState([])
  const [orders, setOrders]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [showAll, setShowAll]   = useState(false)
  const [weekStart, setWeekStart] = useState(() => {
    const dp = searchParams.get('date')
    if (dp) {
      try { return startOfWeek(parseISO(dp), { weekStartsOn: 1 }) } catch {}
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 })
  })

  // cell detail popup: { tr, date }
  const [detail, setDetail]   = useState(null)
  // avail edit modal: { tr, date }
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState({ status: 'Διαθέσιμο', location: '', notes: '' })
  const [saving, setSaving]   = useState(false)

  useEffect(() => { loadAll() }, [weekStart])

  async function loadAll() {
    setLoading(true)
    const from = format(weekStart, 'yyyy-MM-dd')
    const to   = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const [{ data: t }, { data: a }, { data: o }] = await Promise.all([
      supabase.from('trucks').select('*').order('tr'),
      supabase.from('avail').select('*').gte('fr', from).lte('fr', to),
      supabase.from('orders')
        .select('id,client,truck,status,ldm,qty,pal,rdy,load_date,delivery_date,from,to')
        .not('status', 'eq', 'Delivered'),
    ])
    setTrucks(t || [])
    setAvail(a || [])
    setOrders(o || [])
    setLoading(false)
    // clear date param after applying it
    if (searchParams.get('date')) setSearchParams({})
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  function getAvail(tr, date) {
    const d = format(date, 'yyyy-MM-dd')
    return avail.find(a => a.tr === tr && a.fr === d)
  }

  function getDayOrders(tr, date) {
    const d = format(date, 'yyyy-MM-dd')
    return orders.filter(o => {
      if (o.truck !== tr) return false
      const load = o.load_date?.substring(0, 10) || o.rdy?.substring(0, 10)
      const del  = o.delivery_date?.substring(0, 10)
      if (load && del) return d >= load && d <= del
      if (load) return d >= load
      return false
    })
  }

  function getDayLdm(tr, date) {
    return getDayOrders(tr, date).reduce((sum, o) => {
      const ldm = parseFloat(o.ldm) || (o.pal && o.qty ? (LDM_FACTORS[o.pal] || 0) * parseFloat(o.qty) : 0)
      return sum + ldm
    }, 0)
  }

  // Is this truck "active" this week? (has order or avail record)
  function isActiveTruck(tr) {
    const from = format(weekStart, 'yyyy-MM-dd')
    const to   = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const hasAvail  = avail.some(a => a.tr === tr && a.fr >= from && a.fr <= to)
    const hasOrders = orders.some(o => {
      if (o.truck !== tr) return false
      const load = o.load_date?.substring(0, 10) || o.rdy?.substring(0, 10)
      const del  = o.delivery_date?.substring(0, 10)
      if (load && del) return load <= to && del >= from
      if (load) return load <= to && load >= from
      return false
    })
    return hasAvail || hasOrders
  }

  const visibleTrucks = showAll ? trucks : trucks.filter(t => isActiveTruck(t.tr))

  function detectCountry(loc = '') {
    const l = loc.toLowerCase()
    if (l.includes('ιταλ') || l.includes('ital') || l.includes('μπαρ') || l.includes('bari') ||
        l.includes('βενετ') || l.includes('venet') || l.includes('μιλαν') || l.includes('milan') ||
        l.includes('ανκον') || l.includes('ancona') || l.includes('τριεστ') || l.includes('tries')) return 'IT'
    if (l.includes('ελλ') || l.includes('αθην') || l.includes('θεσσαλ') || l.includes('πατρ') ||
        l.includes('athen') || l.includes('thess') || l.includes('patras') || l.includes('greece')) return 'GR'
    return 'OTHER'
  }

  // LDM bar color
  function ldmColor(used, cap) {
    const pct = used / cap
    if (used === 0) return 'bg-slate-600'
    if (pct >= 1)   return 'bg-red-500'
    if (pct >= 0.7) return 'bg-orange-500'
    return 'bg-green-500'
  }

  function ldmTextColor(free) {
    if (free <= 0)  return 'text-red-400'
    if (free < 4)   return 'text-orange-400'
    return 'text-green-400'
  }

  // Open avail edit modal
  function openEdit(tr, date) {
    const rec = getAvail(tr, date)
    setEditing({ tr, date })
    setForm({
      status:   rec?.nt || 'Διαθέσιμο',
      location: rec?.ct || '',
      notes:    rec?.co || '',
    })
    setDetail(null)
  }

  async function saveCell() {
    if (!editing) return
    setSaving(true)
    const { tr, date } = editing
    const d = format(date, 'yyyy-MM-dd')
    const existing = getAvail(tr, date)
    const payload = { tr, fr: d, nt: form.status, ct: form.location, co: form.notes }
    if (existing) {
      await supabase.from('avail').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('avail').insert([payload])
    }
    setSaving(false)
    setEditing(null)
    loadAll()
  }

  async function clearCell() {
    if (!editing) return
    const existing = getAvail(editing.tr, editing.date)
    if (existing) await supabase.from('avail').delete().eq('id', existing.id)
    setEditing(null)
    loadAll()
  }

  if (loading) return <div className="p-6 text-slate-400">Φόρτωση...</div>

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-white">📋 Εβδομαδιαίος Πλάνος</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowAll(v => !v)}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
              showAll
                ? 'bg-slate-600 border-slate-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {showAll ? '👁 Όλα' : '⚡ Ενεργά'}
          </button>
          <div className="w-px h-5 bg-slate-700" />
          <button onClick={() => setWeekStart(w => addDays(w, -7))}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm">◀</button>
          <span className="text-slate-300 text-sm min-w-[160px] text-center">
            {format(weekStart, 'd MMM', { locale: el })} – {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: el })}
          </span>
          <button onClick={() => setWeekStart(w => addDays(w, 7))}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm">▶</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm">Σήμερα</button>
        </div>
      </div>

      {visibleTrucks.length === 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center">
          <p className="text-slate-400 text-sm">Δεν υπάρχουν ενεργά φορτηγά αυτή την εβδομάδα.</p>
          <button onClick={() => setShowAll(true)} className="mt-2 text-blue-400 text-sm hover:underline">
            Εμφάνιση όλων →
          </button>
        </div>
      )}

      {/* Grid */}
      {visibleTrucks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left text-slate-400 text-xs font-medium py-2 pr-3 w-28">Φορτηγό</th>
                {weekDays.map((d, i) => (
                  <th key={i} className={`text-center text-xs font-medium py-2 px-1 min-w-[110px] ${isToday(d) ? 'text-blue-400' : 'text-slate-400'}`}>
                    <div>{DAYS[i]}</div>
                    <div className={`text-xs ${isToday(d) ? 'text-blue-500' : 'text-slate-500'}`}>{format(d, 'd/M')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleTrucks.map(t => (
                <tr key={t.id} className="border-t border-slate-800">
                  <td className="py-2 pr-3">
                    <p className="text-white text-sm font-bold">{t.tr}</p>
                    <p className="text-slate-500 text-xs truncate max-w-[100px]">{t.driver}</p>
                  </td>
                  {weekDays.map((d, i) => {
                    const rec       = getAvail(t.tr, d)
                    const dayOrders = getDayOrders(t.tr, d)
                    const ldmUsed   = getDayLdm(t.tr, d)
                    const cap       = parseFloat(t.ldm) || TLDM
                    const ldmFree   = cap - ldmUsed
                    const pct       = Math.min(100, (ldmUsed / cap) * 100)
                    const today     = isToday(d)
                    const availSt   = rec?.nt

                    // Determine cell mode
                    const hasActivity = dayOrders.length > 0 || !!rec

                    return (
                      <td key={i} className={`py-1 px-1 ${today ? 'bg-blue-950/20' : ''}`}>
                        <button
                          onClick={() => {
                            if (dayOrders.length > 0) {
                              setDetail({ tr: t.tr, date: d, orders: dayOrders, rec, ldmUsed, cap, ldmFree, truck: t })
                            } else {
                              openEdit(t.tr, d)
                            }
                          }}
                          className={`w-full rounded-xl px-2 py-2 text-xs border text-left transition-all min-h-[64px] group ${
                            hasActivity
                              ? 'bg-slate-700/80 border-slate-600 hover:border-slate-500'
                              : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-700/40 hover:border-slate-600'
                          }`}
                        >
                          {hasActivity ? (
                            <div className="space-y-1">
                              {/* Avail status badge */}
                              {availSt && availSt !== 'Φορτωμένο' && (
                                <div className={`text-xs px-1.5 py-0.5 rounded-md inline-block border ${
                                  availSt === 'Διαθέσιμο'  ? 'bg-green-900/60 text-green-300 border-green-800' :
                                  availSt === 'Εν κινήσει' ? 'bg-cyan-900/60 text-cyan-300 border-cyan-800' :
                                  availSt === 'Ρεπό'       ? 'bg-slate-700 text-slate-400 border-slate-600' :
                                  'bg-red-900/60 text-red-300 border-red-800'
                                }`}>{availSt}</div>
                              )}
                              {/* Location */}
                              {rec?.ct && (
                                <div className="text-slate-400 text-xs truncate">📍 {rec.ct}</div>
                              )}
                              {/* Orders count */}
                              {dayOrders.length > 0 && (
                                <div className="text-slate-300 text-xs">
                                  📦 {dayOrders.length} παρ.
                                </div>
                              )}
                              {/* LDM bar */}
                              {ldmUsed > 0 && (
                                <>
                                  <div className="w-full bg-slate-600 rounded-full h-1 mt-1">
                                    <div
                                      className={`h-1 rounded-full ${ldmColor(ldmUsed, cap)}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <div className={`text-xs font-medium ${ldmTextColor(ldmFree)}`}>
                                    {ldmFree > 0 ? `${ldmFree.toFixed(1)} LDM ελεύθερο` : '⚠️ Γεμάτο'}
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-12 opacity-30 group-hover:opacity-60 transition-opacity">
                              <span className="text-slate-400 text-lg">+</span>
                              <span className="text-slate-500 text-xs">{cap.toFixed(1)} LDM</span>
                            </div>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-slate-600 text-xs">Κλικ σε κελί με παραγγελίες → λεπτομέρειες · Κλικ σε κενό κελί → ορισμός κατάστασης</p>

      {/* ── ΕΒΔΟΜΑΔΙΑΙΑ ΤΟΠΟΘΕΣΙΑ ── */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <p className="text-white font-bold text-sm mb-3">📍 Τοποθεσίες ανά ημέρα</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr>
                <th className="text-left text-slate-400 font-medium py-2 pr-3 w-28">Χώρα</th>
                {weekDays.map((d, i) => (
                  <th key={i} className={`text-center font-medium py-2 px-2 min-w-[100px] ${isToday(d) ? 'text-blue-400' : 'text-slate-400'}`}>
                    <div>{DAYS[i]}</div>
                    <div className={`text-xs ${isToday(d) ? 'text-blue-500' : 'text-slate-500'}`}>{format(d, 'd/M')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['IT','GR','OTHER'].map(country => {
                const label = country === 'IT' ? '🇮🇹 Ιταλία' : country === 'GR' ? '🇬🇷 Ελλάδα' : '🔀 Άλλο'
                return (
                  <tr key={country} className="border-t border-slate-700/50">
                    <td className="py-2 pr-3 text-slate-400 font-medium">{label}</td>
                    {weekDays.map((d, i) => {
                      const ds = format(d, 'yyyy-MM-dd')
                      // Avail records for this day
                      const dayAvail = avail.filter(a => a.fr === ds)
                      // Orders active this day (have truck + status)
                      const dayOrders = orders.filter(o => {
                        if (!o.truck) return false
                        const load = o.load_date?.substring(0,10) || o.rdy?.substring(0,10)
                        const del  = o.delivery_date?.substring(0,10)
                        if (load && del) return ds >= load && ds <= del
                        if (load) return ds >= load
                        return false
                      })
                      // Merge: avail overrides orders
                      const availTrSet = new Set(dayAvail.map(a => a.tr))
                      const allTrucks = [
                        ...dayAvail.map(a => ({ tr: a.tr, loc: a.ct || '', status: a.nt })),
                        ...dayOrders.filter(o => !availTrSet.has(o.truck)).map(o => ({ tr: o.truck, loc: (o.from || '') + ' → ' + (o.to || ''), status: o.status })),
                      ]
                      const filtered = allTrucks.filter(t => detectCountry(t.loc) === country)
                      return (
                        <td key={i} className={`py-1.5 px-2 align-top ${isToday(d) ? 'bg-blue-950/20' : ''}`}>
                          {filtered.length === 0 ? (
                            <span className="text-slate-700">—</span>
                          ) : (
                            <div className="space-y-1">
                              {filtered.map((t, j) => {
                                const truckObj = trucks.find(tk => tk.tr === t.tr)
                                return (
                                  <div key={j} className="bg-slate-700/60 rounded-lg px-1.5 py-1">
                                    <p className="text-white font-semibold truncate">{truckObj?.alias || t.tr}</p>
                                    {t.loc && <p className="text-slate-400 truncate text-xs">{t.loc}</p>}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── DETAIL POPUP ── */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setDetail(null) }}>
          <div className="bg-slate-800 rounded-t-3xl sm:rounded-3xl border border-slate-700 w-full sm:max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">🚛 {detail.tr}</h2>
                <p className="text-slate-400 text-sm">{format(detail.date, 'EEEE d MMMM', { locale: el })}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-500 hover:text-white text-xl leading-none">✕</button>
            </div>

            {/* LDM summary */}
            <div className="bg-slate-700/50 rounded-2xl p-3 flex items-center gap-4">
              <div className="flex-1">
                <div className="w-full bg-slate-600 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${ldmColor(detail.ldmUsed, detail.cap)}`}
                    style={{ width: `${Math.min(100, (detail.ldmUsed / detail.cap) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-bold ${ldmTextColor(detail.ldmFree)}`}>
                  {detail.ldmFree > 0 ? `${detail.ldmFree.toFixed(2)} LDM ελεύθερο` : '⚠️ Γεμάτο'}
                </p>
                <p className="text-slate-500 text-xs">{detail.ldmUsed.toFixed(2)} / {detail.cap} χρησιμοποιείται</p>
              </div>
            </div>

            {/* Avail info */}
            {detail.rec && (
              <div className="bg-slate-700/30 rounded-xl px-3 py-2 flex items-center justify-between">
                <div>
                  <span className="text-slate-300 text-sm">{detail.rec.nt}</span>
                  {detail.rec.ct && <span className="text-slate-500 text-xs ml-2">📍 {detail.rec.ct}</span>}
                  {detail.rec.co && <p className="text-slate-500 text-xs mt-0.5 italic">{detail.rec.co}</p>}
                </div>
                <button
                  onClick={() => openEdit(detail.tr, detail.date)}
                  className="text-xs text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded-lg transition-colors"
                >✏️</button>
              </div>
            )}

            {/* Orders list */}
            <div className="space-y-2">
              {detail.orders.map(o => {
                const ldm = parseFloat(o.ldm) || 0
                return (
                  <div key={o.id} className="bg-slate-700 rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white text-sm font-medium truncate">{o.client}</p>
                      <span className="text-slate-400 text-xs shrink-0">{ldm.toFixed(2)} LDM</span>
                    </div>
                    {(o.from || o.to) && (
                      <p className="text-slate-400 text-xs mt-0.5 truncate">{o.from} → {o.to}</p>
                    )}
                    {(o.load_date || o.delivery_date) && (
                      <p className="text-slate-500 text-xs mt-0.5">
                        {o.load_date ? `📦 ${o.load_date.substring(0,10)}` : ''}
                        {o.delivery_date ? ` → 🏁 ${o.delivery_date.substring(0,10)}` : ''}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {!detail.rec && (
              <button
                onClick={() => openEdit(detail.tr, detail.date)}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-xl text-sm transition-colors"
              >
                + Ορισμός κατάστασης
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── AVAIL EDIT MODAL ── */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-slate-800 rounded-t-3xl sm:rounded-3xl border border-slate-700 w-full sm:max-w-sm p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">🚛 {editing.tr}</h2>
              <p className="text-slate-400 text-sm">{format(editing.date, 'EEEE d MMMM yyyy', { locale: el })}</p>
              {getDayLdm(editing.tr, editing.date) > 0 && (
                <p className="text-blue-400 text-xs mt-1">
                  📦 {getDayLdm(editing.tr, editing.date).toFixed(2)} LDM από παραγγελίες
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Κατάσταση</label>
              <div className="grid grid-cols-2 gap-2">
                {AVAIL_STATUSES.map(s => (
                  <button key={s.key}
                    onClick={() => setForm(f => ({ ...f, status: s.key }))}
                    className={`py-2 px-3 rounded-xl text-sm border transition-colors ${
                      form.status === s.key ? s.color + ' font-bold' : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                    }`}
                  >{s.label}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Τοποθεσία</label>
              <input
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="π.χ. Μιλάνο, Θεσσαλονίκη..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Σημείωση</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="π.χ. Επιστρέφει Δευτέρα..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm">
                Ακύρωση
              </button>
              {getAvail(editing.tr, editing.date) && (
                <button onClick={clearCell}
                  className="bg-red-900/40 hover:bg-red-900/60 text-red-400 px-4 py-2 rounded-xl text-sm">
                  🗑️
                </button>
              )}
              <button onClick={saveCell} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium">
                {saving ? '...' : '💾 Αποθήκευση'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
