import { useState, useEffect } from 'react'
import { logActivity } from '../lib/activityLog'
import { supabase } from '../lib/supabase'
import { useOutlet } from '../lib/OutletContext'
import { useAuth } from '../lib/AuthContext'
import * as XLSX from 'xlsx'

const BULAN_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const FMT = n => new Intl.NumberFormat('id-ID').format(n || 0)
const today = new Date()

export default function Payroll() {
  const { activeOutlet, activeOutletData, outlets, areas, getOutletsByArea } = useOutlet()
  const { employee: authEmployee } = useAuth()
  const [tab, setTab] = useState('gaji')
  const [mode, setMode] = useState('outlet') // 'outlet' | 'area'
  const [bulan, setBulan] = useState(today.getMonth() + 1)
  const [tahun, setTahun] = useState(today.getFullYear())
  const [selectedArea, setSelectedArea] = useState('')
  const [employees, setEmployees] = useState([])
  const [allEmployees, setAllEmployees] = useState([]) // untuk rekap area
  const [allowances, setAllowances] = useState({})
  const [payrolls, setPayrolls] = useState([])
  const [allPayrolls, setAllPayrolls] = useState([]) // semua outlet dalam area
  const [schedules, setSchedules] = useState([])
  const [attendance, setAttendance] = useState([])
  const [deductionSetting, setDeductionSetting] = useState(null)
  const [overtimeRates, setOvertimeRates] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingGenerate, setLoadingGenerate] = useState(false)
  const [refreshCounter, setRefreshCounter] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editRow, setEditRow] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [bulkLoading, setBulkLoading] = useState(false)

  useEffect(() => { fetchBase() }, [])
  useEffect(() => { if (activeOutlet) fetchOutletData() }, [bulan, tahun, activeOutlet])
  useEffect(() => { if (selectedArea && mode === 'area') fetchAreaData() }, [bulan, tahun, selectedArea, mode])

  async function fetchBase() {
    await Promise.all([fetchDeductionSetting(), fetchOvertimeRates(), fetchAllowances()])
  }

  async function fetchActiveLoans(empIds) {
    if (!empIds || empIds.length === 0) return {}
    // Ambil cicilan aktif
    const { data: cicilanData } = await supabase.from('loans')
      .select('*').eq('jenis', 'cicilan').eq('status', 'approved').in('employee_id', empIds)
    // Ambil kasbon aktif bulan ini
    const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const to = `${tahun}-${String(bulan).padStart(2,'0')}-${new Date(tahun, bulan, 0).getDate()}`
    const { data: kasbonData } = await supabase.from('loans')
      .select('*').eq('jenis', 'kasbon').eq('status', 'approved')
      .gte('tgl_mulai', from).lte('tgl_mulai', to).in('employee_id', empIds)
    // Ambil arisan aktif
    const { data: arisanData } = await supabase.from('arisan_settings')
      .select('*').eq('aktif', true).in('employee_id', empIds)

    const map = {}
    empIds.forEach(id => { map[id] = { cicilan: 0, kasbon: 0, arisan: 0 } })

    // Hitung cicilan per bulan
    ;(cicilanData || []).forEach(loan => {
      map[loan.employee_id].cicilan += Math.ceil(loan.jumlah / loan.jumlah_bulan)
    })
    // Kasbon bulan ini
    ;(kasbonData || []).forEach(loan => {
      map[loan.employee_id].kasbon += loan.jumlah
    })
    // Arisan
    ;(arisanData || []).forEach(a => {
      if (map[a.employee_id]) map[a.employee_id].arisan = a.nominal || 0
    })
    return map
  }

  async function fetchOutletData() {
    setLoading(true)
    await Promise.all([fetchEmployees(), fetchPayrolls(), fetchSchedules(), fetchAttendance()])
    setLoading(false)
  }

  async function fetchAreaData() {
    if (!selectedArea) return
    setLoading(true)
    const areaOutletList = getOutletsByArea(selectedArea)
    const outletIds = areaOutletList.map(o => o.id)
    if (outletIds.length === 0) { setLoading(false); return }

    // Ambil semua employee di area ini
    const { data: empOutlets } = await supabase.from('employee_outlets')
      .select('employee_id, outlet_id, employees(id, nama, jabatan, gaji_pokok, piket_per_bulan, status)')
      .in('outlet_id', outletIds)
    const emps = (empOutlets || []).map(r => ({...r.employees, outlet_id: r.outlet_id})).filter(e => e?.status === 'aktif')
    // Deduplicate by employee id
    const unique = Object.values(emps.reduce((acc, e) => { acc[e.id] = e; return acc }, {}))
    setAllEmployees(unique)

    // Ambil semua payroll di area
    const { data: pays } = await supabase.from('payroll')
      .select('*').eq('bulan', bulan).eq('tahun', tahun).in('outlet_id', outletIds)
    setAllPayrolls(pays || [])
    setLoading(false)
  }

  async function fetchEmployees() {
    const { data } = await supabase.from('employee_outlets')
      .select('employee_id, employees(id, nama, jabatan, gaji_pokok, piket_per_bulan, status)')
      .eq('outlet_id', activeOutlet)
    setEmployees((data||[]).map(r=>r.employees).filter(e=>e?.status==='aktif'))
  }

  async function fetchAllowances() {
    const { data } = await supabase.from('allowances').select('*')
    const map = {}
    ;(data||[]).forEach(a => { map[a.employee_id] = a })
    setAllowances(map)
  }

  async function fetchPayrolls() {
    const { data } = await supabase.from('payroll').select('*')
      .eq('bulan', bulan).eq('tahun', tahun).eq('outlet_id', activeOutlet)
    setPayrolls(data || [])
  }

  async function fetchSchedules() {
    const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const to = `${tahun}-${String(bulan).padStart(2,'0')}-${lastDay}`
    const { data } = await supabase.from('schedules').select('employee_id')
      .gte('tanggal', from).lte('tanggal', to)
    setSchedules(data || [])
  }

  async function fetchAttendance() {
    const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const to = `${tahun}-${String(bulan).padStart(2,'0')}-${lastDay}`
    const { data } = await supabase.from('attendance')
      .select('employee_id, waktu_masuk, status').gte('tanggal', from).lte('tanggal', to)
      .eq('outlet_id', activeOutlet)
    setAttendance(data || [])
  }

  async function fetchDeductionSetting() {
    const { data } = await supabase.from('attendance_deduction_settings').select('*').single()
    setDeductionSetting(data)
  }

  async function fetchOvertimeRates() {
    const { data } = await supabase.from('overtime_rates').select('*').order('jabatan')
    setOvertimeRates(data || [])
  }

  // ─── KALKULASI ────────────────────────────────────────────

  function hitungPotonganAbsensi(empId) {
    if (!deductionSetting) return 0
    const [bH, bM] = (deductionSetting.batas_jam||'12:00:00').split(':').map(Number)
    const batasMenit = bH * 60 + bM
    let total = 0
    attendance.filter(a => a.employee_id === empId && a.waktu_masuk).forEach(a => {
      const w = new Date(a.waktu_masuk)
      const menit = w.getHours()*60 + w.getMinutes()
      if (menit > batasMenit) {
        const telat = menit - batasMenit
        total += Math.floor(telat / (deductionSetting.interval_menit||30)) * (deductionSetting.potongan_per_interval||10000)
      }
    })
    return total
  }

  function hitungLembur(emp) {
    const total = schedules.filter(s => s.employee_id === emp.id).length
    const lebih = Math.max(0, total - (emp.piket_per_bulan||15))
    const rate = overtimeRates.find(r => r.jabatan === emp.jabatan)
    return lebih * (rate?.nominal_per_hari || 0)
  }

  function hitungTotalGaji(p, emp) {
    if (!p) return 0
    const pemasukan = (p.gaji_pokok||0)+(p.tunjangan_makan||0)+(p.tunjangan_transport||0)+
      (p.tunjangan_telephone||0)+(p.tunjangan_jabatan_pj||0)+(p.tunjangan_jabatan_lain||0)+
      (p.sip||0)+(p.lembur||0)
    const potongan = (p.potongan_bpjs||0)+(p.potongan_cicilan||0)+(p.potongan_kasbon||0)+
      (p.potongan_absensi||0)+(p.potongan_arisan||0)+(p.potongan_lainnya||0)
    return pemasukan - potongan
  }

  function hitungTotalJasa(p) {
    if (!p) return 0
    return (p.jasa_pelayanan||0)+(p.bonus_outlet||0)-(p.potongan_lainnya||0)
  }

  // ─── GENERATE ─────────────────────────────────────────────

  async function generatePayroll(forceRegenerate = false) {
    if (employees.length === 0) { setError('Tidak ada staff di outlet ini.'); return }
    const tipe = tab === 'gaji' ? 'gaji' : 'jasa'
    const sudahAda = employees.filter(emp => payrolls.find(p => p.employee_id === emp.id && p.tipe === tipe))
    const belumAda = employees.filter(emp => !payrolls.find(p => p.employee_id === emp.id && p.tipe === tipe))

    if (sudahAda.length > 0 && !forceRegenerate) {
      const ok = confirm(`${sudahAda.length} staff sudah ada data payroll.\nGenerate hanya untuk ${belumAda.length} staff yang belum?\n\nKlik Cancel untuk batal.`)
      if (!ok) return
    }

    setLoadingGenerate(true); setError(''); setSuccess('')
    const targetEmps = forceRegenerate ? employees : belumAda
    if (targetEmps.length === 0) { setSuccess('Semua staff sudah punya data payroll.'); setLoadingGenerate(false); return }

    if (forceRegenerate) {
      // Hapus SEMUA data payroll bulan ini untuk outlet+tipe ini langsung dari DB
      await supabase.from('payroll')
        .delete()
        .eq('outlet_id', activeOutlet)
        .eq('bulan', bulan)
        .eq('tahun', tahun)
        .eq('tipe', tipe)
    }

    // Cek staff yang sudah punya payroll di outlet LAIN bulan ini (skip agar tidak duplikat)
    const empIds = targetEmps.map(e => e.id)
    const { data: existingOtherOutlet } = await supabase.from('payroll')
      .select('employee_id')
      .in('employee_id', empIds)
      .eq('bulan', bulan)
      .eq('tahun', tahun)
      .eq('tipe', tipe)
      .neq('outlet_id', activeOutlet)
    const sudahDiOutletLain = new Set((existingOtherOutlet || []).map(p => p.employee_id))

    // Ambil data cicilan, kasbon, arisan
    const loanMap = await fetchActiveLoans(empIds)

    const empsToInsert = targetEmps.filter(emp => !sudahDiOutletLain.has(emp.id))
    const skipped = targetEmps.length - empsToInsert.length

    const inserts = empsToInsert.map(emp => {
      const allow = allowances[emp.id] || {}
      const loans = loanMap[emp.id] || {}
      if (tipe === 'gaji') {
        return {
          employee_id: emp.id, outlet_id: activeOutlet, bulan, tahun, tipe,
          gaji_pokok: emp.gaji_pokok||0,
          tunjangan_makan: allow.makan||0, tunjangan_transport: allow.transport||0,
          tunjangan_telephone: allow.telephone||0, tunjangan_jabatan_pj: allow.jabatan_pj||0,
          tunjangan_jabatan_lain: allow.jabatan_lain||0, sip: allow.sip||0,
          lembur: hitungLembur(emp),
          potongan_bpjs: 0,
          potongan_cicilan: loans.cicilan || 0,
          potongan_kasbon: loans.kasbon || 0,
          potongan_absensi: hitungPotonganAbsensi(emp.id),
          potongan_arisan: loans.arisan || 0,
          potongan_lainnya: 0, status: 'draft',
        }
      } else {
        return { employee_id: emp.id, outlet_id: activeOutlet, bulan, tahun, tipe, jasa_pelayanan: 0, bonus_outlet: 0, potongan_lainnya: 0, status: 'draft' }
      }
    })

    if (inserts.length === 0) {
      setSuccess(`Semua staff sudah memiliki payroll ${tipe} di outlet lain bulan ini.${skipped > 0 ? ` (${skipped} staff diskip)` : ''}`)
      setLoadingGenerate(false); return
    }

    const { error } = await supabase.from('payroll').insert(inserts)
    if (error) { setError('Gagal: ' + error.message); setLoadingGenerate(false); return }

    // Fetch fresh payroll data
    const { data: freshPayrolls } = await supabase.from('payroll').select('*')
      .eq('bulan', bulan).eq('tahun', tahun).eq('outlet_id', activeOutlet)
    setPayrolls(freshPayrolls || [])
    setRefreshCounter(c => c + 1)
    const msg = skipped > 0
      ? `${inserts.length} data payroll digenerate. ${skipped} staff diskip (sudah punya payroll di outlet lain).`
      : `${inserts.length} data payroll berhasil digenerate!`
    setSuccess(msg)
    setLoadingGenerate(false)
    logActivity({
      aksi: `Generate Payroll ${tipe}`,
      modul: 'payroll',
      detail: `${inserts.length} staff · ${BULAN_NAMES[bulan-1]} ${tahun} · ${activeOutletData?.nama}`,
      user_nama: authEmployee?.nama,
      outlet_id: activeOutlet,
    })
  }

  // ─── EDIT ─────────────────────────────────────────────────

  function mulaiEdit(p) { setEditRow(p.id); setEditForm({...p}) }

  async function simpanEdit() {
    await supabase.from('payroll').update(editForm).eq('id', editRow)
    setEditRow(null); setEditForm({}); fetchPayrolls()
    if (mode === 'area') fetchAreaData()
  }

  async function updateStatus(id, status) {
    await supabase.from('payroll').update({ status }).eq('id', id)
    fetchPayrolls()
    if (mode === 'area') fetchAreaData()
  }

  async function hapusPayroll(id) {
    if (!confirm('Hapus data payroll ini?')) return
    await supabase.from('payroll').delete().eq('id', id)
    fetchPayrolls()
  }

  // ─── SETTING ─────────────────────────────────────────────

  async function simpanDeductionSetting() {
    await supabase.from('attendance_deduction_settings').update({
      batas_jam: deductionSetting.batas_jam,
      potongan_per_interval: deductionSetting.potongan_per_interval,
      interval_menit: deductionSetting.interval_menit,
    }).eq('id', deductionSetting.id)
    setSuccess('Setting tersimpan!')
  }

  async function simpanOvertimeRate(rate) {
    await supabase.from('overtime_rates').update({ nominal_per_hari: rate.nominal_per_hari }).eq('id', rate.id)
    fetchOvertimeRates(); setSuccess('Nominal lembur tersimpan!')
  }

  async function simpanAllowance(emp) {
    const allow = allowances[emp.id] || {}
    if (allow.id) await supabase.from('allowances').update(allow).eq('id', allow.id)
    else await supabase.from('allowances').insert({ ...allow, employee_id: emp.id })
    fetchAllowances(); setSuccess('Tunjangan tersimpan!')
  }

  // ─── EXPORT ───────────────────────────────────────────────

  async function bulkUpdateStatus(status) {
    const label = status === 'proses' ? 'diproses' : 'lunas'
    if (!confirm(`Tandai semua ${filteredPays.length} data payroll sebagai ${label}?`)) return
    setBulkLoading(true)
    const ids = filteredPays.map(p => p.id)
    await supabase.from('payroll').update({ status }).in('id', ids)
    setBulkLoading(false)
    const { data: freshPayrolls } = await supabase.from('payroll').select('*')
      .eq('bulan', bulan).eq('tahun', tahun).eq('outlet_id', activeOutlet)
    setPayrolls(freshPayrolls || [])
    setRefreshCounter(c => c + 1)
    setSuccess(`${ids.length} data payroll berhasil ditandai ${label}!`)
    logActivity({
      aksi: `Bulk Update Payroll → ${status}`,
      modul: 'payroll',
      detail: `${ids.length} staff ditandai ${label} · ${BULAN_NAMES[bulan-1]} ${tahun} · ${activeOutletData?.nama}`,
      user_nama: authEmployee?.nama,
      outlet_id: activeOutlet,
    })
  }

  function exportExcel() {
    const tipe = tab === 'gaji' ? 'gaji' : 'jasa'
    const sourceEmps = mode === 'area' ? allEmployees : employees
    const sourcePays = mode === 'area' ? allPayrolls : payrolls
    const data = sourceEmps.map(emp => {
      const p = sourcePays.find(pr => pr.employee_id === emp.id && pr.tipe === tipe)
      if (!p) return null
      const outletNama = outlets.find(o => o.id === p.outlet_id)?.nama || ''
      if (tipe === 'gaji') return {
        'Outlet': outletNama, 'Nama': emp.nama, 'Jabatan': emp.jabatan,
        'Gaji Pokok': p.gaji_pokok, 'SIP': p.sip,
        'Tj. Makan': p.tunjangan_makan, 'Tj. Transport': p.tunjangan_transport,
        'Tj. Telephone': p.tunjangan_telephone, 'Tj. Jabatan PJ': p.tunjangan_jabatan_pj,
        'Tj. Jabatan Lain': p.tunjangan_jabatan_lain, 'Lembur': p.lembur,
        'Pot. BPJS': p.potongan_bpjs, 'Pot. Cicilan': p.potongan_cicilan,
        'Pot. Kasbon': p.potongan_kasbon, 'Pot. Absensi': p.potongan_absensi,
        'Pot. Arisan': p.potongan_arisan, 'Pot. Lainnya': p.potongan_lainnya,
        'Total': hitungTotalGaji(p, emp), 'Status': p.status,
      }
      return { 'Outlet': outletNama, 'Nama': emp.nama, 'Jabatan': emp.jabatan, 'Jasa': p.jasa_pelayanan, 'Bonus': p.bonus_outlet, 'Potongan': p.potongan_lainnya, 'Total': hitungTotalJasa(p), 'Status': p.status }
    }).filter(Boolean)

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    const label = mode === 'area' ? (areas.find(a=>a.id===selectedArea)?.nama||'Area') : (activeOutletData?.nama||'Outlet')
    XLSX.utils.book_append_sheet(wb, ws, tipe === 'gaji' ? 'Gaji' : 'Jasa')
    XLSX.writeFile(wb, `Payroll_${tipe}_${label}_${BULAN_NAMES[bulan-1]}_${tahun}.xlsx`)
  }

  const tipe = tab === 'gaji' ? 'gaji' : 'jasa'
  const displayEmps = mode === 'area' ? allEmployees : employees
  const displayPays = mode === 'area' ? allPayrolls : payrolls
  const filteredPays = displayPays.filter(p => p.tipe === tipe)

  // Total per area/outlet
  const grandTotal = filteredPays.reduce((sum, p) => {
    const emp = displayEmps.find(e => e.id === p.employee_id)
    return sum + (tipe === 'gaji' ? hitungTotalGaji(p, emp) : hitungTotalJasa(p))
  }, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Payroll</h1>
            <p className="text-sm text-gray-500 mt-1">
              {mode === 'area'
                ? `${areas.find(a=>a.id===selectedArea)?.nama||'Pilih Area'} · ${BULAN_NAMES[bulan-1]} ${tahun}`
                : `${activeOutletData?.nama||''} · ${BULAN_NAMES[bulan-1]} ${tahun}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>{if(bulan===1){setBulan(12);setTahun(t=>t-1)}else setBulan(b=>b-1)}} className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-100">←</button>
            <span className="font-medium text-gray-800 min-w-max">{BULAN_NAMES[bulan-1]} {tahun}</span>
            <button onClick={()=>{if(bulan===12){setBulan(1);setTahun(t=>t+1)}else setBulan(b=>b+1)}} className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-100">→</button>
          </div>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => setMode('outlet')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode==='outlet'?'bg-blue-600 text-white':'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            Per Outlet
          </button>
          <button onClick={() => setMode('area')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode==='area'?'bg-blue-600 text-white':'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            Rekap Per Area
          </button>
        </div>

        {/* Area selector */}
        {mode === 'area' && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Pilih Area:</p>
            <div className="flex flex-wrap gap-2">
              {areas.map(area => {
                const areaOutletList = getOutletsByArea(area.id)
                return (
                  <button key={area.id} onClick={() => setSelectedArea(area.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${selectedArea===area.id?'bg-blue-600 text-white border-blue-600':'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {area.nama}
                    <span className="ml-2 text-xs opacity-70">({areaOutletList.length} outlet)</span>
                  </button>
                )
              })}
            </div>
            {selectedArea && (
              <div className="mt-3 flex flex-wrap gap-1">
                {getOutletsByArea(selectedArea).map(o => (
                  <span key={o.id} className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">{o.nama}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[['gaji','Gaji Bulanan (Tgl 1)'],['jasa','Jasa Pelayanan (Tgl 10)'],['setting','Pengaturan']].map(([val,label]) => (
            <button key={val} onClick={() => { setTab(val); setError(''); setSuccess('') }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===val?'bg-gray-800 text-white':'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{success}</div>}

        {/* ─── GAJI & JASA ─── */}
        {(tab === 'gaji' || tab === 'jasa') && (
          <div>
            {mode === 'outlet' && (
              <div className="flex gap-3 mb-4 flex-wrap">
                <button onClick={() => generatePayroll(false)} disabled={loadingGenerate}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  {loadingGenerate ? 'Memproses...' : '⚡ Generate Payroll'}
                </button>
                <button onClick={async () => {
                    if(!confirm('Regenerate semua data draft/proses bulan ini?')) return
                    await generatePayroll(true)
                  }}
                  disabled={loadingGenerate}
                  className="border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">
                  🔄 Regenerate Semua
                </button>
                <button onClick={exportExcel}
                  className="border border-green-300 text-green-700 hover:bg-green-50 px-4 py-2 rounded-lg text-sm font-medium">
                  ⬇ Export Excel
                </button>
                {filteredPays.length > 0 && (<>
                  <button onClick={() => bulkUpdateStatus('proses')} disabled={bulkLoading}
                    className="border border-yellow-300 text-yellow-700 hover:bg-yellow-50 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">
                    ✓ Proses Semua
                  </button>
                  <button onClick={() => bulkUpdateStatus('lunas')} disabled={bulkLoading}
                    className="border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">
                    ✓✓ Lunas Semua
                  </button>
                </>)}
              </div>
            )}

            {mode === 'area' && selectedArea && (
              <div className="flex gap-3 mb-4">
                <button onClick={exportExcel}
                  className="border border-green-300 text-green-700 hover:bg-green-50 px-4 py-2 rounded-lg text-sm font-medium">
                  ⬇ Export Excel Area
                </button>
              </div>
            )}

            {/* Grand Total Card */}
            {filteredPays.length > 0 && (
              <div key={`total-${filteredPays.length}-${grandTotal}-${refreshCounter}`} className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 mb-4 text-white">
                <p className="text-sm opacity-80">Total {tipe==='gaji'?'Pengeluaran Gaji':'Jasa Pelayanan'} · {mode==='area'?(areas.find(a=>a.id===selectedArea)?.nama||''):(activeOutletData?.nama||'')}</p>
                <p className="text-2xl font-bold mt-1">Rp {FMT(grandTotal)}</p>
                <p className="text-xs opacity-70 mt-1">{filteredPays.length} staff · {BULAN_NAMES[bulan-1]} {tahun}</p>
              </div>
            )}

            {loading ? (
              <div className="text-center py-10 text-gray-400 text-sm">Memuat data...</div>
            ) : (mode === 'area' && !selectedArea) ? (
              <div className="text-center py-10 text-gray-400 text-sm">Pilih area untuk melihat rekap payroll.</div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  {tab === 'gaji' ? (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {[...(mode==='area'?['Outlet']:[],'Nama','Jabatan','Gaji Pokok','SIP','Tj. Makan','Tj. Transport','Tj. Telp','Tj. PJ','Tj. Lain','Lembur','Pot. BPJS','Pot. Cicilan','Pot. Kasbon','Pot. Absensi','Pot. Arisan','Pot. Lain','Total','Status','')].flat().map(h => (
                            <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayEmps.length === 0
                          ? <tr><td colSpan={20} className="px-4 py-8 text-center text-gray-400">Tidak ada staff.</td></tr>
                          : displayEmps.map(emp => {
                            const p = displayPays.find(pr => pr.employee_id === emp.id && pr.tipe === 'gaji')
                            const isEdit = editRow === p?.id
                            const outletNama = outlets.find(o => o.id === p?.outlet_id)?.nama || ''
                            return (
                              <tr key={emp.id+( p?.outlet_id||'')} className="hover:bg-gray-50">
                                {mode==='area' && <td className="px-3 py-2 text-xs text-blue-600 whitespace-nowrap">{outletNama}</td>}
                                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{emp.nama}</td>
                                <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{emp.jabatan}</td>
                                {!p ? (
                                  <td colSpan={15} className="px-3 py-2 text-gray-400 text-xs italic">Belum digenerate</td>
                                ) : isEdit ? (
                                  ['gaji_pokok','sip','tunjangan_makan','tunjangan_transport','tunjangan_telephone','tunjangan_jabatan_pj','tunjangan_jabatan_lain','lembur','potongan_bpjs','potongan_cicilan','potongan_kasbon','potongan_absensi','potongan_arisan','potongan_lainnya'].map(f => (
                                    <td key={f} className="px-1 py-1">
                                      <input type="number" value={editForm[f]||0}
                                        onChange={e=>setEditForm({...editForm,[f]:Number(e.target.value)})}
                                        className="w-24 border border-blue-300 rounded px-2 py-1 text-xs" />
                                    </td>
                                  ))
                                ) : (
                                  [p.gaji_pokok,p.sip,p.tunjangan_makan,p.tunjangan_transport,p.tunjangan_telephone,p.tunjangan_jabatan_pj,p.tunjangan_jabatan_lain,p.lembur,p.potongan_bpjs,p.potongan_cicilan,p.potongan_kasbon,p.potongan_absensi,p.potongan_arisan,p.potongan_lainnya].map((val,i)=>(
                                    <td key={i} className={`px-3 py-2 text-xs whitespace-nowrap ${i>=8?'text-red-500':'text-gray-700'}`}>
                                      {val>0?`Rp ${FMT(val)}`:'—'}
                                    </td>
                                  ))
                                )}
                                {p && !isEdit && <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">Rp {FMT(hitungTotalGaji(p,emp))}</td>}
                                {p && isEdit && <td className="px-3 py-2 font-semibold">Rp {FMT(hitungTotalGaji(editForm,emp))}</td>}
                                {!p && <td></td>}
                                <td className="px-3 py-2">
                                  {p && <select value={p.status} onChange={e=>updateStatus(p.id,e.target.value)}
                                    className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${p.status==='lunas'?'bg-green-100 text-green-700':p.status==='proses'?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-600'}`}>
                                    <option value="draft">Draft</option>
                                    <option value="proses">Diproses</option>
                                    <option value="lunas">Lunas</option>
                                  </select>}
                                </td>
                                <td className="px-3 py-2">
                                  {p && (isEdit
                                    ? <button onClick={simpanEdit} className="text-green-600 text-xs hover:underline">Simpan</button>
                                    : <div className="flex gap-2">
                                        <button onClick={()=>mulaiEdit(p)} className="text-blue-600 text-xs hover:underline">Edit</button>
                                        {mode==='outlet'&&<button onClick={()=>hapusPayroll(p.id)} className="text-red-500 text-xs hover:underline">Hapus</button>}
                                      </div>
                                  )}
                                </td>
                              </tr>
                            )
                          })
                        }
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {[...(mode==='area'?['Outlet']:[]), 'Nama','Jabatan','Jasa Pelayanan','Bonus Outlet','Potongan','Total','Status',''].map(h=>(
                            <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayEmps.map(emp => {
                          const p = displayPays.find(pr => pr.employee_id === emp.id && pr.tipe === 'jasa')
                          const isEdit = editRow === p?.id
                          const outletNama = outlets.find(o => o.id === p?.outlet_id)?.nama || ''
                          return (
                            <tr key={emp.id} className="hover:bg-gray-50">
                              {mode==='area' && <td className="px-4 py-2 text-xs text-blue-600 whitespace-nowrap">{outletNama}</td>}
                              <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{emp.nama}</td>
                              <td className="px-4 py-2 text-gray-500 text-xs">{emp.jabatan}</td>
                              {!p ? <td colSpan={4} className="px-4 py-2 text-gray-400 text-xs italic">Belum digenerate</td>
                              : isEdit ? (
                                ['jasa_pelayanan','bonus_outlet','potongan_lainnya'].map(f=>(
                                  <td key={f} className="px-2 py-1">
                                    <input type="number" value={editForm[f]||0}
                                      onChange={e=>setEditForm({...editForm,[f]:Number(e.target.value)})}
                                      className="w-32 border border-blue-300 rounded px-2 py-1 text-xs" />
                                  </td>
                                ))
                              ) : (
                                <>
                                  <td className="px-4 py-2 text-gray-700">Rp {FMT(p.jasa_pelayanan)}</td>
                                  <td className="px-4 py-2 text-gray-700">Rp {FMT(p.bonus_outlet)}</td>
                                  <td className="px-4 py-2 text-red-500">{p.potongan_lainnya>0?`Rp ${FMT(p.potongan_lainnya)}`:'—'}</td>
                                </>
                              )}
                              {p&&<td className="px-4 py-2 font-semibold">Rp {FMT(isEdit?hitungTotalJasa(editForm):hitungTotalJasa(p))}</td>}
                              {!p&&<td></td>}
                              <td className="px-4 py-2">
                                {p&&<select value={p.status} onChange={e=>updateStatus(p.id,e.target.value)}
                                  className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${p.status==='lunas'?'bg-green-100 text-green-700':p.status==='proses'?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-600'}`}>
                                  <option value="draft">Draft</option>
                                  <option value="proses">Diproses</option>
                                  <option value="lunas">Lunas</option>
                                </select>}
                              </td>
                              <td className="px-4 py-2">
                                {p&&(isEdit
                                  ?<button onClick={simpanEdit} className="text-green-600 text-xs hover:underline">Simpan</button>
                                  :<div className="flex gap-2">
                                    <button onClick={()=>mulaiEdit(p)} className="text-blue-600 text-xs hover:underline">Edit</button>
                                    {mode==='outlet'&&<button onClick={()=>hapusPayroll(p.id)} className="text-red-500 text-xs hover:underline">Hapus</button>}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── SETTING ─── */}
        {tab === 'setting' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Aturan Potongan Absensi</h2>
              {deductionSetting && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Batas Jam Check-in</label>
                    <input type="time" value={deductionSetting.batas_jam?.slice(0,5)||'12:00'}
                      onChange={e=>setDeductionSetting({...deductionSetting,batas_jam:e.target.value+':00'})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Potongan per Interval (Rp)</label>
                    <input type="number" value={deductionSetting.potongan_per_interval||10000}
                      onChange={e=>setDeductionSetting({...deductionSetting,potongan_per_interval:Number(e.target.value)})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Interval (menit)</label>
                    <input type="number" value={deductionSetting.interval_menit||30}
                      onChange={e=>setDeductionSetting({...deductionSetting,interval_menit:Number(e.target.value)})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
              <button onClick={simpanDeductionSetting} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium">Simpan</button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Nominal Lembur per Jabatan</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {overtimeRates.map(rate => (
                  <div key={rate.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-44 flex-shrink-0">{rate.jabatan}</span>
                    <input type="number" value={rate.nominal_per_hari||0}
                      onChange={e=>setOvertimeRates(overtimeRates.map(r=>r.id===rate.id?{...r,nominal_per_hari:Number(e.target.value)}:r))}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={()=>simpanOvertimeRate(rate)} className="text-blue-600 text-xs hover:underline whitespace-nowrap">Simpan</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Tunjangan per Staff · {activeOutletData?.nama}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>{['Nama','Jabatan','SIP','Makan','Transport','Telephone','Jabatan PJ','Jabatan Lain',''].map(h=>(
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {employees.map(emp => {
                      const allow = allowances[emp.id] || {}
                      return (
                        <tr key={emp.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{emp.nama}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{emp.jabatan}</td>
                          {['sip','makan','transport','telephone','jabatan_pj','jabatan_lain'].map(f=>(
                            <td key={f} className="px-2 py-1">
                              <input type="number" value={allow[f]||0}
                                onChange={e=>setAllowances({...allowances,[emp.id]:{...allow,[f]:Number(e.target.value)}})}
                                className="w-24 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <button onClick={()=>simpanAllowance(emp)} className="text-blue-600 text-xs hover:underline">Simpan</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}