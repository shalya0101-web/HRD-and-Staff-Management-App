import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

function formatFileSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function getFileIcon(fileType) {
  if (!fileType) return '📄'
  if (fileType.includes('pdf')) return '📕'
  if (fileType.includes('image')) return '🖼️'
  if (fileType.includes('word') || fileType.includes('document')) return '📝'
  if (fileType.includes('sheet') || fileType.includes('excel')) return '📊'
  return '📄'
}

function formatTanggal(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

function DocRow({ doc, canDelete, onPreview, onDelete }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
      <span className="text-2xl flex-shrink-0">{getFileIcon(doc.file_type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{doc.nama_file}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatFileSize(doc.file_size)} · {formatTanggal(doc.created_at)}
          {doc.uploaded_by && ` · Upload oleh ${doc.uploaded_by}`}
          {doc.keterangan && ` · ${doc.keterangan}`}
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={onPreview}
          className="border border-blue-200 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-medium">
          Lihat
        </button>
        <a href={doc.file_url} download target="_blank" rel="noopener noreferrer"
          className="border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-xs font-medium">
          ⬇
        </a>
        {canDelete && (
          <button onClick={onDelete}
            className="border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-medium">
            Hapus
          </button>
        )}
      </div>
    </div>
  )
}

// ─── KOMPONEN UTAMA ───────────────────────────────────────────────────────────

export default function EmployeeDocuments({
  employeeId: propEmpId,
  employeeName: propEmpName,
  embedded = false,
  activeOutletProp = null,
  isSelf = false,
}) {
  const { employee: authEmployee, isFullAccess, isPJ } = useAuth()

  const [employees, setEmployees] = useState([])
  const [selectedEmpId, setSelectedEmpId] = useState(propEmpId || '')
  const [categories, setCategories] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Upload form
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadCategoryId, setUploadCategoryId] = useState('')
  const [uploadKeterangan, setUploadKeterangan] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const fileRef = useRef()

  // Kategori management
  const [showKategoriForm, setShowKategoriForm] = useState(false)
  const [newKategori, setNewKategori] = useState('')
  const [filterCategory, setFilterCategory] = useState('semua')

  // Preview
  const [previewDoc, setPreviewDoc] = useState(null)

  // Hak akses — isSelf=true berarti staff membuka dokumen miliknya via ESS
  const canUpload = isFullAccess || isPJ || isSelf
  const canDelete = isFullAccess || isSelf

  useEffect(() => { fetchCategories() }, [])
  useEffect(() => { if (!propEmpId) fetchEmployees() }, [activeOutletProp])
  useEffect(() => {
    if (selectedEmpId) fetchDocuments()
  }, [selectedEmpId, filterCategory])

  // Kalau propEmpId berubah dari luar (misal ESS), sync ke state
  useEffect(() => {
    if (propEmpId) setSelectedEmpId(propEmpId)
  }, [propEmpId])

  async function fetchEmployees() {
    if (isFullAccess) {
      const { data } = await supabase.from('employees')
        .select('id, nama, jabatan, departemen').eq('status', 'aktif').order('nama')
      setEmployees(data || [])
    } else if (isPJ && activeOutletProp) {
      const { data } = await supabase.from('employee_outlets')
        .select('employee_id, employees(id, nama, jabatan, departemen)')
        .eq('outlet_id', activeOutletProp)
      setEmployees((data || []).map(r => r.employees).filter(Boolean))
    } else if (isPJ) {
      const { data } = await supabase.from('employees')
        .select('id, nama, jabatan, departemen').eq('status', 'aktif').order('nama')
      setEmployees(data || [])
    }
  }

  async function fetchCategories() {
    const { data } = await supabase.from('document_categories')
      .select('*').order('urutan')
    setCategories(data || [])
    if (data?.length > 0) setUploadCategoryId(data[0].id)
  }

  async function fetchDocuments() {
    if (!selectedEmpId) return
    setLoading(true)
    let query = supabase.from('employee_documents')
      .select('*, document_categories(id, nama)')
      .eq('employee_id', selectedEmpId)
      .order('created_at', { ascending: false })
    if (filterCategory !== 'semua') query = query.eq('category_id', filterCategory)
    const { data, error } = await query
    if (error) console.error('fetchDocuments error:', error)
    setDocuments(data || [])
    setLoading(false)
  }

  // ─── UPLOAD ───────────────────────────────────────────────

  async function handleUpload() {
    if (!uploadFile) { setError('Pilih file terlebih dahulu.'); return }
    if (!uploadCategoryId) { setError('Pilih kategori dokumen.'); return }
    if (uploadFile.size > MAX_FILE_SIZE) { setError('Ukuran file maksimal 10MB.'); return }

    setUploading(true); setError('')
    const safeName = uploadFile.name.replace(/\s+/g, '_')
    const fileName = `${selectedEmpId}/${Date.now()}_${safeName}`

    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(fileName, uploadFile, { contentType: uploadFile.type, upsert: false })

    if (uploadErr) { setError('Gagal upload: ' + uploadErr.message); setUploading(false); return }

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)

    const { error: dbErr } = await supabase.from('employee_documents').insert({
      employee_id: selectedEmpId,
      category_id: uploadCategoryId,
      nama_file: uploadFile.name,
      file_url: urlData.publicUrl,
      file_type: uploadFile.type,
      file_size: uploadFile.size,
      keterangan: uploadKeterangan,
      uploaded_by: authEmployee?.nama || 'Staff',
    })

    if (dbErr) { setError('Gagal simpan: ' + dbErr.message); setUploading(false); return }

    setSuccess('Dokumen berhasil diupload!')
    setShowUploadForm(false)
    setUploadFile(null); setUploadKeterangan('')
    if (fileRef.current) fileRef.current.value = ''
    setUploading(false); fetchDocuments()
  }

  async function hapusDocument(doc) {
    if (!confirm(`Hapus dokumen "${doc.nama_file}"?`)) return
    const urlParts = doc.file_url.split('/documents/')
    if (urlParts.length > 1) {
      await supabase.storage.from('documents').remove([urlParts[1]])
    }
    await supabase.from('employee_documents').delete().eq('id', doc.id)
    setSuccess('Dokumen berhasil dihapus.')
    fetchDocuments()
  }

  // ─── KATEGORI ─────────────────────────────────────────────

  async function tambahKategori() {
    if (!newKategori.trim()) return
    await supabase.from('document_categories').insert({
      nama: newKategori.trim(), is_default: false, urutan: categories.length + 1
    })
    setNewKategori(''); fetchCategories()
    setSuccess('Kategori berhasil ditambahkan!')
  }

  async function hapusKategori(id) {
    const cat = categories.find(c => c.id === id)
    if (cat?.is_default) { setError('Kategori default tidak bisa dihapus.'); return }
    if (!confirm('Hapus kategori ini?')) return
    await supabase.from('document_categories').delete().eq('id', id)
    fetchCategories()
  }

  const selectedEmp = employees.find(e => e.id === selectedEmpId)
  const displayName = propEmpName || selectedEmp?.nama || ''

  const docsByCategory = categories.map(cat => ({
    ...cat,
    docs: documents.filter(d => d.category_id === cat.id)
  })).filter(cat => cat.docs.length > 0)

  return (
    <div className={embedded ? 'p-4' : 'min-h-screen bg-gray-50'}>
      <div className={embedded ? '' : 'max-w-6xl mx-auto px-4 py-8'}>

        {!embedded && (
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Dokumen Staff</h1>
            <p className="text-sm text-gray-500 mt-1">Kelola dokumen SIP, STR, sertifikat, dan dokumen lainnya</p>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{success}</div>}

        {/* Pilih Staff (jika tidak embedded) */}
        {!propEmpId && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
            <label className="text-xs font-medium text-gray-600 block mb-1">Pilih Staff</label>
            <select value={selectedEmpId} onChange={e => { setSelectedEmpId(e.target.value); setDocuments([]) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Pilih Staff --</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.nama} — {e.jabatan}</option>
              ))}
            </select>
          </div>
        )}

        {selectedEmpId && (
          <>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 mb-4 flex justify-between items-center">
              <div>
                <p className="text-white font-semibold">{displayName || 'Dokumen Saya'}</p>
                <p className="text-blue-200 text-xs mt-0.5">{documents.length} dokumen tersimpan</p>
              </div>
              <div className="flex gap-2">
                {canUpload && (
                  <button onClick={() => { setShowUploadForm(!showUploadForm); setError('') }}
                    className="bg-white text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-xs font-medium">
                    {showUploadForm ? '✕ Tutup' : '+ Upload'}
                  </button>
                )}
                {isFullAccess && (
                  <button onClick={() => setShowKategoriForm(!showKategoriForm)}
                    className="border border-blue-400 text-white hover:bg-blue-600 px-3 py-2 rounded-lg text-xs">
                    ⚙ Kategori
                  </button>
                )}
              </div>
            </div>

            {/* Form Upload */}
            {showUploadForm && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">Upload Dokumen Baru</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Kategori *</label>
                    <select value={uploadCategoryId} onChange={e => setUploadCategoryId(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {categories.map(c => <option key={c.id} value={c.id}>{c.nama}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Keterangan (opsional)</label>
                    <input type="text" placeholder="Contoh: SIP berlaku s/d 2026"
                      value={uploadKeterangan} onChange={e => setUploadKeterangan(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-gray-600 block mb-1">File *</label>
                    {uploadFile ? (
                      <div className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3 bg-gray-50">
                        <span className="text-2xl">{getFileIcon(uploadFile.type)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{uploadFile.name}</p>
                          <p className="text-xs text-gray-500">{formatFileSize(uploadFile.size)}</p>
                        </div>
                        <button onClick={() => { setUploadFile(null); if(fileRef.current) fileRef.current.value='' }}
                          className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </div>
                    ) : (
                      <div onClick={() => fileRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-6 text-center cursor-pointer transition-colors">
                        <p className="text-2xl mb-1">📎</p>
                        <p className="text-sm text-gray-500">Klik untuk pilih file</p>
                        <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, DOCX, dll · Maks 10MB</p>
                      </div>
                    )}
                    <input ref={fileRef} type="file" className="hidden"
                      onChange={e => setUploadFile(e.target.files[0] || null)} />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={handleUpload} disabled={uploading || !uploadFile}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium">
                    {uploading ? 'Mengupload...' : 'Upload'}
                  </button>
                  <button onClick={() => { setShowUploadForm(false); setUploadFile(null) }}
                    className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-600">Batal</button>
                </div>
              </div>
            )}

            {/* Kelola Kategori */}
            {showKategoriForm && isFullAccess && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Kelola Kategori</h3>
                <div className="flex gap-2 mb-3">
                  <input type="text" placeholder="Nama kategori baru..."
                    value={newKategori} onChange={e => setNewKategori(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && tambahKategori()}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={tambahKategori}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Tambah</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => (
                    <div key={cat.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${
                      cat.is_default ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                      <span>{cat.nama}</span>
                      {cat.is_default && <span className="text-blue-400">★</span>}
                      {!cat.is_default && (
                        <button onClick={() => hapusKategori(cat.id)} className="text-gray-400 hover:text-red-500 ml-1">✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filter kategori */}
            {documents.length > 0 && (
              <div className="flex gap-2 mb-4 flex-wrap">
                <button onClick={() => setFilterCategory('semua')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${filterCategory==='semua'?'bg-blue-600 text-white border-blue-600':'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  Semua ({documents.length})
                </button>
                {categories.filter(c => documents.some(d => d.category_id === c.id)).map(cat => (
                  <button key={cat.id} onClick={() => setFilterCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${filterCategory===cat.id?'bg-blue-600 text-white border-blue-600':'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {cat.nama} ({documents.filter(d => d.category_id === cat.id).length})
                  </button>
                ))}
              </div>
            )}

            {/* Daftar Dokumen */}
            {loading ? (
              <div className="text-center py-10 text-gray-400">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                Memuat dokumen...
              </div>
            ) : documents.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <p className="text-4xl mb-3">📁</p>
                <p className="text-gray-500 text-sm">Belum ada dokumen.</p>
                {canUpload && <p className="text-gray-400 text-xs mt-1">Klik tombol Upload untuk menambahkan.</p>}
              </div>
            ) : filterCategory === 'semua' ? (
              <div className="space-y-4">
                {docsByCategory.map(cat => (
                  <div key={cat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex justify-between items-center">
                      <p className="text-xs font-semibold text-gray-700">{cat.nama}</p>
                      <span className="text-xs text-gray-400">{cat.docs.length} file</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {cat.docs.map(doc => (
                        <DocRow key={doc.id} doc={doc} canDelete={canDelete}
                          onPreview={() => setPreviewDoc(doc)}
                          onDelete={() => hapusDocument(doc)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {documents.filter(d => d.category_id === filterCategory).map(doc => (
                  <DocRow key={doc.id} doc={doc} canDelete={canDelete}
                    onPreview={() => setPreviewDoc(doc)}
                    onDelete={() => hapusDocument(doc)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-screen overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200">
              <div>
                <p className="font-semibold text-gray-900 text-sm truncate max-w-xs">{previewDoc.nama_file}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {previewDoc.document_categories?.nama} · {formatFileSize(previewDoc.file_size)} · {formatTanggal(previewDoc.created_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <a href={previewDoc.file_url} target="_blank" rel="noopener noreferrer"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-medium">
                  ⬇ Download
                </a>
                <button onClick={() => setPreviewDoc(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>
            </div>
            <div className="p-4 overflow-auto max-h-96">
              {previewDoc.file_type?.startsWith('image/') ? (
                <img src={previewDoc.file_url} alt={previewDoc.nama_file} className="max-w-full rounded-lg mx-auto" />
              ) : previewDoc.file_type === 'application/pdf' ? (
                <iframe src={previewDoc.file_url} className="w-full h-80 rounded-lg border" title="PDF Preview" />
              ) : (
                <div className="text-center py-8">
                  <p className="text-5xl mb-3">{getFileIcon(previewDoc.file_type)}</p>
                  <p className="text-sm text-gray-600 mb-4">{previewDoc.nama_file}</p>
                  <a href={previewDoc.file_url} target="_blank" rel="noopener noreferrer"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                    ⬇ Download File
                  </a>
                </div>
              )}
              {previewDoc.keterangan && (
                <div className="mt-3 bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-xs text-gray-500">Keterangan: {previewDoc.keterangan}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}