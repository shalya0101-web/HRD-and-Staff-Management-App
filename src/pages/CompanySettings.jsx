import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function CompanySettings() {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingTtd, setUploadingTtd] = useState(false)
  const [outlets, setOutlets] = useState([])
  const [uploadingOutletLogo, setUploadingOutletLogo] = useState(null) // outlet id yang sedang upload
  const logoRef = useRef()
  const ttdRef = useRef()
  const outletLogoRefs = {}

  useEffect(() => { fetchInfo(); fetchOutlets() }, [])

  async function fetchOutlets() {
    const { data } = await supabase.from('outlets').select('id, nama, logo_url').order('nama')
    setOutlets(data || [])
  }

  async function fetchInfo() {
    setLoading(true)
    const { data } = await supabase.from('company_info').select('*').single()
    setInfo(data || {
      nama: '', alamat: '', telepon: '', email: '',
      direktur: '', logo_url: '', ttd_direktur: ''
    })
    setLoading(false)
  }

  async function simpan() {
    setSaving(true); setError(''); setSuccess('')
    const { error } = await supabase.from('company_info').update({
      nama: info.nama,
      alamat: info.alamat,
      telepon: info.telepon,
      email: info.email,
      direktur: info.direktur,
      updated_at: new Date().toISOString(),
    }).eq('id', info.id)
    if (error) setError('Gagal simpan: ' + error.message)
    else setSuccess('Data perusahaan berhasil disimpan!')
    setSaving(false)
  }

  async function uploadFile(file, bucket, field, setUploading) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('File harus berupa gambar.'); return }
    if (file.size > 3 * 1024 * 1024) { setError('Ukuran file maksimal 3MB.'); return }

    setUploading(true); setError(''); setSuccess('')
    const ext = file.name.split('.').pop()
    const fileName = `${field}_${info.id}_${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, { contentType: file.type, upsert: true })

    if (uploadErr) {
      setError('Gagal upload: ' + uploadErr.message)
      setUploading(false); return
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName)
    const url = urlData.publicUrl

    await supabase.from('company_info').update({
      [field]: url, updated_at: new Date().toISOString()
    }).eq('id', info.id)

    setInfo(prev => ({ ...prev, [field]: url }))
    setSuccess(`${field === 'logo_url' ? 'Logo' : 'Tanda tangan direktur'} berhasil diupload!`)
    setUploading(false)
  }

  async function uploadOutletLogo(outletId, file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('File harus berupa gambar.'); return }
    if (file.size > 3 * 1024 * 1024) { setError('Ukuran file maksimal 3MB.'); return }

    setUploadingOutletLogo(outletId); setError(''); setSuccess('')
    const ext = file.name.split('.').pop()
    const fileName = `outlet_${outletId}_${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('logos').upload(fileName, file, { contentType: file.type, upsert: true })

    if (uploadErr) { setError('Gagal upload: ' + uploadErr.message); setUploadingOutletLogo(null); return }

    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    await supabase.from('outlets').update({ logo_url: urlData.publicUrl }).eq('id', outletId)
    setOutlets(prev => prev.map(o => o.id === outletId ? { ...o, logo_url: urlData.publicUrl } : o))
    setSuccess('Logo outlet berhasil diupload!')
    setUploadingOutletLogo(null)
  }

  async function hapusOutletLogo(outletId) {
    if (!confirm('Hapus logo outlet ini?')) return
    await supabase.from('outlets').update({ logo_url: null }).eq('id', outletId)
    setOutlets(prev => prev.map(o => o.id === outletId ? { ...o, logo_url: null } : o))
    setSuccess('Logo outlet dihapus.')
  }

  async function hapusGambar(field, bucket) {
    if (!confirm('Hapus gambar ini?')) return
    await supabase.from('company_info').update({
      [field]: null, updated_at: new Date().toISOString()
    }).eq('id', info.id)
    setInfo(prev => ({ ...prev, [field]: null }))
    setSuccess('Gambar berhasil dihapus.')
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Pengaturan Perusahaan</h1>
          <p className="text-sm text-gray-500 mt-1">Informasi perusahaan, logo, dan tanda tangan untuk dokumen resmi</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{success}</div>}

        {/* ─── INFO PERUSAHAAN ─── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Informasi Perusahaan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Nama Perusahaan / Klinik *</label>
              <input type="text" value={info?.nama || ''} onChange={e => setInfo({...info, nama: e.target.value})}
                placeholder="Contoh: Klinik Pillar Medika"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Alamat</label>
              <textarea rows={2} value={info?.alamat || ''} onChange={e => setInfo({...info, alamat: e.target.value})}
                placeholder="Alamat lengkap klinik"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Nomor Telepon</label>
              <input type="text" value={info?.telepon || ''} onChange={e => setInfo({...info, telepon: e.target.value})}
                placeholder="Contoh: 0370-123456"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
              <input type="email" value={info?.email || ''} onChange={e => setInfo({...info, email: e.target.value})}
                placeholder="Contoh: info@pillarmedika.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Nama Direktur *</label>
              <input type="text" value={info?.direktur || ''} onChange={e => setInfo({...info, direktur: e.target.value})}
                placeholder="Nama lengkap direktur"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <button onClick={simpan} disabled={saving}
            className="mt-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium">
            {saving ? 'Menyimpan...' : 'Simpan Data'}
          </button>
        </div>

        {/* ─── LOGO PERUSAHAAN ─── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Logo Perusahaan</h2>
          <p className="text-xs text-gray-500 mb-4">Logo akan muncul di kop surat dokumen resmi. Format: PNG/JPG, maksimal 3MB.</p>

          {info?.logo_url ? (
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 border border-gray-200 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center p-2">
                <img src={info.logo_url} alt="Logo" className="w-full h-full object-contain" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Logo terpasang ✓</p>
                <div className="flex gap-2">
                  <button onClick={() => logoRef.current?.click()} disabled={uploadingLogo}
                    className="border border-blue-300 text-blue-600 hover:bg-blue-50 px-4 py-1.5 rounded-lg text-xs font-medium">
                    {uploadingLogo ? 'Mengupload...' : 'Ganti Logo'}
                  </button>
                  <button onClick={() => hapusGambar('logo_url', 'logos')}
                    className="border border-red-200 text-red-500 hover:bg-red-50 px-4 py-1.5 rounded-lg text-xs font-medium">
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div onClick={() => logoRef.current?.click()}
              className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-8 text-center cursor-pointer transition-colors">
              <div className="text-4xl mb-2">🏥</div>
              <p className="text-sm font-medium text-gray-600">Klik untuk upload logo</p>
              <p className="text-xs text-gray-400 mt-1">PNG atau JPG, maksimal 3MB</p>
              {uploadingLogo && <p className="text-xs text-blue-600 mt-2">Mengupload...</p>}
            </div>
          )}
          <input ref={logoRef} type="file" accept="image/*" className="hidden"
            onChange={e => uploadFile(e.target.files[0], 'logos', 'logo_url', setUploadingLogo)} />
        </div>

        {/* ─── TANDA TANGAN DIREKTUR ─── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Tanda Tangan Direktur</h2>
          <p className="text-xs text-gray-500 mb-4">
            Tanda tangan akan muncul otomatis di surat pengajuan pinjaman yang telah disetujui.
            Upload gambar tanda tangan direktur (scan/foto). Format: PNG/JPG transparan lebih baik.
          </p>

          {info?.ttd_direktur ? (
            <div className="flex items-center gap-4">
              <div className="w-40 h-20 border border-gray-200 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center p-2">
                <img src={info.ttd_direktur} alt="TTD Direktur" className="w-full h-full object-contain" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Tanda tangan terpasang ✓</p>
                <p className="text-xs text-gray-500">{info.direktur}</p>
                <div className="flex gap-2">
                  <button onClick={() => ttdRef.current?.click()} disabled={uploadingTtd}
                    className="border border-blue-300 text-blue-600 hover:bg-blue-50 px-4 py-1.5 rounded-lg text-xs font-medium">
                    {uploadingTtd ? 'Mengupload...' : 'Ganti TTD'}
                  </button>
                  <button onClick={() => hapusGambar('ttd_direktur', 'signatures')}
                    className="border border-red-200 text-red-500 hover:bg-red-50 px-4 py-1.5 rounded-lg text-xs font-medium">
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div onClick={() => ttdRef.current?.click()}
              className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-8 text-center cursor-pointer transition-colors">
              <div className="text-4xl mb-2">✍️</div>
              <p className="text-sm font-medium text-gray-600">Klik untuk upload tanda tangan direktur</p>
              <p className="text-xs text-gray-400 mt-1">PNG transparan lebih bagus · Maksimal 3MB</p>
              {uploadingTtd && <p className="text-xs text-blue-600 mt-2">Mengupload...</p>}
            </div>
          )}
          <input ref={ttdRef} type="file" accept="image/*" className="hidden"
            onChange={e => uploadFile(e.target.files[0], 'signatures', 'ttd_direktur', setUploadingTtd)} />
        </div>

        {/* ─── LOGO PER OUTLET ─── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Logo per Outlet</h2>
          <p className="text-xs text-gray-500 mb-4">
            Logo outlet akan muncul di sisi kanan kop surat slip gaji masing-masing outlet.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {outlets.map(outlet => {
              const inputId = `outlet-logo-${outlet.id}`
              return (
                <div key={outlet.id} className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">{outlet.nama}</p>
                  {outlet.logo_url ? (
                    <div className="flex items-center gap-3">
                      <img src={outlet.logo_url} alt={outlet.nama} className="w-16 h-16 object-contain border border-gray-200 rounded-lg p-1 bg-gray-50" />
                      <div className="space-y-1.5">
                        <p className="text-xs text-green-600 font-medium">✓ Logo terpasang</p>
                        <div className="flex gap-2">
                          <button onClick={() => document.getElementById(inputId)?.click()}
                            disabled={uploadingOutletLogo === outlet.id}
                            className="border border-blue-200 text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg text-xs font-medium">
                            {uploadingOutletLogo === outlet.id ? 'Uploading...' : 'Ganti'}
                          </button>
                          <button onClick={() => hapusOutletLogo(outlet.id)}
                            className="border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1 rounded-lg text-xs font-medium">
                            Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => document.getElementById(inputId)?.click()}
                      className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg p-4 text-center cursor-pointer transition-colors">
                      <p className="text-xs text-gray-500">
                        {uploadingOutletLogo === outlet.id ? 'Mengupload...' : 'Klik upload logo'}
                      </p>
                    </div>
                  )}
                  <input id={inputId} type="file" accept="image/*" className="hidden"
                    onChange={e => uploadOutletLogo(outlet.id, e.target.files[0])} />
                </div>
              )
            })}
          </div>
        </div>

        {/* ─── PREVIEW KOP SURAT ─── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Preview Kop Surat</h2>
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-blue-600">
              {info?.logo_url
                ? <img src={info.logo_url} alt="Logo" className="w-14 h-14 object-contain" />
                : <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                    {(info?.nama || 'K').charAt(0)}
                  </div>
              }
              <div className="flex-1">
                <p className="font-bold text-blue-700 text-base">{info?.nama || 'Nama Perusahaan'}</p>
                <p className="text-xs text-gray-500 mt-0.5">{info?.alamat || 'Alamat Perusahaan'}</p>
                <p className="text-xs text-gray-500">
                  {info?.telepon && `Telp: ${info.telepon}`}
                  {info?.telepon && info?.email && ' · '}
                  {info?.email}
                </p>
              </div>
            </div>
            <div className="mt-3 flex justify-between">
              <div className="text-center w-40">
                <p className="text-xs text-gray-500 mb-1">Pemohon</p>
                {info?.ttd_direktur
                  ? <div className="h-10 flex items-center justify-center text-xs text-gray-400 border-b border-dashed border-gray-300">[TTD Staff]</div>
                  : <div className="h-10 border-b border-dashed border-gray-300"></div>
                }
                <p className="text-xs font-medium mt-1">Nama Staff</p>
              </div>
              <div className="text-center w-40">
                <p className="text-xs text-gray-500 mb-1">Menyetujui</p>
                {info?.ttd_direktur
                  ? <img src={info.ttd_direktur} alt="TTD" className="h-10 object-contain mx-auto" />
                  : <div className="h-10 border-b border-dashed border-gray-300"></div>
                }
                <p className="text-xs font-medium mt-1">{info?.direktur || 'Nama Direktur'}</p>
                <p className="text-xs text-gray-400">Direktur</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}