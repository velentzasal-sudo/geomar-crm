import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import {
  format, startOfMonth, endOfMonth, startOfWeek, addDays,
  isSameMonth, isToday, isSameDay, parseISO
} from 'date-fns'
import { el } from 'date-fns/locale'

const COMPANIES = ['Hellenic Ferry Services', 'Blue Star']

// Map κωδικών λιμανιών → ελληνικά
const PORT_MAP = {
  'IG': 'Ηγουμενίτσα', 'HG': 'Ηγουμενίτσα', 'HJG': 'Ηγουμενίτσα', 'IGO': 'Ηγουμενίτσα',
  'BA': 'Μπάρι', 'BARI': 'Μπάρι',
  'PA': 'Πάτρα', 'PAT': 'Πάτρα', 'PATRA': 'Πάτρα', 'ΠΑΤΡΑ': 'Πάτρα',
  'AN': 'Ανκόνα', 'ANC': 'Ανκόνα', 'ANCONA': 'Ανκόνα',
  'VEN': 'Βενετία', 'VENICE': 'Βενετία', 'VENEZIA': 'Βενετία', 'ΒΕΝΕΤΙΑ': 'Βενετία',
}

function normalizePort(code) {
  if (!code) return code
  return PORT_MAP[code.trim().toUpperCase()] || code.trim()
}

// "IG BA" or "HG AN GRIMALDI" → { from, to, company }
function parseRouteField(raw) {
  if (!raw) return { route: '', company: null }
  const parts = raw.trim().split(/\s+/)
  const from = normalizePort(parts[0])
  const to   = normalizePort(parts[1] || '')
  const route = `${from} → ${to}`

  let company = null
  const rest = parts.slice(2).join(' ').toLowerCase()
  if (rest.includes('grimaldi')) company = 'Hellenic Ferry Services'
  else if (rest.includes('attica') || rest.includes('attika')) company = 'Blue Star'

  // Normalize to ROUTES list
  const matched = ROUTES.find(r => r !== '__other__' &&
    r.replace(/\s/g,'').toLowerCase() === route.replace(/\s/g,'').replace(/→/g,'').toLowerCase()
  )
  return { route: matched || route, company }
}

// "IAE6104 DIAMANTHS" or "THEOCHAROPOULOS NXY7402" → { truck, client }
// Plate pattern: 2-3 letters + 3-4 digits (Latin or Greek), possibly with space between letters and digits
function splitPlateClient(raw) {
  if (!raw) return { truck: '', client: '' }
  const parts = raw.trim().split(/\s+/)

  // Find which token looks like a plate
  const plateRe = /^[A-ZΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]{2,3}\d{3,4}$/i
  const plateStartRe = /^[A-ZΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]{2,4}$/i
  const digitsRe = /^\d{3,4}$/

  for (let i = 0; i < parts.length; i++) {
    // Case 1: plate in one token e.g. "IAE6104"
    if (plateRe.test(parts[i])) {
      const truck = parts[i]
      const client = [...parts.slice(0, i), ...parts.slice(i + 1)].join(' ')
      return { truck, client }
    }
    // Case 2: plate split across two tokens e.g. "NXT 297" or "E6050BT" (letters+digits in one)
    if (plateStartRe.test(parts[i]) && i + 1 < parts.length && digitsRe.test(parts[i + 1])) {
      const truck = parts[i] + parts[i + 1]
      const client = [...parts.slice(0, i), ...parts.slice(i + 2)].join(' ')
      return { truck, client }
    }
    // Case 3: alphanumeric like "E6050BT"
    if (/^[A-Z]\d{3,4}[A-Z]{1,2}$/i.test(parts[i])) {
      const truck = parts[i]
      const client = [...parts.slice(0, i), ...parts.slice(i + 1)].join(' ')
      return { truck, client }
    }
  }
  // No plate found — whole thing is client
  return { truck: '', client: raw.trim() }
}

