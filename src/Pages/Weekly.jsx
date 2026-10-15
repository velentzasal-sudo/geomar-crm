import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfWeek, addDays } from 'date-fns'
import { el } from 'date-fns/locale'

const DAYS = ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ']

export default function Weekly() {
  const [trucks, setTrucks] = useState([])
  const [avail, setAvail] = useState([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [editCell, setEditCell] = useState(null) // { truckId, day }
  const [cellText, setCellText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from('trucks').select('*').order('tr'),
      supabase.from('avail').select('*'),
    ])
    setTrucks(t || [])
    setAvail(a || [])
    setLoading(false)
  }

  const weekDays = DAYS.map((_, i) => addDays(weekStart, i))

  function getCell(truckTr, date) {
    const d = format(date, 'yyyy-MM-dd')
    return avail.find(a => a.tr === truckTr && a.fr === d)
  }

  function openEdit(truckTr, date) {
    const existing = getCell(truckTr, date)
    setEditCell({ truckTr, date })
    setCellText(existing ? `${existing.ct || ''} → ${existing.co || ''} ${existing.nt || ''}`.trim() : '')
  }

  async function saveCell() {
    if (!editCell) return
    setSaving(true)
    const { truckTr, date } = editCell
    const d = format(date, 'yyyy-MM-dd')
    const existing = getCell(truckTr, date)

    if (cellText.trim() === '') {
      if (existing) await supabase.from('avail').delete().eq('id', existing.id)
    } else {
      const payload = { tr: truckTr, fr: d, nt: cellText, ct: '', co: '' }
      if (existing) {
        await supabase.from('avail').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('avail').insert([payload])
      }
    }
    setSaving(false)
    setEditCell(null)
    loadAll()
  }

  if (loading) return <div className="p-6 text-slate-400">Φόρτωση...</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">📋 Εβδομαδιαίος Πλάνος</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setWeekStart(w => addDays(w, -7))}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm">◀</button>
          <span className="text-slate-300 text-sm">
            {format(weekStart, 'd MMM', { locale: el })} – {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: el })}
          </span>
          <button onClick={() => setWeekStart(w => addDays(w, 7))}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm">▶</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm">Σήμερα</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-slate-400 text-xs font-medium py-2 pr-4 w-28">Φορτηγό</th>
              {weekDays.map((d, i) => (
                <th key={i} className="text-center text-slate-400 text-xs font-medium py-2 px-2 min-w-[120px]">
                  <div>{DAYS[i]}</div>
                  <div className="text-slate-500">{format(d, 'd/M')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trucks.map(t => (
              <tr key={t.id} className="border-t border-slate-800">
                <td className="py-2 pr-4">
                  <p className="text-white text-sm font-medium">{t.tr}</p>
                  <p className="text-slate-500 text-xs">{t.driver}</p>
                </td>
                {weekDays.map((d, i) => {
                  const cell = getCell(t.tr, d)
                  const isEditing = editCell?.truckTr === t.tr && editCell?.date === d
                  return (
                    <td key={i} className="py-1 px-1">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <input
                            autoFocus
                            value={cellText}
                            onChange={e => setCellText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditCell(null) }}
                            className="w-full bg-slate-700 border border-blue-500 rounded-lg px-2 py-1 text-white text-xs focus:outline-none"
                          />
                          <button onClick={saveCell} disabled={saving} className="text-green-400 hover:text-green-300 text-xs px-1">✓</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => openEdit(t.tr, d)}
                          className={`w-full text-left rounded-lg px-2 py-2 text-xs min-h-[36px] transition-colors ${
                            cell ? 'bg-blue-900/40 text-blue-200 hover:bg-blue-900/60' : 'text-slate-600 hover:bg-slate-700 hover:text-slate-400'
                          }`}
                        >
                          {cell ? cell.nt || `${cell.ct} → ${cell.co}` : '—'}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-slate-600 text-xs">Κλικ σε κελί για επεξεργασία · Enter για αποθήκευση · Esc για ακύρωση</p>
    </div>
  )
}
