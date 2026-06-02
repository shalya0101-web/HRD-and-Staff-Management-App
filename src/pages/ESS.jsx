import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import ESSLogin from './ESSLogin'
import SuratPinjaman from './SuratPinjaman'
import SuratCuti from './SuratCuti'
import EmployeeDocuments from './EmployeeDocuments'

const RADIUS_METER = 100

function hitungJarak(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const BULAN_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const FMT = n => new Intl.NumberFormat('id-ID').format(n || 0)
const today = new Date()

const NILAI_COLOR = {
  'Sangat Baik': 'bg-green-100 text-green-700',
  'Baik': 'bg-blue-100 text-blue-700',
  'Cukup': 'bg-yellow-100 text-yellow-700',
  'Kurang': 'bg-red-100 text-red-600',
}
const NILAI_SCORE = { 'Sangat Baik': 4, 'Baik': 3, 'Cukup': 2, 'Kurang': 1 }

function hitungNilaiAkhir(scores, points) {
  if (!scores || !points || points.length === 0) return null
  const vals = points.map(p => NILAI_SCORE[scores[p.id]]).filter(Boolean)
  if (vals.length === 0) return null
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length
  if (avg >= 3.5) return 'Sangat Baik'
  if (avg >= 2.5) return 'Baik'
  if (avg >= 1.5) return 'Cukup'
  return 'Kurang'
}

const BULAN_JADWAL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

const ROLE_COLORS = {
  dokter: 'bg-blue-100 text-blue-700',
  perawat_1: 'bg-teal-100 text-teal-700',
  perawat_2: 'bg-teal-100 text-teal-700',
  admin: 'bg-purple-100 text-purple-700',
  lab: 'bg-amber-100 text-amber-700',
  cs: 'bg-gray-100 text-gray-600',
  assist: 'bg-pink-100 text-pink-700',
  apoteker: 'bg-purple-100 text-purple-700',
  asisten_apt: 'bg-violet-100 text-violet-700',
}

function OutletKalender({ outlet, employee, bulan, tahun }) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const [schedules, setSchedules] = useState([])
  const [requests, setRequests] = useState([])

  useEffect(() => { fetchData() }, [bulan, tahun, outlet.id])

  async function fetchData() {
    const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const to = `${tahun}-${String(bulan).padStart(2,'0')}-${lastDay}`
    const [schRes, reqRes] = await Promise.all([
      supabase.from('schedules')
        .select('*, employees(id, nama, jabatan)')
        .gte('tanggal', from).lte('tanggal', to)
        .eq('outlet_id', outlet.id),
      supabase.from('schedule_requests')
        .select('*').eq('employee_id', employee.id)
        .eq('outlet_id', outlet.id)
        .gte('tanggal', from).lte('tanggal', to),
    ])
    setSchedules(schRes.data || [])
    setRequests(reqRes.data || [])
  }

  function getDaysInMonth() {
    const days = []
    const firstDay = new Date(tahun, bulan-1, 1).getDay()
    const totalDays = new Date(tahun, bulan, 0).getDate()
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= totalDays; d++) days.push(d)
    return days
  }

  function getDateStr(day) {
    return `${tahun}-${String(bulan).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }

  function getSchedulesForDate(day) {
    return schedules.filter(s => s.tanggal === getDateStr(day))
  }

  function isMySchedule(day) {
    return schedules.some(s => s.tanggal === getDateStr(day) && s.employee_id === employee.id)
  }

  function myRequestForDate(day) {
    return requests.find(r => r.tanggal === getDateStr(day))
  }

  function getSelectedDates() {
    return selectedDatesByOutlet[selectedOutlet] || []
  }

  const days = getDaysInMonth()
  const myPiketCount = schedules.filter(s => s.employee_id === employee.id).length

  return (
    <div className="flex-shrink-0 w-full snap-center">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden w-full">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex justify-between items-center">
          <div>
            <p className="text-white font-semibold text-sm">
              {outlet.terdaftar === false && <span title="Penugasan sementara">🔀 </span>}
              {outlet.nama}
            </p>
            <p className="text-blue-200 text-xs">
              {outlet.terdaftar === false ? 'Penugasan sementara · ' : ''}{BULAN_JADWAL[bulan-1]} {tahun}
            </p>
          </div>
          <div className="text-right">
            <p className="text-white font-bold text-lg">{myPiketCount}</p>
            <p className="text-blue-200 text-xs">hari piket</p>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(h => (
            <div key={h} className="py-1.5 text-center text-xs font-medium text-gray-400">{h}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            if (!day) return <div key={idx} className="bg-gray-50 border-b border-r border-gray-100 min-h-16" />
            const dateStr = getDateStr(day)
            const isToday = dateStr === todayStr
            const daySchedules = getSchedulesForDate(day)
            const isMine = isMySchedule(day)
            const req = myRequestForDate(day)
            return (
              <div key={idx} className={`border-b border-r border-gray-100 p-1 min-h-16 ${isMine ? 'bg-green-50' : ''}`}>
                <span className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-0.5 ${
                  isToday ? 'bg-blue-600 text-white' :
                  isMine ? 'bg-green-600 text-white' :
                  'text-gray-700'}`}>
                  {day}
                </span>
                <div className="space-y-0.5">
                  {daySchedules.map(s => (
                    <div key={s.id} className={`text-xs px-1 py-0.5 rounded leading-tight ${
                      s.employee_id === employee.id
                        ? 'bg-green-200 text-green-800 font-medium'
                        : ROLE_COLORS[s.role_slot] || 'bg-gray-100 text-gray-600'
                    }`} style={{ fontSize: '10px' }}>
                      {s.employees?.nama}
                    </div>
                  ))}
                  {req?.status === 'pending' && (
                    <div className="text-xs px-1 py-0.5 rounded bg-yellow-100 text-yellow-700" style={{ fontSize: '10px' }}>
                      ⏳ Menunggu
                    </div>
                  )}
                  {req?.status === 'approved' && isMine && (
                    <div
                      className="text-xs px-1 py-0.5 rounded bg-green-100 text-green-700"
                      style={{ fontSize: '10px' }}
                    >
                      ✓ Disetujui
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-3 py-2 border-t border-gray-100 flex flex-wrap gap-2 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-200 inline-block"></span> Piket saya</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-100 inline-block"></span> Menunggu</span>
        </div>
      </div>
    </div>
  )
}