// Parse Excel workbook into ferry rows
function parseExcelToFerries(workbook) {
  const results = []
  const ws = workbook.Sheets[workbook.SheetNames[0]]
  // raw:true → numbers stay numbers, dates stay Date objects (with cellDates:true)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })

  let currentCompany = null

  for (const row of rows) {
    if (!row || row.every(c => c === null || c === undefined)) continue

    const c0 = row[0]  // Date object or null
    const c1 = String(row[1] || '').trim()
    const c2 = String(row[2] || '').trim()
    const c3 = row[3]
    const c4 = row[4]

    // c0 can be: JS Date, ISO string (from cellDates+raw), number serial, or text
    function parseDateCell(v) {
      if (!v) return null
      if (v instanceof Date) {
        // Use UTC values to avoid timezone shift
        const y = v.getUTCFullYear(), m = String(v.getUTCMonth()+1).padStart(2,'0'), d = String(v.getUTCDate()).padStart(2,'0')
        return `${y}-${m}-${d}`
      }
      if (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}/)) return v.substring(0, 10)
      if (typeof v === 'number' && v > 40000 && v < 60000) {
        // Serial: integer part = days, no timezone issue
        const d = new Date(Math.round((v - 25569) * 86400 * 1000))
        const y = d.getUTCFullYear(), mo = String(d.getUTCMonth()+1).padStart(2,'0'), dy = String(d.getUTCDate()).padStart(2,'0')
        return `${y}-${mo}-${dy}`
      }
      return null
    }
    const departure = parseDateCell(c0)
    if (!departure) {
      const joined = row.map(v => String(v || '')).join(' ').toLowerCase()
      if (joined.includes('blue star')) currentCompany = 'Blue Star'
      else if (joined.includes('grimaldi')) currentCompany = 'Hellenic Ferry Services'
      else if (joined.includes('hfs') || joined.includes('hellenic')) currentCompany = 'Hellenic Ferry Services'
      continue
    }

    let route, truck, client, total_cost, company

    // Blue Star: col4 is a number (amount in last column)
    // Grimaldi:  col3 is a number (amount), col4 is null
    const c4isNum = typeof c4 === 'number'
    const c3isNum = typeof c3 === 'number'

    if (c4isNum) {
      // Blue Star format: route | plate | client | amount
      const { route: r } = parseRouteField(c1)
      route = r
      truck = c2.replace(/\s+/g, '').toUpperCase()
      client = String(c3 || '').trim()
      total_cost = c4
      company = currentCompany || 'Blue Star'
    } else {
      // Grimaldi/HFS format: "route COMPANY" | "plate client" | amount
      const { route: r, company: detectedCo } = parseRouteField(c1)
      route = r
      const { truck: t, client: cl } = splitPlateClient(c2)
      truck = t.replace(/\s+/g, '').toUpperCase()
      client = cl
      total_cost = c3isNum ? c3 : null
      company = detectedCo || currentCompany || 'Hellenic Ferry Services'
    }

    results.push({
      departure,
      route,
      truck:       truck || null,
      meters:      16.5,
      price_per_m: null,
      total_cost:  total_cost || null,
      company,
      booking_ref: null,
      notes:       client || null,
    })
  }

  return results
}

const ROUTES = [
  'Πάτρα → Μπάρι',
  'Πάτρα → Ανκόνα',
  'Πάτρα → Βενετία',
  'Ηγουμενίτσα → Μπάρι',
  'Ηγουμενίτσα → Ανκόνα',
  'Ηγουμενίτσα → Βενετία',
  'Μπάρι → Πάτρα',
  'Ανκόνα → Πάτρα',
  'Βενετία → Πάτρα',
  'Μπάρι → Ηγουμενίτσα',
  'Ανκόνα → Ηγουμενίτσα',
  'Βενετία → Ηγουμενίτσα',
  '__other__',
]

