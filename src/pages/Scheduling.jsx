import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useOutlet } from '../lib/OutletContext'
import { useAuth } from '../lib/AuthContext'

const ALL_ROLE_SLOTS = [
  { key: 'dokter', label: 'Dokter', color: 'bg-blue-100 text-blue-700', dept: ['Dokter'] },
  { key: 'perawat_1', label: 'Perawat 1', color: 'bg-teal-100 text-teal-700', dept: ['Perawat', 'Bidan'] },
  { key: 'perawat_2', label: 'Perawat 2', color: 'bg-teal-100 text-teal-700', dept: ['Perawat', 'Bidan'] },
  { key: 'lab', label: 'Lab Analis', color: 'bg-amber-100 text-amber-700', dept: ['Laboratorium'] },
  { key: 'admin', label: 'Admin/Apoteker', color: 'bg-purple-100 text-purple-700', dept: ['Administrasi', 'Farmasi'] },
  { key: 'assist', label: 'Assist', color: 'bg-pink-100 text-pink-700', dept: ['Assist'] },
  { key: 'cs', label: 'Cleaning Service', color: 'bg-gray-100 text-gray-600', dept: ['Umum'] },
]

const APOTEK_ROLE_SLOTS = [
  { key: 'apoteker', label: 'Apoteker', color: 'bg-purple-100 text-purple-700', dept: ['Farmasi'] },
  { key: 'asisten_apt', label: 'Asisten Apoteker', color: 'bg-violet-100 text-violet-700', dept: ['Farmasi'] },
]

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

