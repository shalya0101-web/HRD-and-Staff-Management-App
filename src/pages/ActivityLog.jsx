import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useOutlet } from '../lib/OutletContext'

const BULAN_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const today = new Date()

const MODUL_COLORS = {
  payroll: 'bg-blue-100 text-blue-700',
  absensi: 'bg-green-100 text-green-700',
  pengajuan: 'bg-yellow-100 text-yellow-700',
  pegawai: 'bg-purple-100 text-purple-700',
  jadwal: 'bg-teal-100 text-teal-700',
  dokumen: 'bg-orange-100 text-orange-700',
  performance: 'bg-pink-100 text-pink-700',
  sistem: 'bg-gray-100 text-gray-600',
}

const MODUL_ICON = {
  payroll: '💰', absensi: '✓', pengajuan: '📝', pegawai: '👤',
  jadwal: '📅', dokumen: '📁', performance: '⭐', sistem: '⚙',
}

function formatWaktu(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function ActivityLog() {
  const { activeOutlet, activeOutletData } = useOutlet()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [filterModul, setFilterModul] = useState('semua')
  const [filterUser, setFilterUser] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState(
    `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`
  )
  const [filterDateTo, setFilterDateTo] = useState(
    today.toISOString().split('T')[0]
  )
  const [page, setPage] = useState(1)
  const PER_PAGE = 50

  useEffect(() => { fetchLogs() }, [activeOutlet, filterModul, filterDateFrom, filterDateTo, page])

  async function fetchLogs() {
    setLoading(true)
    let query = supabase.from('activity_logs')
      .select('*', { count: 'exact' })
      .gte('created_at', filterDateFrom + 'T00:00:00')
      .lte('created_at', filterDateTo + 'T23:59:59')
      .order('created_at', { ascending: false })
      .range((page-1)*PER_PAGE, page*PER_PAGE-1)

    if (activeOutlet) query = query.or(`outlet_id.eq.${activeOutlet},outlet_id.is.null`)
    if (filterModul !== 'semua') query = query.eq('modul', filterModul)
    if (filterUser.trim()) query = query.ilike('user_nama', `%${filterUser.trim()}%`)

    const { data } = await query
    setLogs(data || [])
    setLoading(false)
  }

  const modulList = ['semua','payroll','absensi','pengajuan','pegawai','jadwal','dokumen','performance','sistem']

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">History Log</h1>
          <p className="text-sm text-gray-500 mt-1">Rekam jejak semua aktivitas sistem</p>
        </div>

        {/* Filter */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Modul */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Modul</label>
              <select value={filterModul} onChange={e => { setFilterModul(e.target.value); setPage(1) }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {modulList.map(m => (
                  <option key={m} value={m}>{m === 'semua' ? 'Semua Modul' : m.charAt(0).toUpperCase() + m.slice(1)}</option>
                ))}
              </select>
            </div>
            {/* User */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">User</label>
              <input type="text" placeholder="Cari nama user..."
                value={filterUser} onChange={e => { setFilterUser(e.target.value); setPage(1) }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40" />
            </div>
            {/* Date range */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Dari</label>
              <input type="date" value={filterDateFrom}
                onChange={e => { setFilterDateFrom(e.target.value); setPage(1) }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Sampai</label>
              <input type="date" value={filterDateTo}
                onChange={e => { setFilterDateTo(e.target.value); setPage(1) }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={() => fetchLogs()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Cari
            </button>
          </div>
        </div>

        {/* Log table */}
        {loading ? (
          <div className="text-center py-10 text-gray-400">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            Memuat log...
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500 text-sm">Belum ada log aktivitas.</p>
            <p className="text-gray-400 text-xs mt-1">Log akan muncul setelah ada aktivitas di sistem.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
              <p className="text-sm font-medium text-gray-700">{logs.length} aktivitas</p>
            </div>
            <div className="divide-y divide-gray-100">
              {logs.map(log => (
                <div key={log.id} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50">
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${MODUL_COLORS[log.modul] || 'bg-gray-100'}`}>
                    {MODUL_ICON[log.modul] || '•'}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{log.aksi}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${MODUL_COLORS[log.modul] || 'bg-gray-100 text-gray-600'}`}>
                        {log.modul}
                      </span>
                    </div>
                    {log.detail && <p className="text-xs text-gray-500 mt-0.5">{log.detail}</p>}
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>👤 {log.user_nama || 'Sistem'}</span>
                      <span>🕐 {formatWaktu(log.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Pagination */}
            {logs.length === PER_PAGE && (
              <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                  className="border border-gray-300 px-3 py-1.5 rounded-lg text-xs disabled:opacity-40 hover:bg-gray-50">
                  ← Sebelumnya
                </button>
                <span className="text-xs text-gray-500">Halaman {page}</span>
                <button onClick={() => setPage(p => p+1)}
                  className="border border-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50">
                  Selanjutnya →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}