// €/μέτρο ανά δρομολόγιο και ημέρα (0=Δευτέρα ... 6=Κυριακή)
const PRICE_TABLE = {
  'Πάτρα → Μπάρι':          [59.8, 63.8, 59.8, 59.8, 59.8, 59.8, 59.8],
  'Πάτρα → Ανκόνα':         [103.1,103.1,103.1,103.1,107.1,103.1,103.1],
  'Πάτρα → Βενετία':        [102.5,102.5,102.5,102.5,108.5,102.5,102.5],
  'Ηγουμενίτσα → Μπάρι':    [50,   56,   50,   50,   50,   50,   50  ],
  'Ηγουμενίτσα → Ανκόνα':   [76,   77,   76,   76,   77,   77,   76  ],
  'Ηγουμενίτσα → Βενετία':  [100,  100,  100,  100,  106,  100,  100 ],
  'Μπάρι → Πάτρα':          [60.8, 60.8, 60.8, 60.8, 68.8, 68.8, 60.8],
  'Ανκόνα → Πάτρα':         [109.1,109.1,109.1,109.1,114.1,114,  109.1],
  'Βενετία → Πάτρα':        [115.5,115.5,115.5,115.5,115.5,129.5,115.5],
  'Μπάρι → Ηγουμενίτσα':    [53,   53,   53,   53,   57,   57,   53  ],
  'Ανκόνα → Ηγουμενίτσα':   [80,   80,   80,   87,   87,   93,   80  ],
  'Βενετία → Ηγουμενίτσα':  [113,  113,  113,  113,  113,  127,  113 ],
}

function getPricePerM(route, dateStr) {
  if (!route || !dateStr) return null
  const prices = PRICE_TABLE[route]
  if (!prices) return null
  const dow = (new Date(dateStr).getDay() + 6) % 7
  return prices[dow]
}

const EMPTY = {
  route: '', truck: '', meters: 16.5,
  price_per_m: '', total_cost: '',
  company: 'Hellenic Ferry Services', booking_ref: '', notes: ''
}

const COMPANY_COLORS = {
  'Hellenic Ferry Services': 'bg-blue-900/50 border-blue-700 text-blue-300',
  'Blue Star':               'bg-cyan-900/50 border-cyan-700 text-cyan-300',
}

