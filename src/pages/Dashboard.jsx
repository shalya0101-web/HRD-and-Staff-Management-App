import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useOutlet } from '../lib/OutletContext'
import { useAuth } from '../lib/AuthContext'
import { Link } from 'react-router-dom'

const FMT = n => new Intl.NumberFormat('id-ID').format(n || 0)
const BULAN_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const HARI = ['Min','Sen','Sel','Rab','Kam','Jum','Sab']
const today = new Date()
const todayStr = today.toISOString().split('T')[0]

export default function Dashboard() {
  const { activeOutlet, activeOutletData } = useOutlet()
  const { employee } = useAuth()
  const [loading, setLoading] = useState(true)

  const [stats, setStats] = useState({ totalStaff: 0, hadirHariIni: 0, totalJadwalHariIni: 0, totalGaji: 0 })
  const [pendingCounts, setPendingCounts] = useState({ cuti: 0, cicilan: 0, jadwal: 0, swap: 0 })
  const [piketHariIni, setPiketHariIni] = useState([])
  const [absenHariIni, setAbsenHariIni] = useState([])
  const [cutiHariIni, setCutiHariIni] = useState([])
  const [docExpired, setDocExpired] = useState([])
  const [belumDijadwal, setBelumDijadwal] = useState(0)

  useEffect(() => { if (activeOutlet) fetchDashboard() }, [activeOutlet])

  async function fetchDashboard() {
    setLoading(true)
    const bulan = today.getMonth() + 1
    const tahun = today.getFullYear()
    const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const to = `${tahun}-${String(bulan).padStart(2,'0')}-${lastDay}`

    const in30 = new Date(); in30.setDate(in30.getDate() + 30)
    const in30str = in30.toISOString().split('T')[0]

    // Jalankan SEMUA query paralel sekaligus
    const [
      empOutletsRes, piketRes, absenRes, cutiRes, payRes,
      cutiPend, cicilanPend, jadwalPend, swapPend,
      docRes, schedMonthRes
    ] = await Promise.all([
      supabase.from('employee_outlets').select('employee_id, employees(id, nama, jabatan, status)').eq('outlet_id', activeOutlet),
      supabase.from('schedules').select('*, employees(nama, jabatan)').eq('outlet_id', activeOutlet).eq('tanggal', todayStr),
      supabase.from('attendance').select('*, employees(nama)').eq('outlet_id', activeOutlet).eq('tanggal', todayStr),
      supabase.from('leave_requests').select('*, employees(nama)').eq('status', 'approved').lte('tgl_mulai', todayStr).gte('tgl_selesai', todayStr),
      supabase.from('payroll').select('gaji_pokok, tunjangan_makan, tunjangan_transport, tunjangan_telephone, tunjangan_jabatan_pj, tunjangan_jabatan_lain, sip, lembur, potongan_bpjs_kes, potongan_bpjs_naker, potongan_pph21, potongan_cicilan, potongan_kasbon, potongan_absensi, potongan_arisan, potongan_lainnya').eq('outlet_id', activeOutlet).eq('bulan', bulan).eq('tahun', tahun).eq('tipe', 'gaji'),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('schedule_requests').select('id', { count: 'exact', head: true }).eq('outlet_id', activeOutlet).eq('status', 'pending'),
      supabase.from('shift_swaps').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('employee_documents').select('*, employees(nama), document_categories(nama)').not('expired_at', 'is', null).lte('expired_at', in30str).order('expired_at'),
      supabase.from('schedules').select('employee_id').eq('outlet_id', activeOutlet).gte('tanggal', from).lte('tanggal', to),
    ])

    // Process
    const aktifEmps = (empOutletsRes.data || []).map(r => r.employees).filter(e => e && e.status === 'aktif')
    const totalStaff = aktifEmps.length
    const empIds = aktifEmps.map(e => e.id)

    const piket = piketRes.data || []
    const absen = absenRes.data || []
    const hadirIds = new Set(absen.filter(a => a.status === 'hadir' && a.waktu_masuk).map(a => a.employee_id))
    const cutiToday = (cutiRes.data || []).filter(c => empIds.includes(c.employee_id))

    const totalGaji = (payRes.data || []).reduce((sum, p) => {
      const masuk = (p.gaji_pokok||0)+(p.tunjangan_makan||0)+(p.tunjangan_transport||0)+(p.tunjangan_telephone||0)+
        (p.tunjangan_jabatan_pj||0)+(p.tunjangan_jabatan_lain||0)+(p.sip||0)+(p.lembur||0)
      const potong = (p.potongan_bpjs_kes||0)+(p.potongan_bpjs_naker||0)+(p.potongan_pph21||0)+(p.potongan_cicilan||0)+
        (p.potongan_kasbon||0)+(p.potongan_absensi||0)+(p.potongan_arisan||0)+(p.potongan_lainnya||0)
      return sum + masuk - potong
    }, 0)

    const dijadwalIds = new Set((schedMonthRes.data || []).map(s => s.employee_id))
    const belum = aktifEmps.filter(e => !dijadwalIds.has(e.id)).length

    setStats({ totalStaff, hadirHariIni: hadirIds.size, totalJadwalHariIni: piket.length, totalGaji })
    setPendingCounts({ cuti: cutiPend.count||0, cicilan: cicilanPend.count||0, jadwal: jadwalPend.count||0, swap: swapPend.count||0 })
    setPiketHariIni(piket.map(p => ({ ...p, sudahAbsen: hadirIds.has(p.employee_id) })))
    setAbsenHariIni(absen)
    setCutiHariIni(cutiToday)
    setDocExpired(docRes.data || [])
    setBelumDijadwal(belum)
    setLoading(false)
  }

  const totalPending = pendingCounts.cuti + pendingCounts.cicilan + pendingCounts.jadwal

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-400">Memuat dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">
            Selamat datang, {employee?.nama?.split(',')[0] || 'HR'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeOutletData?.nama} · {HARI[today.getDay()]}, {today.getDate()} {BULAN_NAMES[today.getMonth()]} {today.getFullYear()}
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 mb-1">Total Staff Aktif</p>
            <p className="text-3xl font-semibold text-gray-900">{stats.totalStaff}</p>
            <p className="text-xs text-gray-400 mt-1">di outlet ini</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 mb-1">Kehadiran Hari Ini</p>
            <p className="text-3xl font-semibold text-green-600">{stats.hadirHariIni}<span className="text-lg text-gray-400">/{stats.totalJadwalHariIni}</span></p>
            <p className="text-xs text-gray-400 mt-1">dari yang dijadwalkan</p>
          </div>
          <Link to="/ess-admin" className="bg-white rounded-xl border border-gray-200 p-5 hover:border-yellow-300 transition-colors">
            <p className="text-xs text-gray-500 mb-1">Pengajuan Pending</p>
            <p className="text-3xl font-semibold text-yellow-600">{totalPending}</p>
            <p className="text-xs text-gray-400 mt-1">perlu approval</p>
          </Link>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 mb-1">Pengeluaran Gaji</p>
            <p className="text-xl font-semibold text-gray-900">Rp {FMT(stats.totalGaji)}</p>
            <p className="text-xs text-gray-400 mt-1">{BULAN_NAMES[today.getMonth()]}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Kolom kiri - Hari Ini */}
          <div className="lg:col-span-2 space-y-5">

            {/* Piket Hari Ini */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                <p className="text-sm font-semibold text-gray-700">Piket Hari Ini</p>
                <span className="text-xs text-gray-400">{piketHariIni.length} staff</span>
              </div>
              {piketHariIni.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">Tidak ada jadwal piket hari ini.</div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {piketHariIni.map(p => (
                    <div key={p.id} className="px-5 py-3 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{p.employees?.nama}</p>
                        <p className="text-xs text-gray-500">{p.role_slot}{p.is_temporary ? ' · 🔀 Sementara' : ''}</p>
                      </div>
                      {p.sudahAbsen
                        ? <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">✓ Hadir</span>
                        : <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">Belum absen</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cuti/Izin Hari Ini */}
            {cutiHariIni.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Cuti/Izin Hari Ini</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {cutiHariIni.map(c => (
                    <div key={c.id} className="px-5 py-3 flex justify-between items-center">
                      <p className="text-sm font-medium text-gray-800">{c.employees?.nama}</p>
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium capitalize">{c.jenis}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Kolom kanan - Action Items */}
          <div className="space-y-5">

            {/* Perlu Tindakan */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">Perlu Tindakan</p>
              </div>
              <div className="divide-y divide-gray-100">
                <Link to="/ess-admin" className="px-5 py-3 flex justify-between items-center hover:bg-gray-50">
                  <span className="text-sm text-gray-600">Pengajuan cuti/izin</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${pendingCounts.cuti ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400'}`}>{pendingCounts.cuti}</span>
                </Link>
                <Link to="/ess-admin" className="px-5 py-3 flex justify-between items-center hover:bg-gray-50">
                  <span className="text-sm text-gray-600">Pengajuan cicilan/kasbon</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${pendingCounts.cicilan ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400'}`}>{pendingCounts.cicilan}</span>
                </Link>
                <Link to="/scheduling" className="px-5 py-3 flex justify-between items-center hover:bg-gray-50">
                  <span className="text-sm text-gray-600">Pengajuan jadwal piket</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${pendingCounts.jadwal ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400'}`}>{pendingCounts.jadwal}</span>
                </Link>
                <div className="px-5 py-3 flex justify-between items-center">
                  <span className="text-sm text-gray-600">Staff belum dijadwalkan</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${belumDijadwal ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>{belumDijadwal}</span>
                </div>
              </div>
            </div>

            {/* Dokumen Expired */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                <p className="text-sm font-semibold text-gray-700">Dokumen Akan Expired</p>
                <Link to="/documents" className="text-xs text-blue-600 hover:underline">Lihat semua</Link>
              </div>
              {docExpired.length === 0 ? (
                <div className="px-5 py-6 text-center text-gray-400 text-sm">Tidak ada dokumen yang akan expired.</div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {docExpired.slice(0, 8).map(d => {
                    const exp = new Date(d.expired_at)
                    const now = new Date(); now.setHours(0,0,0,0)
                    const diff = Math.ceil((exp - now) / (1000*60*60*24))
                    return (
                      <div key={d.id} className="px-5 py-2.5">
                        <div className="flex justify-between items-center">
                          <p className="text-sm font-medium text-gray-800">{d.employees?.nama}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff < 0 ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                            {diff < 0 ? 'Expired' : `${diff} hari`}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{d.document_categories?.nama}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">Akses Cepat</p>
              <div className="grid grid-cols-2 gap-2">
                <Link to="/scheduling" className="text-center py-3 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100">📅 Jadwal</Link>
                <Link to="/attendance" className="text-center py-3 rounded-lg bg-green-50 text-green-600 text-xs font-medium hover:bg-green-100">✓ Absensi</Link>
                <Link to="/payroll" className="text-center py-3 rounded-lg bg-purple-50 text-purple-600 text-xs font-medium hover:bg-purple-100">💰 Payroll</Link>
                <Link to="/analytics" className="text-center py-3 rounded-lg bg-orange-50 text-orange-600 text-xs font-medium hover:bg-orange-100">📊 Analytics</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}