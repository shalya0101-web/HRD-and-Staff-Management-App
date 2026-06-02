import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activityLog'
import { STATUS_PTKP_LIST } from '../lib/pph21'
import { useAuth } from '../lib/AuthContext'
import EmployeeDocuments from './EmployeeDocuments'


const KOSONG = {
  nama: '', nik: '', jabatan: '', departemen: '',
  tgl_masuk: '', no_hp: '', email: '',
  status: 'aktif', gaji_pokok: '', piket_per_bulan: 15, level_akses: 'staff',
  ikut_bpjs_kesehatan: true, ikut_bpjs_naker: true, bpjs_tanggungan_tambahan: 0,
  status_ptkp: 'TK/0', punya_npwp: true, default_shift: 'full', outlet_utama_id: '',
}

const DEPARTEMEN = ['Dokter','Perawat','Bidan','Farmasi','Administrasi','Laboratorium','Radiologi','Gizi','Umum','Assist']
const JABATAN = ['Dokter Umum','Dokter Spesialis','Perawat','Bidan','Apoteker','Asisten Apoteker','Analis Lab','Radiografer','Admin','Kasir','Cleaning Service','Security','Assist']
const REQUIRED_COLS = ['nama','nik','jabatan','departemen','tgl_masuk']

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [outlets, setOutlets] = useState([])
  const [shifts, setShifts] = useState([])
  const [empOutlets, setEmpOutlets] = useState({}) // { employee_id: [outlet_id, ...] }
  const [form, setForm] = useState(KOSONG)
  const [selectedOutlets, setSelectedOutlets] = useState([]) // outlet ids for form
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [sortField, setSortField] = useState('nama')
  const [sortDir, setSortDir] = useState('asc')
  const [error, setError] = useState('')
  const [docEmpId, setDocEmpId] = useState(null)
  const [docEmpName, setDocEmpName] = useState('')

  // Import state
  const [importData, setImportData] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileRef = useRef()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    await Promise.all([fetchEmployees(), fetchOutlets(), fetchEmpOutlets()])
  }

  async function fetchEmployees() {
    const { data, error } = await supabase
      .from('employees').select('*').order('created_at', { ascending: false })
    if (error) setError('Gagal memuat data: ' + error.message)
    else setEmployees(data || [])
  }

  async function fetchOutlets() {
    const { data } = await supabase.from('outlets').select('*').order('nama')
    const { data: shiftData } = await supabase.from('shift_settings').select('*').eq('aktif', true).order('urutan')
    if (shiftData) setShifts(shiftData)
    setOutlets(data || [])
  }

  async function fetchEmpOutlets() {
    const { data } = await supabase.from('employee_outlets').select('employee_id, outlet_id')
    if (!data) return
    const map = {}
    data.forEach(r => {
      if (!map[r.employee_id]) map[r.employee_id] = []
      map[r.employee_id].push(r.outlet_id)
    })
    setEmpOutlets(map)
  }

  function toggleOutlet(outletId) {
    if (selectedOutlets.includes(outletId)) {
      setSelectedOutlets(selectedOutlets.filter(id => id !== outletId))
    } else {
      if (selectedOutlets.length >= 3) {
        setError('Maksimal 3 outlet per staff.')
        return
      }
      setSelectedOutlets([...selectedOutlets, outletId])
    }
    setError('')
  }

  async function simpan() {
    if (!form.nama || !form.nik || !form.jabatan || !form.departemen || !form.tgl_masuk) {
      setError('Nama, NIK, Jabatan, Departemen, dan Tanggal Masuk wajib diisi.'); return
    }
    setError(''); setLoading(true)
    const payload = {
      ...form,
      gaji_pokok: form.gaji_pokok ? Number(form.gaji_pokok) : null,
      piket_per_bulan: Number(form.piket_per_bulan) || 15,
      level_akses: form.level_akses || 'staff',
      ikut_bpjs_kesehatan: form.ikut_bpjs_kesehatan !== false,
      ikut_bpjs_naker: form.ikut_bpjs_naker !== false,
      bpjs_tanggungan_tambahan: parseInt(form.bpjs_tanggungan_tambahan) || 0,
      status_ptkp: form.status_ptkp || 'TK/0',
      punya_npwp: form.punya_npwp !== false,
      default_shift: form.default_shift || 'full',
      outlet_utama_id: form.outlet_utama_id || (selectedOutlets.length === 1 ? selectedOutlets[0] : selectedOutlets[0] || null)
    }

    let empId = editId
    if (editId) {
      const { error } = await supabase.from('employees').update(payload).eq('id', editId)
      if (error) { setError('Gagal update: ' + error.message); setLoading(false); return }
    } else {
      const { data, error } = await supabase.from('employees').insert(payload).select().single()
      if (error) { setError('Gagal simpan: ' + error.message); setLoading(false); return }
      empId = data.id
    }

    // Simpan relasi outlet — hapus lama, insert baru
    await supabase.from('employee_outlets').delete().eq('employee_id', empId)
    if (selectedOutlets.length > 0) {
      await supabase.from('employee_outlets').insert(
        selectedOutlets.map(oid => ({ employee_id: empId, outlet_id: oid }))
      )
    }

    setForm(KOSONG); setSelectedOutlets([]); setShowForm(false)
    setEditId(null); setLoading(false)
    fetchAll()
  }

  async function hapus(id) {
    if (!confirm('Yakin ingin menghapus data pegawai ini? Semua data terkait (absensi, jadwal, payroll, dokumen) beserta file foto & dokumen akan ikut terhapus permanen.')) return

    // 1. Hapus file dokumen dari storage
    const { data: docs } = await supabase.from('employee_documents')
      .select('file_url').eq('employee_id', id)
    const docFiles = []
    ;(docs || []).forEach(d => {
      if (d.file_url) {
        const match = d.file_url.split('/documents/')[1]
        if (match) docFiles.push(decodeURIComponent(match.split('?')[0]))
      }
    })
    if (docFiles.length > 0) {
      await supabase.storage.from('documents').remove(docFiles)
    }

    // 2. Hapus foto absensi dari storage
    const { data: atts } = await supabase.from('attendance')
      .select('foto_masuk, foto_keluar').eq('employee_id', id)
    const fotoFiles = []
    ;(atts || []).forEach(a => {
      ;[a.foto_masuk, a.foto_keluar].forEach(url => {
        if (url) {
          const match = url.split('/attendance-photos/')[1]
          if (match) fotoFiles.push(decodeURIComponent(match.split('?')[0]))
        }
      })
    })
    for (let i = 0; i < fotoFiles.length; i += 100) {
      const batch = fotoFiles.slice(i, i + 100)
      if (batch.length) await supabase.storage.from('attendance-photos').remove(batch)
    }

    // 3. Hapus pegawai (data DB terkait ikut CASCADE otomatis)
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) { setError('Gagal menghapus: ' + error.message); return }
    fetchAll()
  }

  function mulaiEdit(emp) {
    const { created_at, ...rest } = emp
    setForm(rest)
    setEditId(emp.id)
    setSelectedOutlets(empOutlets[emp.id] || [])
    setShowForm(true)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function batalForm() {
    setForm(KOSONG); setSelectedOutlets([])
    setShowForm(false); setEditId(null); setError('')
  }

  // ─── IMPORT EXCEL ───────────────────────────────────────────
  function bacaExcel(e) {
    const file = e.target.files[0]
    if (!file) return
    setImportErrors([]); setImportData([]); setImportResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (rows.length === 0) {
          setImportErrors([{ row: '-', pesan: 'File Excel kosong.' }]); return
        }
        const cols = Object.keys(rows[0]).map(k => k.trim().toLowerCase())
        const missing = REQUIRED_COLS.filter(c => !cols.includes(c))
        if (missing.length > 0) {
          setImportErrors([{ row: '-', pesan: `Kolom wajib tidak ditemukan: ${missing.join(', ')}` }]); return
        }
        const errors = []; const valid = []
        rows.forEach((row, idx) => {
          const rowNum = idx + 2
          const r = {}
          Object.entries(row).forEach(([k, v]) => { r[k.trim().toLowerCase()] = v })
          const rowErrors = []
          if (!r.nama) rowErrors.push('Nama kosong')
          if (!r.nik) rowErrors.push('NIK kosong')
          if (!r.jabatan) rowErrors.push('Jabatan kosong')
          if (!r.departemen) rowErrors.push('Departemen kosong')
          if (!r.tgl_masuk) rowErrors.push('Tanggal masuk kosong')
          let tgl = ''
          if (r.tgl_masuk) {
            if (r.tgl_masuk instanceof Date) tgl = r.tgl_masuk.toISOString().split('T')[0]
            else {
              const str = String(r.tgl_masuk).trim()
              if (/^\d{4}-\d{2}-\d{2}$/.test(str)) tgl = str
              else rowErrors.push(`Format tanggal salah: "${str}"`)
            }
          }
          if (rowErrors.length > 0) errors.push({ row: rowNum, nama: r.nama || '(kosong)', pesan: rowErrors.join(', ') })
          else valid.push({
            nama: String(r.nama).trim(), nik: String(r.nik).trim(),
            jabatan: String(r.jabatan).trim(), departemen: String(r.departemen).trim(),
            tgl_masuk: tgl, no_hp: r.no_hp ? String(r.no_hp).trim() : '',
            email: r.email ? String(r.email).trim() : '',
            status: r.status ? String(r.status).trim() : 'aktif',
            ikut_bpjs_kesehatan: r.ikut_bpjs_kesehatan !== false,
            ikut_bpjs_naker: r.ikut_bpjs_naker !== false,
            bpjs_tanggungan_tambahan: r.bpjs_tanggungan_tambahan || 0,
            status_ptkp: r.status_ptkp || 'TK/0',
            punya_npwp: r.punya_npwp !== false,
            default_shift: r.default_shift || 'full',
            outlet_utama_id: r.outlet_utama_id || '',
            gaji_pokok: r.gaji_pokok ? Number(r.gaji_pokok) : null,
            piket_per_bulan: r.piket_per_bulan ? Number(r.piket_per_bulan) : 15,
          })
        })
        setImportErrors(errors); setImportData(valid)
      } catch (e) {
        setImportErrors([{ row: '-', pesan: 'Gagal membaca file: ' + e.message }])
      }
    }
    reader.readAsBinaryString(file)
  }

  async function prosesImport() {
    if (importData.length === 0) return
    setImportLoading(true)
    let berhasil = 0; let gagal = 0; const gagalList = []
    for (const row of importData) {
      const { error } = await supabase.from('employees').insert(row)
      if (error) { gagal++; gagalList.push({ nama: row.nama, pesan: error.message }) }
      else berhasil++
    }
    setImportResult({ berhasil, gagal, gagalList })
    setImportLoading(false); setImportData([])
    if (fileRef.current) fileRef.current.value = ''
    fetchAll()
  }

  function resetImport() {
    setImportData([]); setImportErrors([]); setImportResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ─── FILTER & SORT ─────────────────────────────────────────
  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const filtered = employees
    .filter(e => {
      const matchSearch = [e.nama, e.jabatan, e.departemen, e.nik]
        .some(v => v?.toLowerCase().includes(search.toLowerCase()))
      const matchDept = filterDept ? e.departemen === filterDept : true
      return matchSearch && matchDept
    })
    .sort((a, b) => {
      let va = a[sortField] || ''
      let vb = b[sortField] || ''
      // numerik
      if (sortField === 'piket_per_bulan' || sortField === 'gaji_pokok') {
        va = Number(va) || 0; vb = Number(vb) || 0
        return sortDir === 'asc' ? va - vb : vb - va
      }
      // tanggal
      if (sortField === 'tgl_masuk') {
        va = va ? new Date(va).getTime() : 0
        vb = vb ? new Date(vb).getTime() : 0
        return sortDir === 'asc' ? va - vb : vb - va
      }
      // string
      va = va.toString().toLowerCase()
      vb = vb.toString().toLowerCase()
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })

  const totalAktif = employees.filter(e => e.status === 'aktif').length
  const totalInaktif = employees.filter(e => e.status !== 'aktif').length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Data Pegawai</h1>
            <p className="text-sm text-gray-500 mt-1">Manajemen data seluruh staff klinik</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setShowImport(!showImport); setShowForm(false); resetImport() }}
              className="border border-blue-300 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              ⬆ Import Excel
            </button>
            <button onClick={() => { setShowForm(!showForm); setShowImport(false); setError('') }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              {showForm ? '✕ Tutup Form' : '+ Tambah Pegawai'}
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[['Total Pegawai', employees.length, 'text-gray-900'],
            ['Aktif', totalAktif, 'text-green-600'],
            ['Tidak Aktif', totalInaktif, 'text-red-500']].map(([label, val, cls]) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-2xl font-semibold ${cls}`}>{val}</p>
            </div>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}

        {/* ─── PANEL IMPORT ─── */}
        {showImport && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-800 mb-1">Import Data Pegawai dari Excel</h2>
            <p className="text-sm text-gray-500 mb-4">Gunakan template dengan kolom: nama, nik, jabatan, departemen, tgl_masuk, no_hp, email, status, gaji_pokok, piket_per_bulan</p>
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Upload file .xlsx</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={bacaExcel}
                className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100 cursor-pointer border border-gray-200 rounded-lg p-1" />
            </div>
            {importErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-red-700 mb-2">⚠ {importErrors.length} baris bermasalah:</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {importErrors.map((e, i) => (
                    <div key={i} className="text-xs text-red-600">Baris {e.row}{e.nama ? ` (${e.nama})` : ''}: {e.pesan}</div>
                  ))}
                </div>
                {importData.length > 0 && <p className="text-xs text-gray-500 mt-2">{importData.length} baris valid tetap bisa diimport.</p>}
              </div>
            )}
            {importData.length > 0 && !importResult && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Preview — {importData.length} data siap diimport:</p>
                <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>{['Nama','NIK','Jabatan','Departemen','Tgl Masuk','Status','Piket/Bln'].map(h=>(
                        <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importData.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{row.nama}</td>
                          <td className="px-3 py-2 font-mono text-gray-500">{row.nik}</td>
                          <td className="px-3 py-2">{row.jabatan}</td>
                          <td className="px-3 py-2">{row.departemen}</td>
                          <td className="px-3 py-2">{row.tgl_masuk}</td>
                          <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded-full text-xs ${row.status==='aktif'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-600'}`}>{row.status}</span></td>
                          <td className="px-3 py-2 text-center">{row.piket_per_bulan}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-3 mt-3">
                  <button onClick={prosesImport} disabled={importLoading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium">
                    {importLoading ? 'Mengimport...' : `Import ${importData.length} Data`}
                  </button>
                  <button onClick={resetImport} className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Reset</button>
                </div>
              </div>
            )}
            {importResult && (
              <div className={`rounded-lg p-4 ${importResult.gagal===0?'bg-green-50 border border-green-200':'bg-yellow-50 border border-yellow-200'}`}>
                <p className={`text-sm font-medium mb-1 ${importResult.gagal===0?'text-green-700':'text-yellow-700'}`}>Import selesai!</p>
                <p className="text-sm text-gray-600">✓ {importResult.berhasil} berhasil.{importResult.gagal>0&&` ✗ ${importResult.gagal} gagal (kemungkinan NIK duplikat).`}</p>
                {importResult.gagalList.map((g,i)=><p key={i} className="text-xs text-red-600 mt-1">{g.nama}: {g.pesan}</p>)}
                <button onClick={()=>{setShowImport(false);resetImport()}} className="mt-3 text-sm text-blue-600 hover:underline">Tutup</button>
              </div>
            )}
          </div>
        )}

        {/* ─── FORM TAMBAH/EDIT ─── */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">{editId ? 'Edit Data Pegawai' : 'Tambah Pegawai Baru'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ['nama','Nama Lengkap *','text','Contoh: dr. Siti Rahayu'],
                ['nik','NIK / ID Pegawai *','text','Contoh: KLN-001'],
                ['no_hp','No. HP','text','Contoh: 08123456789'],
                ['email','Email','email','Contoh: siti@klinik.com'],
                ['tgl_masuk','Tanggal Masuk *','date',''],
                ['gaji_pokok','Gaji Pokok (Rp)','number','Contoh: 5000000'],
                ['piket_per_bulan','Piket Per Bulan','number','Contoh: 10 atau 15'],
              ].map(([field, label, type, ph]) => (
                <div key={field}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
                  <input type={type} placeholder={ph} value={form[field]}
                    onChange={e => setForm({ ...form, [field]: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Jabatan *</label>
                <select value={form.jabatan} onChange={e => setForm({ ...form, jabatan: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Pilih Jabatan --</option>
                  {JABATAN.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Departemen *</label>
                <select value={form.departemen} onChange={e => setForm({ ...form, departemen: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Pilih Departemen --</option>
                  {DEPARTEMEN.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="aktif">Aktif</option>
                  <option value="tidak aktif">Tidak Aktif</option>
                  <option value="cuti">Cuti</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Level Otorisasi</label>
                <select value={form.level_akses || 'staff'} onChange={e => setForm({ ...form, level_akses: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="staff">Staff</option>
                  <option value="pj_klinik">Penanggung Jawab Klinik</option>
                  <option value="manager">Manager</option>
                  <option value="direktur">Direktur</option>
                </select>
              </div>

              {/* BPJS */}
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-600 block mb-2">Kepesertaan BPJS</label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox"
                      checked={form.ikut_bpjs_kesehatan !== false}
                      onChange={e => setForm({...form, ikut_bpjs_kesehatan: e.target.checked})}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">BPJS Kesehatan</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox"
                      checked={form.ikut_bpjs_naker !== false}
                      onChange={e => setForm({...form, ikut_bpjs_naker: e.target.checked})}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">BPJS Ketenagakerjaan</span>
                  </label>
                </div>
                {form.ikut_bpjs_kesehatan !== false && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tanggungan Tambahan BPJS Kesehatan</label>
                    <input type="number" min="0" value={form.bpjs_tanggungan_tambahan || 0}
                      onChange={e => setForm({...form, bpjs_tanggungan_tambahan: e.target.value})}
                      className="w-full sm:w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-xs text-gray-400 mt-1">
                      Diisi bila ada anggota keluarga ke-6 dan seterusnya (di luar 5 orang pertama: pekerja + pasangan + 3 anak yang sudah ditanggung otomatis). Setiap tambahan dipotong 1% dari gaji. Isi 0 jika tidak ada.
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status PTKP (untuk PPh 21)</label>
                <select value={form.status_ptkp || 'TK/0'} onChange={e => setForm({...form, status_ptkp: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {STATUS_PTKP_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">TK = Tidak Kawin, K = Kawin. Angka = jumlah tanggungan (maks 3).</p>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input type="checkbox" checked={form.punya_npwp !== false}
                    onChange={e => setForm({...form, punya_npwp: e.target.checked})}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">Memiliki NPWP</span>
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Shift Default</label>
                <select value={form.default_shift || 'full'} onChange={e => setForm({...form, default_shift: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {shifts.map(s => <option key={s.kode} value={s.kode}>{s.nama} ({s.jam_mulai}-{s.jam_selesai})</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Shift default saat dijadwalkan. Bisa diubah per jadwal piket.</p>
              </div>

              {/* Outlet Selection */}
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-600 block mb-2">
                  Outlet Tempat Bertugas <span className="text-gray-400">(maksimal 3)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {outlets.map(o => {
                    const selected = selectedOutlets.includes(o.id)
                    return (
                      <button key={o.id} type="button"
                        onClick={() => toggleOutlet(o.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          selected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                        }`}>
                        {selected ? '✓ ' : ''}{o.nama}
                      </button>
                    )
                  })}
                </div>
                {selectedOutlets.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1">{selectedOutlets.length} outlet dipilih</p>
                )}
                {selectedOutlets.length > 1 && (
                  <div className="mt-3">
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      Outlet Utama (penanggung gaji) <span className="text-gray-400">— untuk staff multi-outlet</span>
                    </label>
                    <select value={form.outlet_utama_id || ''}
                      onChange={e => setForm({...form, outlet_utama_id: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">-- Pilih outlet utama --</option>
                      {outlets.filter(o => selectedOutlets.includes(o.id)).map(o => (
                        <option key={o.id} value={o.id}>{o.nama}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">Gaji hanya dibebankan & muncul di payroll outlet utama ini, mencegah gaji dobel.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={simpan} disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium">
                {loading ? 'Menyimpan...' : editId ? 'Update Data' : 'Simpan'}
              </button>
              <button onClick={batalForm}
                className="border border-gray-300 hover:bg-gray-50 px-6 py-2 rounded-lg text-sm text-gray-700">Batal</button>
            </div>
          </div>
        )}

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input type="text" placeholder="Cari nama, NIK, jabatan..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Semua Departemen</option>
            {DEPARTEMEN.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Tabel */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {[
                    { label: 'Nama', field: 'nama' },
                    { label: 'NIK', field: 'nik' },
                    { label: 'Jabatan', field: 'jabatan' },
                    { label: 'Departemen', field: 'departemen' },
                    { label: 'Tgl Masuk', field: 'tgl_masuk' },
                    { label: 'Piket/Bln', field: 'piket_per_bulan' },
                    { label: 'Outlet', field: null },
                    { label: 'Level', field: 'level_akses' },
                    { label: 'Status', field: 'status' },
                    { label: 'Aksi', field: null },
                  ].map(({ label, field }) => (
                    <th key={label}
                      onClick={() => field && toggleSort(field)}
                      className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wide select-none ${
                        field ? 'cursor-pointer hover:bg-gray-100 text-gray-600' : 'text-gray-500'
                      } ${sortField === field ? 'text-blue-600' : ''}`}>
                      <span className="flex items-center gap-1">
                        {label}
                        {field && (
                          <span className="text-gray-300">
                            {sortField === field
                              ? (sortDir === 'asc' ? ' ↑' : ' ↓')
                              : ' ↕'}
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {employees.length === 0 ? 'Belum ada data pegawai.' : 'Tidak ada hasil yang cocok.'}
                  </td></tr>
                ) : filtered.map(emp => {
                  const outletIds = empOutlets[emp.id] || []
                  const outletNames = outletIds.map(id => outlets.find(o => o.id === id)?.nama).filter(Boolean)
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{emp.nama}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{emp.nik}</td>
                      <td className="px-4 py-3 text-gray-700">{emp.jabatan}</td>
                      <td className="px-4 py-3 text-gray-700">{emp.departemen}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {emp.tgl_masuk ? new Date(emp.tgl_masuk).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">{emp.piket_per_bulan || 15}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {outletNames.length === 0
                            ? <span className="text-xs text-gray-400">-</span>
                            : outletNames.map(name => (
                              <span key={name} className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">{name}</span>
                            ))
                          }
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          emp.level_akses==='direktur' ? 'bg-purple-100 text-purple-700' :
                          emp.level_akses==='manager' ? 'bg-blue-100 text-blue-700' :
                          emp.level_akses==='pj_klinik' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-500'}`}>
                          {emp.level_akses==='direktur'?'Direktur':emp.level_akses==='manager'?'Manager':emp.level_akses==='pj_klinik'?'PJ Klinik':'Staff'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          emp.status==='aktif' ? 'bg-green-100 text-green-700' :
                          emp.status==='cuti' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-600'}`}>
                          {emp.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button onClick={() => mulaiEdit(emp)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                          <button onClick={() => hapus(emp.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Hapus</button>
                          <button onClick={() => { setDocEmpId(emp.id); setDocEmpName(emp.nama) }}
                            className="text-blue-600 text-xs hover:underline">📁 Dokumen</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              Menampilkan {filtered.length} dari {employees.length} pegawai
            </div>
          )}
        </div>
      </div>
      {docEmpId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-50 rounded-2xl w-full max-w-4xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 bg-white rounded-t-2xl">
              <p className="font-semibold text-gray-900">Dokumen — {docEmpName}</p>
              <button onClick={() => setDocEmpId(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <EmployeeDocuments employeeId={docEmpId} employeeName={docEmpName} embedded={true} />
          </div>
        </div>
      )}
    </div>
  )
}