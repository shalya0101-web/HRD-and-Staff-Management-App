import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const FMT = n => new Intl.NumberFormat('id-ID').format(n || 0)
const BULAN_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const today = new Date()

export default function LoanManagement() {
  const { isDirektur } = useAuth()
  const [tab, setTab] = useState('cicilan') // 'cicilan' | 'kasbon' | 'arisan'
  const [employees, setEmployees] = useState([])
  const [loans, setLoans] = useState([])
  const [arisanSettings, setArisanSettings] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form cicilan/kasbon baru (HR input manual)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    employee_id: '', jenis: 'cicilan', jumlah: '',
    jumlah_bulan: 1, tgl_mulai: '', keterangan: '', status: 'pending'
  })

  useEffect(() => { fetchAll() }, [tab])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchEmployees(), fetchLoans(), fetchArisanSettings()])
    setLoading(false)
  }

  async function fetchEmployees() {
    const { data } = await supabase.from('employees').select('id, nama, jabatan, departemen').eq('status', 'aktif').order('nama')
    setEmployees(data || [])
  }

  async function fetchLoans() {
    const { data } = await supabase.from('loans')
      .select('*, employees(id, nama, jabatan)')
      .eq('jenis', tab === 'arisan' ? 'cicilan' : tab)
      .order('created_at', { ascending: false })
    setLoans(data || [])
  }

  async function fetchArisanSettings() {
    const { data } = await supabase.from('arisan_settings').select('*')
    const map = {}
    ;(data || []).forEach(a => { map[a.employee_id] = a })
    setArisanSettings(map)
  }

  // ─── CICILAN / KASBON ────────────────────────────────────

  async function simpanLoan() {
    if (!form.employee_id || !form.jumlah) { setError('Pegawai dan jumlah wajib diisi.'); return }
    if (form.jenis === 'cicilan' && (!form.jumlah_bulan || form.jumlah_bulan < 1)) {
      setError('Jumlah bulan cicilan wajib diisi.'); return
    }
    setError('')
    const payload = {
      employee_id: form.employee_id,
      jenis: form.jenis,
      jumlah: Number(form.jumlah),
      jumlah_bulan: form.jenis === 'kasbon' ? 1 : Number(form.jumlah_bulan),
      tgl_mulai: form.tgl_mulai || today.toISOString().split('T')[0],
      keterangan: form.keterangan,
      status: form.status,
      tgl_pengajuan: today.toISOString().split('T')[0],
    }
    const { error } = await supabase.from('loans').insert(payload)
    if (error) { setError('Gagal simpan: ' + error.message); return }
    setSuccess('Data berhasil disimpan!')
    setForm({ employee_id:'', jenis: tab === 'kasbon' ? 'kasbon' : 'cicilan', jumlah:'', jumlah_bulan:1, tgl_mulai:'', keterangan:'', status:'pending' })
    setShowForm(false)
    fetchLoans()
  }

  async function updateStatus(id, status) {
    // Approve hanya boleh direktur
    if (status === 'approved' && !isDirektur) {
      setError('Hanya Direktur yang dapat menyetujui pengajuan pinjaman.')
      return
    }
    const payload = { status }
    if (status === 'approved') {
      payload.tgl_disetujui = new Date().toISOString().split('T')[0]
    }
    await supabase.from('loans').update(payload).eq('id', id)
    fetchLoans()
    setSuccess(`Status berhasil diubah ke ${status}`)
  }

  async function hapusLoan(id) {
    if (!confirm('Hapus data ini?')) return
    await supabase.from('loans').delete().eq('id', id)
    fetchLoans()
  }

  // Hitung sisa cicilan
  async function hitungSisaCicilan(loan) {
    const { data } = await supabase.from('loan_payments')
      .select('jumlah').eq('loan_id', loan.id)
    const totalBayar = (data || []).reduce((s, p) => s + (p.jumlah || 0), 0)
    return loan.jumlah - totalBayar
  }

  // ─── ARISAN ──────────────────────────────────────────────

  async function simpanArisan(empId) {
    const setting = arisanSettings[empId] || {}
    if (setting.id) {
      await supabase.from('arisan_settings').update({
        nominal: setting.nominal, aktif: setting.aktif, updated_at: new Date().toISOString()
      }).eq('id', setting.id)
    } else {
      await supabase.from('arisan_settings').insert({
        employee_id: empId, nominal: setting.nominal || 0, aktif: setting.aktif ?? true
      })
    }
    fetchArisanSettings()
    setSuccess('Setting arisan tersimpan!')
  }

  async function simpanSemuaArisan() {
    for (const emp of employees) {
      const setting = arisanSettings[emp.id]
      if (setting) await simpanArisan(emp.id)
    }
    setSuccess('Semua setting arisan tersimpan!')
  }

  const totalArisan = Object.values(arisanSettings).filter(a => a.aktif).reduce((s, a) => s + (a.nominal || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Cicilan, Kasbon & Arisan</h1>
            <p className="text-sm text-gray-500 mt-1">Kelola potongan gaji staff</p>
          </div>
          {(tab === 'cicilan' || tab === 'kasbon') && (
            <button onClick={() => { setShowForm(!showForm); setError('') }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {showForm ? '✕ Tutup' : `+ Tambah ${tab === 'cicilan' ? 'Cicilan' : 'Kasbon'}`}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[['cicilan','Cicilan'],['kasbon','Kasbon'],['arisan','Arisan']].map(([val,label]) => (
            <button key={val} onClick={() => { setTab(val); setShowForm(false); setError(''); setSuccess('') }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===val?'bg-blue-600 text-white':'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{success}</div>}

        {/* ─── FORM CICILAN / KASBON ─── */}
        {showForm && (tab === 'cicilan' || tab === 'kasbon') && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">
              {tab === 'cicilan' ? 'Input Cicilan Baru' : 'Input Kasbon Baru'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Nama Staff *</label>
                <select value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Pilih Staff --</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.nama} — {e.jabatan}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  {tab === 'cicilan' ? 'Total Pinjaman (Rp) *' : 'Jumlah Kasbon (Rp) *'}
                </label>
                <input type="number" placeholder="Contoh: 5000000"
                  value={form.jumlah} onChange={e => setForm({...form, jumlah: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {tab === 'cicilan' && (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Jumlah Bulan Cicilan *</label>
                  <input type="number" min="1" placeholder="Contoh: 12"
                    value={form.jumlah_bulan} onChange={e => setForm({...form, jumlah_bulan: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {form.jumlah && form.jumlah_bulan && (
                    <p className="text-xs text-blue-600 mt-1">
                      Cicilan/bulan: Rp {FMT(Math.ceil(Number(form.jumlah) / Number(form.jumlah_bulan)))}
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  {tab === 'cicilan' ? 'Mulai Cicilan' : 'Dipotong Bulan'}
                </label>
                <input type="month"
                  value={form.tgl_mulai ? form.tgl_mulai.slice(0,7) : ''}
                  onChange={e => setForm({...form, tgl_mulai: e.target.value + '-01'})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {isDirektur && <option value="approved">Approved — langsung aktif</option>}
                  <option value="pending">Pending — menunggu persetujuan</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-600 block mb-1">Keterangan</label>
                <input type="text" placeholder="Contoh: Pinjaman untuk renovasi rumah"
                  value={form.keterangan} onChange={e => setForm({...form, keterangan: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={simpanLoan}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium">
                Simpan
              </button>
              <button onClick={() => setShowForm(false)}
                className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Batal
              </button>
            </div>
          </div>
        )}

        {/* ─── TABEL CICILAN ─── */}
        {tab === 'cicilan' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Daftar Cicilan Aktif</p>
              <p className="text-xs text-gray-500">{loans.filter(l=>l.status==='approved').length} aktif</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Nama','Jabatan','Total Pinjaman','Cicilan/Bulan','Jumlah Bulan','Mulai','Keterangan','Status',''].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loans.length === 0
                    ? <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Belum ada data cicilan.</td></tr>
                    : loans.map(loan => (
                      <tr key={loan.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{loan.employees?.nama}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{loan.employees?.jabatan}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">Rp {FMT(loan.jumlah)}</td>
                        <td className="px-4 py-3 font-medium text-blue-600 whitespace-nowrap">
                          Rp {FMT(Math.ceil(loan.jumlah / loan.jumlah_bulan))}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700">{loan.jumlah_bulan} bln</td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {loan.tgl_mulai ? new Date(loan.tgl_mulai).toLocaleDateString('id-ID',{month:'short',year:'numeric'}) : '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-32 truncate">{loan.keterangan||'-'}</td>
                        <td className="px-4 py-3">
                          <select value={loan.status} onChange={e=>updateStatus(loan.id, e.target.value)}
                            className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${
                              loan.status==='approved'?'bg-green-100 text-green-700':
                              loan.status==='lunas'?'bg-blue-100 text-blue-700':
                              loan.status==='rejected'?'bg-red-100 text-red-600':
                              'bg-yellow-100 text-yellow-700'}`}>
                            <option value="pending">Pending</option>
                            {(isDirektur || loan.status==='approved') && <option value="approved">Approved</option>}
                            <option value="rejected">Rejected</option>
                            <option value="lunas">Lunas</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={()=>hapusLoan(loan.id)} className="text-red-500 text-xs hover:underline">Hapus</button>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── TABEL KASBON ─── */}
        {tab === 'kasbon' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Daftar Kasbon</p>
              <p className="text-xs text-gray-500">{loans.filter(l=>l.status==='approved').length} menunggu dipotong</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Nama','Jabatan','Jumlah Kasbon','Dipotong Bulan','Keterangan','Status',''].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loans.length === 0
                    ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Belum ada data kasbon.</td></tr>
                    : loans.map(loan => (
                      <tr key={loan.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{loan.employees?.nama}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{loan.employees?.jabatan}</td>
                        <td className="px-4 py-3 font-medium text-red-600 whitespace-nowrap">Rp {FMT(loan.jumlah)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {loan.tgl_mulai ? new Date(loan.tgl_mulai).toLocaleDateString('id-ID',{month:'long',year:'numeric'}) : '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-32 truncate">{loan.keterangan||'-'}</td>
                        <td className="px-4 py-3">
                          <select value={loan.status} onChange={e=>updateStatus(loan.id, e.target.value)}
                            className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${
                              loan.status==='approved'?'bg-green-100 text-green-700':
                              loan.status==='lunas'?'bg-blue-100 text-blue-700':
                              loan.status==='rejected'?'bg-red-100 text-red-600':
                              'bg-yellow-100 text-yellow-700'}`}>
                            <option value="pending">Pending</option>
                            {(isDirektur || loan.status==='approved') && <option value="approved">Approved</option>}
                            <option value="rejected">Rejected</option>
                            <option value="lunas">Lunas</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={()=>hapusLoan(loan.id)} className="text-red-500 text-xs hover:underline">Hapus</button>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── ARISAN ─── */}
        {tab === 'arisan' && (
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm text-blue-700 flex justify-between items-center">
              <span>Total arisan aktif per bulan: <strong>Rp {FMT(totalArisan)}</strong></span>
              <button onClick={simpanSemuaArisan}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700">
                Simpan Semua
              </button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Nama','Jabatan','Nominal Arisan/Bulan (Rp)','Aktif',''].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {employees.map(emp => {
                      const setting = arisanSettings[emp.id] || {}
                      return (
                        <tr key={emp.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{emp.nama}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{emp.jabatan}</td>
                          <td className="px-4 py-2">
                            <input type="number" placeholder="0"
                              value={setting.nominal || 0}
                              onChange={e => setArisanSettings({...arisanSettings, [emp.id]: {...setting, nominal: Number(e.target.value)}})}
                              className="w-36 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => setArisanSettings({...arisanSettings, [emp.id]: {...setting, aktif: !setting.aktif}})}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${setting.aktif !== false ? 'bg-blue-600' : 'bg-gray-300'}`}>
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${setting.aktif !== false ? 'translate-x-4' : 'translate-x-1'}`} />
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => simpanArisan(emp.id)}
                              className="text-blue-600 text-xs hover:underline">Simpan</button>
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