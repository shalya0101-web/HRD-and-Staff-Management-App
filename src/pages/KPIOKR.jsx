import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useOutlet } from '../lib/OutletContext'
import { useAuth } from '../lib/AuthContext'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

const BULAN_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const FMT = n => new Intl.NumberFormat('id-ID').format(n || 0)
const today = new Date()

const KATEGORI_COLOR = {
  kehadiran: 'bg-blue-100 text-blue-700',
  turnover: 'bg-red-100 text-red-600',
  rekrutmen: 'bg-green-100 text-green-700',
  pelatihan: 'bg-purple-100 text-purple-700',
}

const KATEGORI_LABEL = {
  kehadiran: 'Kehadiran & Disiplin',
  turnover: 'Turnover & Retensi',
  rekrutmen: 'Rekrutmen',
  pelatihan: 'Pelatihan & Kompetensi',
}

function hitungPersen(realisasi, target, satuan) {
  if (satuan === '%') return Math.min(Math.round((realisasi / Math.max(target, 1)) * 100), 150)
  if (target === 0) return realisasi > 0 ? 100 : 0
  return Math.min(Math.round((realisasi / target) * 100), 150)
}

function statusKPI(persen, isInverse = false) {
  if (isInverse) {
    if (persen <= 100) return { label: 'Tercapai', color: 'text-green-600', bg: 'bg-green-100' }
    if (persen <= 130) return { label: 'Perhatian', color: 'text-yellow-600', bg: 'bg-yellow-100' }
    return { label: 'Melampaui', color: 'text-red-600', bg: 'bg-red-100' }
  }
  if (persen >= 100) return { label: 'Tercapai ✓', color: 'text-green-600', bg: 'bg-green-100' }
  if (persen >= 75) return { label: 'On Track', color: 'text-blue-600', bg: 'bg-blue-100' }
  if (persen >= 50) return { label: 'Perhatian', color: 'text-yellow-600', bg: 'bg-yellow-100' }
  return { label: 'Di Bawah Target', color: 'text-red-600', bg: 'bg-red-100' }
}

// KPI yang nilainya lebih kecil = lebih baik
const INVERSE_KPI = ['Tingkat Turnover', 'Jumlah Staff Keluar', 'Waktu Rata-rata Rekrutmen',
  'Jumlah Pengajuan Sakit', 'Total Hari Lembur Staff']

