import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { logActivity } from '../lib/activityLog'

const FMT = n => new Intl.NumberFormat('id-ID').format(n || 0)

export default function ESSAdmin() {
  const { employee, isManager, isDirektur } = useAuth()
  const canApproveSchedule = isManager || isDirektur

  const [tab, setTab] = useState('akun')
  const [employees, setEmployees] = useState([])
  const [leaves, setLeaves] = useState([])
  const [loans, setLoans] = useState([])
  const [scheduleReqs, setScheduleReqs] = useState([])
  const [outlets, setOutlets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [filterStatus, setFilterStatus] = useState('pending')

  // Approve schedule state
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [selectedReq, setSelectedReq] = useState(null)
  const [approveSlot, setApproveSlot] = useState('')

  const ROLE_SLOTS = [
    { key: 'dokter', label: 'Dokter', color: 'bg-blue-100 text-blue-700' },
    { key: 'perawat_1', label: 'Perawat 1', color: 'bg-teal-100 text-teal-700' },
    { key: 'perawat_2', label: 'Perawat 2', color: 'bg-teal-100 text-teal-700' },
    { key: 'admin', label: 'Admin/Apoteker', color: 'bg-purple-100 text-purple-700' },
    { key: 'lab', label: 'Lab Analis', color: 'bg-amber-100 text-amber-700' },
    { key: 'cs', label: 'Cleaning Service', color: 'bg-gray-100 text-gray-600' },
    { key: 'assist', label: 'Assist', color: 'bg-pink-100 text-pink-700' },
    { key: 'apoteker', label: 'Apoteker', color: 'bg-purple-100 text-purple-700' },
    { key: 'asisten_apt', label: 'Asisten Apoteker', color: 'bg-violet-100 text-violet-700' },
  ]

  useEffect(() => { fetchAll() }, [tab])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchEmployees(), fetchLeaves(), fetchLoans(), fetchScheduleReqs(), fetchOutlets()])
    setLoading(false)
  }

  async function fetchEmployees() {
    const { data } = await supabase.from('employees')
      .select('id, nama, nik, jabatan, departemen, status, user_id, email')
      .eq('status', 'aktif').order('nama')
    setEmployees(data || [])
  }

  async function fetchLeaves() {
    const { data } = await supabase.from('leave_requests')
      .select('*, employees(id, nama, jabatan)')
      .order('created_at', { ascending: false })
    setLeaves(data || [])
  }

  async function fetchLoans() {
    const { data } = await supabase.from('loans')
      .select('*, employees(id, nama, jabatan)')
      .order('created_at', { ascending: false })
    setLoans(data || [])
  }

  async function fetchScheduleReqs() {
    const { data } = await supabase.from('schedule_requests')
      .select('*, employees(id, nama, jabatan, departemen), outlets(nama)')
      .order('tanggal', { ascending: true })
    setScheduleReqs(data || [])
  }

  async function fetchOutlets() {
    const { data } = await supabase.from('outlets').select('id, nama')
    setOutlets(data || [])
  }

  // ─── AKUN ESS ─────────────────────────────────────────────

  async function buatAkun(emp) {
    if (!newPassword || newPassword.length < 6) { setError('Password minimal 6 karakter.'); return }
    setSavingPassword(true); setError('')
    const email = `${emp.nik.toLowerCase()}@klinik.internal`
    if (emp.user_id) {
      setError('Untuk reset password, hapus akun dulu lalu buat ulang.')
      setSavingPassword(false); return
    }
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email, password: newPassword,
      options: { data: { employee_id: emp.id, nama: emp.nama } }
    })
    if (signUpErr) {
      if (signUpErr.message.includes('already registered')) {
        setError('Email sudah terdaftar. Hapus manual di Supabase → Authentication → Users → cari ' + email + ' → Delete, lalu coba lagi.')
      } else setError('Gagal: ' + signUpErr.message)
      setSavingPassword(false); return
    }
    if (data.user) {
      await supabase.from('employees').update({ user_id: data.user.id }).eq('id', emp.id)
      setSuccess(`Akun ESS ${emp.nama} berhasil dibuat! Login: NIK ${emp.nik}`)
      fetchEmployees()
    }
    setShowPasswordForm(null); setNewPassword(''); setSavingPassword(false)
  }

  async function hapusAkun(emp) {
    if (!confirm(`Hapus akun ESS ${emp.nama}?\n\nCatatan: Hapus juga manual di Supabase → Authentication → Users → cari ${emp.nik.toLowerCase()}@klinik.internal → Delete.`)) return
    await supabase.from('employees').update({ user_id: null }).eq('id', emp.id)
    setSuccess(`Referensi akun ${emp.nama} dihapus.`)
    fetchEmployees()
  }

  // ─── CUTI/IZIN ────────────────────────────────────────────

  async function updateLeaveStatus(id, status, nama) {
    await supabase.from('leave_requests').update({ status, disetujui_oleh: employee?.nama || 'HR Admin' }).eq('id', id)
    setSuccess(`Pengajuan ${nama} ${status === 'approved' ? 'disetujui' : 'ditolak'}.`)
    fetchLeaves()
  }

  // ─── CICILAN/KASBON ───────────────────────────────────────

  async function updateLoanStatus(id, status, nama) {
    await supabase.from('loans').update({ status, disetujui_oleh: employee?.nama || 'HR Admin' }).eq('id', id)
    setSuccess(`Pengajuan ${nama} ${status === 'approved' ? 'disetujui' : status === 'lunas' ? 'ditandai lunas' : 'ditolak'}.`)
    fetchLoans()
  }

  // ─── JADWAL PIKET ─────────────────────────────────────────

  function bukaApprove(req) {
    setSelectedReq(req); setApproveSlot(''); setError(''); setShowApproveModal(true)
  }

  async function approveSchedule() {
    if (!approveSlot) { setError('Pilih slot jabatan.'); return }
    setLoading(true); setError('')

    // Cek slot sudah terisi
    const { data: existing } = await supabase.from('schedules')
      .select('id, employees(nama)').eq('tanggal', selectedReq.tanggal)
      .eq('outlet_id', selectedReq.outlet_id).eq('role_slot', approveSlot).single()

    if (existing) {
      setError(`Slot sudah terisi oleh ${existing.employees?.nama}.`)
      setLoading(false); return
    }

    await supabase.from('schedules').insert({
      tanggal: selectedReq.tanggal,
      employee_id: selectedReq.employee_id,
      role_slot: approveSlot,
      outlet_id: selectedReq.outlet_id,
    })

    await supabase.from('schedule_requests').update({
      status: 'approved', role_slot: approveSlot,
      disetujui_oleh: employee?.nama || 'Manager',
    }).eq('id', selectedReq.id)

    setSuccess(`Pengajuan ${selectedReq.employees?.nama} disetujui dan jadwal ditambahkan!`)
    logActivity({
      aksi: 'Approve Pengajuan Jadwal Piket',
      modul: 'jadwal',
      detail: `${selectedReq.employees?.nama} · ${selectedReq.tanggal} · slot: ${approveSlot}`,
      user_nama: employee?.nama,
      outlet_id: selectedReq.outlet_id,
    })
    setShowApproveModal(false); setSelectedReq(null)
    setLoading(false); fetchScheduleReqs()
  }

  async function rejectSchedule(id, nama) {
    if (!confirm(`Tolak pengajuan piket ${nama}?`)) return
    await supabase.from('schedule_requests').update({
      status: 'rejected', disetujui_oleh: employee?.nama || 'Manager',
    }).eq('id', id)
    setSuccess(`Pengajuan ${nama} ditolak.`)
    fetchScheduleReqs()
  }

  const filteredEmps = employees.filter(e =>
    e.nama.toLowerCase().includes(search.toLowerCase()) ||
    e.nik.toLowerCase().includes(search.toLowerCase())
  )
  const filteredLeaves = leaves.filter(l => filterStatus === 'semua' ? true : l.status === filterStatus)
  const filteredLoans = loans.filter(l => filterStatus === 'semua' ? true : l.status === filterStatus)
  const filteredScheduleReqs = scheduleReqs.filter(r => filterStatus === 'semua' ? true : r.status === filterStatus)

  const pendingLeaves = leaves.filter(l => l.status === 'pending').length
  const pendingLoans = loans.filter(l => l.status === 'pending').length
  const pendingSchedule = scheduleReqs.filter(r => r.status === 'pending').length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">ESS Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Kelola akun staff dan approve pengajuan</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Akun ESS Aktif</p>
            <p className="text-2xl font-semibold text-blue-600">{employees.filter(e=>e.user_id).length}</p>
            <p className="text-xs text-gray-400">dari {employees.length} staff</p>
          </div>
          <div className={`rounded-xl border p-4 ${pendingSchedule>0?'bg-blue-50 border-blue-200':'bg-white border-gray-200'}`}>
            <p className="text-xs text-gray-500 mb-1">Pengajuan Jadwal</p>
            <p className={`text-2xl font-semibold ${pendingSchedule>0?'text-blue-600':'text-gray-400'}`}>{pendingSchedule}</p>
            <p className="text-xs text-gray-400">menunggu approval</p>
          </div>
          <div className={`rounded-xl border p-4 ${pendingLeaves>0?'bg-yellow-50 border-yellow-200':'bg-white border-gray-200'}`}>
            <p className="text-xs text-gray-500 mb-1">Pengajuan Cuti/Izin</p>
            <p className={`text-2xl font-semibold ${pendingLeaves>0?'text-yellow-600':'text-gray-400'}`}>{pendingLeaves}</p>
            <p className="text-xs text-gray-400">menunggu approval</p>
          </div>
          <div className={`rounded-xl border p-4 ${pendingLoans>0?'bg-orange-50 border-orange-200':'bg-white border-gray-200'}`}>
            <p className="text-xs text-gray-500 mb-1">Pengajuan Cicilan/Kasbon</p>
            <p className={`text-2xl font-semibold ${pendingLoans>0?'text-orange-600':'text-gray-400'}`}>{pendingLoans}</p>
            <p className="text-xs text-gray-400">menunggu approval</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            ['akun','Kelola Akun ESS'],
            canApproveSchedule && ['jadwal', `Jadwal Piket${pendingSchedule>0?` (${pendingSchedule})`:''}`],
            ['cuti', `Cuti & Izin${pendingLeaves>0?` (${pendingLeaves})`:''}`],
            ['pinjaman', `Cicilan & Kasbon${pendingLoans>0?` (${pendingLoans})`:''}`],
          ].filter(Boolean).map(([val, label]) => (
            <button key={val} onClick={() => { setTab(val); setError(''); setSuccess(''); setFilterStatus('pending') }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab===val?'bg-blue-600 text-white':'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{success}</div>}

        {/* Filter status */}
        {tab !== 'akun' && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {[['pending','Menunggu'],['approved','Disetujui'],['rejected','Ditolak'],['semua','Semua']].map(([val,label]) => (
              <button key={val} onClick={() => setFilterStatus(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filterStatus===val?'bg-blue-600 text-white border-blue-600':'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ─── TAB AKUN ─── */}
        {tab === 'akun' && (
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-xs text-blue-700">
              💡 Buat akun untuk staff agar bisa login ke ESS dengan NIK dan password.
            </div>
            <input type="text" placeholder="Cari nama atau NIK..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Nama','NIK','Jabatan','Status Akun','Aksi'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEmps.length === 0
                    ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Tidak ada staff.</td></tr>
                    : filteredEmps.map(emp => (
                      <tr key={emp.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{emp.nama}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{emp.nik}</td>
                        <td className="px-4 py-3 text-gray-700 text-xs">{emp.jabatan}</td>
                        <td className="px-4 py-3">
                          {emp.user_id
                            ? <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-medium">✓ Aktif</span>
                            : <span className="bg-gray-100 text-gray-500 text-xs px-2 py-1 rounded-full">Belum ada akun</span>}
                        </td>
                        <td className="px-4 py-3">
                          {showPasswordForm === emp.id ? (
                            <div className="flex items-center gap-2">
                              <input type="password" placeholder="Min 6 karakter"
                                value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                className="border border-gray-300 rounded px-2 py-1 text-xs w-36 focus:outline-none" />
                              <button onClick={() => buatAkun(emp)} disabled={savingPassword}
                                className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
                                {savingPassword ? '...' : 'Simpan'}
                              </button>
                              <button onClick={() => { setShowPasswordForm(null); setNewPassword('') }}
                                className="text-gray-400 text-xs">Batal</button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => { setShowPasswordForm(emp.id); setNewPassword('') }}
                                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                                  emp.user_id?'border border-blue-200 text-blue-600 hover:bg-blue-50':'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                {emp.user_id ? 'Reset' : 'Buat Akun'}
                              </button>
                              {emp.user_id && (
                                <button onClick={() => hapusAkun(emp)} className="text-red-500 text-xs hover:underline">Hapus</button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── TAB JADWAL PIKET ─── */}
        {tab === 'jadwal' && canApproveSchedule && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Nama','Jabatan','Outlet','Tanggal','Keterangan','Status','Aksi'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredScheduleReqs.length === 0
                    ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Tidak ada pengajuan.</td></tr>
                    : filteredScheduleReqs.map(req => (
                      <tr key={req.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{req.employees?.nama}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{req.employees?.jabatan}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{req.outlets?.nama}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs">
                          {new Date(req.tanggal).toLocaleDateString('id-ID',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-32 truncate">{req.keterangan || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            req.status==='approved'?'bg-green-100 text-green-700':
                            req.status==='rejected'?'bg-red-100 text-red-600':
                            'bg-yellow-100 text-yellow-700'}`}>
                            {req.status === 'approved' && req.role_slot ? `✓ ${req.role_slot}` : req.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {req.status === 'pending' && (
                            <div className="flex gap-2">
                              <button onClick={() => bukaApprove(req)}
                                className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg">
                                Approve
                              </button>
                              <button onClick={() => rejectSchedule(req.id, req.employees?.nama)}
                                className="border border-red-200 text-red-600 hover:bg-red-50 text-xs px-3 py-1.5 rounded-lg">
                                Reject
                              </button>
                            </div>
                          )}
                          {req.status !== 'pending' && (
                            <span className="text-xs text-gray-400">{req.disetujui_oleh || '—'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── TAB CUTI ─── */}
        {tab === 'cuti' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Nama','Jabatan','Jenis','Dari','Sampai','Keterangan','Status','Aksi'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLeaves.length === 0
                    ? <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Tidak ada pengajuan.</td></tr>
                    : filteredLeaves.map(leave => (
                      <tr key={leave.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{leave.employees?.nama}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{leave.employees?.jabatan}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full capitalize ${
                            leave.jenis==='cuti'?'bg-blue-100 text-blue-700':
                            leave.jenis==='sakit'?'bg-yellow-100 text-yellow-700':'bg-purple-100 text-purple-700'}`}>
                            {leave.jenis}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {new Date(leave.tgl_mulai).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {new Date(leave.tgl_selesai).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-32 truncate">{leave.keterangan || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            leave.status==='approved'?'bg-green-100 text-green-700':
                            leave.status==='rejected'?'bg-red-100 text-red-600':'bg-yellow-100 text-yellow-700'}`}>
                            {leave.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {leave.status === 'pending' && (
                            <div className="flex gap-2">
                              <button onClick={() => updateLeaveStatus(leave.id,'approved',leave.employees?.nama)}
                                className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg">Approve</button>
                              <button onClick={() => updateLeaveStatus(leave.id,'rejected',leave.employees?.nama)}
                                className="border border-red-200 text-red-600 hover:bg-red-50 text-xs px-3 py-1.5 rounded-lg">Reject</button>
                            </div>
                          )}
                          {leave.status !== 'pending' && <span className="text-xs text-gray-400">{leave.disetujui_oleh||'—'}</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── TAB PINJAMAN ─── */}
        {tab === 'pinjaman' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Nama','Jabatan','Jenis','Jumlah','Cicilan/Bln','Keterangan','Status','Aksi'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLoans.length === 0
                    ? <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Tidak ada pengajuan.</td></tr>
                    : filteredLoans.map(loan => (
                      <tr key={loan.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{loan.employees?.nama}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{loan.employees?.jabatan}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full capitalize ${
                            loan.jenis==='cicilan'?'bg-blue-100 text-blue-700':'bg-orange-100 text-orange-700'}`}>
                            {loan.jenis}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">Rp {FMT(loan.jumlah)}</td>
                        <td className="px-4 py-3 text-blue-600 text-xs whitespace-nowrap">
                          Rp {FMT(Math.ceil(loan.jumlah / loan.jumlah_bulan))}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-32 truncate">{loan.keterangan||'—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            loan.status==='approved'?'bg-green-100 text-green-700':
                            loan.status==='rejected'?'bg-red-100 text-red-600':
                            loan.status==='lunas'?'bg-blue-100 text-blue-700':'bg-yellow-100 text-yellow-700'}`}>
                            {loan.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {loan.status === 'pending' && (
                            <div className="flex gap-2">
                              <button onClick={() => updateLoanStatus(loan.id,'approved',loan.employees?.nama)}
                                className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg">Approve</button>
                              <button onClick={() => updateLoanStatus(loan.id,'rejected',loan.employees?.nama)}
                                className="border border-red-200 text-red-600 hover:bg-red-50 text-xs px-3 py-1.5 rounded-lg">Reject</button>
                            </div>
                          )}
                          {loan.status === 'approved' && (
                            <button onClick={() => updateLoanStatus(loan.id,'lunas',loan.employees?.nama)}
                              className="border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs px-3 py-1.5 rounded-lg">Lunas</button>
                          )}
                          {!['pending','approved'].includes(loan.status) && (
                            <span className="text-xs text-gray-400">{loan.disetujui_oleh||'—'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Approve Jadwal */}
      {showApproveModal && selectedReq && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Approve Pengajuan Piket</h2>
              <p className="text-xs text-gray-500 mt-1">
                {selectedReq.employees?.nama} · {selectedReq.outlets?.nama}
                <br/>{new Date(selectedReq.tanggal).toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}
              </p>
            </div>
            <div className="px-5 py-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{error}</div>}
              <label className="text-xs font-medium text-gray-600 block mb-2">Pilih slot jabatan:</label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {ROLE_SLOTS.map(role => (
                  <button key={role.key} onClick={() => setApproveSlot(role.key)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      approveSlot === role.key
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'}`}>
                    <span className={`text-xs px-2 py-0.5 rounded ${role.color}`}>{role.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={approveSchedule} disabled={!approveSlot || loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium">
                {loading ? 'Memproses...' : 'Approve & Tambah Jadwal'}
              </button>
              <button onClick={() => { setShowApproveModal(false); setError('') }}
                className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-700">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}