export default function Scheduling() {
  const today = new Date()
  const { activeOutlet, activeOutletData, isPayrollOnly, isApotek, areas, getOutletsByArea, areaOutlets } = useOutlet()
  const { employee, isManager, isDirektur } = useAuth()
  const canApprove = isManager || isDirektur

  const [bulan, setBulan] = useState(today.getMonth())
  const [tahun, setTahun] = useState(today.getFullYear())
  const [tab] = useState('kalender') // 'kalender' | 'pengajuan'

  // Employees
  const [allEmployees, setAllEmployees] = useState([])   // semua aktif
  const [areaEmpIds, setAreaEmpIds] = useState([])       // emp ids di area outlet aktif

  const [schedules, setSchedules] = useState([])
  const [allSchedules, setAllSchedules] = useState([])
  const [scheduleRequests, setScheduleRequests] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [slotForm, setSlotForm] = useState({})
  const [slotShift, setSlotShift] = useState({})
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showModal, setShowModal] = useState(false)

  // Approve modal
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [requestTab, setRequestTab] = useState('dokter')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [approveSlot, setApproveSlot] = useState('')

  // Penugasan sementara
  const [showTempModal, setShowTempModal] = useState(false)
  const [tempForm, setTempForm] = useState({
    employee_id: '', role_slot: '', tanggal: '', catatan_penugasan: ''
  })
  const [savingTemp, setSavingTemp] = useState(false)

  const ROLE_SLOTS = isApotek ? APOTEK_ROLE_SLOTS : ALL_ROLE_SLOTS
  const REQUEST_GROUPS = [
    {
      key: 'dokter',
      label: 'Dokter',
      dept: ['Dokter']
    },
    {
      key: 'perawat',
      label: 'Perawat',
      dept: ['Perawat', 'Bidan']
    },
    {
      key: 'admin',
      label: 'Admin',
      dept: ['Administrasi', 'Farmasi']
    },
    {
      key: 'lab',
      label: 'Lab',
      dept: ['Laboratorium']
    },
    {
      key: 'cs',
      label: 'CS',
      dept: ['Umum']
    },
    {
      key: 'assist',
      label: 'Assist',
      dept: ['Assist']
    }
  ]

  useEffect(() => { fetchAllEmployees() }, [])
  useEffect(() => { if (activeOutlet) { fetchAreaEmployees(); fetchSchedules(); fetchRequests() } }, [bulan, tahun, activeOutlet, areaOutlets])

  async function fetchAllEmployees() {
    const { data } = await supabase
      .from('employees')
      .select('id, nama, jabatan, departemen, piket_per_bulan, status, default_shift')
      .eq('status', 'aktif').order('nama')
    setAllEmployees(data || [])
    const { data: shiftData } = await supabase.from('shift_settings').select('*').eq('aktif', true).order('urutan')
    if (shiftData) setShifts(shiftData)
  }

  async function fetchAreaEmployees() {
    // Cari area dari outlet aktif
    const ao = areaOutlets.find(a => a.outlet_id === activeOutlet)
    if (!ao) {
      // Tidak ada area — hanya tampil staff outlet ini
      const { data } = await supabase
        .from('employee_outlets').select('employee_id').eq('outlet_id', activeOutlet)
      setAreaEmpIds((data || []).map(r => r.employee_id))
      return
    }

    // Ambil semua outlet dalam area yang sama
    const areaId = ao.area_id
    const outletIdsInArea = areaOutlets.filter(a => a.area_id === areaId).map(a => a.outlet_id)

    // Ambil semua employee dari outlet-outlet dalam area
    const { data } = await supabase
      .from('employee_outlets').select('employee_id')
      .in('outlet_id', outletIdsInArea)
    const uniqueIds = [...new Set((data || []).map(r => r.employee_id))]
    setAreaEmpIds(uniqueIds)
  }

  async function fetchSchedules() {
    const from = `${tahun}-${String(bulan+1).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan+1, 0).getDate()
    const to = `${tahun}-${String(bulan+1).padStart(2,'0')}-${lastDay}`
    const { data } = await supabase.from('schedules')
      .select('*, employees(id, nama, jabatan)')
      .gte('tanggal', from).lte('tanggal', to).eq('outlet_id', activeOutlet)
    setSchedules(data || [])
    const { data: allData } = await supabase.from('schedules')
      .select('employee_id').gte('tanggal', from).lte('tanggal', to)
    setAllSchedules(allData || [])
  }

  async function fetchRequests() {
    const from = `${tahun}-${String(bulan+1).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan+1, 0).getDate()
    const to = `${tahun}-${String(bulan+1).padStart(2,'0')}-${lastDay}`
    const { data } = await supabase
      .from('schedule_requests')
      .select('*, employees(id, nama, jabatan, departemen)')
      .gte('tanggal', from)
      .lte('tanggal', to)
      .order('created_at', { ascending: false })
    setScheduleRequests(data || [])
  }

  // Staff di area outlet aktif
  const areaEmployees = allEmployees.filter(e => areaEmpIds.includes(e.id))

  // Nama area outlet aktif
  const activeArea = (() => {
    const ao = areaOutlets.find(a => a.outlet_id === activeOutlet)
    if (!ao) return null
    return areas.find(a => a.id === ao.area_id)
  })()

  function getDaysInMonth() {
    const days = []
    const firstDay = new Date(tahun, bulan, 1).getDay()
    const totalDays = new Date(tahun, bulan+1, 0).getDate()
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= totalDays; d++) days.push(d)
    return days
  }

  function getSchedulesForDate(day) {
    if (!day) return []
    const dateStr = `${tahun}-${String(bulan+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const roleOrder = ALL_ROLE_SLOTS.concat(APOTEK_ROLE_SLOTS).map(r => r.key)
    return schedules.filter(s => s.tanggal === dateStr)
      .sort((a, b) => {
        const ia = roleOrder.indexOf(a.role_slot); const ib = roleOrder.indexOf(b.role_slot)
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
      })
  }

  function getRequestsForDate(day) {
    if (!day) return []
    const dateStr = `${tahun}-${String(bulan+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return scheduleRequests.filter(r => r.tanggal === dateStr && r.status === 'pending')
  }

  function hitungPiketBulanIni(empId) {
    return allSchedules.filter(s => s.employee_id === empId).length
  }

  function openModal(day) {
    setSelectedDate(day)
    const dateStr = `${tahun}-${String(bulan+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const existing = schedules.filter(s => s.tanggal === dateStr)
    const init = {}
    const initShift = {}
    ROLE_SLOTS.forEach(r => {
      const found = existing.find(e => e.role_slot === r.key)
      init[r.key] = found ? found.employee_id : ''
      initShift[r.key] = found?.shift || 'full'
    })
    setSlotForm(init); setSlotShift(initShift); setError(''); setShowModal(true)
  }

  async function simpanJadwal() {
    if (!activeOutlet) { setError('Pilih outlet terlebih dahulu.'); return }
    setLoading(true); setError('')
    const dateStr = `${tahun}-${String(bulan+1).padStart(2,'0')}-${String(selectedDate).padStart(2,'0')}`

    const empIds = Object.values(slotForm).filter(Boolean)
    // Ambil outlet asal tiap staff + area tujuan, untuk tentukan is_temporary
    let outletAsalMap = {}, isBedaAreaMap = {}
    if (empIds.length > 0) {
      const { data: eoData } = await supabase.from('employee_outlets')
        .select('employee_id, outlet_id').in('employee_id', empIds)
      // area outlet tujuan (aktif)
      const { data: areaTujuanData } = await supabase.from('area_outlets')
        .select('area_id').eq('outlet_id', activeOutlet)
      const areaTujuan = (areaTujuanData || []).map(a => a.area_id)
      // map outlet asal per staff (ambil yang pertama)
      empIds.forEach(id => {
        const eo = (eoData || []).find(r => r.employee_id === id)
        outletAsalMap[id] = eo?.outlet_id || null
      })
      // cek beda area per outlet asal unik
      const outletAsalUnik = [...new Set(Object.values(outletAsalMap).filter(Boolean))]
      const areaAsalMap = {}
      if (outletAsalUnik.length > 0) {
        const { data: aoData } = await supabase.from('area_outlets')
          .select('outlet_id, area_id').in('outlet_id', outletAsalUnik)
        outletAsalUnik.forEach(oid => {
          areaAsalMap[oid] = (aoData || []).filter(a => a.outlet_id === oid).map(a => a.area_id)
        })
      }
      empIds.forEach(id => {
        const asal = outletAsalMap[id]
        if (asal && asal !== activeOutlet) {
          const areaAsal = areaAsalMap[asal] || []
          isBedaAreaMap[id] = !areaAsal.some(a => areaTujuan.includes(a))
        } else {
          isBedaAreaMap[id] = false
        }
      })
    }

    const { data: deleted, error: delErr } = await supabase.from('schedules')
      .delete().eq('tanggal', dateStr).eq('outlet_id', activeOutlet).select()
    if (delErr) { setError('Gagal hapus jadwal lama: ' + delErr.message); setLoading(false); return }

    const inserts = Object.entries(slotForm).filter(([,v]) => v).map(([role, empId]) => ({
      tanggal: dateStr, employee_id: empId, role_slot: role, outlet_id: activeOutlet,
      shift: slotShift[role] || 'full',
      is_temporary: isBedaAreaMap[empId] || false,
      outlet_asal_id: outletAsalMap[empId] || null,
      catatan_penugasan: isBedaAreaMap[empId] ? 'Penugasan sementara lintas area' : '',
    }))
    if (inserts.length > 0) {
      const { error } = await supabase.from('schedules').insert(inserts)
      if (error) { setError('Gagal simpan: ' + error.message); setLoading(false); return }
    }
    setLoading(false); setShowModal(false); fetchSchedules()
  }

  async function hapusJadwalTanggal(day) {
    if (!confirm('Hapus semua jadwal tanggal ini?')) return
    const dateStr = `${tahun}-${String(bulan+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    await supabase.from('schedules').delete().eq('tanggal', dateStr).eq('outlet_id', activeOutlet)
    fetchSchedules()
  }

  // ─── APPROVE / REJECT REQUEST ─────────────────────────────

  function bukaApprove(req) {
    setSelectedRequest(req)
    setApproveSlot('')
    setShowApproveModal(true)
  }

  async function approveRequest() {
    if (!approveSlot) { setError('Pilih slot jabatan terlebih dahulu.'); return }
    setLoading(true); setError('')

    // Cek apakah slot sudah terisi
    const existing = schedules.find(s =>
      s.tanggal === selectedRequest.tanggal && s.role_slot === approveSlot
    )
    if (existing) {
      setError(`Slot ${ROLE_SLOTS.find(r=>r.key===approveSlot)?.label} di tanggal ini sudah terisi oleh ${existing.employees?.nama}.`)
      setLoading(false); return
    }

    // Insert ke schedules
    const { error: insertErr } = await supabase.from('schedules').insert({
      tanggal: selectedRequest.tanggal,
      employee_id: selectedRequest.employee_id,
      role_slot: approveSlot,
      outlet_id: activeOutlet,
    })
    if (insertErr) { setError('Gagal: ' + insertErr.message); setLoading(false); return }

    // Update status request
    await supabase.from('schedule_requests').update({
      status: 'approved',
      role_slot: approveSlot,
      disetujui_oleh: employee?.nama || 'Manager',
    }).eq('id', selectedRequest.id)
    await supabase
      .from('schedule_requests')
      .update({
        status: 'rejected',
        disetujui_oleh: employee?.nama || 'Manager',
      })
      .eq('tanggal', selectedRequest.tanggal)
      .eq('outlet_id', activeOutlet)
      .eq('status', 'pending')
      .neq('id', selectedRequest.id)

    setSuccess(`Pengajuan ${selectedRequest.employees?.nama} disetujui dan jadwal otomatis ditambahkan!`)
    setShowApproveModal(false); setSelectedRequest(null)
    setLoading(false); fetchSchedules(); fetchRequests()
  }

  async function rejectRequest(id, nama) {
    if (!confirm(`Tolak pengajuan piket ${nama}?`)) return
    await supabase.from('schedule_requests').update({
      status: 'rejected',
      disetujui_oleh: employee?.nama || 'Manager',
    }).eq('id', id)
    setSuccess(`Pengajuan ${nama} ditolak.`)
    fetchRequests()
  }

  // ─── PENUGASAN SEMENTARA ─────────────────────────────────

  async function simpanPenugasanSementara() {
    if (!tempForm.employee_id) { setError('Pilih staff terlebih dahulu.'); return }
    if (!tempForm.role_slot) { setError('Pilih slot jabatan.'); return }
    if (!tempForm.tanggal) { setError('Pilih tanggal penugasan.'); return }
    setSavingTemp(true); setError('')

    // Ambil outlet asal staff
    const { data: empOutletData } = await supabase
      .from('employee_outlets')
      .select('outlet_id')
      .eq('employee_id', tempForm.employee_id)
      .limit(1)
      .single()

    const outletAsal = empOutletData?.outlet_id || null

    // Cek apakah beda area (untuk menentukan is_temporary)
    let isBedaArea = false
    if (outletAsal && outletAsal !== activeOutlet) {
      const { data: areaAsalData } = await supabase.from('area_outlets')
        .select('area_id').eq('outlet_id', outletAsal)
      const { data: areaTujuanData } = await supabase.from('area_outlets')
        .select('area_id').eq('outlet_id', activeOutlet)
      const areaAsal = (areaAsalData || []).map(a => a.area_id)
      const areaTujuan = (areaTujuanData || []).map(a => a.area_id)
      isBedaArea = !areaAsal.some(a => areaTujuan.includes(a))
    }

    // Cek apakah slot sudah terisi
    const { data: existing } = await supabase.from('schedules')
      .select('id, employees(nama)')
      .eq('tanggal', tempForm.tanggal)
      .eq('outlet_id', activeOutlet)
      .eq('role_slot', tempForm.role_slot)
      .single()

    if (existing) {
      setError(`Slot sudah terisi oleh ${existing.employees?.nama}.`)
      setSavingTemp(false); return
    }

    const { error: insertErr } = await supabase.from('schedules').insert({
      tanggal: tempForm.tanggal,
      employee_id: tempForm.employee_id,
      role_slot: tempForm.role_slot,
      outlet_id: activeOutlet,
      is_temporary: isBedaArea,
      catatan_penugasan: isBedaArea
        ? (tempForm.catatan_penugasan || 'Penugasan sementara lintas area')
        : (tempForm.catatan_penugasan || ''),
      outlet_asal_id: outletAsal,
    })

    if (insertErr) { setError('Gagal: ' + insertErr.message); setSavingTemp(false); return }

    setSuccess(isBedaArea
      ? `Penugasan sementara lintas area berhasil ditambahkan!`
      : `Staff berhasil ditambahkan ke jadwal outlet ini!`)
    setShowTempModal(false)
    setTempForm({ employee_id: '', role_slot: '', tanggal: '', catatan_penugasan: '' })
    setSavingTemp(false)
    fetchSchedules()
  }

  // ─── PRINT JADWAL ────────────────────────────────────────

  async function printJadwal() {
    const from = `${tahun}-${String(bulan+1).padStart(2,'0')}-01`
    const lastDay = new Date(tahun, bulan+1, 0).getDate()
    const to = `${tahun}-${String(bulan+1).padStart(2,'0')}-${lastDay}`
    const daysInMonth = Array.from({ length: lastDay }, (_, i) => {
      const d = new Date(tahun, bulan, i + 1)
      return {
        tanggal: `${tahun}-${String(bulan+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,
        hari: ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()],
        tgl: i + 1,
        isMinggu: d.getDay() === 0,
        isSabtu: d.getDay() === 6,
      }
    })

    // Ambil semua outlet dalam area
    const areaId = areaOutlets.find(ao => ao.outlet_id === activeOutlet)?.area_id
    const outletIdsInArea = areaId
      ? areaOutlets.filter(ao => ao.area_id === areaId).map(ao => ao.outlet_id)
      : [activeOutlet]

    // Fetch semua outlet info untuk buat inisial
    const { data: outletData } = await supabase.from('outlets')
      .select('id, nama').in('id', outletIdsInArea)
    const outletMap = {}
    ;(outletData || []).forEach(o => {
      // Buat inisial: ambil huruf kapital dari tiap kata, maks 4 huruf
      const inisial = o.nama.split(/\s+/)
        .map(w => w[0]?.toUpperCase() || '')
        .join('')
        .slice(0, 4)
      outletMap[o.id] = { nama: o.nama, inisial }
    })

    // Fetch semua jadwal di area ini bulan ini
    const { data: areaSchedulesRaw } = await supabase.from('schedules')
      .select('employee_id, outlet_id, tanggal, role_slot, is_temporary, shift')
      .in('outlet_id', outletIdsInArea)
      .gte('tanggal', from).lte('tanggal', to)

    // Fetch juga jadwal staff area ini yang dijadwalkan DI LUAR area (penugasan keluar)
    const areaEmpIdsArr = areaEmployees.map(e => e.id)
    let outSchedules = []
    if (areaEmpIdsArr.length > 0) {
      const { data: outData } = await supabase.from('schedules')
        .select('employee_id, outlet_id, tanggal, role_slot, is_temporary, shift')
        .in('employee_id', areaEmpIdsArr)
        .gte('tanggal', from).lte('tanggal', to)
        .not('outlet_id', 'in', `(${outletIdsInArea.join(',')})`)
      outSchedules = outData || []
    }

    // Gabung (hindari duplikat berdasarkan kombinasi unik)
    const seen = new Set()
    const allAreaSchedules = [...(areaSchedulesRaw || []), ...outSchedules].filter(s => {
      const key = `${s.employee_id}|${s.outlet_id}|${s.tanggal}|${s.role_slot}`
      if (seen.has(key)) return false
      seen.add(key); return true
    })

    // Pastikan outlet luar area juga ada di outletMap (untuk inisial)
    const extraOutletIds = [...new Set(allAreaSchedules.map(s => s.outlet_id).filter(id => !outletMap[id]))]
    if (extraOutletIds.length > 0) {
      const { data: extraOutletData } = await supabase.from('outlets')
        .select('id, nama').in('id', extraOutletIds)
      ;(extraOutletData || []).forEach(o => {
        const inisial = o.nama.split(/\s+/).map(w => w[0]?.toUpperCase() || '').join('').slice(0, 4)
        outletMap[o.id] = { nama: o.nama, inisial }
      })
    }

    // Kumpulkan employee_id yang punya jadwal di area ini tapi TIDAK terdaftar di area (= penugasan sementara dari area lain)
    const areaEmpIdSet = new Set(areaEmployees.map(e => e.id))
    const tempEmpIds = [...new Set(
      allAreaSchedules.map(s => s.employee_id).filter(id => !areaEmpIdSet.has(id))
    )]
    let extraEmps = []
    if (tempEmpIds.length > 0) {
      const { data: extraData } = await supabase.from('employees')
        .select('id, nama, jabatan, departemen, piket_per_bulan')
        .in('id', tempEmpIds)
      extraEmps = extraData || []
    }

    // Sort staff by departemen then nama (gabung staff area + staff penugasan sementara)
    const DEPT_ORDER = ['Dokter Umum','Dokter','Perawat','Bidan','Laboratorium','Farmasi','Apoteker','Administrasi','Admin','Assist','Umum','Cleaning Service']
    const allEmpsForPrint = [...areaEmployees, ...extraEmps]
    const sortedEmps = allEmpsForPrint.sort((a, b) => {
      const dA = DEPT_ORDER.indexOf(a.departemen) === -1 ? 99 : DEPT_ORDER.indexOf(a.departemen)
      const dB = DEPT_ORDER.indexOf(b.departemen) === -1 ? 99 : DEPT_ORDER.indexOf(b.departemen)
      if (dA !== dB) return dA - dB
      return a.nama.localeCompare(b.nama)
    })

    // Build tabel: baris = staff, kolom = tanggal
    const rows = sortedEmps.map(emp => {
      const piketHari = daysInMonth.map(d => {
        // Cari semua jadwal staff ini pada tanggal ini (bisa lebih dari 1 outlet)
        const staffScheds = (allAreaSchedules || []).filter(
          sc => sc.employee_id === emp.id && sc.tanggal === d.tanggal
        )
        if (staffScheds.length === 0) return null
        return staffScheds.map(s => {
          const role = ROLE_SLOTS.find(r => r.key === s.role_slot) || ALL_ROLE_SLOTS.find(r => r.key === s.role_slot)
          const outlet = outletMap[s.outlet_id]
          const isCurrentOutlet = s.outlet_id === activeOutlet
          // Kode shift: P/S/M (full tanpa kode)
          const shiftKode = s.shift === 'pagi' ? '-P' : s.shift === 'siang' ? '-S' : s.shift === 'malam' ? '-M' : ''
          return {
            slot: role?.label || s.role_slot,
            inisial: (outlet?.inisial || '?') + shiftKode,
            namaOutlet: outlet?.nama || '',
            isTemp: s.is_temporary,
            isCurrentOutlet,
          }
        })
      })
      const total = piketHari.filter(Boolean).length
      const target = emp.piket_per_bulan || 15
      return { emp, piketHari, total, target }
    })

    // Buat legenda outlet
    const outletLegend = Object.values(outletMap)
    const legendHTML = outletLegend.map(o =>
      `<div class="legend-item"><strong>${o.inisial}</strong> = ${o.nama}</div>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Jadwal Piket ${activeOutletData?.nama} - ${BULAN[bulan]} ${tahun}</title>
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
      .piket{background:#dbeafe;color:#1e40af;border-radius:2px;padding:1px 2px;font-size:6pt;white-space:nowrap}
      .piket-temp{background:#fed7aa;color:#c2410c;border-radius:2px;padding:1px 2px;font-size:6pt}
      .minggu{background:#fef9c3}
      .sabtu{background:#f0fdf4}
      .no-print{display:block;text-align:center;padding:12px;margin-bottom:12px}
      @media print{.no-print{display:none}body{font-size:7pt}}
      .legend{display:flex;gap:12px;font-size:8pt;margin:8px 16px;flex-wrap:wrap}
      .legend-item{display:flex;align-items:center;gap:4px}
      .box{width:12px;height:12px;border-radius:2px;flex-shrink:0}
    </style></head><body>
    <div class="no-print">
      <button onclick="window.print()" style="background:#1e40af;color:white;border:none;padding:10px 28px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;margin-right:8px">🖨 Print / Save PDF</button>
      <button onclick="window.close()" style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer">Tutup</button>
    </div>
    <div class="header">
      <h1>Jadwal Piket — ${activeOutletData?.nama}</h1>
      <p>${BULAN[bulan]} ${tahun} &nbsp;|&nbsp; ${areaEmployees.length} Staff &nbsp;|&nbsp; Dicetak: ${new Date().toLocaleDateString('id-ID', {day:'2-digit',month:'long',year:'numeric'})}</p>
    </div>
    <div class="legend">
      <strong>Kode Outlet:</strong> ${legendHTML}
      &nbsp;|&nbsp;
      <div class="legend-item"><div class="box" style="background:#dbeafe"></div> Piket Normal</div>
      <div class="legend-item"><div class="box" style="background:#fed7aa"></div> 🔀 Sementara</div>
      <div class="legend-item"><div class="box" style="background:#fef9c3"></div> Minggu</div>
      <div class="legend-item"><div class="box" style="background:#f0fdf4"></div> Sabtu</div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="nama">Nama Staff</th>
          <th>Jabatan</th>
          ${daysInMonth.map(d => `<th style="${d.isMinggu?'background:#b45309;color:white':d.isSabtu?'background:#15803d;color:white':''}">
            <div>${d.hari}</div><div>${d.tgl}</div>
          </th>`).join('')}
          <th>Total</th>
          <th>Target</th>
        </tr>
      </thead>
      <tbody>
        ${(() => {
          let lastDept = null
          return rows.map(({ emp, piketHari, total, target }) => {
            const deptHeader = emp.departemen !== lastDept
              ? `<tr><td colspan="${daysInMonth.length + 4}" style="background:#1e40af;color:white;font-weight:700;font-size:8pt;padding:4px 8px">${emp.departemen || 'Lainnya'}</td></tr>`
              : ''
            lastDept = emp.departemen
            return deptHeader + `<tr>
          <td class="nama">${emp.nama}</td>
          <td style="text-align:left;white-space:nowrap;font-size:6.5pt;color:#6b7280">${emp.jabatan}</td>
          ${piketHari.map((slots, i) => {
            const d = daysInMonth[i]
            const bg = d.isMinggu ? 'background:#fef9c3' : d.isSabtu ? 'background:#f0fdf4' : ''
            if (!slots) return `<td style="${bg}"></td>`
            const items = slots.map(p =>
              `<span class="${p.isTemp ? 'piket-temp' : 'piket'}" title="${p.namaOutlet} · ${p.slot}">
                ${p.isTemp ? '🔀' : ''}${p.inisial}
              </span>`
            ).join('<br>')
            return `<td style="${bg}">${items}</td>`
          }).join('')}
          <td class="${total > target ? 'over' : total >= target ? 'ok' : 'total'}">${total}</td>
          <td style="text-align:center;color:#6b7280">${target}</td>
        </tr>`
          }).join('')
        })()}
      </tbody>
    </table>
    </body></html>`

    const win = window.open('', '_blank', 'width=1200,height=800')
    win.document.write(html)
    win.document.close()
  }

  const days = getDaysInMonth()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const pendingCount = scheduleRequests.filter(r => r.status === 'pending').length

  if (isPayrollOnly) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md text-center">
          <div className="text-4xl mb-3">🏢</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">{activeOutletData?.nama}</h2>
          <p className="text-sm text-gray-500">Outlet ini tidak memiliki jadwal piket.</p>
        </div>
      </div>
    )
  }

  const filteredRequests = scheduleRequests.filter(req => {
    const activeGroup = REQUEST_GROUPS.find(
      g => g.key === requestTab
    )

    if (!activeGroup) return true

    return activeGroup.dept.includes(
      req.employees?.departemen
    )
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Jadwal Piket</h1>
            <p className="text-sm text-gray-500 mt-1">
              {activeOutletData?.nama} · {BULAN[bulan]} {tahun}
              {activeArea && <span className="ml-2 text-blue-500">· {activeArea.nama}</span>}
              {isApotek && <span className="ml-2 bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">Apotek</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={()=>{if(bulan===0){setBulan(11);setTahun(t=>t-1)}else setBulan(b=>b-1)}}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-100">←</button>
            <span className="font-medium text-gray-800 min-w-max">{BULAN[bulan]} {tahun}</span>
            <button onClick={()=>{if(bulan===11){setBulan(0);setTahun(t=>t+1)}else setBulan(b=>b+1)}}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-100">→</button>
            <button onClick={() => { setShowTempModal(true); setError('') }}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              🔀 Penugasan Sementara
            </button>
            <button onClick={printJadwal}
              className="border border-blue-300 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-medium">
              🖨 Print Jadwal
            </button>
          </div>
        </div>

        {/* Info area */}
        {activeArea && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-4 text-xs text-blue-700 flex items-center gap-2">
            <span>👥</span>
            <span>Staff dari area <strong>{activeArea.nama}</strong> tersedia untuk semua outlet dalam area ini ({areaEmployees.length} staff terdaftar)</span>
          </div>
        )}

        {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{success}</div>}

        {/* ─── TAB KALENDER ─── */}
        <>
          {areaEmployees.length === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mb-4 text-sm text-yellow-700">
              ⚠ Belum ada staff terdaftar di area ini.
            </div>
          )}

          {/* Rekapitulasi */}
          {areaEmployees.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                Rekapitulasi Piket · {activeOutletData?.nama} · {BULAN[bulan]} {tahun}
              </p>
              <div className="flex flex-wrap gap-2">
                {areaEmployees.map(emp => {
                  const sudah = hitungPiketBulanIni(emp.id)
                  const target = emp.piket_per_bulan || 15
                  const lebih = sudah > target; const cukup = sudah === target
                  return (
                    <div key={emp.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${
                      lebih?'bg-red-50 border-red-200 text-red-700':
                      cukup?'bg-green-50 border-green-200 text-green-700':
                      'bg-gray-50 border-gray-200 text-gray-600'}`}>
                      <span className="font-medium">{emp.nama}</span>
                      <span>{sudah}/{target}</span>
                      {lebih&&<span>⚠</span>}{cukup&&<span>✓</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Kalender */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-200">
              {['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(h => (
                <div key={h} className="py-2 text-center text-xs font-medium text-gray-500">{h}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, idx) => {
                const daySchedules = getSchedulesForDate(day)
                const dayRequests = getRequestsForDate(day)
                const dateStr = day ? `${tahun}-${String(bulan+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : ''
                const isToday = dateStr === todayStr
                return (
                  <div key={idx}
                    className={`border-b border-r border-gray-100 p-1.5 ${day?'cursor-pointer hover:bg-blue-50 transition-colors':'bg-gray-50'}`}
                    style={{ minHeight: day && daySchedules.length > 0 ? `${44+daySchedules.length*26}px` : '96px' }}
                    onClick={() => day && openModal(day)}>
                    {day && (<>
                      <div className="flex justify-between items-start mb-1.5">
                        <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 ${isToday?'bg-blue-600 text-white':'text-gray-700'}`}>{day}</span>
                        <div className="flex gap-1">
                          {dayRequests.length > 0 && (
                            <span className="bg-orange-100 text-orange-600 text-xs px-1 rounded-full leading-tight">{dayRequests.length}</span>
                          )}
                          {daySchedules.length > 0 && (
                            <button onClick={e=>{e.stopPropagation();hapusJadwalTanggal(day)}}
                              className="text-gray-300 hover:text-red-400 text-xs leading-none">✕</button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        {daySchedules.map(s => {
                          const roleData = ROLE_SLOTS.find(r=>r.key===s.role_slot) || ALL_ROLE_SLOTS.find(r=>r.key===s.role_slot)
                          return (
                            <div key={s.id} className={`text-xs px-1.5 py-0.5 rounded ${s.is_temporary ? 'bg-orange-100 text-orange-700 border border-orange-300' : roleData?.color||'bg-gray-100 text-gray-600'}`}
                              title={s.is_temporary ? `Penugasan sementara: ${s.catatan_penugasan || ''}` : ''}>
                              <span className="font-medium block leading-tight truncate">
                                {s.is_temporary && <span className="text-orange-500 mr-0.5">🔀</span>}
                                {s.employees?.nama}
                              </span>
                              <span className="opacity-60 text-xs leading-tight">{roleData?.label}</span>
                            </div>
                          )
                        })}
                        {dayRequests.length > 0 && (
                          <div className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">
                            {dayRequests.length} pengajuan
                          </div>
                        )}
                      </div>
                    </>)}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4">
            {ROLE_SLOTS.map(r => (
              <span key={r.key} className={`text-xs px-2 py-0.5 rounded ${r.color}`}>{r.label}</span>
            ))}
            <span className="text-xs px-2 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">Pengajuan pending</span>
          </div>
        </>

          {/* ─── TAB PENGAJUAN ─── */}
          {canApprove && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {REQUEST_GROUPS.map(group => {

                  const count = scheduleRequests.filter(req =>
                    group.dept.includes(req.employees?.departemen) && req.status === 'pending'
                  ).length

                  return (
                    <button
                      key={group.key}
                      onClick={() => setRequestTab(group.key)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                        requestTab === group.key
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {group.label}

                      {count > 0 && (
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                          requestTab === group.key
                            ? 'bg-white/20 text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-700">Pengajuan Jadwal Piket · {activeOutletData?.nama}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {['Nama','Jabatan','Tanggal','Keterangan','Status','Aksi'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">

                      {filteredRequests.length === 0 ? (

                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-8 text-center text-gray-400"
                          >
                            Belum ada pengajuan.
                          </td>
                        </tr>

                      ) : (

                        filteredRequests.map(req => (

                          <tr key={req.id} className="hover:bg-gray-50">

                            <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                              {req.employees?.nama}
                            </td>

                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {req.employees?.jabatan}
                            </td>

                            <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                              {new Date(req.tanggal).toLocaleDateString(
                                'id-ID',
                                {
                                  weekday:'short',
                                  day:'2-digit',
                                  month:'short',
                                  year:'numeric'
                                }
                              )}
                            </td>

                            <td className="px-4 py-3 text-gray-500 text-xs max-w-32 truncate">
                              {req.keterangan || '—'}
                            </td>

                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                req.status==='approved'
                                  ? 'bg-green-100 text-green-700'
                                  : req.status==='rejected'
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}>
                                {
                                  req.status === 'approved'
                                    ? `✓ ${req.role_slot}`
                                    : req.status
                                }
                              </span>
                            </td>

                            <td className="px-4 py-3">

                              {req.status === 'pending' && (

                                <div className="flex gap-2">

                                  <button
                                    onClick={() => bukaApprove(req)}
                                    className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg"
                                  >
                                    Approve
                                  </button>

                                  <button
                                    onClick={() => rejectRequest(req.id, req.employees?.nama)}
                                    className="border border-red-200 text-red-600 hover:bg-red-50 text-xs px-3 py-1.5 rounded-lg"
                                  >
                                    Reject
                                  </button>

                                </div>

                              )}

                              {req.status !== 'pending' && (
                                <span className="text-xs text-gray-400">
                                  {req.disetujui_oleh || '—'}
                                </span>
                              )}

                            </td>

                          </tr>

                        ))

                      )}

                    </tbody>
                  </table>
                </div>
              </div>
        
          </div>
        )}
      </div>

      {/* Modal Input Jadwal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {String(selectedDate).padStart(2,'0')} {BULAN[bulan]} {tahun}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">{activeOutletData?.nama}</p>
              </div>
              <button onClick={()=>setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-96 overflow-y-auto">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
              {ROLE_SLOTS.map(role => {
                const filtered = areaEmployees.filter(emp => role.dept.includes(emp.departemen))
                // Pastikan staff yang sudah terpilih (mis. penugasan dari luar area) tetap muncul di option
                const selectedId = slotForm[role.key]
                let optionList = filtered
                if (selectedId && !filtered.some(e => e.id === selectedId)) {
                  const selEmp = allEmployees.find(e => e.id === selectedId)
                  if (selEmp) optionList = [selEmp, ...filtered]
                }
                return (
                  <div key={role.key}>
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs ${role.color}`}>{role.label}</span>
                      <span className="ml-2 text-gray-400">({filtered.length} tersedia dari {activeArea?.nama || 'outlet ini'})</span>
                    </label>
                    <div className="flex gap-2">
                      <select value={slotForm[role.key]||''} onChange={e=>{
                        const empId = e.target.value
                        const emp = optionList.find(x=>x.id===empId)
                        setSlotForm({...slotForm,[role.key]:empId})
                        // auto-set shift ke default staff
                        if (emp?.default_shift) setSlotShift(prev=>({...prev,[role.key]:emp.default_shift}))
                      }}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">-- Tidak ada / Kosong --</option>
                        {optionList.length === 0
                          ? <option disabled>Tidak ada staff {role.dept.join('/')} di area ini</option>
                          : optionList.map(emp => {
                            const sudah = hitungPiketBulanIni(emp.id)
                            const target = emp.piket_per_bulan || 15
                            const luarArea = !areaEmpIds.includes(emp.id)
                            return (
                              <option key={emp.id} value={emp.id}>
                                {emp.nama} ({sudah}/{target}){sudah>=target?' ⚠ penuh':''}{luarArea?' · luar area':''}
                              </option>
                            )
                          })
                        }
                      </select>
                      {slotForm[role.key] && (
                        <select value={slotShift[role.key]||'full'} onChange={e=>setSlotShift({...slotShift,[role.key]:e.target.value})}
                          className="w-28 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {shifts.map(s => <option key={s.kode} value={s.kode}>{s.nama}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={simpanJadwal} disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium">
                {loading?'Menyimpan...':'Simpan Jadwal'}
              </button>
              <button onClick={()=>setShowModal(false)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Penugasan Sementara */}
      {showTempModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="font-semibold text-gray-900">Penugasan Sementara Lintas Area</h2>
                <p className="text-xs text-gray-500 mt-0.5">Outlet tujuan: {activeOutletData?.nama}</p>
              </div>
              <button onClick={() => { setShowTempModal(false); setError('') }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}

              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
                ℹ️ Staff dari area yang sama: dijadwalkan biasa (tanpa tag 🔀)<br/>
                Staff dari area berbeda: ditandai sebagai penugasan sementara lintas area (🔀)
              </div>

              {/* Tanggal */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Tanggal Penugasan *</label>
                <input type="date"
                  min={`${tahun}-${String(bulan+1).padStart(2,'0')}-01`}
                  max={`${tahun}-${String(bulan+1).padStart(2,'0')}-${new Date(tahun, bulan+1, 0).getDate()}`}
                  value={tempForm.tanggal}
                  onChange={e => setTempForm({...tempForm, tanggal: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>

              {/* Staff - semua staff aktif, bukan hanya area */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Staff *</label>
                <select value={tempForm.employee_id} onChange={e => setTempForm({...tempForm, employee_id: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">-- Pilih Staff --</option>
                  {allEmployees
                    .filter(e => !areaEmpIds.includes(e.id)) // staff dari luar area aktif
                    .map(emp => {
                      const sudah = allSchedules.filter(s => s.employee_id === emp.id).length
                      const target = emp.piket_per_bulan || 15
                      return (
                        <option key={emp.id} value={emp.id}>
                          {emp.nama} — {emp.jabatan} ({sudah}/{target} piket)
                        </option>
                      )
                    })
                  }
                </select>
                <p className="text-xs text-gray-400 mt-1">Hanya menampilkan staff dari area lain</p>
              </div>

              {/* Slot jabatan */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Slot Jabatan *</label>
                <select value={tempForm.role_slot} onChange={e => setTempForm({...tempForm, role_slot: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">-- Pilih Slot --</option>
                  {ROLE_SLOTS.map(r => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Catatan */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Catatan</label>
                <input type="text"
                  placeholder="Contoh: Menggantikan dr. X yang cuti"
                  value={tempForm.catatan_penugasan}
                  onChange={e => setTempForm({...tempForm, catatan_penugasan: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={simpanPenugasanSementara} disabled={savingTemp}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium">
                {savingTemp ? 'Menyimpan...' : '🔀 Tambahkan ke Jadwal'}
              </button>
              <button onClick={() => { setShowTempModal(false); setError('') }}
                className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-700">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Approve Request */}
      {showApproveModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Approve Pengajuan Piket</h2>
              <p className="text-xs text-gray-500 mt-1">
                {selectedRequest.employees?.nama} · {new Date(selectedRequest.tanggal).toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long'})}
              </p>
            </div>
            <div className="px-5 py-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{error}</div>}
              <label className="text-xs font-medium text-gray-600 block mb-2">Pilih slot jabatan untuk staff ini:</label>
              <div className="space-y-2">
                {ROLE_SLOTS.map(role => {
                  const slotTerisi = schedules.find(s =>
                    s.tanggal === selectedRequest.tanggal && s.role_slot === role.key
                  )
                  const sesuaiDept = role.dept.includes(selectedRequest.employees?.departemen ||
                    allEmployees.find(e => e.id === selectedRequest.employee_id)?.departemen)
                  return (
                    <button key={role.key}
                      onClick={() => !slotTerisi && setApproveSlot(role.key)}
                      disabled={!!slotTerisi}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                        approveSlot === role.key ? 'border-blue-500 bg-blue-50' :
                        slotTerisi ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed' :
                        sesuaiDept ? 'border-green-200 bg-green-50 hover:border-green-400' :
                        'border-gray-200 hover:bg-gray-50'
                      }`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-xs px-2 py-0.5 rounded ${role.color}`}>{role.label}</span>
                        {slotTerisi && <span className="text-xs text-gray-400">Terisi: {slotTerisi.employees?.nama?.split(' ')[0]}</span>}
                        {!slotTerisi && sesuaiDept && <span className="text-xs text-green-600">✓ Sesuai jabatan</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={approveRequest} disabled={!approveSlot || loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium">
                {loading ? 'Memproses...' : 'Approve & Tambah Jadwal'}
              </button>
              <button onClick={() => { setShowApproveModal(false); setError('') }}
                className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}