export default function KPIOKR() {
  const { activeOutlet, activeOutletData } = useOutlet()
  const { employee } = useAuth()
  const [bulan, setBulan] = useState(today.getMonth() + 1)
  const [tahun, setTahun] = useState(today.getFullYear())
  const [tab, setTab] = useState('kpi') // 'kpi' | 'okr' | 'setting'

  // Data
  const [kpiDefs, setKpiDefs] = useState([])
  const [kpiResults, setKpiResults] = useState([])
  const [objectives, setObjectives] = useState([])
  const [keyResults, setKeyResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Auto data
  const [autoData, setAutoData] = useState({})

  // Forms
  const [editKPI, setEditKPI] = useState({})
  const [showObjForm, setShowObjForm] = useState(false)
  const [objForm, setObjForm] = useState({ judul: '', deskripsi: '' })
  const [showKRForm, setShowKRForm] = useState(null) // objective_id
  const [krForm, setKrForm] = useState({ deskripsi: '', target: 100, realisasi: 0, satuan: '%' })

  // KPI Setting
  const [showKPISetting, setShowKPISetting] = useState(false)
  const [newKPI, setNewKPI] = useState({ nama: '', deskripsi: '', kategori: 'kehadiran', satuan: '%', target: 0 })

  useEffect(() => { fetchAll() }, [bulan, tahun, activeOutlet])

  async function fetchAll() {
    if (!activeOutlet) return
    setLoading(true)
    await Promise.all([fetchKPIDefs(), fetchKPIResults(), fetchObjectives(), fetchAutoData()])
    setLoading(false)
  }

  async function fetchKPIDefs() {
    const { data } = await supabase.from('kpi_definitions').select('*').eq('aktif', true).order('urutan')
    setKpiDefs(data || [])
  }

  async function fetchKPIResults() {
    const { data } = await supabase.from('kpi_results').select('*')
      .eq('bulan', bulan).eq('tahun', tahun).eq('outlet_id', activeOutlet)
    setKpiResults(data || [])
  }

  async function fetchObjectives() {
    const { data: objs } = await supabase.from('okr_objectives').select('*')
      .eq('bulan', bulan).eq('tahun', tahun).eq('outlet_id', activeOutlet)
      .order('created_at')
    const { data: krs } = await supabase.from('okr_key_results').select('*')
      .in('objective_id', (objs || []).map(o => o.id))
      .order('urutan')
    setObjectives(objs || [])
    setKeyResults(krs || [])
  }

  // ─── HITUNG OTOMATIS ─────────────────────────────────────

  async function fetchAutoData() {
    const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const to = `${tahun}-${String(bulan).padStart(2,'0')}-${lastDay}`
    const prevMonth = bulan === 1 ? 12 : bulan - 1
    const prevYear = bulan === 1 ? tahun - 1 : tahun
    const prevFrom = `${prevYear}-${String(prevMonth).padStart(2,'0')}-01`
    const prevLastDay = new Date(prevYear, prevMonth, 0).getDate()
    const prevTo = `${prevYear}-${String(prevMonth).padStart(2,'0')}-${prevLastDay}`

    const [attRes, schedRes, empRes, perfRes, scoreRes, leaveRes, payRes, docRes, deductRes] = await Promise.all([
      supabase.from('attendance').select('employee_id, status, waktu_masuk, tanggal')
        .eq('outlet_id', activeOutlet).gte('tanggal', from).lte('tanggal', to),
      supabase.from('schedules').select('employee_id').eq('outlet_id', activeOutlet)
        .gte('tanggal', from).lte('tanggal', to),
      supabase.from('employees').select('id, status, tgl_masuk, piket_per_bulan'),
      supabase.from('performance_reviews').select('id, employee_id')
        .eq('outlet_id', activeOutlet).eq('bulan', bulan).eq('tahun', tahun),
      supabase.from('performance_scores').select('nilai, review_id'),
      supabase.from('leave_requests').select('employee_id, jenis, status')
        .gte('tgl_mulai', from).lte('tgl_mulai', to),
      supabase.from('payroll').select('employee_id, tipe, gaji_pokok, tunjangan_makan, tunjangan_transport, tunjangan_telephone, tunjangan_jabatan_pj, tunjangan_jabatan_lain, sip, lembur, potongan_bpjs, potongan_cicilan, potongan_kasbon, potongan_absensi, potongan_arisan, potongan_lainnya')
        .eq('outlet_id', activeOutlet).eq('bulan', bulan).eq('tahun', tahun).eq('tipe', 'gaji'),
      supabase.from('employee_documents').select('employee_id, document_categories(nama)')
        .in('document_categories.nama', ['SIP', 'STR']),
      supabase.from('attendance_deduction_settings').select('*').single(),
    ])

    const att = attRes.data || []
    const sched = schedRes.data || []
    const emps = empRes.data || []
    const perf = perfRes.data || []
    const scores = scoreRes.data || []
    const leaves = leaveRes.data || []
    const pays = payRes.data || []
    const docs = docRes.data || []
    const deduct = deductRes.data

    // Staff aktif di outlet ini
    const { data: outletEmps } = await supabase.from('employee_outlets')
      .select('employee_id').eq('outlet_id', activeOutlet)
    const outletEmpIds = (outletEmps || []).map(r => r.employee_id)
    const aktifEmps = emps.filter(e => e.status === 'aktif' && outletEmpIds.includes(e.id))
    const totalStaff = aktifEmps.length

    // 1. Tingkat kehadiran
    const totalHadir = att.filter(a => a.status === 'hadir').length
    const totalAtt = att.length
    const tingkatKehadiran = totalAtt > 0 ? Math.round(totalHadir / totalAtt * 100) : 0

    // 2. Pemenuhan target piket
    const terpenuhi = aktifEmps.filter(emp => {
      const target = emp.piket_per_bulan || 15
      const actual = sched.filter(s => s.employee_id === emp.id).length
      return actual >= target
    }).length
    const pemenuhan = totalStaff > 0 ? Math.round(terpenuhi / totalStaff * 100) : 0

    // 3. Staff aktif
    const jumlahAktif = totalStaff

    // 4. Turnover - staff yang nonaktif bulan ini
    const nonaktifBulanIni = emps.filter(e => e.status !== 'aktif' && outletEmpIds.includes(e.id)).length
    const turnover = totalStaff > 0 ? Math.round(nonaktifBulanIni / (totalStaff + nonaktifBulanIni) * 100) : 0

    // 5. Staff masuk bulan ini
    const staffMasuk = emps.filter(e =>
      e.tgl_masuk >= from && e.tgl_masuk <= to && outletEmpIds.includes(e.id)
    ).length

    // 6. Staff keluar
    const staffKeluar = nonaktifBulanIni

    // 7. % staff dinilai performance
    const staffDinilai = [...new Set(perf.map(r => r.employee_id))].length
    const pctDinilai = totalStaff > 0 ? Math.round(staffDinilai / totalStaff * 100) : 0

    // 8. Rata-rata nilai performance
    const NILAI_SCORE = { 'Sangat Baik': 4, 'Baik': 3, 'Cukup': 2, 'Kurang': 1 }
    const allScores = scores.map(s => NILAI_SCORE[s.nilai] || 0).filter(Boolean)
    const avgPerf = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length * 10) / 10
      : 0

    // 9. Ketepatan waktu check-in
    let tepatWaktu = 0
    if (deduct?.batas_jam) {
      const [bH, bM] = deduct.batas_jam.split(':').map(Number)
      const batasMenit = bH * 60 + bM
      const attDenganWaktu = att.filter(a => a.waktu_masuk)
      tepatWaktu = attDenganWaktu.length > 0
        ? Math.round(attDenganWaktu.filter(a => {
            const w = new Date(a.waktu_masuk)
            return w.getHours() * 60 + w.getMinutes() <= batasMenit
          }).length / attDenganWaktu.length * 100)
        : 0
    }

    // 10. Total hari lembur
    const totalLembur = aktifEmps.reduce((sum, emp) => {
      const target = emp.piket_per_bulan || 15
      const actual = sched.filter(s => s.employee_id === emp.id).length
      return sum + Math.max(0, actual - target)
    }, 0)

    // 11. Pengajuan cuti/izin
    const totalCutiIzin = leaves.filter(l => ['cuti', 'izin'].includes(l.jenis)).length
    const totalSakit = leaves.filter(l => l.jenis === 'sakit').length

    // 12. Dokumen lengkap (SIP/STR)
    const empDenganDokumen = new Set(docs.map(d => d.employee_id)).size
    const pctDokumen = totalStaff > 0 ? Math.round(empDenganDokumen / totalStaff * 100) : 0

    // 13. Total pengeluaran gaji
    const totalGaji = pays.reduce((sum, p) => {
      const masuk = (p.gaji_pokok||0)+(p.tunjangan_makan||0)+(p.tunjangan_transport||0)+
        (p.tunjangan_telephone||0)+(p.tunjangan_jabatan_pj||0)+(p.tunjangan_jabatan_lain||0)+(p.sip||0)+(p.lembur||0)
      const potong = (p.potongan_bpjs||0)+(p.potongan_cicilan||0)+(p.potongan_kasbon||0)+
        (p.potongan_absensi||0)+(p.potongan_arisan||0)+(p.potongan_lainnya||0)
      return sum + masuk - potong
    }, 0)

    setAutoData({
      'attendance': tingkatKehadiran,
      'schedules': pemenuhan,
      'employees': jumlahAktif,
      'turnover': turnover,
      'staff_masuk': staffMasuk,
      'staff_keluar': staffKeluar,
      'performance_reviews': pctDinilai,
      'performance_scores': avgPerf,
      'attendance_tepat': tepatWaktu,
      'schedules_lembur': totalLembur,
      'leave_cutiizin': totalCutiIzin,
      'leave_sakit': totalSakit,
      'employee_documents': pctDokumen,
      'payroll': totalGaji,
    })
  }

  function getAutoValue(kpi) {
    const src = kpi.auto_source
    const nama = kpi.nama
    if (nama.includes('Turnover')) return autoData['turnover'] || 0
    if (nama.includes('Staff Masuk')) return autoData['staff_masuk'] || 0
    if (nama.includes('Staff Keluar') || nama.includes('Keluar')) return autoData['staff_keluar'] || 0
    if (nama.includes('Dinilai Performance')) return autoData['performance_reviews'] || 0
    if (nama.includes('Nilai Performance')) return autoData['performance_scores'] || 0
    if (nama.includes('Ketepatan Waktu')) return autoData['attendance_tepat'] || 0
    if (nama.includes('Lembur')) return autoData['schedules_lembur'] || 0
    if (nama.includes('Cuti/Izin')) return autoData['leave_cutiizin'] || 0
    if (nama.includes('Sakit')) return autoData['leave_sakit'] || 0
    if (nama.includes('Dokumen')) return autoData['employee_documents'] || 0
    if (nama.includes('Pengeluaran Gaji')) return autoData['payroll'] || 0
    if (nama.includes('Pemenuhan Target Piket')) return autoData['schedules'] || 0
    if (nama.includes('Jumlah Staff Aktif')) return autoData['employees'] || 0
    if (src === 'attendance') return autoData['attendance'] || 0
    return 0
  }

  function getRealisasi(kpi) {
    if (kpi.is_auto) return getAutoValue(kpi)
    const result = kpiResults.find(r => r.kpi_id === kpi.id)
    return result?.realisasi || 0
  }

  // ─── SAVE MANUAL KPI ─────────────────────────────────────

  async function simpanKPI(kpiId, nilai, catatan = '') {
    setSaving(true)
    const existing = kpiResults.find(r => r.kpi_id === kpiId)
    if (existing) {
      await supabase.from('kpi_results').update({ realisasi: nilai, catatan, input_oleh: employee?.nama })
        .eq('id', existing.id)
    } else {
      await supabase.from('kpi_results').insert({
        kpi_id: kpiId, bulan, tahun, outlet_id: activeOutlet,
        realisasi: nilai, catatan, input_oleh: employee?.nama
      })
    }
    setEditKPI({})
    setSaving(false)
    fetchKPIResults()
    setSuccess('KPI berhasil disimpan!')
  }

  // ─── OKR ─────────────────────────────────────────────────

  async function tambahObjective() {
    if (!objForm.judul.trim()) { setError('Judul objective wajib diisi.'); return }
    setSaving(true)
    const { data } = await supabase.from('okr_objectives').insert({
      judul: objForm.judul, deskripsi: objForm.deskripsi,
      bulan, tahun, outlet_id: activeOutlet, created_by: employee?.nama
    }).select().single()
    setObjForm({ judul: '', deskripsi: '' })
    setShowObjForm(false)
    setSaving(false)
    fetchObjectives()
    setSuccess('Objective berhasil ditambahkan!')
  }

  async function hapusObjective(id) {
    if (!confirm('Hapus objective ini beserta semua key results?')) return
    await supabase.from('okr_objectives').delete().eq('id', id)
    fetchObjectives()
  }

  async function updateObjectiveStatus(id, status) {
    await supabase.from('okr_objectives').update({ status }).eq('id', id)
    fetchObjectives()
  }

  async function tambahKR(objectiveId) {
    if (!krForm.deskripsi.trim()) { setError('Deskripsi KR wajib diisi.'); return }
    setSaving(true)
    const urutan = keyResults.filter(kr => kr.objective_id === objectiveId).length + 1
    await supabase.from('okr_key_results').insert({
      objective_id: objectiveId, ...krForm, urutan
    })
    setKrForm({ deskripsi: '', target: 100, realisasi: 0, satuan: '%' })
    setShowKRForm(null)
    setSaving(false)
    fetchObjectives()
    setSuccess('Key Result berhasil ditambahkan!')
  }

  async function updateKRRealisasi(krId, realisasi) {
    await supabase.from('okr_key_results').update({ realisasi: Number(realisasi) }).eq('id', krId)
    fetchObjectives()
  }

  async function hapusKR(id) {
    if (!confirm('Hapus key result ini?')) return
    await supabase.from('okr_key_results').delete().eq('id', id)
    fetchObjectives()
  }

  // ─── KPI SETTING ─────────────────────────────────────────

  async function tambahKPIManual() {
    if (!newKPI.nama.trim()) { setError('Nama KPI wajib diisi.'); return }
    await supabase.from('kpi_definitions').insert({
      ...newKPI, is_auto: false, aktif: true,
      urutan: kpiDefs.length + 1
    })
    setNewKPI({ nama: '', deskripsi: '', kategori: 'kehadiran', satuan: '%', target: 0 })
    fetchKPIDefs()
    setSuccess('KPI berhasil ditambahkan!')
  }

  async function toggleKPIAktif(id, aktif) {
    await supabase.from('kpi_definitions').update({ aktif: !aktif }).eq('id', id)
    fetchKPIDefs()
  }

  async function updateKPITarget(id, target) {
    await supabase.from('kpi_definitions').update({ target: Number(target) }).eq('id', id)
    fetchKPIDefs()
  }

  // ─── KALKULASI OKR ────────────────────────────────────────

  function hitungProgressOKR(objectiveId) {
    const krs = keyResults.filter(kr => kr.objective_id === objectiveId)
    if (krs.length === 0) return 0
    const avg = krs.reduce((sum, kr) => {
      const pct = Math.min(hitungPersen(kr.realisasi, kr.target, kr.satuan), 100)
      return sum + pct
    }, 0) / krs.length
    return Math.round(avg)
  }

  // ─── RADAR DATA ───────────────────────────────────────────

  const radarData = ['kehadiran', 'turnover', 'rekrutmen', 'pelatihan'].map(kat => {
    const kpisKat = kpiDefs.filter(k => k.kategori === kat)
    if (kpisKat.length === 0) return { kategori: KATEGORI_LABEL[kat]?.split(' ')[0], nilai: 0 }
    const avg = kpisKat.reduce((sum, kpi) => {
      const real = getRealisasi(kpi)
      const pct = hitungPersen(real, kpi.target, kpi.satuan)
      return sum + Math.min(pct, 100)
    }, 0) / kpisKat.length
    return { kategori: KATEGORI_LABEL[kat]?.split(' ')[0], nilai: Math.round(avg) }
  })

  const totalKPI = kpiDefs.length
  const kpiTercapai = kpiDefs.filter(kpi => {
    const real = getRealisasi(kpi)
    const pct = hitungPersen(real, kpi.target, kpi.satuan)
    return INVERSE_KPI.includes(kpi.nama) ? pct <= 100 : pct >= 100
  }).length
  const okrProgress = objectives.length > 0
    ? Math.round(objectives.reduce((sum, obj) => sum + hitungProgressOKR(obj.id), 0) / objectives.length)
    : 0

  const kategoriList = ['kehadiran', 'turnover', 'rekrutmen', 'pelatihan']

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">KPI & OKR HRD</h1>
            <p className="text-sm text-gray-500 mt-1">{activeOutletData?.nama} · {BULAN_NAMES[bulan-1]} {tahun}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>{if(bulan===1){setBulan(12);setTahun(t=>t-1)}else setBulan(b=>b-1)}}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-100">←</button>
            <span className="font-medium text-gray-800 min-w-max">{BULAN_NAMES[bulan-1]} {tahun}</span>
            <button onClick={()=>{if(bulan===12){setBulan(1);setTahun(t=>t+1)}else setBulan(b=>b+1)}}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-100">→</button>
          </div>
        </div>

        {/* Summary Cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">KPI Tercapai</p>
              <p className="text-2xl font-semibold text-green-600">{kpiTercapai}/{totalKPI}</p>
              <p className="text-xs text-gray-400 mt-0.5">{totalKPI > 0 ? Math.round(kpiTercapai/totalKPI*100) : 0}% tercapai</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">OKR Progress</p>
              <p className="text-2xl font-semibold text-blue-600">{okrProgress}%</p>
              <p className="text-xs text-gray-400 mt-0.5">{objectives.length} objective aktif</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Kehadiran Staff</p>
              <p className="text-2xl font-semibold text-gray-900">{autoData['attendance'] || 0}%</p>
              <p className="text-xs text-gray-400 mt-0.5">bulan ini</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Avg Performance</p>
              <p className="text-2xl font-semibold text-purple-600">{autoData['performance_scores'] || 0}/4</p>
              <p className="text-xs text-gray-400 mt-0.5">rata-rata skor</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[['kpi','📊 KPI Dashboard'],['okr','🎯 OKR'],['setting','⚙ Kelola KPI']].map(([val,label]) => (
            <button key={val} onClick={() => { setTab(val); setError(''); setSuccess('') }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===val?'bg-blue-600 text-white':'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{success}</div>}

        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Memuat data...
          </div>
        ) : (
          <>
          {/* ─── TAB KPI ─── */}
          {tab === 'kpi' && (
            <div className="space-y-6">
              {/* Radar Chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Overview Performa HRD</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="kategori" tick={{ fontSize: 11 }} />
                      <Radar name="Pencapaian" dataKey="nilai" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                    </RadarChart>
                  </ResponsiveContainer>
                  <div className="space-y-3">
                    {radarData.map(d => (
                      <div key={d.kategori}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600">{d.kategori}</span>
                          <span className="font-medium text-blue-600">{d.nilai}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full">
                          <div className={`h-2 rounded-full transition-all ${d.nilai>=80?'bg-green-500':d.nilai>=60?'bg-blue-500':d.nilai>=40?'bg-yellow-500':'bg-red-500'}`}
                            style={{width:`${Math.min(d.nilai,100)}%`}} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* KPI per kategori */}
              {kategoriList.map(kat => {
                const kpisKat = kpiDefs.filter(k => k.kategori === kat)
                if (kpisKat.length === 0) return null
                return (
                  <div key={kat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${KATEGORI_COLOR[kat]}`}>
                        {KATEGORI_LABEL[kat]}
                      </span>
                      <span className="text-xs text-gray-400">
                        {kpisKat.filter(k => {
                          const pct = hitungPersen(getRealisasi(k), k.target, k.satuan)
                          return INVERSE_KPI.includes(k.nama) ? pct <= 100 : pct >= 100
                        }).length}/{kpisKat.length} tercapai
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {kpisKat.map(kpi => {
                        const real = getRealisasi(kpi)
                        const pct = hitungPersen(real, kpi.target, kpi.satuan)
                        const isInverse = INVERSE_KPI.includes(kpi.nama)
                        const status = statusKPI(pct, isInverse)
                        const isEditing = editKPI[kpi.id] !== undefined
                        return (
                          <div key={kpi.id} className="px-5 py-4">
                            <div className="flex justify-between items-start mb-2 gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-gray-800">{kpi.nama}</p>
                                  {kpi.is_auto && <span className="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded">Auto</span>}
                                </div>
                                {kpi.deskripsi && <p className="text-xs text-gray-400 mt-0.5">{kpi.deskripsi}</p>}
                              </div>
                              <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${status.bg} ${status.color}`}>
                                {status.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                  <span>
                                    Realisasi: <strong className="text-gray-800">
                                      {kpi.satuan === 'Rp' ? `Rp ${FMT(real)}` : `${real} ${kpi.satuan}`}
                                    </strong>
                                  </span>
                                  <span>Target: {kpi.satuan === 'Rp' ? `Rp ${FMT(kpi.target)}` : `${kpi.target} ${kpi.satuan}`}</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full">
                                  <div className={`h-2 rounded-full transition-all ${
                                    (isInverse ? pct <= 100 : pct >= 100) ? 'bg-green-500' :
                                    pct >= 75 ? 'bg-blue-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`} style={{width:`${Math.min(pct,100)}%`}} />
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5 text-right">{pct}% dari target</p>
                              </div>
                              {!kpi.is_auto && (
                                <div className="flex-shrink-0">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1">
                                      <input type="number" value={editKPI[kpi.id]}
                                        onChange={e => setEditKPI({...editKPI, [kpi.id]: e.target.value})}
                                        className="w-20 border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none" />
                                      <button onClick={() => simpanKPI(kpi.id, editKPI[kpi.id])}
                                        className="bg-blue-600 text-white text-xs px-2 py-1 rounded">✓</button>
                                      <button onClick={() => setEditKPI(prev => { const n={...prev}; delete n[kpi.id]; return n })}
                                        className="text-gray-400 text-xs px-1">✕</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => setEditKPI({...editKPI, [kpi.id]: real})}
                                      className="text-blue-600 text-xs hover:underline">Input</button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ─── TAB OKR ─── */}
          {tab === 'okr' && (
            <div className="space-y-4">
              <button onClick={() => setShowObjForm(!showObjForm)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                + Tambah Objective
              </button>

              {showObjForm && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Objective Baru</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Judul Objective *</label>
                      <input type="text" placeholder="Contoh: Meningkatkan Kedisiplinan Staff"
                        value={objForm.judul} onChange={e => setObjForm({...objForm, judul: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Deskripsi</label>
                      <textarea rows={2} placeholder="Deskripsi singkat objective..."
                        value={objForm.deskripsi} onChange={e => setObjForm({...objForm, deskripsi: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={tambahObjective} disabled={saving}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                        Simpan
                      </button>
                      <button onClick={() => setShowObjForm(false)}
                        className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-600">Batal</button>
                    </div>
                  </div>
                </div>
              )}

              {objectives.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                  <p className="text-4xl mb-3">🎯</p>
                  <p className="text-gray-500 text-sm">Belum ada OKR bulan ini.</p>
                  <p className="text-gray-400 text-xs mt-1">Klik + Tambah Objective untuk mulai.</p>
                </div>
              ) : objectives.map(obj => {
                const progress = hitungProgressOKR(obj.id)
                const krs = keyResults.filter(kr => kr.objective_id === obj.id)
                return (
                  <div key={obj.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Objective header */}
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{obj.judul}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              obj.status==='selesai'?'bg-green-100 text-green-700':
                              obj.status==='dibatalkan'?'bg-red-100 text-red-600':
                              'bg-blue-100 text-blue-700'}`}>
                              {obj.status}
                            </span>
                          </div>
                          {obj.deskripsi && <p className="text-xs text-gray-500">{obj.deskripsi}</p>}
                          <div className="mt-2">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>Progress keseluruhan</span>
                              <span className="font-medium text-blue-600">{progress}%</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full">
                              <div className={`h-2 rounded-full transition-all ${progress>=100?'bg-green-500':progress>=60?'bg-blue-500':'bg-yellow-500'}`}
                                style={{width:`${Math.min(progress,100)}%`}} />
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <select value={obj.status} onChange={e => updateObjectiveStatus(obj.id, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none">
                            <option value="aktif">Aktif</option>
                            <option value="selesai">Selesai</option>
                            <option value="dibatalkan">Dibatalkan</option>
                          </select>
                          <button onClick={() => hapusObjective(obj.id)}
                            className="text-red-400 hover:text-red-600 text-xs">Hapus</button>
                        </div>
                      </div>
                    </div>

                    {/* Key Results */}
                    <div className="divide-y divide-gray-100">
                      {krs.map((kr, idx) => {
                        const pct = Math.min(hitungPersen(kr.realisasi, kr.target, kr.satuan), 100)
                        return (
                          <div key={kr.id} className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-400 flex-shrink-0">KR{idx+1}</span>
                              <div className="flex-1">
                                <p className="text-sm text-gray-700 mb-1">{kr.deskripsi}</p>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full">
                                    <div className={`h-1.5 rounded-full ${pct>=100?'bg-green-500':pct>=60?'bg-blue-500':'bg-yellow-500'}`}
                                      style={{width:`${pct}%`}} />
                                  </div>
                                  <span className="text-xs text-gray-500 flex-shrink-0">
                                    {kr.realisasi}/{kr.target} {kr.satuan}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <input type="number" defaultValue={kr.realisasi}
                                  onBlur={e => updateKRRealisasi(kr.id, e.target.value)}
                                  className="w-16 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                <button onClick={() => hapusKR(kr.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Tambah KR */}
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                      {showKRForm === obj.id ? (
                        <div className="space-y-2">
                          <input type="text" placeholder="Deskripsi key result..."
                            value={krForm.deskripsi} onChange={e => setKrForm({...krForm, deskripsi: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <div className="flex gap-2">
                            <input type="number" placeholder="Target" value={krForm.target}
                              onChange={e => setKrForm({...krForm, target: e.target.value})}
                              className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                            <select value={krForm.satuan} onChange={e => setKrForm({...krForm, satuan: e.target.value})}
                              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                              {['%','orang','hari','jam','kali','posisi','skor'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <button onClick={() => tambahKR(obj.id)} disabled={saving}
                              className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg">Tambah</button>
                            <button onClick={() => setShowKRForm(null)}
                              className="text-gray-400 text-xs px-2">Batal</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setShowKRForm(obj.id); setKrForm({ deskripsi:'', target:100, realisasi:0, satuan:'%' }) }}
                          className="text-blue-600 text-xs hover:underline">+ Tambah Key Result</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ─── TAB SETTING ─── */}
          {tab === 'setting' && (
            <div className="space-y-5">
              {/* Tambah KPI manual */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-4">Tambah KPI Manual Baru</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-gray-600 block mb-1">Nama KPI *</label>
                    <input type="text" placeholder="Contoh: Jumlah Pelatihan"
                      value={newKPI.nama} onChange={e => setNewKPI({...newKPI, nama: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Kategori</label>
                    <select value={newKPI.kategori} onChange={e => setNewKPI({...newKPI, kategori: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {Object.entries(KATEGORI_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Satuan</label>
                    <select value={newKPI.satuan} onChange={e => setNewKPI({...newKPI, satuan: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {['%','orang','hari','jam','kali','posisi','Rp','skor'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Target</label>
                    <input type="number" value={newKPI.target} onChange={e => setNewKPI({...newKPI, target: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Deskripsi</label>
                    <input type="text" placeholder="Opsional"
                      value={newKPI.deskripsi} onChange={e => setNewKPI({...newKPI, deskripsi: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <button onClick={tambahKPIManual}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium">
                  Tambah KPI
                </button>
              </div>

              {/* Daftar KPI + edit target */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Semua KPI ({kpiDefs.length})</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {['Nama KPI','Kategori','Satuan','Target','Tipe','Aktif'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {kpiDefs.map(kpi => (
                        <tr key={kpi.id} className={`hover:bg-gray-50 ${!kpi.aktif ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3 font-medium text-gray-900 text-xs">{kpi.nama}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${KATEGORI_COLOR[kpi.kategori]}`}>
                              {KATEGORI_LABEL[kpi.kategori]?.split(' ')[0]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{kpi.satuan}</td>
                          <td className="px-4 py-3">
                            <input type="number" defaultValue={kpi.target}
                              onBlur={e => updateKPITarget(kpi.id, e.target.value)}
                              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${kpi.is_auto ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                              {kpi.is_auto ? 'Otomatis' : 'Manual'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => toggleKPIAktif(kpi.id, kpi.aktif)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${kpi.aktif ? 'bg-blue-600' : 'bg-gray-300'}`}>
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${kpi.aktif ? 'translate-x-4' : 'translate-x-1'}`} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}