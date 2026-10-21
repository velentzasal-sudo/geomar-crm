// Κοινές σταθερές logistics — χρησιμοποιούνται σε Orders, Avail, Fleet, Dashboard, Dispatch, TruckHistory, Calendar, Weekly

export const TLDM = 13.20

export const LDM_FACTORS = { E: 0.40, B: 0.50, P: 0.60, M: 1.00 }

// Χρώματα για κατάσταση παραγγελίας (Orders, Dispatch, TruckHistory, Calendar, Dashboard)
export const STATUS_COLORS = {
  'Open':          'bg-blue-900/50 text-blue-300 border-blue-700',
  'Ανατεθειμένη': 'bg-orange-900/50 text-orange-300 border-orange-700',
  'Μεταφορά':     'bg-green-900/50 text-green-300 border-green-700',
  'Παράδοση':     'bg-purple-900/50 text-purple-300 border-purple-700',
  'Delivered':    'bg-slate-700 text-slate-400 border-slate-600',
}

// Χρώματα για κατάσταση διαθεσιμότητας φορτηγού (Avail)
export const AVAIL_STATUS_COLORS = {
  'Διαθέσιμο':         'bg-green-900/50 text-green-300 border-green-700',
  'Μερικώς Φορτωμένο': 'bg-blue-900/50 text-blue-300 border-blue-700',
  'Πλήρως Φορτωμένο':  'bg-orange-900/50 text-orange-300 border-orange-700',
  'Ρεπό':              'bg-slate-700 text-slate-400 border-slate-600',
  'Service':           'bg-red-900/50 text-red-300 border-red-700',
}
