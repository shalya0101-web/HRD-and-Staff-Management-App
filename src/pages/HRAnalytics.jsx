import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useOutlet } from '../lib/OutletContext'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import * as XLSX from 'xlsx'

const FMT = n => new Intl.NumberFormat('id-ID').format(n || 0)
const BULAN_NAMES = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
const BULAN_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16']
const NILAI_SCORE = { 'Sangat Baik': 4, 'Baik': 3, 'Cukup': 2, 'Kurang': 1 }

const today = new Date()

export default function HRAnalytics() {
  const { outlets, activeOutlet, activeOutletData, areas, getOutletsByArea } = useOutlet()

  // Range filter
  const [mode, setMode] = useState('outlet') // 'outlet' | 'area'
  const [selectedArea, setSelectedArea] = useState('')
  const [bulanDari, setBulanDari] = useState(Math.max(1, today.getMonth() - 2))
  const [tahunDari, setTahunDari] = useState(today.getFullYear())
  const [bulanSampai, setBulanSampai] = useState(today.getMonth() + 1)
  const [tahunSampai, setTahunSampai] = useState(today.getFullYear())
  const [tab, setTab] = useState('absensi')
  const [loading, setLoading] = useState(false)

  // Data
  const [absensiData, setAbsensiData] = useState([])
  const [payrollData, setPayrollData] = useState([])
  const [performanceData, setPerformanceData] = useState([])
  const [piketData, setPiketData] = useState([])
  const [allPiketData, setAllPiketData] = useState([]) // semua jadwal staff termasuk penugasan sementara lintas outlet
  const [employees, setEmployees] = useState([])

  useEffect(() => { if (activeOutlet) fetchAll() }, [bulanDari, tahunDari, bulanSampai, tahunSampai, activeOutlet, mode, selectedArea])

  // Buat list bulan dalam range
  function getBulanRange() {
    const result = []
    let b = bulanDari, t = tahunDari
    while (t < tahunSampai || (t === tahunSampai && b <= bulanSampai)) {
      result.push({ bulan: b, tahun: t, label: `${BULAN_NAMES[b-1]} ${t}` })
      b++; if (b > 12) { b = 1; t++ }
    }
    return result
  }

  // Outlet yang aktif berdasarkan mode
  function getActiveOutletIds() {
    if (mode === 'area' && selectedArea) {
      return getOutletsByArea(selectedArea).map(o => o.id)
    }
    return [activeOutlet]
  }

  async function fetchAll() {
    setLoading(true)
    const outletIds = getActiveOutletIds()
    const from = `${tahunDari}-${String(bulanDari).padStart(2,'0')}-01`
    const lastDay = new Date(tahunSampai, bulanSampai, 0).getDate()
    const to = `${tahunSampai}-${String(bulanSampai).padStart(2,'0')}-${lastDay}`

    const [empRes, attRes, payRes, perfRes, schedRes] = await Promise.all([
      supabase.from('employee_outlets').select('employee_id, outlet_id, employees(id, nama, jabatan, departemen, piket_per_bulan)')
        .in('outlet_id', outletIds),
      supabase.from('attendance').select('employee_id, outlet_id, tanggal, status, waktu_masuk')
        .in('outlet_id', outletIds).gte('tanggal', from).lte('tanggal', to),
      supabase.from('payroll').select('employee_id, outlet_id, bulan, tahun, tipe, gaji_pokok, tunjangan_makan, tunjangan_transport, tunjangan_telephone, tunjangan_jabatan_pj, tunjangan_jabatan_lain, sip, lembur, potongan_bpjs, potongan_cicilan, potongan_kasbon, potongan_absensi, potongan_arisan, potongan_lainnya, jasa_pelayanan, bonus_outlet, status')
        .in('outlet_id', outletIds).gte('bulan', bulanDari).gte('tahun', tahunDari)
        .lte('bulan', bulanSampai).lte('tahun', tahunSampai),
      supabase.from('performance_reviews').select('*, performance_scores(point_id, nilai)')
        .in('outlet_id', outletIds).gte('bulan', bulanDari).gte('tahun', tahunDari)
        .lte('bulan', bulanSampai).lte('tahun', tahunSampai),
      supabase.from('schedules').select('employee_id, outlet_id, tanggal, role_slot, is_temporary, catatan_penugasan, outlet_asal_id')
        .in('outlet_id', outletIds).gte('tanggal', from).lte('tanggal', to),
    ])

    const empList = [...new Map(
      (empRes.data || []).map(r => [r.employee_id, r.employees]).filter(([,e]) => e)
    ).values()]
    setEmployees(empList)
    setAbsensiData(attRes.data || [])
    setPayrollData(payRes.data || [])
    setPerformanceData(perfRes.data || [])
    const schedData = schedRes.data || []
    setPiketData(schedData)

    // Semua jadwal di outlet ini (termasuk is_temporary maupun tidak)
    // schedData sudah berisi semua jadwal di outlet ini
    // Cari employee_id yang ada di jadwal tapi tidak ada di empList (= penugasan sementara)
    const tempEmpIds = [...new Set(
      schedData
        .map(s => s.employee_id)
        .filter(id => !empList.find(e => e.id === id))
    )]

    let finalEmpList = [...empList]

    if (tempEmpIds.length > 0) {
      const { data: tempEmps } = await supabase.from('employees')
        .select('id, nama, jabatan, departemen, piket_per_bulan')
        .in('id', tempEmpIds)
      finalEmpList = [...empList, ...(tempEmps || [])]
      setEmployees(finalEmpList)
    }

    // allPiketData: semua jadwal staff di outlet ini
    // Untuk staff penugasan sementara, juga ambil jadwal mereka di outlet asal
    // agar Total Semua akurat
    const allEmpIds = finalEmpList.map(e => e.id)
    const { data: allSched } = await supabase.from('schedules')
      .select('employee_id, outlet_id, tanggal, role_slot, is_temporary, catatan_penugasan, outlets(nama)')
      .in('employee_id', allEmpIds)
      .gte('tanggal', from).lte('tanggal', to)
    setAllPiketData(allSched || [])

    setLoading(false)
  }

  const bulanRange = getBulanRange()

  // ─── KALKULASI ABSENSI ────────────────────────────────────

  function getAbsensiByBulan() {
    return bulanRange.map(({ bulan, tahun, label }) => {
      const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
      const to = `${tahun}-${String(bulan).padStart(2,'0')}-${new Date(tahun, bulan, 0).getDate()}`
      const records = absensiData.filter(a => a.tanggal >= from && a.tanggal <= to)
      return {
        label,
        hadir: records.filter(a => a.status === 'hadir').length,
        izin: records.filter(a => ['izin','sakit'].includes(a.status)).length,
        alpha: records.filter(a => a.status === 'alpha').length,
        total: records.length,
      }
    })
  }

  function getAbsensiByEmployee() {
    return employees.map(emp => {
      const records = absensiData.filter(a => a.employee_id === emp.id)
      const hadir = records.filter(a => a.status === 'hadir').length
      const total = records.length
      // Penugasan sementara: ada jadwal is_temporary=true untuk staff ini
      const tempScheds = piketData.filter(p => p.employee_id === emp.id && p.is_temporary === true)
      const isTemp = tempScheds.length > 0
      return {
        nama: emp.nama, jabatan: emp.jabatan,
        hadir, izin: records.filter(a => ['izin','sakit'].includes(a.status)).length,
        alpha: records.filter(a => a.status === 'alpha').length,
        total, persen: total > 0 ? Math.round(hadir/total*100) : 0,
        isTemp, tempCount: tempScheds.length,
      }
    }).sort((a,b) => b.persen - a.persen)
  }

  // ─── KALKULASI PAYROLL ────────────────────────────────────

  function hitungTotal(p) {
    if (p.tipe === 'gaji') {
      const masuk = (p.gaji_pokok||0)+(p.tunjangan_makan||0)+(p.tunjangan_transport||0)+
        (p.tunjangan_telephone||0)+(p.tunjangan_jabatan_pj||0)+(p.tunjangan_jabatan_lain||0)+(p.sip||0)+(p.lembur||0)
      const potong = (p.potongan_bpjs||0)+(p.potongan_cicilan||0)+(p.potongan_kasbon||0)+
        (p.potongan_absensi||0)+(p.potongan_arisan||0)+(p.potongan_lainnya||0)
      return masuk - potong
    }
    return (p.jasa_pelayanan||0)+(p.bonus_outlet||0)-(p.potongan_lainnya||0)
  }

  function getPayrollByBulan() {
    return bulanRange.map(({ bulan, tahun, label }) => {
      const records = payrollData.filter(p => p.bulan === bulan && p.tahun === tahun)
      const gaji = records.filter(p => p.tipe === 'gaji').reduce((s,p) => s + hitungTotal(p), 0)
      const jasa = records.filter(p => p.tipe === 'jasa').reduce((s,p) => s + hitungTotal(p), 0)
      return { label, gaji, jasa, total: gaji + jasa }
    })
  }

  function getPayrollByEmployee() {
    return employees.map(emp => {
      const records = payrollData.filter(p => p.employee_id === emp.id)
      const totalGaji = records.filter(p => p.tipe === 'gaji').reduce((s,p) => s + hitungTotal(p), 0)
      const totalJasa = records.filter(p => p.tipe === 'jasa').reduce((s,p) => s + hitungTotal(p), 0)
      const lembur = records.filter(p => p.tipe === 'gaji').reduce((s,p) => s + (p.lembur||0), 0)
      const potongan = records.filter(p => p.tipe === 'gaji').reduce((s,p) =>
        s + (p.potongan_bpjs||0)+(p.potongan_cicilan||0)+(p.potongan_kasbon||0)+(p.potongan_absensi||0)+(p.potongan_arisan||0)+(p.potongan_lainnya||0), 0)
      return { nama: emp.nama, jabatan: emp.jabatan, totalGaji, totalJasa, lembur, potongan, total: totalGaji + totalJasa }
    }).sort((a,b) => b.total - a.total)
  }

  // ─── KALKULASI PERFORMANCE ────────────────────────────────

  function hitungNilai(review) {
    const scores = (review.performance_scores || [])
    if (scores.length === 0) return null
    const avg = scores.reduce((s, sc) => s + (NILAI_SCORE[sc.nilai] || 0), 0) / scores.length
    if (avg >= 3.5) return 'Sangat Baik'
    if (avg >= 2.5) return 'Baik'
    if (avg >= 1.5) return 'Cukup'
    return 'Kurang'
  }

  function getPerformanceByBulan() {
    return bulanRange.map(({ bulan, tahun, label }) => {
      const reviews = performanceData.filter(r => r.bulan === bulan && r.tahun === tahun)
      const distribusi = { 'Sangat Baik': 0, 'Baik': 0, 'Cukup': 0, 'Kurang': 0 }
      reviews.forEach(r => { const n = hitungNilai(r); if (n) distribusi[n]++ })
      return { label, ...distribusi, total: reviews.length }
    })
  }

  function getPerformanceByEmployee() {
    return employees.map(emp => {
      const reviews = performanceData.filter(r => r.employee_id === emp.id)
      const nilaiList = reviews.map(r => hitungNilai(r)).filter(Boolean)
      const avgScore = nilaiList.length > 0
        ? nilaiList.reduce((s,n) => s + (NILAI_SCORE[n]||0), 0) / nilaiList.length : 0
      const nilaiAkhir = avgScore >= 3.5 ? 'Sangat Baik' : avgScore >= 2.5 ? 'Baik' : avgScore >= 1.5 ? 'Cukup' : avgScore > 0 ? 'Kurang' : '-'
      return { nama: emp.nama, jabatan: emp.jabatan, jumlahReview: reviews.length, nilaiAkhir, avgScore }
    }).sort((a,b) => b.avgScore - a.avgScore)
  }

  // ─── KALKULASI PIKET ──────────────────────────────────────

  function getPiketByBulan() {
    return bulanRange.map(({ bulan, tahun, label }) => {
      const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
      const to = `${tahun}-${String(bulan).padStart(2,'0')}-${new Date(tahun, bulan, 0).getDate()}`
      // Pakai allPiketData untuk hitung total per bulan (termasuk lintas area)
      const records = allPiketData.filter(p => p.tanggal >= from && p.tanggal <= to)
      const piketDiOutletIni = piketData.filter(p => p.tanggal >= from && p.tanggal <= to)
      const tempCount = records.filter(p => p.is_temporary).length
      const lembur = employees.reduce((sum, emp) => {
        const target = emp.piket_per_bulan || 15
        const actual = records.filter(p => p.employee_id === emp.id).length
        return sum + Math.max(0, actual - target)
      }, 0)
      return { label, total: piketDiOutletIni.length, totalSemua: records.length, sementara: tempCount, lembur }
    })
  }

  function getPiketByEmployee() {
    // Gunakan allPiketData jika sudah ada, fallback ke piketData
    const piketSumber = allPiketData.length > 0 ? allPiketData : piketData
    return employees.map(emp => {
      // Total di outlet yang dipilih
      const totalOutlet = piketData.filter(p => p.employee_id === emp.id).length
      // Total semua jadwal staff ini (semua outlet)
      const totalSemua = piketSumber.filter(p => p.employee_id === emp.id).length
      // Penugasan sementara lintas area = is_temporary true di schedules
      const tugasSementaraMasuk = piketSumber.filter(p =>
        p.employee_id === emp.id && p.is_temporary === true
      )
      const outletSementaraList = [...new Set(
        tugasSementaraMasuk.map(p => p.outlets?.nama).filter(Boolean)
      )]
      const target = (emp.piket_per_bulan || 15) * bulanRange.length
      const lembur = Math.max(0, totalSemua - target)
      // isTemporaryStaff hanya true kalau ada jadwal is_temporary=true (beda area)
      const isTemp = tugasSementaraMasuk.length > 0
      return {
        nama: emp.nama, jabatan: emp.jabatan,
        totalOutlet, totalSemua, target, lembur,
        tugasSementara: tugasSementaraMasuk.length,
        outletSementara: outletSementaraList,
        isTemporaryStaff: isTemp,
        persen: target > 0 ? Math.round(totalSemua/target*100) : 0
      }
    }).sort((a,b) => b.totalSemua - a.totalSemua)
  }

  // ─── EXPORT ───────────────────────────────────────────────

  function exportPDF() {
    const periode = `${BULAN_FULL[bulanDari-1]} ${tahunDari}${bulanDari !== bulanSampai || tahunDari !== tahunSampai ? ` — ${BULAN_FULL[bulanSampai-1]} ${tahunSampai}` : ''}`
    const outletNama = mode === 'area'
      ? (areas.find(a=>a.id===selectedArea)?.nama||'Area')
      : (activeOutletData?.nama||'Outlet')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>HR Analytics - ${outletNama} - ${BULAN_FULL[bulanDari-1]} ${tahunDari}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:11pt;color:#111;padding:20px}
      h1{font-size:16pt;color:#1e40af;margin-bottom:4px}
      h2{font-size:12pt;color:#374151;margin:16px 0 8px}
      .meta{font-size:10pt;color:#6b7280;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #1e40af}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10pt}
      th{background:#1e40af;color:white;padding:8px;text-align:left}
      td{padding:6px 8px;border-bottom:1px solid #e5e7eb}
      tr:nth-child(even){background:#f9fafb}
      .badge-green{background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:999px;font-size:9pt}
      .badge-yellow{background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:9pt}
      .badge-red{background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:999px;font-size:9pt}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
      .card{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;text-align:center}
      .card-val{font-size:20pt;font-weight:700;color:#0284c7}
      .card-lbl{font-size:9pt;color:#6b7280;margin-top:2px}
      @media print{body{padding:10px}.no-print{display:none}}
    </style></head><body>
    <div class="no-print" style="margin-bottom:16px;text-align:center">
      <button onclick="window.print()" style="background:#1e40af;color:white;border:none;padding:10px 28px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;margin-right:8px">🖨 Print / Save PDF</button>
      <button onclick="window.close()" style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer">Tutup</button>
    </div>
    <h1>HR Analytics — ${outletNama}</h1>
    <div class="meta">Periode: ${BULAN_FULL[bulanDari-1]} ${tahunDari} — ${BULAN_FULL[bulanSampai-1]} ${tahunSampai} &nbsp;|&nbsp; Dicetak: ${new Date().toLocaleDateString('id-ID', {day:'2-digit',month:'long',year:'numeric'})}</div>

    <h2>Ringkasan</h2>
    <div class="summary">
      <div class="card"><div class="card-val">${employees.length}</div><div class="card-lbl">Total Staff</div></div>
      <div class="card"><div class="card-val">${absensiData.filter(a=>a.status==='hadir').length}</div><div class="card-lbl">Total Kehadiran</div></div>
      <div class="card"><div class="card-val">Rp ${FMT(payrollData.filter(p=>p.tipe==='gaji').reduce((s,p)=>s+hitungTotal(p),0))}</div><div class="card-lbl">Total Gaji</div></div>
      <div class="card"><div class="card-val">${piketData.length}</div><div class="card-lbl">Total Piket</div></div>
    </div>

    <h2>Rekap Kehadiran per Staff</h2>
    <table><thead><tr><th>Nama</th><th>Jabatan</th><th>Hadir</th><th>Izin/Sakit</th><th>Alpha</th><th>% Hadir</th></tr></thead>
    <tbody>${getAbsensiByEmployee().map(r => `<tr>
      <td>${r.isTemp?'🔀 ':''}${r.nama}${r.isTemp?' (sementara)':''}</td><td>${r.jabatan}</td>
      <td style="color:#059669;font-weight:600">${r.hadir}</td>
      <td style="color:#d97706">${r.izin}</td>
      <td style="color:#dc2626">${r.alpha}</td>
      <td><span class="${r.persen>=80?'badge-green':r.persen>=60?'badge-yellow':'badge-red'}">${r.persen}%</span></td>
    </tr>`).join('')}</tbody></table>

    <h2>Rekap Payroll per Staff</h2>
    <table><thead><tr><th>Nama</th><th>Jabatan</th><th>Total Gaji</th><th>Total Jasa</th><th>Lembur</th><th>Potongan</th><th>Grand Total</th></tr></thead>
    <tbody>${getPayrollByEmployee().map(r => `<tr>
      <td>${r.nama}</td><td>${r.jabatan}</td>
      <td>Rp ${FMT(r.totalGaji)}</td><td>Rp ${FMT(r.totalJasa)}</td>
      <td>Rp ${FMT(r.lembur)}</td><td style="color:#dc2626">Rp ${FMT(r.potongan)}</td>
      <td style="font-weight:700">Rp ${FMT(r.total)}</td>
    </tr>`).join('')}
    <tr style="background:#dbeafe;font-weight:700"><td colspan="2">TOTAL</td>
      <td>Rp ${FMT(getPayrollByEmployee().reduce((s,r)=>s+r.totalGaji,0))}</td>
      <td>Rp ${FMT(getPayrollByEmployee().reduce((s,r)=>s+r.totalJasa,0))}</td>
      <td>Rp ${FMT(getPayrollByEmployee().reduce((s,r)=>s+r.lembur,0))}</td>
      <td>Rp ${FMT(getPayrollByEmployee().reduce((s,r)=>s+r.potongan,0))}</td>
      <td>Rp ${FMT(getPayrollByEmployee().reduce((s,r)=>s+r.total,0))}</td>
    </tr></tbody></table>

    <h2>Rekap Performance per Staff</h2>
    <table><thead><tr><th>Peringkat</th><th>Nama</th><th>Jabatan</th><th>Jumlah Review</th><th>Nilai Akhir</th></tr></thead>
    <tbody>${getPerformanceByEmployee().map((r,i) => `<tr>
      <td>#${i+1}</td><td>${r.nama}</td><td>${r.jabatan}</td><td>${r.jumlahReview}</td>
      <td><span class="${r.nilaiAkhir==='Sangat Baik'||r.nilaiAkhir==='Baik'?'badge-green':r.nilaiAkhir==='Cukup'?'badge-yellow':'badge-red'}">${r.nilaiAkhir||'-'}</span></td>
    </tr>`).join('')}</tbody></table>

    <h2>Rekap Piket per Staff</h2>
    <table><thead><tr><th>Nama</th><th>Jabatan</th><th>Piket di Outlet</th><th>Total Semua</th><th>Target</th><th>Lembur</th><th>Pencapaian</th></tr></thead>
    <tbody>${getPiketByEmployee().map(r => `<tr>
      <td>${r.isTemporaryStaff?'🔀 ':''} ${r.nama}</td><td>${r.jabatan}</td>
      <td>${r.totalOutlet}</td><td style="font-weight:600">${r.totalSemua}</td>
      <td>${r.target}</td>
      <td style="color:#d97706">${r.lembur>0?'+'+r.lembur:'—'}</td>
      <td><span class="${r.persen>=100?'badge-green':r.persen>=80?'badge-green':'badge-yellow'}">${r.persen}%</span></td>
    </tr>`).join('')}</tbody></table>
    </body></html>`

    const win = window.open('', '_blank', 'width=900,height=800')
    win.document.write(html)
    win.document.close()
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new()

    // Absensi
    const attSheet = XLSX.utils.json_to_sheet(getAbsensiByEmployee().map(r => ({
      'Nama': r.nama, 'Jabatan': r.jabatan, 'Hadir': r.hadir, 'Izin/Sakit': r.izin,
      'Alpha': r.alpha, 'Total': r.total, 'Kehadiran %': r.persen + '%'
    })))
    XLSX.utils.book_append_sheet(wb, attSheet, 'Absensi')

    // Payroll
    const paySheet = XLSX.utils.json_to_sheet(getPayrollByEmployee().map(r => ({
      'Nama': r.nama, 'Jabatan': r.jabatan,
      'Total Gaji': r.totalGaji, 'Total Jasa': r.totalJasa,
      'Lembur': r.lembur, 'Potongan': r.potongan, 'Total': r.total
    })))
    XLSX.utils.book_append_sheet(wb, paySheet, 'Payroll')

    // Performance
    const perfSheet = XLSX.utils.json_to_sheet(getPerformanceByEmployee().map(r => ({
      'Nama': r.nama, 'Jabatan': r.jabatan,
      'Jumlah Review': r.jumlahReview, 'Nilai Akhir': r.nilaiAkhir
    })))
    XLSX.utils.book_append_sheet(wb, perfSheet, 'Performance')

    // Piket
    const piketSheet = XLSX.utils.json_to_sheet(getPiketByEmployee().map(r => ({
      'Nama': r.nama, 'Jabatan': r.jabatan,
      'Piket di Outlet': r.totalOutlet,
      'Total Piket (semua outlet)': r.totalSemua,
      'Penugasan Sementara': r.tugasSementara,
      'Outlet Sementara': r.outletSementara.join(', ') || '-',
      'Target': r.target, 'Lembur': r.lembur, 'Pencapaian %': r.persen + '%'
    })))
    XLSX.utils.book_append_sheet(wb, piketSheet, 'Piket')

    const label = mode === 'area'
      ? (areas.find(a=>a.id===selectedArea)?.nama || 'Area')
      : (activeOutletData?.nama || 'Outlet')
    XLSX.writeFile(wb, `HR_Analytics_${label}_${BULAN_NAMES[bulanDari-1]}${tahunDari}-${BULAN_NAMES[bulanSampai-1]}${tahunSampai}.xlsx`)
  }

  const NILAI_COLORS = { 'Sangat Baik': '#10b981', 'Baik': '#3b82f6', 'Cukup': '#f59e0b', 'Kurang': '#ef4444' }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">HR Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">
              {mode === 'area' ? (areas.find(a=>a.id===selectedArea)?.nama || 'Pilih Area') : activeOutletData?.nama}
              {' · '}{BULAN_FULL[bulanDari-1]} {tahunDari} — {BULAN_FULL[bulanSampai-1]} {tahunSampai}
            </p>
          </div>
          <button onClick={exportPDF}
            className="border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium">
            🖨 Export PDF
          </button>
          <button onClick={exportExcel}
            className="border border-green-300 text-green-700 hover:bg-green-50 px-4 py-2 rounded-lg text-sm font-medium">
            ⬇ Export Excel
          </button>
        </div>

        {/* Filter */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Mode */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Tampilan</label>
              <div className="flex gap-2">
                <button onClick={() => setMode('outlet')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${mode==='outlet'?'bg-blue-600 text-white border-blue-600':'border-gray-300 text-gray-600'}`}>
                  Per Outlet
                </button>
                <button onClick={() => setMode('area')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${mode==='area'?'bg-blue-600 text-white border-blue-600':'border-gray-300 text-gray-600'}`}>
                  Per Area
                </button>
              </div>
            </div>

            {/* Area selector */}
            {mode === 'area' && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Area</label>
                <select value={selectedArea} onChange={e => setSelectedArea(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Pilih Area --</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}
                </select>
              </div>
            )}

            {/* Dari */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Dari</label>
              <div className="flex gap-2">
                <select value={bulanDari} onChange={e => setBulanDari(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {BULAN_NAMES.map((b,i) => <option key={i+1} value={i+1}>{b}</option>)}
                </select>
                <select value={tahunDari} onChange={e => setTahunDari(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Sampai */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Sampai</label>
              <div className="flex gap-2">
                <select value={bulanSampai} onChange={e => setBulanSampai(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {BULAN_NAMES.map((b,i) => <option key={i+1} value={i+1}>{b}</option>)}
                </select>
                <select value={tahunSampai} onChange={e => setTahunSampai(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Total Staff</p>
              <p className="text-2xl font-semibold text-blue-600">{employees.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Total Kehadiran</p>
              <p className="text-2xl font-semibold text-green-600">{absensiData.filter(a=>a.status==='hadir').length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Total Pengeluaran Gaji</p>
              <p className="text-lg font-semibold text-gray-900">
                Rp {FMT(payrollData.filter(p=>p.tipe==='gaji').reduce((s,p)=>s+hitungTotal(p),0))}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Total Piket</p>
              <p className="text-2xl font-semibold text-purple-600">{piketData.length}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[['absensi','Absensi'],['payroll','Payroll'],['performance','Performance'],['piket','Piket & Lembur']].map(([val,label]) => (
            <button key={val} onClick={() => setTab(val)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===val?'bg-blue-600 text-white':'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Memuat data...
          </div>
        ) : (

          <>
          {/* ─── ABSENSI ─── */}
          {tab === 'absensi' && (
            <div className="space-y-6">
              {/* Chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Tren Kehadiran per Bulan</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={getAbsensiByBulan()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="hadir" name="Hadir" fill="#10b981" radius={[4,4,0,0]} />
                    <Bar dataKey="izin" name="Izin/Sakit" fill="#f59e0b" radius={[4,4,0,0]} />
                    <Bar dataKey="alpha" name="Alpha" fill="#ef4444" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Tabel */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                  <p className="text-sm font-semibold text-gray-700">Detail Kehadiran per Staff</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>{['Nama','Jabatan','Hadir','Izin/Sakit','Alpha','Total','% Hadir'].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {getAbsensiByEmployee().length === 0
                        ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Tidak ada data.</td></tr>
                        : getAbsensiByEmployee().map((r,i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {r.isTemp && <span className="text-blue-500 mr-1" title={`Penugasan sementara (${r.tempCount} hari)`}>🔀</span>}
                              {r.nama}
                              {r.isTemp && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">sementara</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{r.jabatan}</td>
                            <td className="px-4 py-3 text-green-600 font-medium">{r.hadir}</td>
                            <td className="px-4 py-3 text-yellow-600">{r.izin}</td>
                            <td className="px-4 py-3 text-red-500">{r.alpha}</td>
                            <td className="px-4 py-3 text-gray-700">{r.total}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-16">
                                  <div className="bg-green-500 h-1.5 rounded-full" style={{width:`${r.persen}%`}}></div>
                                </div>
                                <span className={`text-xs font-medium ${r.persen>=80?'text-green-600':r.persen>=60?'text-yellow-600':'text-red-500'}`}>{r.persen}%</span>
                              </div>
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── PAYROLL ─── */}
          {tab === 'payroll' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Tren Pengeluaran Gaji per Bulan</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={getPayrollByBulan()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000000).toFixed(1)}jt`} />
                    <Tooltip formatter={v => `Rp ${FMT(v)}`} />
                    <Legend />
                    <Line type="monotone" dataKey="gaji" name="Gaji" stroke="#3b82f6" strokeWidth={2} dot />
                    <Line type="monotone" dataKey="jasa" name="Jasa" stroke="#10b981" strokeWidth={2} dot />
                    <Line type="monotone" dataKey="total" name="Total" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Detail Payroll per Staff</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>{['Nama','Jabatan','Total Gaji','Total Jasa','Lembur','Potongan','Grand Total'].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {getPayrollByEmployee().length === 0
                        ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Tidak ada data.</td></tr>
                        : getPayrollByEmployee().map((r,i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {r.isTemporaryStaff && (
                                  <span className="bg-orange-100 text-orange-700 text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">🔀 Sementara</span>
                                )}
                                {r.nama}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{r.jabatan}</td>
                            <td className="px-4 py-3 text-blue-600 text-xs whitespace-nowrap">Rp {FMT(r.totalGaji)}</td>
                            <td className="px-4 py-3 text-green-600 text-xs whitespace-nowrap">Rp {FMT(r.totalJasa)}</td>
                            <td className="px-4 py-3 text-yellow-600 text-xs whitespace-nowrap">Rp {FMT(r.lembur)}</td>
                            <td className="px-4 py-3 text-red-500 text-xs whitespace-nowrap">Rp {FMT(r.potongan)}</td>
                            <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">Rp {FMT(r.total)}</td>
                          </tr>
                        ))
                      }
                      {getPayrollByEmployee().length > 0 && (
                        <tr className="bg-blue-50 font-semibold">
                          <td className="px-4 py-3 text-blue-700" colSpan={2}>TOTAL</td>
                          <td className="px-4 py-3 text-blue-700 text-xs whitespace-nowrap">Rp {FMT(getPayrollByEmployee().reduce((s,r)=>s+r.totalGaji,0))}</td>
                          <td className="px-4 py-3 text-blue-700 text-xs whitespace-nowrap">Rp {FMT(getPayrollByEmployee().reduce((s,r)=>s+r.totalJasa,0))}</td>
                          <td className="px-4 py-3 text-blue-700 text-xs whitespace-nowrap">Rp {FMT(getPayrollByEmployee().reduce((s,r)=>s+r.lembur,0))}</td>
                          <td className="px-4 py-3 text-blue-700 text-xs whitespace-nowrap">Rp {FMT(getPayrollByEmployee().reduce((s,r)=>s+r.potongan,0))}</td>
                          <td className="px-4 py-3 text-blue-700 whitespace-nowrap">Rp {FMT(getPayrollByEmployee().reduce((s,r)=>s+r.total,0))}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── PERFORMANCE ─── */}
          {tab === 'performance' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Bar chart distribusi */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">Distribusi Nilai per Bulan</h2>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={getPerformanceByBulan()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Sangat Baik" fill="#10b981" radius={[4,4,0,0]} />
                      <Bar dataKey="Baik" fill="#3b82f6" radius={[4,4,0,0]} />
                      <Bar dataKey="Cukup" fill="#f59e0b" radius={[4,4,0,0]} />
                      <Bar dataKey="Kurang" fill="#ef4444" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Pie chart keseluruhan */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">Distribusi Nilai Keseluruhan</h2>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={
                        Object.entries({ 'Sangat Baik': 0, 'Baik': 0, 'Cukup': 0, 'Kurang': 0 }).map(([name]) => ({
                          name,
                          value: getPerformanceByEmployee().filter(e => e.nilaiAkhir === name).length
                        })).filter(d => d.value > 0)
                      } cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({name,value})=>`${name}: ${value}`}>
                        {['Sangat Baik','Baik','Cukup','Kurang'].map(n => (
                          <Cell key={n} fill={NILAI_COLORS[n]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Detail Performance per Staff</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>{['Peringkat','Nama','Jabatan','Jumlah Review','Nilai Akhir'].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {getPerformanceByEmployee().length === 0
                        ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Tidak ada data.</td></tr>
                        : getPerformanceByEmployee().map((r,i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-500 font-medium">#{i+1}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{r.nama}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{r.jabatan}</td>
                            <td className="px-4 py-3 text-gray-700">{r.jumlahReview}</td>
                            <td className="px-4 py-3">
                              {r.nilaiAkhir !== '-'
                                ? <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                    r.nilaiAkhir==='Sangat Baik'?'bg-green-100 text-green-700':
                                    r.nilaiAkhir==='Baik'?'bg-blue-100 text-blue-700':
                                    r.nilaiAkhir==='Cukup'?'bg-yellow-100 text-yellow-700':
                                    'bg-red-100 text-red-600'}`}>{r.nilaiAkhir}</span>
                                : <span className="text-gray-400 text-xs">Belum dinilai</span>
                              }
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── PIKET ─── */}
          {tab === 'piket' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Tren Piket & Lembur per Bulan</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={getPiketByBulan()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" name="Piket di Outlet" fill="#3b82f6" radius={[4,4,0,0]} />
                    <Bar dataKey="sementara" name="Penugasan Sementara" fill="#f97316" radius={[4,4,0,0]} />
                    <Bar dataKey="lembur" name="Hari Lembur" fill="#f59e0b" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Detail Piket per Staff</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>{['Nama','Jabatan','Piket di Outlet','Total Semua','Penugasan Sementara','Target','Lembur','Pencapaian'].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {getPiketByEmployee().length === 0
                        ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Tidak ada data.</td></tr>
                        : getPiketByEmployee().map((r,i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {r.isTemporaryStaff && (
                                  <span className="bg-orange-100 text-orange-700 text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">🔀 Sementara</span>
                                )}
                                {r.nama}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{r.jabatan}</td>
                            <td className="px-4 py-3 text-blue-600 font-medium">{r.totalOutlet}</td>
                            <td className="px-4 py-3 font-semibold text-gray-900">{r.totalSemua}</td>
                            <td className="px-4 py-3">
                              {r.tugasSementara > 0 ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                    🔀 {r.tugasSementara}x
                                  </span>
                                  {r.outletSementara.length > 0 && (
                                    <p className="text-xs text-gray-400 mt-0.5">{r.outletSementara.join(', ')}</p>
                                  )}
                                </div>
                              ) : <span className="text-gray-400 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-500">{r.target}</td>
                            <td className="px-4 py-3">
                              {r.lembur > 0
                                ? <span className="text-yellow-600 font-medium">+{r.lembur}</span>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-16">
                                  <div className={`h-1.5 rounded-full ${r.persen>=100?'bg-green-500':r.persen>=80?'bg-blue-500':'bg-yellow-500'}`}
                                    style={{width:`${Math.min(r.persen,100)}%`}}></div>
                                </div>
                                <span className={`text-xs font-medium ${r.persen>=100?'text-green-600':r.persen>=80?'text-blue-600':'text-yellow-600'}`}>
                                  {r.persen}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))
                      }
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