export default function Ferries() {
  const [bookings, setBookings] = useState([])
  const [trucks, setTrucks]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [current, setCurrent]   = useState(new Date())
  const [selected, setSelected] = useState(null)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [editing, setEditing]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [importRows, setImportRows]   = useState([])
  const [importing, setImporting]     = useState(false)
  const [importDone, setImportDone]   = useState(null) // { inserted, skipped }

  useEffect(() => {
    loadAll()
    supabase.from('trucks').select('tr,driver').order('tr').then(({ data }) => setTrucks(data || []))
  }, [])

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase.from('ferries').select('*').order('departure')
    setBookings(data || [])
    setLoading(false)
  }

  // Κρατήσεις για συγκεκριμένη μέρα
  function bookingsForDay(date) {
    const ds = format(date, 'yyyy-MM-dd')
    return bookings.filter(b => b.departure === ds)
  }

  // Σύνολο κόστους μήνα
  const monthStart = startOfMonth(current)
  const monthEnd   = endOfMonth(current)
  const monthDs    = format(monthStart, 'yyyy-MM-dd')
  const monthDe    = format(monthEnd, 'yyyy-MM-dd')
  const monthBookings = bookings.filter(b => b.departure >= monthDs && b.departure <= monthDe)
  const monthTotal = monthBookings.reduce((sum, b) => sum + (parseFloat(b.total_cost) || 0), 0)
  const companyTotals = Object.fromEntries(
    COMPANIES.map(c => [c, monthBookings.filter(b => b.company === c).reduce((s, b) => s + (parseFloat(b.total_cost)||0), 0)])
  )

  // Ημέρες ημερολογίου
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const days = []
  let d = calStart
  while (days.length < 42) { days.push(d); d = addDays(d, 1) }

  function openNew(date) {
    setEditing(null)
    const ds = format(date, 'yyyy-MM-dd')
    const ppm = getPricePerM(EMPTY.route, ds)
    setForm({ ...EMPTY, price_per_m: ppm || '', total_cost: ppm ? +(ppm * 16.5).toFixed(2) : '' })
    setSelected(date)
    setModal(true)
  }

  function openEdit(b) {
    setEditing(b.id)
    setForm({
      route:       b.route || '',
      truck:       b.truck || '',
      meters:      b.meters ?? 16.5,
      price_per_m: b.price_per_m ?? '',
      total_cost:  b.total_cost ?? '',
      company:     b.company || 'Hellenic Ferry Services',
      booking_ref: b.booking_ref || '',
      notes:       b.notes || '',
    })
    setSelected(parseISO(b.departure))
    setModal(true)
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => {
      const next = { ...f, [name]: value }
      if (name === 'route') {
        const ds  = selected ? format(selected, 'yyyy-MM-dd') : ''
        const ppm = getPricePerM(value, ds)
        if (ppm !== null) {
          next.price_per_m = ppm
          next.total_cost  = +(ppm * (parseFloat(f.meters) || 16.5)).toFixed(2)
        }
      }
      if (name === 'price_per_m' || name === 'meters') {
        const ppm = parseFloat(name === 'price_per_m' ? value : f.price_per_m) || 0
        const m   = parseFloat(name === 'meters' ? value : f.meters) || 16.5
        next.total_cost = ppm ? +(ppm * m).toFixed(2) : ''
      }
      return next
    })
  }

  async function handleSave() {
    if (!form.route || !selected) return
    setSaving(true)
    const payload = {
      route:       form.route,
      departure:   format(selected, 'yyyy-MM-dd'),
      truck:       form.truck || null,
      meters:      parseFloat(form.meters) || 16.5,
      price_per_m: parseFloat(form.price_per_m) || null,
      total_cost:  parseFloat(form.total_cost) || null,
      company:     form.company || null,
      booking_ref: form.booking_ref || null,
      notes:       form.notes || null,
    }
    if (editing) {
      await supabase.from('ferries').update(payload).eq('id', editing)
    } else {
      await supabase.from('ferries').insert([payload])
    }
    setSaving(false)
    setModal(false)
    loadAll()
  }

  function handleImportFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const data = new Uint8Array(ev.target.result)
      const wb = XLSX.read(data, { type: 'array', cellDates: true })
      const rows = parseExcelToFerries(wb)
      setImportRows(rows)
      setImportDone(null)
      setImportModal(true)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = '' // reset so same file can be re-selected
  }

  async function handleImportConfirm() {
    if (!importRows.length) return
    setImporting(true)
    let inserted = 0, skipped = 0
    for (const row of importRows) {
      if (!row.departure || !row.route) { skipped++; continue }
      const { error } = await supabase.from('ferries').insert([row])
      if (error) skipped++
      else inserted++
    }
    setImporting(false)
    setImportDone({ inserted, skipped })
    loadAll()
  }

  async function handleDelete(id) {
    if (!window.confirm('Διαγραφή κράτησης;')) return
    await supabase.from('ferries').delete().eq('id', id)
    loadAll()
  }

  function exportXlsx() {
    const rows = monthBookings.map(b => ({
      'Ημερομηνία':   b.departure || '',
      'Δρομολόγιο':   b.route || '',
      'Εταιρεία':     b.company || '',
      'Φορτηγό':      b.truck || '',
      'Μέτρα':        b.meters ?? 16.5,
      '€/μέτρο':      b.price_per_m ?? '',
      'Σύνολο (€)':   b.total_cost ?? '',
      'Αρ. Κράτησης': b.booking_ref || '',
      'Σημειώσεις':   b.notes || '',
    }))

    // Σύνολα ανά εταιρεία
    const summaryRows = [
      {},
      { 'Δρομολόγιο': 'ΣΥΝΟΛΑ', 'Εταιρεία': 'Hellenic Ferry Services', 'Σύνολο (€)': companyTotals['Hellenic Ferry Services'] },
      { 'Δρομολόγιο': '',        'Εταιρεία': 'Blue Star',               'Σύνολο (€)': companyTotals['Blue Star'] },
      { 'Δρομολόγιο': '',        'Εταιρεία': 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ',           'Σύνολο (€)': monthTotal },
    ]

    const ws = XLSX.utils.json_to_sheet([...rows, ...summaryRows])
    ws['!cols'] = [
      { wch: 12 }, { wch: 28 }, { wch: 24 }, { wch: 12 },
      { wch: 8 },  { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 24 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, format(current, 'MMM yyyy', { locale: el }))
    XLSX.writeFile(wb, `Καράβια_${format(current, 'yyyy-MM', { locale: el })}.xlsx`)
  }

  const DAY_LABELS = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ']

  return (
    <div className="p-4 md:p-6 flex flex-col h-full gap-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">⛴️ Καράβια</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {format(current, 'MMMM yyyy', { locale: el })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrent(c => addDays(startOfMonth(c), -1))}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm transition-colors">‹</button>
          <button onClick={() => setCurrent(new Date())}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm transition-colors">Σήμερα</button>
          <button onClick={() => setCurrent(c => addDays(endOfMonth(c), 1))}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm transition-colors">›</button>
          <label className="px-3 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded-xl text-sm transition-colors cursor-pointer">
            📂 Import
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
          </label>
          <button onClick={exportXlsx}
            className="px-3 py-2 bg-green-700 hover:bg-green-600 text-white rounded-xl text-sm transition-colors">
            📥 Excel
          </button>
        </div>
      </div>

      {/* Σύνολα μήνα */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-900/30 border border-blue-700/50 rounded-2xl px-4 py-3">
          <p className="text-blue-300 text-xs font-medium uppercase tracking-wide mb-1">Hellenic</p>
          <p className="text-white text-xl font-bold">{companyTotals['Hellenic Ferry Services'].toLocaleString('el-GR', { minimumFractionDigits: 2 })} €</p>
          <p className="text-blue-400 text-xs mt-0.5">{monthBookings.filter(b => b.company === 'Hellenic Ferry Services').length} κρατήσεις</p>
        </div>
        <div className="bg-cyan-900/30 border border-cyan-700/50 rounded-2xl px-4 py-3">
          <p className="text-cyan-300 text-xs font-medium uppercase tracking-wide mb-1">Blue Star</p>
          <p className="text-white text-xl font-bold">{companyTotals['Blue Star'].toLocaleString('el-GR', { minimumFractionDigits: 2 })} €</p>
          <p className="text-cyan-400 text-xs mt-0.5">{monthBookings.filter(b => b.company === 'Blue Star').length} κρατήσεις</p>
        </div>
        <div className="bg-slate-800 border border-slate-600 rounded-2xl px-4 py-3">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Σύνολο {format(current, 'MMM', { locale: el })}</p>
          <p className="text-green-400 text-xl font-bold">{monthTotal.toLocaleString('el-GR', { minimumFractionDigits: 2 })} €</p>
          <p className="text-slate-500 text-xs mt-0.5">{monthBookings.length} κρατήσεις</p>
        </div>
      </div>

      {/* Ημερολόγιο */}
      {loading ? (
        <div className="text-slate-400 py-8 text-center">Φόρτωση...</div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden flex-1">
          {/* Επικεφαλίδες ημερών */}
          <div className="grid grid-cols-7 border-b border-slate-700">
            {DAY_LABELS.map(l => (
              <div key={l} className="py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wide">{l}</div>
            ))}
          </div>

          {/* Ημέρες */}
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const dayBookings = bookingsForDay(day)
              const inMonth     = isSameMonth(day, current)
              const isSelected  = selected && isSameDay(day, selected)
              const today       = isToday(day)

              return (
                <div
                  key={i}
                  onClick={() => setSelected(day)}
                  className={`min-h-20 border-b border-r border-slate-700/50 p-1.5 cursor-pointer transition-colors
                    ${!inMonth ? 'opacity-30' : ''}
                    ${isSelected ? 'bg-blue-900/30' : 'hover:bg-slate-700/30'}
                  `}
                >
                  <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1
                    ${today ? 'bg-blue-600 text-white' : 'text-slate-400'}
                  `}>{format(day, 'd')}</div>

                  {dayBookings.slice(0, 2).map(b => (
                    <div key={b.id}
                      className={`text-xs px-1 py-0.5 rounded border truncate mb-0.5 ${COMPANY_COLORS[b.company] || 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                      ⛴️ {b.route?.split('→')[1]?.trim() || b.route}
                    </div>
                  ))}
                  {dayBookings.length > 2 && (
                    <div className="text-xs text-slate-500">+{dayBookings.length - 2}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Sidebar: λεπτομέρειες επιλεγμένης μέρας */}
      {selected && (
        <div className="fixed inset-y-0 right-0 w-80 bg-slate-900 border-l border-slate-700 z-30 flex flex-col shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <div>
              <p className="text-white font-semibold text-sm">{format(selected, 'EEEE d MMMM', { locale: el })}</p>
              <p className="text-slate-500 text-xs">{bookingsForDay(selected).length} κρατήσεις</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openNew(selected)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium transition-colors">
                + Κράτηση
              </button>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {bookingsForDay(selected).length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">Δεν υπάρχουν κρατήσεις</p>
            ) : (
              bookingsForDay(selected).map(b => (
                <div key={b.id} className={`border rounded-2xl px-4 py-3 space-y-2 ${COMPANY_COLORS[b.company] || 'bg-slate-800 border-slate-700'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-white font-semibold text-sm">{b.route}</p>
                      <p className="text-xs opacity-70 mt-0.5">{b.company}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEdit(b)}
                        className="px-2 py-1 bg-black/20 hover:bg-black/40 rounded-lg text-xs transition-colors">✏️</button>
                      <button onClick={() => handleDelete(b.id)}
                        className="px-2 py-1 bg-black/20 hover:bg-red-900/60 rounded-lg text-xs transition-colors">🗑️</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {b.truck && <div><span className="opacity-60">Φορτηγό</span><p className="font-medium">{b.truck}</p></div>}
                    <div><span className="opacity-60">Μέτρα</span><p className="font-medium">{b.meters ?? 16.5}m</p></div>
                    <div><span className="opacity-60">Κόστος</span><p className="font-bold text-green-300">{b.total_cost ? `${b.total_cost.toLocaleString('el-GR')}€` : '—'}</p></div>
                  </div>
                  {b.booking_ref && <p className="text-xs opacity-60">#{b.booking_ref}</p>}
                  {b.notes && <p className="text-xs opacity-60">💬 {b.notes}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal κράτησης */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-800 rounded-t-3xl sm:rounded-3xl border border-slate-700 w-full sm:max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">{editing ? '✏️ Επεξεργασία' : '+ Νέα Κράτηση'}</h2>
                {selected && <p className="text-slate-400 text-sm">{format(selected, 'EEEE d MMMM yyyy', { locale: el })}</p>}
              </div>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-white text-2xl">×</button>
            </div>

            <div className="space-y-3">
              {/* Εταιρεία */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Εταιρεία</label>
                <div className="flex gap-2">
                  {COMPANIES.map(c => (
                    <button key={c} type="button"
                      onClick={() => setForm(f => ({ ...f, company: c }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                        form.company === c
                          ? COMPANY_COLORS[c]
                          : 'bg-slate-700 border-slate-600 text-slate-400'
                      }`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Δρομολόγιο */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Δρομολόγιο *</label>
                <select
                  value={ROUTES.includes(form.route) ? form.route : (form.route ? '__other__' : '')}
                  onChange={e => {
                    if (e.target.value === '__other__') setForm(f => ({ ...f, route: '' }))
                    else handleChange({ target: { name: 'route', value: e.target.value } })
                  }}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                  <option value="">— Επιλογή —</option>
                  {ROUTES.filter(r => r !== '__other__').map(r => <option key={r} value={r}>{r}</option>)}
                  <option value="__other__">✏️ Άλλο δρομολόγιο...</option>
                </select>
                {!ROUTES.filter(r => r !== '__other__').includes(form.route) && (
                  <input
                    name="route" value={form.route} onChange={handleChange}
                    placeholder="π.χ. Πειραιάς → Χανιά"
                    className="w-full mt-2 bg-slate-700 border border-blue-500 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400"
                  />
                )}
              </div>

              {/* Φορτηγό */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Φορτηγό</label>
                <select name="truck" value={form.truck} onChange={handleChange}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                  <option value="">— Χωρίς φορτηγό —</option>
                  {trucks.map(t => <option key={t.tr} value={t.tr}>{t.tr}{t.driver ? ` · ${t.driver}` : ''}</option>)}
                </select>
              </div>

              {/* Μέτρα / €/μ / Σύνολο */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Μέτρα</label>
                  <input type="number" name="meters" value={form.meters} onChange={handleChange} step="0.5"
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    €/μ {form.route && <span className="text-blue-400">(auto)</span>}
                  </label>
                  <input type="number" name="price_per_m" value={form.price_per_m} onChange={handleChange} step="0.1"
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Σύνολο €</label>
                  <input type="number" name="total_cost" value={form.total_cost} onChange={handleChange}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              {/* Αρ. Κράτησης / Σημειώσεις */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Αρ. Κράτησης</label>
                <input name="booking_ref" value={form.booking_ref} onChange={handleChange}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Σημειώσεις</label>
                <textarea name="notes" value={form.notes} onChange={handleChange} rows={2}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm transition-colors">
                Ακύρωση
              </button>
              <button onClick={handleSave} disabled={saving || !form.route}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium transition-colors">
                {saving ? 'Αποθήκευση...' : '💾 Αποθήκευση'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Import Modal */}
      {importModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-4xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">📂 Import από Excel</h2>
                <p className="text-slate-400 text-sm">{importRows.length} εγγραφές βρέθηκαν</p>
              </div>
              <button onClick={() => setImportModal(false)} className="text-slate-400 hover:text-white text-2xl">×</button>
            </div>

            {/* Preview table */}
            <div className="flex-1 overflow-auto p-4">
              {importRows.length === 0 ? (
                <p className="text-slate-400 text-center py-8">Δεν βρέθηκαν έγκυρες εγγραφές</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-700">
                      <th className="text-left pb-2 pr-3">Ημ/νία</th>
                      <th className="text-left pb-2 pr-3">Δρομολόγιο</th>
                      <th className="text-left pb-2 pr-3">Πινακίδα</th>
                      <th className="text-left pb-2 pr-3">Εταιρεία</th>
                      <th className="text-left pb-2 pr-3">Σημειώσεις</th>
                      <th className="text-right pb-2">Κόστος</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, i) => (
                      <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-1.5 pr-3 text-white font-mono text-xs">{r.departure}</td>
                        <td className="py-1.5 pr-3 text-white">{r.route}</td>
                        <td className="py-1.5 pr-3 text-cyan-300 font-mono text-xs">{r.truck || '—'}</td>
                        <td className="py-1.5 pr-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            r.company === 'Blue Star' ? 'bg-cyan-900/50 border-cyan-700 text-cyan-300' :
'bg-blue-900/50 border-blue-700 text-blue-300'
                          }`}>{r.company}</span>
                        </td>
                        <td className="py-1.5 pr-3 text-slate-400 text-xs">{r.notes || '—'}</td>
                        <td className="py-1.5 text-right text-green-300 font-medium">
                          {r.total_cost ? `${r.total_cost.toLocaleString('el-GR')}€` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Result message */}
            {importDone && (
              <div className="px-6 py-3 border-t border-slate-700 bg-slate-900/50 shrink-0">
                <p className="text-green-400 font-medium">
                  ✅ {importDone.inserted} εγγραφές εισήχθησαν
                  {importDone.skipped > 0 && <span className="text-yellow-400 ml-2">⚠️ {importDone.skipped} παραλείφθηκαν</span>}
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-700 shrink-0">
              <button onClick={() => setImportModal(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm transition-colors">
                {importDone ? 'Κλείσιμο' : 'Ακύρωση'}
              </button>
              {!importDone && (
                <button onClick={handleImportConfirm} disabled={importing || importRows.length === 0}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium transition-colors">
                  {importing ? 'Εισαγωγή...' : `💾 Εισαγωγή ${importRows.length} εγγραφών`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
