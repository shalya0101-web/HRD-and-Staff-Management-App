import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useOutlet } from '../lib/OutletContext'
import * as XLSX from 'xlsx'

const BULAN_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const today = new Date()
const NILAI = ['Sangat Baik', 'Baik', 'Cukup', 'Kurang']
const NILAI_SCORE = { 'Sangat Baik': 4, 'Baik': 3, 'Cukup': 2, 'Kurang': 1 }
const NILAI_COLOR = {
  'Sangat Baik': 'bg-green-100 text-green-700 border-green-200',
  'Baik': 'bg-blue-100 text-blue-700 border-blue-200',
  'Cukup': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Kurang': 'bg-red-100 text-red-600 border-red-200',
}

function hitungNilaiAkhir(scores, points) {
  if (!scores || !points || points.length === 0) return null
  const vals = points.map(p => NILAI_SCORE[scores[p.id]]).filter(Boolean)
  if (vals.length === 0) return null
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length
  if (avg >= 3.5) return { label: 'Sangat Baik', score: avg }
  if (avg >= 2.5) return { label: 'Baik', score: avg }
  if (avg >= 1.5) return { label: 'Cukup', score: avg }
  return { label: 'Kurang', score: avg }
}

export default function Performance() {
  const { activeOutlet, activeOutletData } = useOutlet()
  const [tab, setTab] = useState('penilaian') // 'penilaian' | 'setting'
  const [bulan, setBulan] = useState(today.getMonth() + 1)
  const [tahun, setTahun] = useState(today.getFullYear())

  // Data struktur penilaian
  const [categories, setCategories] = useState([])
  const [subcategories, setSubcategories] = useState([])
  const [points, setPoints] = useState([])

  // Data penilaian
  const [employees, setEmployees] = useState([])
  const [reviews, setReviews] = useState([])
  const [allScores, setAllScores] = useState({}) // { review_id: { point_id: nilai } }

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')

  // Form penilaian
  const [mode, setMode] = useState('list') // 'list' | 'form'
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [formScores, setFormScores] = useState({}) // { point_id: nilai }
  const [formReviewer, setFormReviewer] = useState('')
  const [formCatatan, setFormCatatan] = useState('')
  const [savingReview, setSavingReview] = useState(false)

  // Setting form
  const [newKategori, setNewKategori] = useState('')
  const [newSubkat, setNewSubkat] = useState({ category_id: '', nama: '' })
  const [newPoin, setNewPoin] = useState({ subcategory_id: '', deskripsi: '' })
  const [editingPoint, setEditingPoint] = useState(null)
  const [editingSubcat, setEditingSubcat] = useState(null)
  const [editingCat, setEditingCat] = useState(null)

  useEffect(() => { fetchStruktur() }, [])
  useEffect(() => { if (activeOutlet) fetchPenilaian() }, [bulan, tahun, activeOutlet])

  async function fetchStruktur() {
    const [catRes, subRes, poinRes] = await Promise.all([
      supabase.from('performance_categories').select('*').order('urutan'),
      supabase.from('performance_subcategories').select('*').order('urutan'),
      supabase.from('performance_points').select('*').order('urutan'),
    ])
    setCategories(catRes.data || [])
    setSubcategories(subRes.data || [])
    setPoints(poinRes.data || [])
  }

  async function fetchPenilaian() {
    setLoading(true)
    const [empRes, revRes] = await Promise.all([
      supabase.from('employee_outlets')
        .select('employee_id, employees(id, nama, jabatan, departemen, status)')
        .eq('outlet_id', activeOutlet),
      supabase.from('performance_reviews')
        .select('*, performance_scores(point_id, nilai)')
        .eq('bulan', bulan).eq('tahun', tahun).eq('outlet_id', activeOutlet),
    ])
    setEmployees((empRes.data||[]).map(r=>r.employees).filter(e=>e?.status==='aktif'))

    const revData = revRes.data || []
    setReviews(revData)

    // Build scores map
    const map = {}
    revData.forEach(r => {
      map[r.id] = {}
      ;(r.performance_scores || []).forEach(s => { map[r.id][s.point_id] = s.nilai })
    })
    setAllScores(map)
    setLoading(false)
  }

  // ─── FORM PENILAIAN ───────────────────────────────────────

  function bukaForm(emp) {
    const existing = reviews.find(r => r.employee_id === emp.id)
    setSelectedEmp(emp)
    setFormReviewer(existing?.reviewer || '')
    setFormCatatan(existing?.catatan || '')
    if (existing && allScores[existing.id]) {
      setFormScores({ ...allScores[existing.id] })
    } else {
      setFormScores({})
    }
    setMode('form')
    setError('')
  }

  async function simpanPenilaian() {
    const totalPoin = points.length
    const terisi = Object.keys(formScores).filter(k => formScores[k]).length
    if (terisi < totalPoin) {
      setError(`Semua poin wajib dinilai. ${terisi}/${totalPoin} sudah diisi.`)
      return
    }
    setSavingReview(true); setError('')

    const existing = reviews.find(r => r.employee_id === selectedEmp.id)
    let reviewId = existing?.id

    if (existing) {
      await supabase.from('performance_reviews').update({
        reviewer: formReviewer, catatan: formCatatan
      }).eq('id', existing.id)
      // Hapus scores lama
      await supabase.from('performance_scores').delete().eq('review_id', existing.id)
    } else {
      const { data } = await supabase.from('performance_reviews').insert({
        employee_id: selectedEmp.id, outlet_id: activeOutlet,
        bulan, tahun, reviewer: formReviewer, catatan: formCatatan,
      }).select().single()
      reviewId = data?.id
    }

    // Insert scores baru
    const scoreInserts = Object.entries(formScores)
      .filter(([,v]) => v)
      .map(([pointId, nilai]) => ({ review_id: reviewId, point_id: pointId, nilai }))

    if (scoreInserts.length > 0) {
      await supabase.from('performance_scores').insert(scoreInserts)
    }

    setSuccess(`Penilaian ${selectedEmp.nama} berhasil disimpan!`)
    setSavingReview(false)
    setMode('list')
    fetchPenilaian()
  }

  async function hapusReview(id) {
    if (!confirm('Hapus penilaian ini?')) return
    await supabase.from('performance_reviews').delete().eq('id', id)
    fetchPenilaian()
  }

  // ─── SETTING KATEGORI ─────────────────────────────────────

  async function tambahKategori() {
    if (!newKategori.trim()) return
    await supabase.from('performance_categories').insert({
      nama: newKategori.trim(), urutan: categories.length + 1
    })
    setNewKategori(''); fetchStruktur()
  }

  async function hapusKategori(id) {
    if (!confirm('Hapus kategori dan semua sub-kategori + poin di dalamnya?')) return
    await supabase.from('performance_categories').delete().eq('id', id)
    fetchStruktur()
  }

  async function updateKategori(id, nama) {
    await supabase.from('performance_categories').update({ nama }).eq('id', id)
    setEditingCat(null); fetchStruktur()
  }

  async function tambahSubkat() {
    if (!newSubkat.category_id || !newSubkat.nama.trim()) return
    const urutan = subcategories.filter(s => s.category_id === newSubkat.category_id).length + 1
    await supabase.from('performance_subcategories').insert({
      category_id: newSubkat.category_id, nama: newSubkat.nama.trim(), urutan
    })
    setNewSubkat({ category_id: '', nama: '' }); fetchStruktur()
  }

  async function hapusSubkat(id) {
    if (!confirm('Hapus sub-kategori dan semua poin di dalamnya?')) return
    await supabase.from('performance_subcategories').delete().eq('id', id)
    fetchStruktur()
  }

  async function updateSubkat(id, nama) {
    await supabase.from('performance_subcategories').update({ nama }).eq('id', id)
    setEditingSubcat(null); fetchStruktur()
  }

  async function tambahPoin() {
    if (!newPoin.subcategory_id || !newPoin.deskripsi.trim()) return
    const urutan = points.filter(p => p.subcategory_id === newPoin.subcategory_id).length + 1
    await supabase.from('performance_points').insert({
      subcategory_id: newPoin.subcategory_id, deskripsi: newPoin.deskripsi.trim(), urutan
    })
    setNewPoin({ subcategory_id: '', deskripsi: '' }); fetchStruktur()
  }

  async function hapusPoin(id) {
    if (!confirm('Hapus poin ini?')) return
    await supabase.from('performance_points').delete().eq('id', id)
    fetchStruktur()
  }

  async function updatePoin(id, deskripsi) {
    await supabase.from('performance_points').update({ deskripsi }).eq('id', id)
    setEditingPoint(null); fetchStruktur()
  }

  // ─── EXPORT ───────────────────────────────────────────────

  function exportExcel() {
    const data = employees.map(emp => {
      const r = reviews.find(rv => rv.employee_id === emp.id)
      const scores = r ? allScores[r.id] || {} : {}
      const row = { 'Nama': emp.nama, 'Jabatan': emp.jabatan }
      categories.forEach(cat => {
        subcategories.filter(s => s.category_id === cat.id).forEach(sub => {
          points.filter(p => p.subcategory_id === sub.id).forEach(pt => {
            row[`${cat.nama} > ${sub.nama} > ${pt.deskripsi.slice(0,30)}`] = scores[pt.id] || '-'
          })
        })
      })
      const nilaiAkhir = hitungNilaiAkhir(scores, points)
      row['Nilai Akhir'] = nilaiAkhir?.label || 'Belum dinilai'
      row['Skor'] = nilaiAkhir ? nilaiAkhir.score.toFixed(2) : '-'
      row['Reviewer'] = r?.reviewer || '-'
      row['Catatan'] = r?.catatan || '-'
      return row
    })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Performance')
    XLSX.writeFile(wb, `Performance_${activeOutletData?.nama}_${BULAN_NAMES[bulan-1]}_${tahun}.xlsx`)
  }

  // ─── STATS ────────────────────────────────────────────────

  const totalDinilai = reviews.length
  const distribusi = NILAI.map(n => ({
    label: n,
    count: employees.filter(emp => {
      const r = reviews.find(rv => rv.employee_id === emp.id)
      return r ? hitungNilaiAkhir(allScores[r.id], points)?.label === n : false
    }).length
  }))

  const filtered = employees.filter(e =>
    e.nama.toLowerCase().includes(search.toLowerCase()) ||
    e.jabatan.toLowerCase().includes(search.toLowerCase())
  )

  // ─── FORM PENILAIAN VIEW ──────────────────────────────────

  if (mode === 'form' && selectedEmp) {
    const nilaiPreview = hitungNilaiAkhir(formScores, points)
    const terisi = points.filter(p => formScores[p.id]).length

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <button onClick={() => { setMode('list'); setError('') }}
            className="text-blue-600 text-sm hover:underline mb-4 flex items-center gap-1">
            ← Kembali
          </button>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <h2 className="text-white font-semibold text-lg">{selectedEmp.nama}</h2>
              <p className="text-blue-200 text-sm">{selectedEmp.jabatan} · {activeOutletData?.nama}</p>
              <p className="text-blue-200 text-sm">{BULAN_NAMES[bulan-1]} {tahun}</p>
            </div>

            <div className="p-6">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}

              {/* Progress */}
              <div className="mb-5">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Progress penilaian</span>
                  <span>{terisi}/{points.length} poin</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-1.5 bg-blue-500 rounded-full transition-all"
                    style={{ width: `${points.length > 0 ? (terisi/points.length)*100 : 0}%` }} />
                </div>
              </div>

              {/* Reviewer */}
              <div className="mb-5">
                <label className="text-xs font-medium text-gray-600 block mb-1">Dinilai oleh</label>
                <input type="text" placeholder="Nama penilai/HRD"
                  value={formReviewer} onChange={e => setFormReviewer(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Poin per kategori */}
              {categories.map(cat => (
                <div key={cat.id} className="mb-5">
                  <h3 className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
                    <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{cat.nama}</span>
                  </h3>
                  {subcategories.filter(s => s.category_id === cat.id).map(sub => {
                    const subPoints = points.filter(p => p.subcategory_id === sub.id)
                    if (subPoints.length === 0) return null
                    return (
                      <div key={sub.id} className="mb-4 border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                          <p className="text-xs font-medium text-gray-600">{sub.nama}</p>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {subPoints.map((pt, idx) => (
                            <div key={pt.id} className="px-4 py-3">
                              <p className="text-sm text-gray-700 mb-2">
                                <span className="text-gray-400 text-xs mr-1">{idx+1}.</span>
                                {pt.deskripsi}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {NILAI.map(n => (
                                  <button key={n} onClick={() => setFormScores({...formScores, [pt.id]: n})}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                      formScores[pt.id] === n
                                        ? NILAI_COLOR[n] + ' ring-2 ring-offset-1 ring-blue-400'
                                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                    }`}>
                                    {n}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}

              {/* Nilai akhir preview */}
              {nilaiPreview && (
                <div className={`rounded-xl p-4 border mb-4 ${NILAI_COLOR[nilaiPreview.label]}`}>
                  <p className="text-xs font-medium opacity-70 mb-1">Nilai Akhir (rata-rata {terisi} poin)</p>
                  <p className="text-xl font-bold">{nilaiPreview.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">Skor: {nilaiPreview.score.toFixed(2)} / 4.00</p>
                </div>
              )}

              {/* Catatan */}
              <div className="mb-5">
                <label className="text-xs font-medium text-gray-600 block mb-1">Catatan (opsional)</label>
                <textarea rows={3} placeholder="Catatan tambahan..."
                  value={formCatatan} onChange={e => setFormCatatan(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              <div className="flex gap-3">
                <button onClick={simpanPenilaian} disabled={savingReview}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {savingReview ? 'Menyimpan...' : 'Simpan Penilaian'}
                </button>
                <button onClick={() => { setMode('list'); setError('') }}
                  className="border border-gray-300 px-5 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── MAIN VIEW ────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Performance Management</h1>
            <p className="text-sm text-gray-500 mt-1">{activeOutletData?.nama} · {BULAN_NAMES[bulan-1]} {tahun}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={()=>{if(bulan===1){setBulan(12);setTahun(t=>t-1)}else setBulan(b=>b-1)}}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-100">←</button>
            <span className="font-medium text-gray-800 min-w-max">{BULAN_NAMES[bulan-1]} {tahun}</span>
            <button onClick={()=>{if(bulan===12){setBulan(1);setTahun(t=>t+1)}else setBulan(b=>b+1)}}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-100">→</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[['penilaian','Penilaian'],['setting','Kelola Poin']].map(([val,label]) => (
            <button key={val} onClick={() => setTab(val)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===val?'bg-blue-600 text-white':'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
          {tab === 'penilaian' && (
            <button onClick={exportExcel}
              className="ml-auto border border-green-300 text-green-700 hover:bg-green-50 px-4 py-2 rounded-lg text-sm font-medium">
              ⬇ Export Excel
            </button>
          )}
        </div>

        {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{success}</div>}

        {/* ─── TAB PENILAIAN ─── */}
        {tab === 'penilaian' && (
          <div>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-5">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">Total Staff</p>
                <p className="text-2xl font-semibold text-gray-900">{employees.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">Dinilai</p>
                <p className="text-2xl font-semibold text-green-600">{totalDinilai}</p>
              </div>
              {distribusi.map(d => (
                <div key={d.label} className={`rounded-xl border p-4 ${NILAI_COLOR[d.label]}`}>
                  <p className="text-xs mb-1 opacity-70">{d.label}</p>
                  <p className="text-2xl font-semibold">{d.count}</p>
                </div>
              ))}
            </div>

            {/* Progress */}
            {employees.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span className="font-medium">Progress Penilaian {BULAN_NAMES[bulan-1]} {tahun}</span>
                  <span>{totalDinilai}/{employees.length} staff</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-2 bg-blue-600 rounded-full"
                    style={{ width: `${employees.length > 0 ? (totalDinilai/employees.length)*100 : 0}%` }} />
                </div>
              </div>
            )}

            {/* Search */}
            <input type="text" placeholder="Cari nama atau jabatan..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />

            {loading ? (
              <div className="text-center py-10 text-gray-400">Memuat data...</div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Nama','Jabatan','Nilai Akhir','Skor','Reviewer','Catatan',''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                        {employees.length === 0 ? 'Tidak ada staff di outlet ini.' : 'Tidak ada hasil.'}
                      </td></tr>
                    ) : filtered.map(emp => {
                      const r = reviews.find(rv => rv.employee_id === emp.id)
                      const scores = r ? allScores[r.id] || {} : {}
                      const nilai = hitungNilaiAkhir(scores, points)
                      return (
                        <tr key={emp.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{emp.nama}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{emp.jabatan}</td>
                          <td className="px-4 py-3">
                            {nilai
                              ? <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold border ${NILAI_COLOR[nilai.label]}`}>{nilai.label}</span>
                              : <span className="text-gray-400 text-xs italic">Belum dinilai</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{nilai ? nilai.score.toFixed(2) : '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{r?.reviewer || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-32 truncate">{r?.catatan || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button onClick={() => bukaForm(emp)}
                                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${r?'border border-blue-200 text-blue-600 hover:bg-blue-50':'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                {r ? 'Edit' : 'Nilai'}
                              </button>
                              {r && <button onClick={() => hapusReview(r.id)} className="text-red-500 text-xs hover:underline">Hapus</button>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB SETTING ─── */}
        {tab === 'setting' && (
          <div className="space-y-6">

            {/* Tambah Kategori */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Tambah Kategori Baru</h2>
              <div className="flex gap-3">
                <input type="text" placeholder="Nama kategori baru..."
                  value={newKategori} onChange={e => setNewKategori(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && tambahKategori()}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={tambahKategori}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  Tambah
                </button>
              </div>
            </div>

            {/* Tambah Sub-kategori */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Tambah Sub-Kategori</h2>
              <div className="flex gap-3 flex-wrap">
                <select value={newSubkat.category_id} onChange={e => setNewSubkat({...newSubkat, category_id: e.target.value})}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Pilih Kategori --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.nama}</option>)}
                </select>
                <input type="text" placeholder="Nama sub-kategori..."
                  value={newSubkat.nama} onChange={e => setNewSubkat({...newSubkat, nama: e.target.value})}
                  className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={tambahSubkat}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  Tambah
                </button>
              </div>
            </div>

            {/* Tambah Poin */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Tambah Poin Penilaian</h2>
              <div className="flex gap-3 flex-wrap">
                <select value={newPoin.subcategory_id} onChange={e => setNewPoin({...newPoin, subcategory_id: e.target.value})}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Pilih Sub-Kategori --</option>
                  {categories.map(cat => (
                    <optgroup key={cat.id} label={cat.nama}>
                      {subcategories.filter(s => s.category_id === cat.id).map(s => (
                        <option key={s.id} value={s.id}>{s.nama}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input type="text" placeholder="Deskripsi poin penilaian..."
                  value={newPoin.deskripsi} onChange={e => setNewPoin({...newPoin, deskripsi: e.target.value})}
                  className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={tambahPoin}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  Tambah
                </button>
              </div>
            </div>

            {/* Struktur lengkap */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-4">
                Struktur Penilaian
                <span className="ml-2 text-xs text-gray-400 font-normal">{points.length} poin total</span>
              </h2>
              <div className="space-y-4">
                {categories.map((cat, ci) => (
                  <div key={cat.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* Header kategori */}
                    <div className="bg-blue-600 px-4 py-2.5 flex justify-between items-center">
                      {editingCat === cat.id ? (
                        <input autoFocus defaultValue={cat.nama}
                          onBlur={e => updateKategori(cat.id, e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && updateKategori(cat.id, e.target.value)}
                          className="bg-blue-700 text-white rounded px-2 py-0.5 text-sm focus:outline-none" />
                      ) : (
                        <span className="text-white font-semibold text-sm">{ci+1}. {cat.nama}</span>
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => setEditingCat(cat.id)} className="text-blue-200 hover:text-white text-xs">Edit</button>
                        <button onClick={() => hapusKategori(cat.id)} className="text-red-300 hover:text-white text-xs">Hapus</button>
                      </div>
                    </div>

                    {/* Sub-kategori */}
                    <div className="divide-y divide-gray-100">
                      {subcategories.filter(s => s.category_id === cat.id).map((sub, si) => (
                        <div key={sub.id}>
                          {/* Sub-kat header */}
                          <div className="bg-gray-50 px-4 py-2 flex justify-between items-center">
                            {editingSubcat === sub.id ? (
                              <input autoFocus defaultValue={sub.nama}
                                onBlur={e => updateSubkat(sub.id, e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && updateSubkat(sub.id, e.target.value)}
                                className="border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none w-48" />
                            ) : (
                              <span className="text-xs font-medium text-gray-600">{si+1}. {sub.nama}</span>
                            )}
                            <div className="flex gap-2">
                              <button onClick={() => setEditingSubcat(sub.id)} className="text-gray-400 hover:text-blue-600 text-xs">Edit</button>
                              <button onClick={() => hapusSubkat(sub.id)} className="text-gray-400 hover:text-red-500 text-xs">Hapus</button>
                            </div>
                          </div>
                          {/* Poin */}
                          {points.filter(p => p.subcategory_id === sub.id).map((pt, pi) => (
                            <div key={pt.id} className="px-4 py-2.5 flex justify-between items-start gap-3 hover:bg-gray-50">
                              {editingPoint === pt.id ? (
                                <input autoFocus defaultValue={pt.deskripsi}
                                  onBlur={e => updatePoin(pt.id, e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && updatePoin(pt.id, e.target.value)}
                                  className="flex-1 border border-blue-300 rounded px-2 py-0.5 text-sm focus:outline-none" />
                              ) : (
                                <p className="text-sm text-gray-700 flex-1">
                                  <span className="text-gray-400 text-xs mr-1">{pi+1}.</span>{pt.deskripsi}
                                </p>
                              )}
                              <div className="flex gap-2 flex-shrink-0">
                                <button onClick={() => setEditingPoint(pt.id)} className="text-gray-400 hover:text-blue-600 text-xs">Edit</button>
                                <button onClick={() => hapusPoin(pt.id)} className="text-gray-400 hover:text-red-500 text-xs">Hapus</button>
                              </div>
                            </div>
                          ))}
                          {points.filter(p => p.subcategory_id === sub.id).length === 0 && (
                            <div className="px-4 py-2 text-xs text-gray-400 italic">Belum ada poin</div>
                          )}
                        </div>
                      ))}
                      {subcategories.filter(s => s.category_id === cat.id).length === 0 && (
                        <div className="px-4 py-3 text-xs text-gray-400 italic">Belum ada sub-kategori</div>
                      )}
                    </div>
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-gray-400 text-sm italic text-center py-4">Belum ada kategori penilaian.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}