function ESSJadwal({ employee, bulan, tahun }) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  const [myOutlets, setMyOutlets] = useState([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [allSchedules, setAllSchedules] = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [selectedOutlet, setSelectedOutlet] = useState('')
  const [selectedDates, setSelectedDates] = useState({})
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const sliderRef = useRef(null)
  const ROLE_SLOTS = [
    { key: 'dokter', dept: ['Dokter'] },
    { key: 'perawat_1', dept: ['Perawat', 'Bidan'] },
    { key: 'perawat_2', dept: ['Perawat', 'Bidan'] },
    { key: 'admin', dept: ['Administrasi', 'Farmasi'] },
    { key: 'lab', dept: ['Laboratorium'] },
    { key: 'cs', dept: ['Umum'] },
    { key: 'assist', dept: ['Assist'] },
  ]

  useEffect(() => { fetchMyOutlets() }, [employee])
  useEffect(() => { if (selectedOutlet) { fetchAllSchedules(); fetchRequests() } }, [bulan, tahun, selectedOutlet])

  async function fetchMyOutlets() {
    if (!employee) return
    // Outlet tempat staff terdaftar (bisa untuk ajukan jadwal)
    const { data } = await supabase
      .from('employee_outlets')
      .select('outlet_id, outlets(id, nama)')
      .eq('employee_id', employee.id)
    const list = (data || []).map(r => r.outlets).filter(Boolean).map(o => ({ ...o, terdaftar: true }))
    const idSet = new Set(list.map(o => o.id))

    // Outlet tempat staff punya jadwal (termasuk penugasan sementara lintas area) - hanya untuk lihat
    const { data: schedOutlets } = await supabase.from('schedules')
      .select('outlet_id').eq('employee_id', employee.id)
    const extraIds = [...new Set((schedOutlets || []).map(s => s.outlet_id).filter(id => id && !idSet.has(id)))]
    if (extraIds.length > 0) {
      const { data: extraOutlets } = await supabase.from('outlets')
        .select('id, nama').in('id', extraIds)
      ;(extraOutlets || []).forEach(o => { list.push({ ...o, terdaftar: false }); idSet.add(o.id) })
    }

    setMyOutlets(list)
    if (list.length > 0) setSelectedOutlet(list[0].id)
  }

  async function fetchAllSchedules() {
    const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const to = `${tahun}-${String(bulan).padStart(2,'0')}-${lastDay}`
    const { data } = await supabase.from('schedules')
      .select('*, employees(id, nama, jabatan)')
      .gte('tanggal', from).lte('tanggal', to)
      .eq('outlet_id', selectedOutlet)
    setAllSchedules(data || [])
  }

  async function fetchRequests() {
    const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const to = `${tahun}-${String(bulan).padStart(2,'0')}-${lastDay}`
    const { data } = await supabase
      .from('schedule_requests')
      .select('*')
      .eq('employee_id', employee.id)
      .gte('tanggal', from)
      .lte('tanggal', to)
      .order('created_at', { ascending: false })
    setMyRequests(data || [])
  }

  async function printMyJadwal() {
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const BN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
    const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const to = `${tahun}-${String(bulan).padStart(2,'0')}-${lastDay}`

    const daysInMonth = Array.from({ length: lastDay }, (_, i) => {
      const d = new Date(tahun, bulan - 1, i + 1)
      return {
        tanggal: `${tahun}-${String(bulan).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,
        hari: ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()],
        tgl: i + 1, isMinggu: d.getDay()===0, isSabtu: d.getDay()===6,
      }
    })

    // Inisial outlet
    const outletInisial = {}
    myOutlets.forEach(o => {
      outletInisial[o.id] = o.nama.split(' ').map(w => w[0]?.toUpperCase()||'').join('').slice(0,4)
    })
    const outletNamaMap = {}
    myOutlets.forEach(o => { outletNamaMap[o.id] = o.nama })

    // Fetch semua staff di outlet yang sama untuk tabel lengkap
    const { data: empOutlets } = await supabase.from('employee_outlets')
      .select('employee_id, employees(id, nama, jabatan, departemen, piket_per_bulan)')
      .eq('outlet_id', selectedOutlet)
    const allEmps = (empOutlets || []).map(r => r.employees).filter(Boolean)

    // Fetch semua jadwal di outlet ini bulan ini
    const { data: allSched } = await supabase.from('schedules')
      .select('employee_id, outlet_id, tanggal, role_slot, is_temporary')
      .eq('outlet_id', selectedOutlet)
      .gte('tanggal', from).lte('tanggal', to)

    // Inisial semua outlet dari schedules
    const outletIds = [...new Set((allSched||[]).map(s => s.outlet_id))]
    const { data: outletData } = await supabase.from('outlets').select('id, nama').in('id', outletIds)
    const allOutletInisial = {}
    const allOutletNama = {}
    ;(outletData||[]).forEach(o => {
      allOutletInisial[o.id] = o.nama.split(' ').map(w => w[0]?.toUpperCase()||'').join('').slice(0,4)
      allOutletNama[o.id] = o.nama
    })

    // Sort by departemen
    const DEPT_ORDER = ['Dokter Umum','Dokter','Perawat','Bidan','Farmasi','Apoteker','Laboratorium','Administrasi','Admin','Umum','Cleaning Service','Assist']
    const sortedEmps = [...allEmps].sort((a, b) => {
      const dA = DEPT_ORDER.indexOf(a.departemen) === -1 ? 99 : DEPT_ORDER.indexOf(a.departemen)
      const dB = DEPT_ORDER.indexOf(b.departemen) === -1 ? 99 : DEPT_ORDER.indexOf(b.departemen)
      return dA !== dB ? dA - dB : a.nama.localeCompare(b.nama)
    })

    // Build rows
    const rows = sortedEmps.map(emp => {
      const piketHari = daysInMonth.map(d => {
        const scheds = (allSched||[]).filter(s => s.employee_id === emp.id && s.tanggal === d.tanggal)
        if (!scheds.length) return null
        return scheds.map(s => ({
          inisial: allOutletInisial[s.outlet_id] || '?',
          namaOutlet: allOutletNama[s.outlet_id] || '',
          isTemp: s.is_temporary,
        }))
      })
      const total = piketHari.filter(Boolean).length
      const target = emp.piket_per_bulan || 15
      return { emp, piketHari, total, target }
    })

    // Legenda outlet
    const legendHTML = Object.entries(allOutletInisial).map(([id, ins]) =>
      `<span style="margin-right:12px"><strong>${ins}</strong> = ${allOutletNama[id]}</span>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Jadwal Piket ${myOutlets.find(o=>o.id===selectedOutlet)?.nama} - ${BN[bulan-1]} ${tahun}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}
      body{font-family:Arial,sans-serif;font-size:8pt;color:#111}
      .header{padding:12px 16px;border-bottom:3px solid #1e40af;margin-bottom:10px}
      .header h1{font-size:14pt;color:#1e40af;font-weight:700}
      .header p{font-size:9pt;color:#6b7280;margin-top:2px}
      table{width:100%;border-collapse:collapse;font-size:7pt}
      th{background:#1e40af;color:white;padding:4px 3px;text-align:center;border:1px solid #1e3a8a;white-space:nowrap}
      th.nama{text-align:left;min-width:100px;padding-left:6px}
      td{padding:3px;text-align:center;border:1px solid #e5e7eb;vertical-align:middle}
      td.nama{text-align:left;padding-left:6px;font-weight:500;white-space:nowrap;background:#f8fafc}
      td.total{font-weight:700;background:#eff6ff;color:#1d4ed8}
      td.over{background:#fef2f2;color:#dc2626;font-weight:700}
      td.ok{background:#f0fdf4;color:#15803d;font-weight:700}
      .piket{background:#dbeafe;color:#1e40af;border-radius:2px;padding:1px 2px;font-size:6pt}
      .piket-temp{background:#fed7aa;color:#c2410c;border-radius:2px;padding:1px 2px;font-size:6pt}
      .dept-header td{background:#1e40af;color:white;font-weight:700;font-size:8pt;padding:4px 8px;text-align:left}
      .highlight{background:#fef08a}
      .no-print{display:block;text-align:center;padding:12px;margin-bottom:12px}
      .legend{font-size:8pt;margin:8px 16px 10px}
      @media print{.no-print{display:none}body{font-size:7pt}}
    </style></head><body>
    <div class="no-print">
      <button onclick="window.print()" style="background:#1e40af;color:white;border:none;padding:10px 28px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;margin-right:8px">🖨 Print / Save PDF</button>
      <button onclick="window.close()" style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer">Tutup</button>
    </div>
    <div class="header">
      <h1>Jadwal Piket — ${myOutlets.find(o=>o.id===selectedOutlet)?.nama||''}</h1>
      <p>${BN[bulan-1]} ${tahun} &nbsp;|&nbsp; ${sortedEmps.length} Staff &nbsp;|&nbsp; Dicetak: ${new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'})}</p>
    </div>
    <div class="legend"><strong>Kode Outlet:</strong> ${legendHTML} &nbsp;|&nbsp;
      <span style="background:#dbeafe;padding:1px 6px;border-radius:3px;color:#1e40af">■</span> Piket &nbsp;
      <span style="background:#fed7aa;padding:1px 6px;border-radius:3px;color:#c2410c">🔀</span> Sementara &nbsp;
      <span style="background:#fef9c3;padding:1px 6px;border-radius:3px">■</span> Minggu &nbsp;
      <span style="background:#f0fdf4;padding:1px 6px;border-radius:3px">■</span> Sabtu
    </div>
    <table>
      <thead><tr>
        <th class="nama">Nama Staff</th>
        <th>Jabatan</th>
        ${daysInMonth.map(d=>`<th style="${d.isMinggu?'background:#b45309;color:white':d.isSabtu?'background:#15803d;color:white':''}"><div>${d.hari}</div><div>${d.tgl}</div></th>`).join('')}
        <th>Total</th><th>Target</th>
      </tr></thead>
      <tbody>
        ${(()=>{
          let lastDept = null
          return rows.map(({emp, piketHari, total, target})=>{
            const deptRow = emp.departemen !== lastDept
              ? `<tr class="dept-header"><td colspan="${daysInMonth.length+4}">${emp.departemen||'Lainnya'}</td></tr>`
              : ''
            lastDept = emp.departemen
            const isMe = emp.id === employee.id
            return deptRow + `<tr${isMe?' style="background:#fef9c3"':''}>
              <td class="nama">${isMe?'▶ ':''}${emp.nama}</td>
              <td style="text-align:left;white-space:nowrap;font-size:6.5pt;color:#6b7280">${emp.jabatan}</td>
              ${piketHari.map((slots,i)=>{
                const d = daysInMonth[i]
                const bg = d.isMinggu?'background:#fef9c3':d.isSabtu?'background:#f0fdf4':''
                if(!slots) return `<td style="${bg}"></td>`
                return `<td style="${bg}">${slots.map(p=>`<span class="${p.isTemp?'piket-temp':'piket'}">${p.isTemp?'🔀':''}${p.inisial}</span>`).join('<br>')}</td>`
              }).join('')}
              <td class="${total>target?'over':total>=target?'ok':'total'}">${total}</td>
              <td style="text-align:center;color:#6b7280">${target}</td>
            </tr>`
          }).join('')
        })()}
      </tbody>
    </table>
    </body></html>`

    const win = window.open('', '_blank', 'width=1200,height=800')
    win.document.write(html); win.document.close()
  }

  function getDaysInMonth() {
    const days = []
    const firstDay = new Date(tahun, bulan-1, 1).getDay()
    const totalDays = new Date(tahun, bulan, 0).getDate()
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= totalDays; d++) days.push(d)
    return days
  }

  function getDateStr(day) {
    return `${tahun}-${String(bulan).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }

  function isMySchedule(day) {
    return allSchedules.some(s => s.tanggal === getDateStr(day) && s.employee_id === employee.id)
  }

  function myRequestForDate(day, outletId = selectedOutlet) {

    return myRequests.find(
      r =>
        r.tanggal === getDateStr(day) &&
        r.outlet_id === outletId
    )
  }

  function getSlotInfo(day) {
    const dateStr = getDateStr(day)

    // cari role slot yang sesuai dengan departemen employee
    const employeeDept = employee?.departemen

    const myRoles = ROLE_SLOTS.filter(role =>
      role.dept.includes(employeeDept)
    )

    // semua schedule tanggal ini
    const approved = allSchedules.filter(
      s => s.tanggal === dateStr
    )

    // hitung slot milik departemen staff ini
    const usedSlots = approved.filter(s =>
      myRoles.some(r => r.key === s.role_slot)
    ).length

    const totalSlots = myRoles.length

    return {
      totalSlots,
      usedSlots,
      remaining: totalSlots - usedSlots,
      full: usedSlots >= totalSlots,
      almostFull:
        usedSlots === totalSlots - 1 &&
        totalSlots > 1,
    }
  }

  function toggleDate(day) {

    const outletId = selectedOutlet

    const dateStr = getDateStr(day)

    // sudah ada jadwal kerja
    const sudahJadwal = allSchedules.some(
      s =>
        s.tanggal === dateStr &&
        s.employee_id === employee.id
    )

    // sudah pending di database
    const sudahPengajuan = myRequests.some(
      r =>
        r.tanggal === dateStr &&
        r.status === 'pending'
    )

    // sudah dipilih di outlet lain (BELUM DIKIRIM)
    const sudahDipilihOutletLain = Object.entries(selectedDates).some(
      ([id, dates]) =>
        id !== outletId &&
        dates.includes(day)
    )

    if (sudahJadwal || sudahPengajuan || sudahDipilihOutletLain) {

      if (sudahDipilihOutletLain) {
        setError('Tanggal ini sudah dipilih di outlet lain.')
      }

      return
    }

    setSelectedDates(prev => {

      const currentDates = prev[outletId] || []

      const updatedDates = currentDates.includes(day)
        ? currentDates.filter(d => d !== day)
        : [...currentDates, day]

      return {
        ...prev,
        [outletId]: updatedDates
      }
    })

    setError('')
  }
  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  // PERUBAHAN 3: ajukanPiket menerima outletId, hanya kirim tanggal outlet itu
  // Sebelumnya: async function ajukanPiket() { const targetOutlet = lockedOutlet || selectedOutlet ... }
  async function ajukanPiketAllOutlets() {

      setSaving(true)
      setError('')

      let berhasil = 0
      let gagal = 0

      // ambil hanya outlet yang punya tanggal
      const entries = Object.entries(selectedDates)
        .filter(([_, dates]) => Array.isArray(dates) && dates.length > 0)

      // kalau kosong
      if (entries.length === 0) {
        setError('Pilih minimal 1 tanggal.')
        setSaving(false)
        return
      }

      console.log('selectedDates:', selectedDates)
      console.log('entries:', entries)

      for (const [outletId, dates] of entries) {

        for (const day of dates) {

          const dateStr = getDateStr(day)

          // cek pending khusus outlet + tanggal
          const { data: pending } = await supabase
            .from('schedule_requests')
            .select('id')
            .eq('employee_id', employee.id)
            .eq('outlet_id', outletId)
            .eq('tanggal', dateStr)
            .eq('status', 'pending')
            .maybeSingle()

          // skip kalau memang masih pending
          if (pending) {
            gagal++
            continue
          }

          const { data: existing } = await supabase
            .from('schedule_requests')
            .select('id, status')
            .eq('employee_id', employee.id)
            .eq('tanggal', dateStr)
            .eq('outlet_id', outletId)
            .maybeSingle()

          // kalau masih pending → skip
          if (existing?.status === 'pending') {
            gagal++
            continue
          }

          let err = null

          // kalau sudah pernah ada (approved/rejected)
          if (existing) {

            const { error } = await supabase
              .from('schedule_requests')
              .update({
                status: 'pending',
                keterangan,
              })
              .eq('id', existing.id)

            err = error

          } else {

            // insert baru
            const { error } = await supabase
              .from('schedule_requests')
              .insert({
                employee_id: employee.id,
                outlet_id: outletId,
                tanggal: dateStr,
                keterangan,
                status: 'pending',
              })

            err = error
          }

          if (err) gagal++
          else berhasil++
                    
        }
      }

      if (berhasil > 0) {

        setSuccess(
          `${berhasil} pengajuan piket berhasil dikirim${
            gagal > 0 ? ` (${gagal} gagal)` : ''
          }`
        )

        // reset semua outlet
        setSelectedDates({})

        setShowRequestForm(false)

        setKeterangan('')

      } else {

        setError('Semua tanggal yang dipilih sudah memiliki pengajuan pending.')

      }

      setSaving(false)

      fetchRequests()
    }
  // ═══════════════════════════════════════════════════════════════

  const days = getDaysInMonth()
  const outletNama = myOutlets.find(o => o.id === selectedOutlet)?.nama || ''

  // Outlet yang sedang ditampilkan di slider
  const activeOutletId = myOutlets[activeIdx]?.id || selectedOutlet
  // Tanggal yang dipilih untuk outlet aktif
  const activeDates = selectedDates[activeOutletId] || []
  // Jumlah tanggal yang dipilih di outlet LAIN (untuk info reminder)
  const totalDatesOtherOutlets = Object.entries(selectedDates)
    .filter(([id]) => id !== activeOutletId)
    .reduce((sum, [, dates]) => sum + dates.length, 0)

  useEffect(() => {
    const slider = sliderRef.current
    if (!slider) return
    const handleScroll = () => {
      const slideWidth = slider.offsetWidth * 0.92 + 12
      const idx = Math.round(slider.scrollLeft / slideWidth)
      if (idx !== activeIdx) {
        setActiveIdx(idx)
        if (myOutlets[idx]) setSelectedOutlet(myOutlets[idx].id)
      }
    }
    slider.addEventListener('scroll', handleScroll)
    return () => slider.removeEventListener('scroll', handleScroll)
  }, [activeIdx, myOutlets])

  return (
    <div className="space-y-4">

      {myOutlets.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          {myOutlets.map((o, i) => (
            <button key={o.id} onClick={() => { setActiveIdx(i); setSelectedOutlet(o.id) }}
              className={`transition-all rounded-full ${activeIdx === i ? 'w-6 h-2 bg-blue-600' : 'w-2 h-2 bg-gray-300'}`} />
          ))}
        </div>
      )}

      <div ref={sliderRef} className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide gap-4 px-4 pb-2">
        {myOutlets.map((outlet) => (
          <div key={outlet.id} className="snap-center flex-none w-[90%]">
            <OutletKalender outlet={outlet} employee={employee} bulan={bulan} tahun={tahun} />
          </div>
        ))}
      </div>

      {/* Tombol buka/tutup form — hanya untuk outlet terdaftar */}
      <div className="flex items-stretch gap-2">
        {myOutlets.find(o => o.id === selectedOutlet)?.terdaftar !== false ? (
          <button
            onClick={() => {
              setShowRequestForm(!showRequestForm)
              setError('')
              setSuccess('')
            }}
            className="flex-1 border border-blue-300 text-blue-600 hover:bg-blue-50 py-2.5 rounded-xl text-sm font-medium"
          >
            {showRequestForm ? '✕ Tutup Form' : '+ Ajukan Jadwal Piket'}
          </button>
        ) : (
          <div className="flex-1 border border-gray-200 bg-gray-50 text-gray-400 py-2.5 rounded-xl text-xs text-center flex items-center justify-center">
            🔀 Penugasan sementara — hanya bisa dilihat
          </div>
        )}
        <button onClick={printMyJadwal}
          className="border border-gray-300 text-gray-600 hover:bg-gray-50 py-2.5 px-5 rounded-xl text-sm font-medium">
          Print
        </button>
      </div>

      {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{success}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

      {showRequestForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-700 mb-1">Ajukan Jadwal Piket</p>
          {/* PERUBAHAN 5: Tampilkan outlet aktif (bukan lockedOutlet) */}
          <p className="text-xs text-gray-400 mb-3">
            Outlet: <strong className="text-blue-600">
              {myOutlets.find(o => o.id === activeOutletId)?.nama || outletNama}
            </strong> · Ketuk tanggal untuk pilih/batal
          </p>

          {/* PERUBAHAN 6: Info reminder jika ada tanggal dipilih di outlet lain */}
          {totalDatesOtherOutlets > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3 text-xs text-blue-700">
              ℹ️ <strong>{totalDatesOtherOutlets} tanggal</strong> sudah dipilih di outlet lain.
              Geser slider ke outlet tersebut lalu kirim secara terpisah.
            </div>
          )}

          {/* Mini calendar */}
          <div className="grid grid-cols-7 gap-1 mb-3">
            {['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(h => (
              <div key={h} className="text-center text-xs text-gray-400 py-1">{h}</div>
            ))}
            {days.map((day, idx) => {
              if (!day) return <div key={idx} />
              const dateStr = getDateStr(day)
              const isPast = dateStr < todayStr
              const hasSchedule = isMySchedule(day)
              const req = myRequestForDate(day, activeOutletId)
              const slotInfo = getSlotInfo(day)
              const isSelected = activeDates.includes(day)
              const isDisabled = isPast || hasSchedule || req?.status === 'pending'
              return (
                <button
                  key={idx}
                  // PERUBAHAN 8: kirim activeOutletId ke toggleDate
                  onClick={() => !isDisabled && toggleDate(day, activeOutletId)}
                  disabled={isDisabled}
                  className={`aspect-square rounded-lg text-xs font-medium flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-blue-600 text-white ring-2 ring-blue-300' :
                    hasSchedule ? 'bg-green-100 text-green-700 cursor-not-allowed' :
                    req?.status === 'pending' ? 'bg-yellow-100 text-yellow-700 cursor-not-allowed' :
                    isPast ? 'text-gray-300 cursor-not-allowed' :
                    slotInfo.full
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : slotInfo.almostFull
                      ? 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                      : 'bg-gray-50 text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                  }`}
                >
                  <div className="flex flex-col items-center leading-none">
                    <span>{day}</span>

                    {slotInfo.full ? (
                      <span className="text-[9px] font-medium text-red-500">
                        penuh
                      </span>
                    ) : slotInfo.almostFull ? (
                      <span className="text-[9px] font-medium text-orange-500">
                        hampir
                      </span>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>

          {/* PERUBAHAN 9: chip tanggal dari activeDates */}
          {activeDates.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-blue-600 mb-1">{activeDates.length} tanggal dipilih:</p>
              <div className="flex flex-wrap gap-1">
                {activeDates.sort((a,b) => a-b).map(day => (
                  <span key={day} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                    {new Date(getDateStr(day)).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                    {/* PERUBAHAN 10: hapus hanya dari activeOutletId */}
                    <button
                      onClick={() => setSelectedDates(prev => ({
                        ...prev,
                        [activeOutletId]: (prev[activeOutletId] || []).filter(d => d !== day)
                      }))}
                      className="hover:text-blue-900"
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mb-3">
            <label className="text-xs font-medium text-gray-600 block mb-1">Keterangan (opsional)</label>
            <input type="text" placeholder="Contoh: Bersedia piket pengganti"
              value={keterangan} onChange={e => setKeterangan(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex gap-2">
            {/* PERUBAHAN 11: kirim activeOutletId ke ajukanPiket */}
            <button
              onClick={ajukanPiketAllOutlets}
              disabled={activeDates.length === 0 || saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium"
            >
              {saving ? 'Mengirim...' : `Kirim ${activeDates.length > 0 ? `(${activeDates.length} tgl)` : ''}`}
            </button>
            <button
              onClick={() => { setShowRequestForm(false); setKeterangan('') }}
              className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-600"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {myRequests.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700">Riwayat Pengajuan · {outletNama}</p>
          </div>
          <div className="divide-y divide-gray-100">
            {myRequests.map(req => (
              <div key={req.id} className="px-4 py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(req.tanggal).toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' })}
                  </p>
                  {req.keterangan && <p className="text-xs text-gray-500 mt-0.5">{req.keterangan}</p>}
                  {req.status === 'approved' && req.role_slot && (
                    <p className="text-xs text-green-600 mt-0.5">Slot: {req.role_slot}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  req.status==='approved' ? 'bg-green-100 text-green-700' :
                  req.status==='rejected' ? 'bg-red-100 text-red-600' :
                  'bg-yellow-100 text-yellow-700'}`}>
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


// ─── TAB TUKAR SHIFT ─────────────────────────────────────────────────────────

function ESSTukarShift({ employee, bulan, tahun }) {
  const [subTab, setSubTab] = useState('jadwalku') // 'jadwalku' | 'masuk' | 'open' | 'riwayat'
  const [myschedules, setMySchedules] = useState([])
  const [swapsIncoming, setSwapsIncoming] = useState([])
  const [openShifts, setOpenShifts] = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  // Modal tukar
  const [swapModal, setSwapModal] = useState(null) // schedule object dari staff A (jadwalku)
  const [targetSchedules, setTargetSchedules] = useState([])
  const [selectedTargetSched, setSelectedTargetSched] = useState(null)
  const [allEmployees, setAllEmployees] = useState([])
  const [filterEmp, setFilterEmp] = useState('')

  useEffect(() => { fetchAll() }, [bulan, tahun])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchMySchedules(), fetchIncoming(), fetchOpenShifts(), fetchMyRequests(), fetchEmployees()])
    setLoading(false)
  }

  async function fetchMySchedules() {
    const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const to = `${tahun}-${String(bulan).padStart(2,'0')}-${lastDay}`
    // Fetch tanpa join dulu (hindari RLS join issue)
    const { data, error } = await supabase.from('schedules')
      .select('*')
      .eq('employee_id', employee.id)
      .gte('tanggal', from).lte('tanggal', to)
      .order('tanggal')
    if (error) console.error('fetchMySchedules error:', error)
    // Fetch nama outlet terpisah
    const schedules = data || []
    const outletIds = [...new Set(schedules.map(s => s.outlet_id))]
    let outletMap = {}
    if (outletIds.length > 0) {
      const { data: outletData } = await supabase.from('outlets').select('id, nama').in('id', outletIds)
      ;(outletData || []).forEach(o => { outletMap[o.id] = o.nama })
    }
    setMySchedules(schedules.map(s => ({ ...s, outlets: { nama: outletMap[s.outlet_id] || '' } })))
  }

  // Helper: lengkapi data swap dengan join manual (hindari RLS join)
  async function enrichSwaps(swaps) {
    if (!swaps || swaps.length === 0) return []
    const empIds = [...new Set(swaps.flatMap(s => [s.pengaju_id, s.target_id, s.pengambil_id].filter(Boolean)))]
    const schedIds = [...new Set(swaps.flatMap(s => [s.schedule_a_id, s.schedule_b_id].filter(Boolean)))]

    const [empRes, schedRes] = await Promise.all([
      empIds.length ? supabase.from('employees').select('id, nama, jabatan').in('id', empIds) : Promise.resolve({ data: [] }),
      schedIds.length ? supabase.from('schedules').select('id, tanggal, role_slot, outlet_id').in('id', schedIds) : Promise.resolve({ data: [] }),
    ])
    const empMap = {}; (empRes.data || []).forEach(e => { empMap[e.id] = e })
    const schedList = schedRes.data || []
    const outletIds = [...new Set(schedList.map(s => s.outlet_id))]
    let outletMap = {}
    if (outletIds.length) {
      const { data: od } = await supabase.from('outlets').select('id, nama').in('id', outletIds)
      ;(od || []).forEach(o => { outletMap[o.id] = o.nama })
    }
    const schedMap = {}
    schedList.forEach(s => { schedMap[s.id] = { ...s, outlets: { nama: outletMap[s.outlet_id] || '' } } })

    return swaps.map(s => ({
      ...s,
      pengaju: empMap[s.pengaju_id] || null,
      target: empMap[s.target_id] || null,
      pengambil: empMap[s.pengambil_id] || null,
      schedule_a: schedMap[s.schedule_a_id] || null,
      schedule_b: schedMap[s.schedule_b_id] || null,
    }))
  }

  async function fetchIncoming() {
    const { data, error } = await supabase.from('shift_swaps')
      .select('*')
      .eq('target_id', employee.id).eq('tipe', 'tukar').eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) console.error('fetchIncoming error:', error)
    setSwapsIncoming(await enrichSwaps(data || []))
  }

  async function fetchOpenShifts() {
    const { data, error } = await supabase.from('shift_swaps')
      .select('*')
      .eq('tipe', 'open').eq('status', 'pending')
      .neq('pengaju_id', employee.id)
      .order('created_at', { ascending: false })
    if (error) console.error('fetchOpenShifts error:', error)
    setOpenShifts(await enrichSwaps(data || []))
  }

  async function fetchMyRequests() {
    const { data, error } = await supabase.from('shift_swaps')
      .select('*')
      .eq('pengaju_id', employee.id)
      .order('created_at', { ascending: false }).limit(20)
    if (error) console.error('fetchMyRequests error:', error)
    setMyRequests(await enrichSwaps(data || []))
  }

  async function fetchEmployees() {
    const { data } = await supabase.from('employees').select('id, nama, jabatan').eq('status', 'aktif').order('nama')
    setAllEmployees((data || []).filter(e => e.id !== employee.id))
  }

  // Buka modal tukar - pilih jadwal sendiri lalu cari jadwal target
  async function openSwapModal(sched) {
    setSwapModal(sched)
    setSelectedTargetSched(null)
    setFilterEmp('')
    setTargetSchedules([])
  }

  async function fetchTargetSchedules(targetEmpId) {
    const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const to = `${tahun}-${String(bulan).padStart(2,'0')}-${lastDay}`
    const { data, error } = await supabase.from('schedules')
      .select('*')
      .eq('employee_id', targetEmpId)
      .gte('tanggal', from).lte('tanggal', to)
      .order('tanggal')
    if (error) console.error('fetchTargetSchedules error:', error)
    const schedules = data || []
    const outletIds = [...new Set(schedules.map(s => s.outlet_id))]
    let outletMap = {}
    if (outletIds.length > 0) {
      const { data: outletData } = await supabase.from('outlets').select('id, nama').in('id', outletIds)
      ;(outletData || []).forEach(o => { outletMap[o.id] = o.nama })
    }
    setTargetSchedules(schedules.map(s => ({ ...s, outlets: { nama: outletMap[s.outlet_id] || '' } })))
  }

  // Ajukan tukar shift (mode tukar - butuh persetujuan target)
  async function ajukanTukar() {
    if (!selectedTargetSched) { setError('Pilih jadwal yang ingin ditukar.'); return }
    const { error } = await supabase.from('shift_swaps').insert({
      tipe: 'tukar',
      pengaju_id: employee.id,
      schedule_a_id: swapModal.id,
      target_id: selectedTargetSched.employee_id,
      schedule_b_id: selectedTargetSched.id,
      status: 'pending',
    })
    if (error) { setError('Gagal: ' + error.message); return }
    setSuccess('Permintaan tukar shift dikirim! Menunggu persetujuan rekan.')
    setSwapModal(null)
    fetchAll()
  }

  // Jadikan open shift (lepas jadwal, siapa saja bisa ambil)
  async function jadikanOpenShift(sched) {
    if (!confirm('Lepas jadwal ini sebagai open shift? Staff lain bisa mengambilnya.')) return
    const { error } = await supabase.from('shift_swaps').insert({
      tipe: 'open',
      pengaju_id: employee.id,
      schedule_a_id: sched.id,
      status: 'pending',
    })
    if (error) { setError('Gagal: ' + error.message); return }
    setSuccess('Jadwal berhasil dijadikan open shift!')
    fetchAll()
  }

  // Target menyetujui tukar - lakukan swap employee_id di schedules
  async function setujuiTukar(swap) {
    if (!confirm('Setujui tukar shift ini? Jadwal akan langsung tertukar.')) return
    // Tukar employee_id kedua jadwal
    await supabase.from('schedules').update({ employee_id: swap.target_id }).eq('id', swap.schedule_a_id)
    await supabase.from('schedules').update({ employee_id: swap.pengaju_id }).eq('id', swap.schedule_b_id)
    await supabase.from('shift_swaps').update({ status: 'disetujui', responded_at: new Date().toISOString() }).eq('id', swap.id)
    setSuccess('Tukar shift disetujui! Jadwal sudah tertukar.')
    fetchAll()
  }

  async function tolakTukar(swapId) {
    await supabase.from('shift_swaps').update({ status: 'ditolak', responded_at: new Date().toISOString() }).eq('id', swapId)
    setSuccess('Permintaan tukar ditolak.')
    fetchAll()
  }

  // Ambil open shift - pindahkan jadwal ke pengambil
  async function ambilOpenShift(swap) {
    if (!confirm('Ambil shift ini? Jadwal akan dipindahkan ke Anda.')) return
    await supabase.from('schedules').update({ employee_id: employee.id }).eq('id', swap.schedule_a_id)
    await supabase.from('shift_swaps').update({
      status: 'disetujui', pengambil_id: employee.id, responded_at: new Date().toISOString()
    }).eq('id', swap.id)
    setSuccess('Shift berhasil diambil! Jadwal sudah masuk ke Anda.')
    fetchAll()
  }

  async function batalkan(swapId) {
    if (!confirm('Batalkan permintaan ini?')) return
    await supabase.from('shift_swaps').update({ status: 'dibatalkan' }).eq('id', swapId)
    fetchAll()
  }

  const ROLE_LABELS = {} // bisa diisi mapping role jika perlu
  const fmtTgl = t => new Date(t).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })
  const filteredEmps = allEmployees.filter(e => e.nama.toLowerCase().includes(filterEmp.toLowerCase()))

  return (
    <div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-3 text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-3 text-sm">{success}</div>}

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[['jadwalku','Jadwalku'],['masuk',`Masuk${swapsIncoming.length?` (${swapsIncoming.length})`:''}`],['open',`Open Shift${openShifts.length?` (${openShifts.length})`:''}`],['riwayat','Riwayat']].map(([val,label]) => (
          <button key={val} onClick={() => setSubTab(val)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${subTab===val?'bg-blue-600 text-white':'border border-gray-300 text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Memuat...</div>
      ) : (
        <>
        {/* JADWALKU - pilih jadwal untuk ditukar/dilepas */}
        {subTab === 'jadwalku' && (
          <div className="space-y-2">
            {myschedules.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
                Belum ada jadwal piket bulan ini.
              </div>
            ) : myschedules.map(s => (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-800">{fmtTgl(s.tanggal)}</p>
                  <p className="text-xs text-gray-500">{s.outlets?.nama} · {s.role_slot}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openSwapModal(s)}
                    className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium">🔄 Tukar</button>
                  <button onClick={() => jadikanOpenShift(s)}
                    className="text-xs bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg font-medium">📢 Open</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MASUK - permintaan tukar yang ditujukan ke saya */}
        {subTab === 'masuk' && (
          <div className="space-y-2">
            {swapsIncoming.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
                Tidak ada permintaan tukar masuk.
              </div>
            ) : swapsIncoming.map(swap => (
              <div key={swap.id} className="bg-white rounded-xl border border-blue-200 p-4">
                <p className="text-sm font-medium text-gray-800 mb-2">{swap.pengaju?.nama} ingin tukar shift</p>
                <div className="bg-gray-50 rounded-lg p-2 mb-2 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Jadwal {swap.pengaju?.nama}:</span>
                    <span className="text-gray-800">{swap.schedule_a && fmtTgl(swap.schedule_a.tanggal)} · {swap.schedule_a?.outlets?.nama}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Jadwal Anda:</span>
                    <span className="text-gray-800">{swap.schedule_b && fmtTgl(swap.schedule_b.tanggal)} · {swap.schedule_b?.outlets?.nama}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setujuiTukar(swap)}
                    className="flex-1 bg-green-600 text-white text-xs py-2 rounded-lg font-medium">✓ Setujui</button>
                  <button onClick={() => tolakTukar(swap.id)}
                    className="flex-1 border border-gray-300 text-gray-600 text-xs py-2 rounded-lg font-medium">✕ Tolak</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* OPEN SHIFT - shift yang dilepas staff lain */}
        {subTab === 'open' && (
          <div className="space-y-2">
            {openShifts.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
                Tidak ada open shift tersedia.
              </div>
            ) : openShifts.map(swap => (
              <div key={swap.id} className="bg-white rounded-xl border border-orange-200 p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{swap.schedule_a && fmtTgl(swap.schedule_a.tanggal)}</p>
                    <p className="text-xs text-gray-500">{swap.schedule_a?.outlets?.nama} · {swap.schedule_a?.role_slot}</p>
                    <p className="text-xs text-gray-400 mt-1">Dilepas oleh {swap.pengaju?.nama}</p>
                  </div>
                  <button onClick={() => ambilOpenShift(swap)}
                    className="bg-orange-500 text-white text-xs px-4 py-2 rounded-lg font-medium">Ambil</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* RIWAYAT - permintaan saya */}
        {subTab === 'riwayat' && (
          <div className="space-y-2">
            {myRequests.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
                Belum ada riwayat permintaan.
              </div>
            ) : myRequests.map(swap => (
              <div key={swap.id} className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {swap.tipe === 'open' ? '📢 Open Shift' : `🔄 Tukar dengan ${swap.target?.nama || '-'}`}
                    </p>
                    <p className="text-xs text-gray-500">{swap.schedule_a && fmtTgl(swap.schedule_a.tanggal)} · {swap.schedule_a?.outlets?.nama}</p>
                    {swap.pengambil && <p className="text-xs text-green-600 mt-0.5">Diambil oleh {swap.pengambil.nama}</p>}
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      swap.status==='disetujui'?'bg-green-100 text-green-700':
                      swap.status==='ditolak'?'bg-red-100 text-red-600':
                      swap.status==='dibatalkan'?'bg-gray-100 text-gray-500':
                      'bg-yellow-100 text-yellow-700'}`}>{swap.status}</span>
                    {swap.status === 'pending' && (
                      <button onClick={() => batalkan(swap.id)} className="block text-xs text-red-400 mt-1">Batalkan</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </>
      )}

      {/* MODAL TUKAR */}
      {swapModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSwapModal(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-1">Tukar Shift</h3>
            <p className="text-xs text-gray-500 mb-3">Jadwal Anda: {fmtTgl(swapModal.tanggal)} · {swapModal.outlets?.nama}</p>

            <label className="text-xs font-medium text-gray-600 block mb-1">Pilih rekan untuk ditukar</label>
            <input type="text" placeholder="Cari nama rekan..." value={filterEmp}
              onChange={e => setFilterEmp(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />

            {filterEmp && (
              <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg mb-3">
                {filteredEmps.slice(0, 10).map(emp => (
                  <button key={emp.id} onClick={() => { fetchTargetSchedules(emp.id); setFilterEmp(emp.nama); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50">
                    {emp.nama} <span className="text-xs text-gray-400">· {emp.jabatan}</span>
                  </button>
                ))}
              </div>
            )}

            {targetSchedules.length > 0 && (
              <div className="mb-3">
                <label className="text-xs font-medium text-gray-600 block mb-1">Pilih jadwal rekan:</label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {targetSchedules.map(ts => (
                    <button key={ts.id} onClick={() => setSelectedTargetSched(ts)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${selectedTargetSched?.id===ts.id?'border-blue-500 bg-blue-50':'border-gray-200'}`}>
                      {fmtTgl(ts.tanggal)} · {ts.outlets?.nama} · {ts.role_slot}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!filterEmp.includes(' ') ? null : targetSchedules.length === 0 && (
              <div className="mb-3 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                Rekan ini tidak punya jadwal piket di {BULAN_NAMES[bulan-1]} {tahun}. Pilih rekan lain atau ganti bulan.
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={ajukanTukar} disabled={!selectedTargetSched}
                className="flex-1 bg-blue-600 disabled:opacity-40 text-white py-2 rounded-lg text-sm font-medium">Kirim Permintaan</button>
              <button onClick={() => setSwapModal(null)}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ESS() {
  const [employee, setEmployee] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [tab, setTab] = useState('beranda')
  const [bulan, setBulan] = useState(today.getMonth() + 1)
  const [tahun, setTahun] = useState(today.getFullYear())

  const [schedules, setSchedules] = useState([])
  const [upcomingShifts, setUpcomingShifts] = useState([])
  const [shiftLabels, setShiftLabels] = useState({})
  const [attendance, setAttendance] = useState([])
  const [payrolls, setPayrolls] = useState([])
  const [companyInfo, setCompanyInfo] = useState(null)
  const [performance, setPerformance] = useState([])
  const [perfPoints, setPerfPoints] = useState([])
  const [loans, setLoans] = useState([])
  const [leaves, setLeaves] = useState([])
  const [suratLoanId, setSuratLoanId] = useState(null)
  const [suratLeaveId, setSuratLeaveId] = useState(null)
  const [outlets, setOutlets] = useState([])

  const [showLoanForm, setShowLoanForm] = useState(false)
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [loanForm, setLoanForm] = useState({ jenis: 'cicilan', jumlah: '', jumlah_bulan: 1, keterangan: '' })
  const [leaveForm, setLeaveForm] = useState({ jenis: 'cuti', tgl_mulai: '', tgl_selesai: '', keterangan: '' })
  const [editProfile, setEditProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [expandSlip, setExpandSlip] = useState(null) // payroll id yang di-expand

  const [outletList, setOutletList] = useState([])
  const [selectedOutletAbsen, setSelectedOutletAbsen] = useState('')
  const [locating, setLocating] = useState(false)
  const [jarakInfo, setJarakInfo] = useState(null)
  const [showCamera, setShowCamera] = useState(false)
  const [captureType, setCaptureType] = useState(null)
  const [essShifts, setEssShifts] = useState([])
  const [fotoPreview, setFotoPreview] = useState(null)
  const [fotoBlob, setFotoBlob] = useState(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [pendingGps, setPendingGps] = useState(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [todayRecord, setTodayRecord] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await restoreSession(data.session)
      setCheckingSession(false)
    })
  }, [])

  useEffect(() => {
    if (employee) { fetchAllData(); fetchOutletList(); fetchTodayRecord() }
  }, [employee, bulan, tahun])

  useEffect(() => { return () => stopCamera() }, [])

  async function restoreSession(session) {
    // Query berdasarkan user_id (lebih andal dengan RLS)
    const { data, error } = await supabase.from('employees')
      .select('*')
      .eq('user_id', session.user.id).single()
    if (error) {
      console.error('ESS restoreSession error (user_id):', error)
      // Fallback: coba via NIK dari email
      const nik = session.user.email.replace('@klinik.internal', '')
      const { data: data2 } = await supabase.from('employees').select('*').eq('nik', nik).single()
      if (data2) setEmployee({ ...data2, session })
      return
    }
    if (data) setEmployee({ ...data, session })
  }

  async function fetchOutletList() {
    if (!employee) return
    const { data } = await supabase
      .from('employee_outlets')
      .select('outlet_id, outlets(id, nama, lat, lng)')
      .eq('employee_id', employee.id)
    const list = (data || []).map(r => r.outlets).filter(Boolean)
    setOutletList(list)
    if (list.length > 0 && !selectedOutletAbsen) setSelectedOutletAbsen(list[0].id)
  }

  async function fetchTodayRecord() {
    if (!employee) return
    const todayStr = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('attendance').select('*')
      .eq('employee_id', employee.id).eq('tanggal', todayStr)
      .order('created_at', { ascending: false }).limit(1).single()
    setTodayRecord(data || null)
  }

  async function fetchUpcomingShifts() {
    if (!employee) return
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    const in3days = new Date(now)
    in3days.setDate(now.getDate() + 3)
    const in3str = in3days.toISOString().split('T')[0]
    const { data } = await supabase.from('schedules')
      .select('*')
      .eq('employee_id', employee.id)
      .gte('tanggal', todayStr).lte('tanggal', in3str)
      .order('tanggal')
    const schedules = data || []
    const outletIds = [...new Set(schedules.map(s => s.outlet_id))]
    let outletMap = {}
    if (outletIds.length > 0) {
      const { data: od } = await supabase.from('outlets').select('id, nama').in('id', outletIds)
      ;(od || []).forEach(o => { outletMap[o.id] = o.nama })
    }
    setUpcomingShifts(schedules.map(s => ({ ...s, outletNama: outletMap[s.outlet_id] || '' })))
    if (Object.keys(shiftLabels).length === 0) {
      const { data: sd } = await supabase.from('shift_settings').select('*')
      const map = {}
      ;(sd || []).forEach(s => { map[s.kode] = s.kode === 'full' ? s.nama : `${s.nama} (${s.jam_mulai}-${s.jam_selesai})` })
      setShiftLabels(map)
      setEssShifts(sd || [])
    }
  }

  async function fetchAllData() {
    if (!employee) return
    const from = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const to = `${tahun}-${String(bulan).padStart(2,'0')}-${lastDay}`

    const [schRes, attRes, payRes, perfRes, pointRes, loanRes, leaveRes, outletRes, companyRes] = await Promise.all([
      supabase.from('schedules').select('*, outlets(nama)').eq('employee_id', employee.id).gte('tanggal', from).lte('tanggal', to).order('tanggal'),
      supabase.from('attendance').select('*, outlets(nama)').eq('employee_id', employee.id).gte('tanggal', from).lte('tanggal', to).order('tanggal'),
      supabase.from('payroll').select('*, outlets(nama)').eq('employee_id', employee.id).eq('bulan', bulan).eq('tahun', tahun),
      supabase.from('performance_reviews').select('*, performance_scores(point_id, nilai)').eq('employee_id', employee.id).eq('bulan', bulan).eq('tahun', tahun),
      supabase.from('performance_points').select('*'),
      supabase.from('loans').select('*').eq('employee_id', employee.id).order('created_at', { ascending: false }),
      supabase.from('leave_requests').select('*').eq('employee_id', employee.id).order('created_at', { ascending: false }),
      supabase.from('outlets').select('id, nama'),
      supabase.from('company_info').select('*').limit(1).single(),
    ])

    setSchedules(schRes.data || [])
    fetchUpcomingShifts()
    setAttendance(attRes.data || [])
    setPayrolls(payRes.data || [])
    setPerformance(perfRes.data || [])
    setPerfPoints(pointRes.data || [])
    setLoans(loanRes.data || [])
    setLeaves(leaveRes.data || [])
    setOutlets(outletRes.data || [])
    setCompanyInfo(companyRes.data || null)
    setProfileForm({ no_hp: employee.no_hp || '', email: employee.email || '' })
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => { videoRef.current.play(); setCameraReady(true) }
      }
    } catch (e) { setError('Kamera tidak dapat diakses: ' + e.message); setShowCamera(false) }
  }

  function stopCamera() {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    setCameraReady(false)
  }

  function ambilFoto() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      setFotoBlob(blob)
      setFotoPreview(canvas.toDataURL('image/jpeg', 0.8))
    }, 'image/jpeg', 0.8)
    stopCamera(); setShowCamera(false)
  }

  function ulangFoto() {
    setFotoBlob(null); setFotoPreview(null)
    setShowCamera(true); setTimeout(() => startCamera(), 100)
  }

  async function uploadFoto(type) {
    if (!fotoBlob) return null
    const todayStr = new Date().toISOString().split('T')[0]
    const fileName = `${employee.id}_${type}_${todayStr}_${Date.now()}.jpg`
    const { error } = await supabase.storage.from('attendance-photos')
      .upload(fileName, fotoBlob, { contentType: 'image/jpeg', upsert: true })
    if (error) return null
    const { data: urlData } = supabase.storage.from('attendance-photos').getPublicUrl(fileName)
    return urlData.publicUrl
  }

  async function mulaiAbsen(tipeAbsen) {
    if (!selectedOutletAbsen) { setError('Pilih outlet tempat bertugas.'); return }
    const outletData = outletList.find(o => o.id === selectedOutletAbsen)
    if (!outletData?.lat || !outletData?.lng) { setError('Koordinat outlet belum diatur. Hubungi HR.'); return }
    setError(''); setJarakInfo(null); setLocating(true)
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          e => reject(new Error('Izin lokasi ditolak. Aktifkan GPS.')),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        )
      })
      const jarak = Math.round(hitungJarak(pos.lat, pos.lng, parseFloat(outletData.lat), parseFloat(outletData.lng)))
      setJarakInfo({ jarak, outlet: outletData.nama })
      if (jarak > RADIUS_METER) {
        setError(`Anda berada ${jarak}m dari ${outletData.nama}. Maksimal ${RADIUS_METER}m.`)
        setLocating(false); return
      }
      const now = new Date()
      const todayStr = now.toISOString().split('T')[0]

      if (tipeAbsen === 'checkout') {
        // Cari record terbuka: hari ini dulu, lalu mundur 3 hari
        let rec = null
        const { data: today_rec } = await supabase.from('attendance')
          .select('id, waktu_masuk, waktu_keluar, tanggal').eq('employee_id', employee.id)
          .eq('tanggal', todayStr).eq('outlet_id', selectedOutletAbsen).maybeSingle()
        if (today_rec?.waktu_masuk && !today_rec.waktu_keluar) {
          rec = today_rec
        } else {
          const tigaHari = new Date(now); tigaHari.setDate(tigaHari.getDate() - 3)
          const dariStr = tigaHari.toISOString().split('T')[0]
          const { data: open } = await supabase.from('attendance')
            .select('id, waktu_masuk, waktu_keluar, tanggal').eq('employee_id', employee.id)
            .eq('outlet_id', selectedOutletAbsen).gte('tanggal', dariStr).lt('tanggal', todayStr)
            .is('waktu_keluar', null).not('waktu_masuk', 'is', null)
            .order('tanggal', { ascending: false }).limit(1)
          rec = open && open[0] ? open[0] : null
        }
        if (!rec) { setError('Tidak ada absen masuk yang perlu di-checkout. Lakukan Absen Masuk dulu.'); setLocating(false); return }
        setPendingGps({ lat: pos.lat, lng: pos.lng, jarak, outletData, existing: rec })
        setCaptureType('checkout')
      } else {
        const { data: rec } = await supabase.from('attendance')
          .select('id, waktu_masuk').eq('employee_id', employee.id)
          .eq('tanggal', todayStr).eq('outlet_id', selectedOutletAbsen).maybeSingle()
        if (rec?.waktu_masuk) { setError('Anda sudah absen masuk hari ini di outlet ini.'); setLocating(false); return }
        setPendingGps({ lat: pos.lat, lng: pos.lng, jarak, outletData, existing: null })
        setCaptureType('checkin')
      }
      setFotoBlob(null); setFotoPreview(null)
      setShowCamera(true); setTimeout(() => startCamera(), 100)
    } catch (e) { setError(e.message) }
    setLocating(false)
  }

  async function prosesAbsen() {
    if (!pendingGps) return
    setUploadingFoto(true)
    const { lat, lng, existing } = pendingGps
    const todayStr = new Date().toISOString().split('T')[0]
    try {
      const fotoUrl = await uploadFoto(captureType)
      if (captureType === 'checkout' && existing) {
        await supabase.from('attendance').update({
          waktu_keluar: new Date().toISOString(), lat_keluar: lat, lng_keluar: lng, foto_keluar: fotoUrl,
        }).eq('id', existing.id)
      } else {
        const sched = upcomingShifts.find(s => s.tanggal === todayStr && s.outlet_id === selectedOutletAbsen)
        const shiftKode = sched?.shift || employee.default_shift || 'full'
        const now = new Date()
        let menitTerlambat = 0, potonganTerlambat = 0
        const sd = (essShifts || []).find(s => s.kode === shiftKode)
        if (sd) {
          const [jh, jm] = (sd.jam_mulai || '08:00').split(':').map(Number)
          const batas = new Date(now); batas.setHours(jh, jm + (sd.toleransi_menit || 0), 0, 0)
          const menit = Math.round((now - batas) / 60000)
          if (menit > 0) {
            menitTerlambat = menit
            potonganTerlambat = Math.ceil(menit / (sd.interval_menit || 30)) * (sd.potongan_per_interval || 0)
            const maks = sd.potongan_maks_harian || 0
            if (maks > 0 && potonganTerlambat > maks) potonganTerlambat = maks
          }
        }
        await supabase.from('attendance').insert({
          employee_id: employee.id, outlet_id: selectedOutletAbsen, tanggal: todayStr,
          waktu_masuk: new Date().toISOString(), lat_masuk: lat, lng_masuk: lng,
          foto_masuk: fotoUrl, status: 'hadir',
          shift: shiftKode, menit_terlambat: menitTerlambat, potongan_terlambat: potonganTerlambat,
        })
      }
      setSuccess(captureType === 'checkin' ? '✓ Absen masuk berhasil!' : '✓ Absen pulang berhasil!')
      setFotoBlob(null); setFotoPreview(null); setPendingGps(null)
      fetchTodayRecord(); fetchAllData()
    } catch (e) { setError(e.message) }
    setUploadingFoto(false)
  }

  function handleLogin(emp) { setEmployee(emp) }

  async function handleLogout() {
    await supabase.auth.signOut()
    setEmployee(null)
    setTab('beranda')
  }

  async function ajukanLoan() {
    if (!loanForm.jumlah) { setError('Jumlah wajib diisi.'); return }
    setError(''); setSaving(true)
    const { error } = await supabase.from('loans').insert({
      employee_id: employee.id,
      jenis: loanForm.jenis,
      jumlah: Number(loanForm.jumlah),
      jumlah_bulan: loanForm.jenis === 'kasbon' ? 1 : Number(loanForm.jumlah_bulan),
      keterangan: loanForm.keterangan,
      tgl_pengajuan: today.toISOString().split('T')[0],
      status: 'pending',
    })
    if (error) { setError('Gagal: ' + error.message); setSaving(false); return }
    setSuccess('Pengajuan berhasil dikirim! Menunggu persetujuan HR.')
    setShowLoanForm(false)
    setLoanForm({ jenis: 'cicilan', jumlah: '', jumlah_bulan: 1, keterangan: '' })
    setSaving(false); fetchAllData()
  }

  async function ajukanLeave() {
    if (!leaveForm.tgl_mulai || !leaveForm.tgl_selesai) { setError('Tanggal wajib diisi.'); return }
    setError(''); setSaving(true)
    const { error } = await supabase.from('leave_requests').insert({
      employee_id: employee.id, ...leaveForm, status: 'pending',
    })
    if (error) { setError('Gagal: ' + error.message); setSaving(false); return }
    setSuccess('Pengajuan cuti/izin berhasil dikirim!')
    setShowLeaveForm(false)
    setLeaveForm({ jenis: 'cuti', tgl_mulai: '', tgl_selesai: '', keterangan: '' })
    setSaving(false); fetchAllData()
  }

  async function simpanProfil() {
    setSaving(true); setError('')
    const { error } = await supabase.from('employees').update({
      no_hp: profileForm.no_hp, email: profileForm.email,
    }).eq('id', employee.id)
    if (error) { setError('Gagal: ' + error.message); setSaving(false); return }
    setEmployee({ ...employee, no_hp: profileForm.no_hp, email: profileForm.email })
    setSuccess('Data profil berhasil diperbarui!')
    setEditProfile(false); setSaving(false)
  }

  function hitungTotal(p) {
    if (!p) return 0
    if (p.tipe === 'gaji') {
      const masuk = (p.gaji_pokok||0)+(p.tunjangan_makan||0)+(p.tunjangan_transport||0)+
        (p.tunjangan_telephone||0)+(p.tunjangan_jabatan_pj||0)+(p.tunjangan_jabatan_lain||0)+(p.sip||0)+(p.lembur||0)
      const potong = (p.potongan_bpjs||0)+(p.potongan_cicilan||0)+(p.potongan_kasbon||0)+
        (p.potongan_absensi||0)+(p.potongan_arisan||0)+(p.potongan_lainnya||0)
      return masuk - potong
    }
    return (p.jasa_pelayanan||0)+(p.bonus_outlet||0)-(p.potongan_lainnya||0)
  }

  function cetakSlip(p) {
    const total = hitungTotal(p)
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Slip Gaji</title>
    <style>*{margin:0;padding:0;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}body{font-family:Arial,sans-serif;padding:20px}
    .header{background:linear-gradient(135deg,#1e40af,#2563eb);color:white;padding:20px;border-radius:8px 8px 0 0}
    .body{border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:16px}
    table{width:100%;border-collapse:collapse}td{padding:6px 8px;font-size:13px}
    .section{background:#f0f9ff;font-weight:600;font-size:11px;text-transform:uppercase;color:#1e40af}
    .total{background:linear-gradient(135deg,#065f46,#059669);color:white;padding:14px;border-radius:8px;margin-top:12px}
    .no-print{text-align:center;margin-bottom:16px}
    @media print{.no-print{display:none}}</style></head>
    <body>
    <div class="no-print"><button onclick="window.print()" style="background:#2563eb;color:white;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px">🖨 Print / Save PDF</button></div>
    <div class="kop" style="display:flex;align-items:center;gap:16px;padding-bottom:12px;border-bottom:3px solid #1e40af;margin-bottom:16px">
      ${companyInfo?.logo_url ? `<img src="${companyInfo.logo_url}" style="height:70px;object-fit:contain" />` : ''}
      <div style="flex:1">
        <div style="font-size:20px;font-weight:700;color:#1e40af">${companyInfo?.nama || 'Klinik'}</div>
        ${companyInfo?.alamat ? `<div style="font-size:11px;color:#4b5563;margin-top:2px">${companyInfo.alamat}</div>` : ''}
        <div style="font-size:11px;color:#4b5563">${companyInfo?.telepon ? `Telp: ${companyInfo.telepon}` : ''}${companyInfo?.telepon && companyInfo?.email ? ' · ' : ''}${companyInfo?.email || ''}</div>
      </div>
    </div>
    <div class="header">
      <div style="font-size:18px;font-weight:700">${p.outlets?.nama || 'Klinik'}</div>
      <div style="font-size:12px;opacity:0.8">Slip ${p.tipe === 'gaji' ? 'Gaji Bulanan' : 'Jasa Pelayanan'} · ${BULAN_NAMES[bulan-1]} ${tahun}</div>
    </div>
    <div class="body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;padding:12px;background:#f8fafc;border-radius:6px">
        <div><div style="font-size:10px;color:#6b7280">NAMA</div><div style="font-size:14px;font-weight:600">${employee.nama}</div></div>
        <div><div style="font-size:10px;color:#6b7280">NIK</div><div style="font-size:13px;font-family:monospace">${employee.nik}</div></div>
        <div><div style="font-size:10px;color:#6b7280">JABATAN</div><div style="font-size:13px">${employee.jabatan}</div></div>
        <div><div style="font-size:10px;color:#6b7280">PERIODE</div><div style="font-size:13px">${BULAN_NAMES[bulan-1]} ${tahun}</div></div>
      </div>
      <table>
        ${p.tipe === 'gaji' ? `
        <tr><td colspan="2" class="section">Penghasilan</td></tr>
        ${p.gaji_pokok > 0 ? `<tr><td>Gaji Pokok</td><td style="text-align:right">Rp ${FMT(p.gaji_pokok)}</td></tr>` : ''}
        ${p.sip > 0 ? `<tr><td>SIP</td><td style="text-align:right">Rp ${FMT(p.sip)}</td></tr>` : ''}
        ${p.tunjangan_makan > 0 ? `<tr><td>Tunjangan Makan</td><td style="text-align:right">Rp ${FMT(p.tunjangan_makan)}</td></tr>` : ''}
        ${p.tunjangan_transport > 0 ? `<tr><td>Tunjangan Transport</td><td style="text-align:right">Rp ${FMT(p.tunjangan_transport)}</td></tr>` : ''}
        ${p.tunjangan_telephone > 0 ? `<tr><td>Tunjangan Telephone</td><td style="text-align:right">Rp ${FMT(p.tunjangan_telephone)}</td></tr>` : ''}
        ${p.tunjangan_jabatan_pj > 0 ? `<tr><td>Tunjangan Jabatan PJ</td><td style="text-align:right">Rp ${FMT(p.tunjangan_jabatan_pj)}</td></tr>` : ''}
        ${p.tunjangan_jabatan_lain > 0 ? `<tr><td>Tunjangan Jabatan Lain</td><td style="text-align:right">Rp ${FMT(p.tunjangan_jabatan_lain)}</td></tr>` : ''}
        ${p.lembur > 0 ? `<tr><td>Lembur</td><td style="text-align:right">Rp ${FMT(p.lembur)}</td></tr>` : ''}
        <tr><td colspan="2" class="section" style="background:#fff5f5;color:#dc2626">Potongan</td></tr>
        ${(p.potongan_bpjs_kes ?? 0) > 0 ? `<tr><td>BPJS Kesehatan</td><td style="text-align:right;color:#dc2626">- Rp ${FMT(p.potongan_bpjs_kes)}</td></tr>` : ''}
        ${(p.potongan_bpjs_naker ?? 0) > 0 ? `<tr><td>BPJS Ketenagakerjaan</td><td style="text-align:right;color:#dc2626">- Rp ${FMT(p.potongan_bpjs_naker)}</td></tr>` : ''}
        ${(!p.potongan_bpjs_kes && !p.potongan_bpjs_naker && p.potongan_bpjs > 0) ? `<tr><td>BPJS</td><td style="text-align:right;color:#dc2626">- Rp ${FMT(p.potongan_bpjs)}</td></tr>` : ''}
        ${(p.potongan_pph21 ?? 0) > 0 ? `<tr><td>PPh 21</td><td style="text-align:right;color:#dc2626">- Rp ${FMT(p.potongan_pph21)}</td></tr>` : ''}
        ${p.potongan_cicilan > 0 ? `<tr><td>Cicilan</td><td style="text-align:right;color:#dc2626">- Rp ${FMT(p.potongan_cicilan)}</td></tr>` : ''}
        ${p.potongan_kasbon > 0 ? `<tr><td>Kasbon</td><td style="text-align:right;color:#dc2626">- Rp ${FMT(p.potongan_kasbon)}</td></tr>` : ''}
        ${p.potongan_absensi > 0 ? `<tr><td>Potongan Absensi</td><td style="text-align:right;color:#dc2626">- Rp ${FMT(p.potongan_absensi)}</td></tr>` : ''}
        ${p.potongan_arisan > 0 ? `<tr><td>Arisan</td><td style="text-align:right;color:#dc2626">- Rp ${FMT(p.potongan_arisan)}</td></tr>` : ''}
        ${p.potongan_lainnya > 0 ? `<tr><td>Potongan Lainnya</td><td style="text-align:right;color:#dc2626">- Rp ${FMT(p.potongan_lainnya)}</td></tr>` : ''}
        ` : `
        <tr><td colspan="2" class="section">Jasa Pelayanan</td></tr>
        ${p.jasa_pelayanan > 0 ? `<tr><td>Jasa Pelayanan</td><td style="text-align:right">Rp ${FMT(p.jasa_pelayanan)}</td></tr>` : ''}
        ${p.bonus_outlet > 0 ? `<tr><td>Bonus Outlet</td><td style="text-align:right">Rp ${FMT(p.bonus_outlet)}</td></tr>` : ''}
        ${p.potongan_lainnya > 0 ? `<tr><td>Potongan</td><td style="text-align:right;color:#dc2626">- Rp ${FMT(p.potongan_lainnya)}</td></tr>` : ''}
        `}
      </table>
      <div class="total">
        <div style="font-size:12px;opacity:0.8">Total Bersih</div>
        <div style="font-size:22px;font-weight:700">Rp ${FMT(total)}</div>
      </div>
      ${p.status === 'lunas' ? `
      <div style="display:flex;justify-content:flex-end;margin-top:30px;padding:0 10px">
        <div style="text-align:center;min-width:240px">
          <div style="font-size:12px;color:#374151">${p.tgl_lunas ? new Date(p.tgl_lunas).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</div>
          <div style="position:relative;display:inline-block;margin:4px 0">
            ${companyInfo?.logo_url ? `<img src="${companyInfo.logo_url}" style="height:95px;object-fit:contain;opacity:0.18;position:absolute;left:20%;top:50%;transform:translate(-50%,-50%);z-index:0" />` : ''}
            ${companyInfo?.ttd_direktur ? `<img src="${companyInfo.ttd_direktur}" style="height:75px;object-fit:contain;position:relative;z-index:1" />` : '<div style="height:75px"></div>'}
          </div>
          <div style="font-size:12px;font-weight:600;border-top:1px solid #374151;padding-top:4px">${companyInfo?.direktur || p.lunas_nama || ''}</div>
          <div style="font-size:11px;color:#6b7280">Direktur</div>
        </div>
      </div>
      ` : ''}
    </div></body></html>`
    const win = window.open('', '_blank', 'width=600,height=700')
    win.document.write(html)
    win.document.close()
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-400">Memuat...</p>
        </div>
      </div>
    )
  }
  if (!employee) return <ESSLogin onLogin={handleLogin} />

  const gaji = payrolls.find(p => p.tipe === 'gaji')
  const jasa = payrolls.find(p => p.tipe === 'jasa')
  const hadirCount = attendance.filter(a => a.status === 'hadir').length
  const review = performance[0]
  const reviewScores = review ? Object.fromEntries((review.performance_scores || []).map(s => [s.point_id, s.nilai])) : {}
  const nilaiAkhir = hitungNilaiAkhir(reviewScores, perfPoints)

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">🏥</span>
          <div>
            <p className="text-sm font-semibold text-gray-900">{employee.nama}</p>
            <p className="text-xs text-gray-500">{employee.jabatan}</p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="text-xs text-gray-500 hover:text-red-500 border border-gray-200 px-3 py-1.5 rounded-lg">
          Keluar
        </button>
      </nav>

      <div className="bg-white border-b border-gray-200 px-4 overflow-x-auto">
        <div className="flex gap-1 min-w-max py-1">
          {[
            ['beranda','🏠 Beranda'],
            ['jadwal',`📅 Jadwal${upcomingShifts.length ? ` (${upcomingShifts.length})` : ''}`],
            ['tukar','🔄 Tukar Shift'],
            ['absensi','✓ Absensi'],
            ['gaji','💰 Gaji'],
            ['performance','⭐ Performance'],
            ['pengajuan','📝 Pengajuan'],
            ['dokumen','📁 Dokumen'],
            ['profil','👤 Profil'],
          ].map(([val, label]) => (
            <button key={val} onClick={() => { setTab(val); setSuccess(''); setError('') }}
              className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                tab === val ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {tab !== 'profil' && tab !== 'pengajuan' && tab !== 'dokumen' && (
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => { if(bulan===1){setBulan(12);setTahun(t=>t-1)}else setBulan(b=>b-1) }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-100">←</button>
            <span className="font-medium text-gray-800 text-sm">{BULAN_NAMES[bulan-1]} {tahun}</span>
            <button onClick={() => { if(bulan===12){setBulan(1);setTahun(t=>t+1)}else setBulan(b=>b+1) }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-100">→</button>
          </div>
        )}

        {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{success}</div>}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}

        {tab === 'beranda' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 text-white">
              <p className="text-blue-200 text-sm">Selamat datang,</p>
              <p className="text-xl font-bold mt-0.5">{employee.nama}</p>
              <p className="text-blue-200 text-sm mt-1">{employee.jabatan} · {BULAN_NAMES[bulan-1]} {tahun}</p>
            </div>

            {/* Pengingat shift 3 hari ke depan */}
            {upcomingShifts.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🔔</span>
                  <p className="text-sm font-semibold text-amber-800">Pengingat Jadwal Piket</p>
                </div>
                <div className="space-y-2">
                  {upcomingShifts.map(s => {
                    const tgl = new Date(s.tanggal)
                    const now = new Date(); now.setHours(0,0,0,0)
                    const diffDays = Math.round((tgl - now) / (1000*60*60*24))
                    const labelHari = diffDays === 0 ? 'Hari ini' : diffDays === 1 ? 'Besok' : `${diffDays} hari lagi`
                    return (
                      <div key={s.id} className="bg-white rounded-lg px-3 py-2 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {tgl.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </p>
                          <p className="text-xs text-gray-500">{s.outletNama} · {s.role_slot}{s.is_temporary ? ' · 🔀 Sementara' : ''}</p>
                          {s.shift && shiftLabels[s.shift] && <p className="text-xs text-blue-600 mt-0.5">🕐 {shiftLabels[s.shift]}</p>}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${diffDays===0?'bg-red-100 text-red-700':diffDays===1?'bg-orange-100 text-orange-700':'bg-amber-100 text-amber-700'}`}>
                          {labelHari}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">Jadwal Piket</p>
                <p className="text-2xl font-semibold text-blue-600">{schedules.length}</p>
                <p className="text-xs text-gray-400">hari bulan ini</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">Kehadiran</p>
                <p className="text-2xl font-semibold text-green-600">{hadirCount}</p>
                <p className="text-xs text-gray-400">hari hadir</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">Gaji Bersih</p>
                <p className="text-lg font-semibold text-gray-900">{gaji ? `Rp ${FMT(hitungTotal(gaji))}` : '—'}</p>
                <p className="text-xs text-gray-400">tgl 1</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">Nilai Performance</p>
                {nilaiAkhir
                  ? <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${NILAI_COLOR[nilaiAkhir]}`}>{nilaiAkhir}</span>
                  : <p className="text-sm text-gray-400">Belum dinilai</p>
                }
              </div>
            </div>
            {loans.filter(l => l.status === 'pending').length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-sm font-medium text-yellow-800">⏳ Pengajuan Menunggu</p>
                <p className="text-xs text-yellow-600 mt-1">
                  {loans.filter(l => l.status === 'pending').length} pengajuan cicilan/kasbon menunggu persetujuan HR.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === 'jadwal' && (
          <ESSJadwal employee={employee} bulan={bulan} tahun={tahun} schedules={schedules} />
        )}

        {tab === 'absensi' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-medium text-gray-700 mb-4">Absensi Hari Ini</p>
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-600 block mb-1">Pilih Outlet</label>
                <select value={selectedOutletAbsen} onChange={e => setSelectedOutletAbsen(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">-- Pilih outlet --</option>
                  {outletList.map(o => <option key={o.id} value={o.id}>{o.nama}</option>)}
                </select>
              </div>
              {todayRecord && (
                <div className={`rounded-lg px-4 py-3 mb-4 text-sm ${!todayRecord.waktu_keluar
                  ? 'bg-yellow-50 border border-yellow-200 text-yellow-700'
                  : 'bg-green-50 border border-green-200 text-green-700'}`}>
                  {!todayRecord.waktu_keluar
                    ? `Check-in pukul ${new Date(todayRecord.waktu_masuk).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}`
                    : `Selesai. Check-out pukul ${new Date(todayRecord.waktu_keluar).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}`}
                </div>
              )}
              {jarakInfo && (
                <div className={`rounded-lg px-4 py-3 mb-4 text-sm ${jarakInfo.jarak <= RADIUS_METER
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  Jarak dari outlet: <strong>{jarakInfo.jarak}m</strong>
                </div>
              )}
              {showCamera && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    Ambil Foto {captureType === 'checkin' ? 'Check-in' : 'Check-out'}
                  </p>
                  <div className="relative bg-black rounded-xl overflow-hidden">
                    <video ref={videoRef} autoPlay playsInline muted
                      className="w-full rounded-xl" style={{ transform: 'scaleX(-1)' }} />
                    {!cameraReady && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 text-white text-sm">
                        Membuka kamera...
                      </div>
                    )}
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { stopCamera(); setShowCamera(false) }}
                      className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm">Batal</button>
                    <button onClick={ambilFoto} disabled={!cameraReady}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium">
                      📸 Ambil Foto
                    </button>
                  </div>
                </div>
              )}
              {fotoPreview && !showCamera && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-600 mb-2">Foto {captureType === 'checkin' ? 'Check-in' : 'Check-out'}:</p>
                  <div className="relative inline-block">
                    <img src={fotoPreview} alt="Foto absen" className="w-40 h-32 object-cover rounded-lg border border-gray-200" />
                    <button onClick={ulangFoto}
                      className="absolute top-1 right-1 bg-black bg-opacity-50 text-white text-xs px-2 py-0.5 rounded">Ulangi</button>
                  </div>
                  <button onClick={prosesAbsen} disabled={uploadingFoto}
                    className="mt-3 w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-medium transition-colors block">
                    {uploadingFoto ? 'Menyimpan...' : `✓ Konfirmasi ${captureType === 'checkin' ? 'Check-in' : 'Check-out'}`}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button onClick={() => mulaiAbsen('checkin')} disabled={locating || showCamera || uploadingFoto}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                  {locating ? '...' : '📥 Absen Masuk'}
                </button>
                <button onClick={() => mulaiAbsen('checkout')} disabled={locating || showCamera || uploadingFoto}
                  className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                  {locating ? '...' : '📤 Absen Pulang'}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {attendance.map(a => (
                <div key={a.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(a.tanggal).toLocaleDateString('id-ID',{weekday:'short',day:'2-digit',month:'short'})}
                      </p>
                      <p className="text-xs text-gray-500">{a.outlets?.nama}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      a.status==='hadir' ? 'bg-green-100 text-green-700' :
                      a.status==='alpha' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'}`}>{a.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'tukar' && (
          <ESSTukarShift employee={employee} bulan={bulan} tahun={tahun} />
        )}

        {tab === 'gaji' && (
          <div className="space-y-4">
            {[gaji, jasa].filter(Boolean).filter(p => p.status === 'lunas').length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-4xl mb-3">💰</p>
                <p className="text-gray-500 text-sm">Slip gaji belum tersedia.</p>
                <p className="text-gray-400 text-xs mt-1">Slip gaji akan muncul setelah pembayaran selesai diproses (status lunas).</p>
              </div>
            )}
            {[gaji, jasa].filter(Boolean).filter(p => p.status === 'lunas').map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex justify-between items-center">
                  <div>
                    <p className="text-white font-medium text-sm">{p.tipe === 'gaji' ? 'Gaji Bulanan' : 'Jasa Pelayanan'}</p>
                    <p className="text-blue-200 text-xs">{p.outlets?.nama} · {BULAN_NAMES[bulan-1]} {tahun}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    p.status==='lunas'?'bg-green-100 text-green-700':
                    p.status==='proses'?'bg-yellow-100 text-yellow-700':
                    'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                </div>
                <div className="px-4 py-3">
                  <div className="text-center py-2 mb-3">
                    <p className="text-xs text-gray-500">Total Bersih</p>
                    <p className="text-2xl font-bold text-gray-900">Rp {FMT(hitungTotal(p))}</p>
                  </div>

                  {/* Toggle detail */}
                  <button onClick={() => setExpandSlip(expandSlip === p.id ? null : p.id)}
                    className="w-full border border-gray-200 text-gray-600 hover:bg-gray-50 py-2 rounded-lg text-sm mb-2">
                    {expandSlip === p.id ? '▲ Sembunyikan Detail' : '▼ Lihat Detail'}
                  </button>

                  {expandSlip === p.id && (
                    <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs space-y-1">
                      {p.tipe === 'gaji' ? (
                        <>
                          <p className="font-semibold text-gray-600 mb-1">Penghasilan</p>
                          {p.gaji_pokok > 0 && <div className="flex justify-between"><span>Gaji Pokok</span><span>Rp {FMT(p.gaji_pokok)}</span></div>}
                          {p.sip > 0 && <div className="flex justify-between"><span>SIP</span><span>Rp {FMT(p.sip)}</span></div>}
                          {p.tunjangan_makan > 0 && <div className="flex justify-between"><span>Tj. Makan</span><span>Rp {FMT(p.tunjangan_makan)}</span></div>}
                          {p.tunjangan_transport > 0 && <div className="flex justify-between"><span>Tj. Transport</span><span>Rp {FMT(p.tunjangan_transport)}</span></div>}
                          {p.tunjangan_telephone > 0 && <div className="flex justify-between"><span>Tj. Telephone</span><span>Rp {FMT(p.tunjangan_telephone)}</span></div>}
                          {p.tunjangan_jabatan_pj > 0 && <div className="flex justify-between"><span>Tj. Jabatan PJ</span><span>Rp {FMT(p.tunjangan_jabatan_pj)}</span></div>}
                          {p.tunjangan_jabatan_lain > 0 && <div className="flex justify-between"><span>Tj. Jabatan Lain</span><span>Rp {FMT(p.tunjangan_jabatan_lain)}</span></div>}
                          {p.lembur > 0 && <div className="flex justify-between"><span>Lembur</span><span>Rp {FMT(p.lembur)}</span></div>}
                          {(p.potongan_bpjs > 0 || p.potongan_cicilan > 0 || p.potongan_kasbon > 0 || p.potongan_absensi > 0 || p.potongan_arisan > 0) && (
                            <>
                              <div className="border-t border-gray-200 pt-1 mt-1">
                                <p className="font-semibold text-red-500 mb-1">Potongan</p>
                              </div>
                              {p.potongan_bpjs > 0 && <div className="flex justify-between text-red-500"><span>BPJS</span><span>- Rp {FMT(p.potongan_bpjs)}</span></div>}
                              {p.potongan_cicilan > 0 && <div className="flex justify-between text-red-500"><span>Cicilan</span><span>- Rp {FMT(p.potongan_cicilan)}</span></div>}
                              {p.potongan_kasbon > 0 && <div className="flex justify-between text-red-500"><span>Kasbon</span><span>- Rp {FMT(p.potongan_kasbon)}</span></div>}
                              {p.potongan_absensi > 0 && <div className="flex justify-between text-red-500"><span>Pot. Absensi</span><span>- Rp {FMT(p.potongan_absensi)}</span></div>}
                              {p.potongan_arisan > 0 && <div className="flex justify-between text-red-500"><span>Arisan</span><span>- Rp {FMT(p.potongan_arisan)}</span></div>}
                            </>
                          )}
                          <div className="border-t border-gray-300 pt-1 mt-1 flex justify-between font-semibold text-gray-800">
                            <span>Total Bersih</span><span>Rp {FMT(hitungTotal(p))}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          {p.jasa_pelayanan > 0 && <div className="flex justify-between"><span>Jasa Pelayanan</span><span>Rp {FMT(p.jasa_pelayanan)}</span></div>}
                          {p.bonus_outlet > 0 && <div className="flex justify-between"><span>Bonus Outlet</span><span>Rp {FMT(p.bonus_outlet)}</span></div>}
                          {p.potongan_lainnya > 0 && <div className="flex justify-between text-red-500"><span>Potongan</span><span>- Rp {FMT(p.potongan_lainnya)}</span></div>}
                          <div className="border-t border-gray-300 pt-1 mt-1 flex justify-between font-semibold text-gray-800">
                            <span>Total</span><span>Rp {FMT(hitungTotal(p))}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <button onClick={() => cetakSlip(p)}
                    className="w-full border border-blue-200 text-blue-600 hover:bg-blue-50 py-2 rounded-lg text-sm font-medium">
                    🖨 Cetak / Download PDF
                  </button>
                </div>
              </div>
            ))}
            {payrolls.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                Belum ada data gaji bulan ini.
              </div>
            )}
          </div>
        )}

        {tab === 'performance' && (
          <div>
            {!review ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                Belum ada penilaian performance bulan ini.
              </div>
            ) : (
              <div className="space-y-4">
                {nilaiAkhir && (
                  <div className={`rounded-xl p-5 border ${NILAI_COLOR[nilaiAkhir]}`}>
                    <p className="text-xs font-medium opacity-70 mb-1">Nilai Akhir {BULAN_NAMES[bulan-1]} {tahun}</p>
                    <p className="text-2xl font-bold">{nilaiAkhir}</p>
                    {review.reviewer && <p className="text-xs opacity-70 mt-1">Dinilai oleh: {review.reviewer}</p>}
                  </div>
                )}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-700">Detail Penilaian</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {(review.performance_scores || []).map(score => {
                      const pt = perfPoints.find(p => p.id === score.point_id)
                      return pt ? (
                        <div key={score.point_id} className="px-4 py-3 flex justify-between items-start gap-3">
                          <p className="text-sm text-gray-700 flex-1">{pt.deskripsi}</p>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${NILAI_COLOR[score.nilai]}`}>
                            {score.nilai}
                          </span>
                        </div>
                      ) : null
                    })}
                  </div>
                </div>
                {review.catatan && (
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-medium text-gray-500 mb-1">Catatan dari HR</p>
                    <p className="text-sm text-gray-700">{review.catatan}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'pengajuan' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setShowLoanForm(!showLoanForm); setShowLeaveForm(false) }}
                className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-medium">
                💰 Ajukan Cicilan/Kasbon
              </button>
              <button onClick={() => { setShowLeaveForm(!showLeaveForm); setShowLoanForm(false) }}
                className="bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl text-sm font-medium">
                📅 Ajukan Cuti/Izin
              </button>
            </div>
            {showLoanForm && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">Form Pengajuan</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Jenis</label>
                    <select value={loanForm.jenis} onChange={e => setLoanForm({...loanForm, jenis: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="cicilan">Cicilan (diangsur)</option>
                      <option value="kasbon">Kasbon (potong bulan depan)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Jumlah (Rp)</label>
                    <input type="number" placeholder="Contoh: 5000000"
                      value={loanForm.jumlah} onChange={e => setLoanForm({...loanForm, jumlah: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  {loanForm.jenis === 'cicilan' && (
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Jumlah Bulan Cicilan</label>
                      <input type="number" min="1" placeholder="Contoh: 12"
                        value={loanForm.jumlah_bulan} onChange={e => setLoanForm({...loanForm, jumlah_bulan: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      {loanForm.jumlah && loanForm.jumlah_bulan && (
                        <p className="text-xs text-blue-600 mt-1">
                          Cicilan/bulan: Rp {FMT(Math.ceil(Number(loanForm.jumlah) / Number(loanForm.jumlah_bulan)))}
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Keterangan</label>
                    <textarea rows={2} placeholder="Alasan pengajuan..."
                      value={loanForm.keterangan} onChange={e => setLoanForm({...loanForm, keterangan: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>
                  <button onClick={ajukanLoan} disabled={saving}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                    {saving ? 'Mengirim...' : 'Kirim Pengajuan'}
                  </button>
                </div>
              </div>
            )}
            {showLeaveForm && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">Form Cuti / Izin</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Jenis</label>
                    <select value={leaveForm.jenis} onChange={e => setLeaveForm({...leaveForm, jenis: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="cuti">Cuti</option>
                      <option value="izin">Izin</option>
                      <option value="sakit">Sakit</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Dari Tanggal</label>
                      <input type="date" value={leaveForm.tgl_mulai}
                        onChange={e => setLeaveForm({...leaveForm, tgl_mulai: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Sampai Tanggal</label>
                      <input type="date" value={leaveForm.tgl_selesai}
                        onChange={e => setLeaveForm({...leaveForm, tgl_selesai: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Keterangan</label>
                    <textarea rows={2} placeholder="Alasan cuti/izin..."
                      value={leaveForm.keterangan} onChange={e => setLeaveForm({...leaveForm, keterangan: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>
                  <button onClick={ajukanLeave} disabled={saving}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                    {saving ? 'Mengirim...' : 'Kirim Pengajuan'}
                  </button>
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Riwayat Cicilan & Kasbon</p>
              {loans.length === 0
                ? <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-gray-400 text-sm">Belum ada pengajuan.</div>
                : loans.slice(0, 5).map(loan => (
                  <div key={loan.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-900 capitalize">{loan.jenis}</p>
                        <p className="text-xs text-gray-500">Rp {FMT(loan.jumlah)} · {loan.jenis==='cicilan'?`${loan.jumlah_bulan} bln`:''}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        loan.status==='approved'?'bg-green-100 text-green-700':
                        loan.status==='rejected'?'bg-red-100 text-red-600':
                        loan.status==='lunas'?'bg-blue-100 text-blue-700':
                        'bg-yellow-100 text-yellow-700'}`}>
                        {loan.status}
                      </span>
                    </div>
                    {/* Tombol lihat surat */}
                    {loan.jenis === 'cicilan' && (
                      <button onClick={() => setSuratLoanId(loan.id)}
                        className="mt-2 w-full border border-blue-200 text-blue-600 hover:bg-blue-50 py-1.5 rounded-lg text-xs font-medium">
                        📄 Lihat Surat Pengajuan
                      </button>
                    )}
                  </div>
                ))
              }
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Riwayat Cuti & Izin</p>
              {leaves.length === 0
                ? <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-gray-400 text-sm">Belum ada pengajuan.</div>
                : leaves.slice(0, 5).map(leave => (
                  <div key={leave.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-900 capitalize">{leave.jenis}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(leave.tgl_mulai).toLocaleDateString('id-ID',{day:'2-digit',month:'short'})} —
                          {new Date(leave.tgl_selesai).toLocaleDateString('id-ID',{day:'2-digit',month:'short'})}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        leave.status==='approved'?'bg-green-100 text-green-700':
                        leave.status==='rejected'?'bg-red-100 text-red-600':
                        'bg-yellow-100 text-yellow-700'}`}>
                        {leave.status}
                      </span>
                    </div>
                    <button onClick={() => setSuratLeaveId(leave.id)}
                      className="mt-2 w-full border border-green-200 text-green-600 hover:bg-green-50 py-1.5 rounded-lg text-xs font-medium">
                      📄 Lihat Surat {leave.jenis === 'cuti' ? 'Cuti' : leave.jenis === 'sakit' ? 'Sakit' : 'Izin'}
                    </button>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ─── DOKUMEN ─── */}
        {tab === 'dokumen' && (
          <EmployeeDocuments
            employeeId={employee.id}
            employeeName={employee.nama}
            embedded={true}
            isSelf={true}
          />
        )}

        {tab === 'profil' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-base font-semibold text-gray-800">Data Pribadi</h2>
                <button onClick={() => setEditProfile(!editProfile)}
                  className="text-blue-600 text-xs hover:underline">
                  {editProfile ? 'Batal' : 'Edit'}
                </button>
              </div>
              <div className="space-y-3">
                {[['Nama Lengkap', employee.nama],['NIK', employee.nik],['Jabatan', employee.jabatan],['Departemen', employee.departemen]].map(([label, val]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className="text-sm text-gray-800 font-medium">{val || '—'}</span>
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500">No. HP</span>
                    {editProfile
                      ? <input type="text" value={profileForm.no_hp}
                          onChange={e => setProfileForm({...profileForm, no_hp: e.target.value})}
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-40" />
                      : <span className="text-sm text-gray-800">{employee.no_hp || '—'}</span>
                    }
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Email</span>
                    {editProfile
                      ? <input type="email" value={profileForm.email}
                          onChange={e => setProfileForm({...profileForm, email: e.target.value})}
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-40" />
                      : <span className="text-sm text-gray-800">{employee.email || '—'}</span>
                    }
                  </div>
                </div>
                {editProfile && (
                  <button onClick={simpanProfil} disabled={saving}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium mt-2">
                    {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Modal Surat Pinjaman */}
      {suratLoanId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-gray-50 rounded-2xl w-full max-w-lg max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 bg-white rounded-t-2xl">
              <p className="font-semibold text-gray-900 text-sm">Surat Pengajuan Pinjaman</p>
              <button onClick={() => setSuratLoanId(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-4">
              <SuratPinjaman
                loanId={suratLoanId}
                employee={employee}
                onClose={() => setSuratLoanId(null)}
              />
            </div>
          </div>
        </div>
      )}
      {suratLeaveId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-gray-50 rounded-2xl w-full max-w-lg max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 bg-white rounded-t-2xl">
              <p className="font-semibold text-gray-900 text-sm">Surat Cuti / Izin</p>
              <button onClick={() => setSuratLeaveId(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-4">
              <SuratCuti leaveId={suratLeaveId} employee={employee} onClose={() => setSuratLeaveId(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}