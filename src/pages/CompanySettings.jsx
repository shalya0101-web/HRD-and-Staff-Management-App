import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useOutlet } from '../lib/OutletContext'

const DEFAULT_BPJS = {
  bpjs_kesehatan_aktif: false, bpjs_naker_aktif: false,
  bpjsk_karyawan_pct: 1.00, bpjsk_perusahaan_pct: 4.00, bpjsk_batas_atas: 12000000,
  jht_karyawan_pct: 2.00, jht_perusahaan_pct: 3.70,
  jp_karyawan_pct: 1.00, jp_perusahaan_pct: 2.00, jp_batas_atas: 9559600,
  jkk_pct: 0.24, jkm_pct: 0.30,
}

export default function CompanySettings() {
  const { activeOutlet } = useOutlet()
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingTtd, setUploadingTtd] = useState(false)
  const [outlets, setOutlets] = useState([])
  const [uploadingOutletLogo, setUploadingOutletLogo] = useState(null)
  const [bpjs, setBpjs] = useState(DEFAULT_BPJS)
  const [bpjsId, setBpjsId] = useState(null)
  const [savingBpjs, setSavingBpjs] = useState(false)
  const [pph21, setPph21] = useState({
    pph21_aktif: false, kena_tanpa_npwp: true,
    inc_gaji_pokok: true, inc_tunjangan_makan: true, inc_tunjangan_transport: true,
    inc_tunjangan_telephone: true, inc_tunjangan_jabatan_pj: true,
    inc_tunjangan_jabatan_lain: true, inc_sip: true, inc_lembur: true,
  })
  const [pph21Id, setPph21Id] = useState(null)
  const [savingPph21, setSavingPph21] = useState(false)
  const [cleaningFoto, setCleaningFoto] = useState(false)
  const [cleanResult, setCleanResult] = useState('')
  const [shifts, setShifts] = useState([])
  const [savingShift, setSavingShift] = useState(false)
  const logoRef = useRef()
  const ttdRef = useRef()
  const outletLogoRefs = {}

  useEffect(() => { fetchInfo(); fetchOutlets() }, [])
  useEffect(() => { if (activeOutlet) { fetchBpjs(); fetchPph21() } }, [activeOutlet])
  useEffect(() => { fetchShifts() }, [])

  async function fetchBpjs() {
    const { data } = await supabase.from('bpjs_settings').select('*')
      .eq('outlet_id', activeOutlet).single()
    if (data) { setBpjs(data); setBpjsId(data.id) }
    else { setBpjs({ ...DEFAULT_BPJS, outlet_id: activeOutlet }); setBpjsId(null) }
  }

  async function simpanBpjs() {
    setSavingBpjs(true); setError(''); setSuccess('')
    const payload = { ...bpjs, outlet_id: activeOutlet }
    let err
    if (bpjsId) {
      const { error } = await supabase.from('bpjs_settings').update(payload).eq('id', bpjsId)
      err = error
    } else {
      const { data, error } = await supabase.from('bpjs_settings').insert(payload).select().single()
      if (data) setBpjsId(data.id)
      err = error
    }
    if (err) setError('Gagal simpan BPJS: ' + err.message)
    else setSuccess('Pengaturan BPJS berhasil disimpan!')
    setSavingBpjs(false)
  }

  async function bersihkanFotoLama() {
    if (!confirm('Hapus semua foto absensi yang berusia lebih dari 3 bulan? Tindakan ini permanen dan tidak bisa dibatalkan.')) return
    setCleaningFoto(true); setCleanResult(''); setError(''); setSuccess('')

    // Cari absensi > 3 bulan yang punya foto
    const batas = new Date()
    batas.setMonth(batas.getMonth() - 3)
    const batasStr = batas.toISOString().split('T')[0]

    const { data: oldAtt, error: fetchErr } = await supabase.from('attendance')
      .select('id, foto_masuk, foto_keluar, tanggal')
      .lt('tanggal', batasStr)
      .or('foto_masuk.not.is.null,foto_keluar.not.is.null')

    if (fetchErr) { setError('Gagal mengambil data: ' + fetchErr.message); setCleaningFoto(false); return }
    if (!oldAtt || oldAtt.length === 0) {
      setCleanResult('Tidak ada foto absensi lebih dari 3 bulan yang perlu dihapus.')
      setCleaningFoto(false); return
    }

    // Kumpulkan nama file dari URL
    const fileNames = []
    oldAtt.forEach(a => {
      ;[a.foto_masuk, a.foto_keluar].forEach(url => {
        if (url) {
          // Ekstrak nama file dari URL public storage
          const match = url.split('/attendance-photos/')[1]
          if (match) fileNames.push(decodeURIComponent(match.split('?')[0]))
        }
      })
    })

    // Hapus file dari storage (batch per 100)
    let deletedFiles = 0
    for (let i = 0; i < fileNames.length; i += 100) {
      const batch = fileNames.slice(i, i + 100)
      const { error: delErr } = await supabase.storage.from('attendance-photos').remove(batch)
      if (!delErr) deletedFiles += batch.length
    }

    // Set kolom foto jadi NULL di database
    const ids = oldAtt.map(a => a.id)
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200)
      await supabase.from('attendance').update({ foto_masuk: null, foto_keluar: null }).in('id', batch)
    }

    setCleanResult(`Berhasil! ${deletedFiles} foto dihapus dari ${oldAtt.length} data absensi lama (sebelum ${batasStr}).`)
    setCleaningFoto(false)
  }

  async function fetchShifts() {
    const { data } = await supabase.from('shift_settings').select('*').order('urutan')
    if (data) setShifts(data)
  }

  function updateShiftField(id, field, value) {
    setShifts(shifts.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  async function simpanShifts() {
    setSavingShift(true); setError(''); setSuccess('')
    for (const s of shifts) {
      const { error } = await supabase.from('shift_settings').update({
        jam_mulai: s.jam_mulai, jam_selesai: s.jam_selesai,
        toleransi_menit: parseInt(s.toleransi_menit) || 0,
        interval_menit: parseInt(s.interval_menit) || 30,
        potongan_per_interval: parseFloat(s.potongan_per_interval) || 0,
        potongan_maks_harian: parseFloat(s.potongan_maks_harian) || 0,
        aktif: s.aktif !== false,
      }).eq('id', s.id)
      if (error) { setError('Gagal simpan shift: ' + error.message); setSavingShift(false); return }
    }
    setSuccess('Pengaturan shift berhasil disimpan!')
    setSavingShift(false)
  }

  async function fetchPph21() {
    const { data } = await supabase.from('pph21_settings').select('*').eq('outlet_id', activeOutlet).single()
    if (data) { setPph21(data); setPph21Id(data.id) }
    else { setPph21Id(null) }
  }

  async function simpanPph21() {
    setSavingPph21(true); setError(''); setSuccess('')
    const payload = { ...pph21, outlet_id: activeOutlet }
    delete payload.id; delete payload.created_at
    let err
    if (pph21Id) {
      const { error } = await supabase.from('pph21_settings').update(payload).eq('id', pph21Id)
      err = error
    } else {
      const { data, error } = await supabase.from('pph21_settings').insert(payload).select().single()
      if (data) setPph21Id(data.id)
      err = error
    }
    if (err) setError('Gagal simpan PPh21: ' + err.message)
    else setSuccess('Pengaturan PPh 21 berhasil disimpan!')
    setSavingPph21(false)
  }

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

        {/* ─── BPJS SETTINGS ─── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Pengaturan BPJS</h2>
          <p className="text-xs text-gray-500 mb-5">Aktifkan BPJS agar potongan dihitung otomatis saat generate payroll. HR tetap bisa override manual per staff.</p>

          <div className="space-y-6">
            {/* BPJS Kesehatan */}
            <div className={`border rounded-xl p-4 ${bpjs.bpjs_kesehatan_aktif ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
              <div className="flex justify-between items-center mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">BPJS Kesehatan</p>
                  <p className="text-xs text-gray-500 mt-0.5">Iuran kesehatan karyawan & perusahaan</p>
                </div>
                <button onClick={() => setBpjs({...bpjs, bpjs_kesehatan_aktif: !bpjs.bpjs_kesehatan_aktif})}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${bpjs.bpjs_kesehatan_aktif ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${bpjs.bpjs_kesehatan_aktif ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {bpjs.bpjs_kesehatan_aktif && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Iuran Karyawan (%)</label>
                    <input type="number" step="0.01" value={bpjs.bpjsk_karyawan_pct}
                      onChange={e => setBpjs({...bpjs, bpjsk_karyawan_pct: parseFloat(e.target.value)})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Iuran Perusahaan (%)</label>
                    <input type="number" step="0.01" value={bpjs.bpjsk_perusahaan_pct}
                      onChange={e => setBpjs({...bpjs, bpjsk_perusahaan_pct: parseFloat(e.target.value)})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Batas Atas Gaji (Rp)</label>
                    <input type="number" value={bpjs.bpjsk_batas_atas}
                      onChange={e => setBpjs({...bpjs, bpjsk_batas_atas: parseFloat(e.target.value)})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
            </div>

            {/* BPJS Ketenagakerjaan */}
            <div className={`border rounded-xl p-4 ${bpjs.bpjs_naker_aktif ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
              <div className="flex justify-between items-center mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">BPJS Ketenagakerjaan</p>
                  <p className="text-xs text-gray-500 mt-0.5">JHT · JP · JKK · JKM</p>
                </div>
                <button onClick={() => setBpjs({...bpjs, bpjs_naker_aktif: !bpjs.bpjs_naker_aktif})}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${bpjs.bpjs_naker_aktif ? 'bg-green-600' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${bpjs.bpjs_naker_aktif ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {bpjs.bpjs_naker_aktif && (
                <div className="space-y-3 mt-3">
                  <p className="text-xs font-medium text-gray-500">JHT (Jaminan Hari Tua)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Karyawan (%)</label>
                      <input type="number" step="0.01" value={bpjs.jht_karyawan_pct}
                        onChange={e => setBpjs({...bpjs, jht_karyawan_pct: parseFloat(e.target.value)})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Perusahaan (%)</label>
                      <input type="number" step="0.01" value={bpjs.jht_perusahaan_pct}
                        onChange={e => setBpjs({...bpjs, jht_perusahaan_pct: parseFloat(e.target.value)})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-gray-500">JP (Jaminan Pensiun)</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Karyawan (%)</label>
                      <input type="number" step="0.01" value={bpjs.jp_karyawan_pct}
                        onChange={e => setBpjs({...bpjs, jp_karyawan_pct: parseFloat(e.target.value)})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Perusahaan (%)</label>
                      <input type="number" step="0.01" value={bpjs.jp_perusahaan_pct}
                        onChange={e => setBpjs({...bpjs, jp_perusahaan_pct: parseFloat(e.target.value)})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Batas Atas (Rp)</label>
                      <input type="number" value={bpjs.jp_batas_atas}
                        onChange={e => setBpjs({...bpjs, jp_batas_atas: parseFloat(e.target.value)})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-gray-500">JKK & JKM (ditanggung perusahaan)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">JKK (%)</label>
                      <input type="number" step="0.01" value={bpjs.jkk_pct}
                        onChange={e => setBpjs({...bpjs, jkk_pct: parseFloat(e.target.value)})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">JKM (%)</label>
                      <input type="number" step="0.01" value={bpjs.jkm_pct}
                        onChange={e => setBpjs({...bpjs, jkm_pct: parseFloat(e.target.value)})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button onClick={simpanBpjs} disabled={savingBpjs}
            className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium">
            {savingBpjs ? 'Menyimpan...' : 'Simpan Pengaturan BPJS'}
          </button>
        </div>

        {/* ─── PPH 21 SETTINGS ─── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-base font-semibold text-gray-800">Pengaturan PPh 21</h2>
            <button onClick={() => setPph21({...pph21, pph21_aktif: !pph21.pph21_aktif})}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${pph21.pph21_aktif ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${pph21.pph21_aktif ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">Metode TER (PMK 168/2023) untuk Jan-Nov, perhitungan tahunan di Desember. Status PTKP diatur per staff di menu Pegawai.</p>

          {pph21.pph21_aktif && (
            <div className="space-y-4">
              {/* NPWP */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={pph21.kena_tanpa_npwp}
                  onChange={e => setPph21({...pph21, kena_tanpa_npwp: e.target.checked})}
                  className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm text-gray-700">Kenakan tarif 20% lebih tinggi untuk staff tanpa NPWP</span>
              </label>

              {/* Komponen dasar perhitungan */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Komponen yang dihitung sebagai penghasilan bruto:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    ['inc_gaji_pokok','Gaji Pokok'],
                    ['inc_sip','SIP'],
                    ['inc_tunjangan_makan','Tj. Makan'],
                    ['inc_tunjangan_transport','Tj. Transport'],
                    ['inc_tunjangan_telephone','Tj. Telephone'],
                    ['inc_tunjangan_jabatan_pj','Tj. Jabatan PJ'],
                    ['inc_tunjangan_jabatan_lain','Tj. Jabatan Lain'],
                    ['inc_lembur','Lembur'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pph21[key] !== false}
                        onChange={e => setPph21({...pph21, [key]: e.target.checked})}
                        className="w-4 h-4 text-blue-600 rounded" />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button onClick={simpanPph21} disabled={savingPph21}
            className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium">
            {savingPph21 ? 'Menyimpan...' : 'Simpan Pengaturan PPh 21'}
          </button>
        </div>

        {/* ─── PENGATURAN SHIFT ─── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Pengaturan Shift Kerja</h2>
          <p className="text-xs text-gray-500 mb-4">
            Atur jam kerja & potongan keterlambatan per shift. Keterlambatan dihitung dari jam mulai + toleransi; tiap kelipatan interval kena potongan, dibatasi maks/hari (0 = tanpa batas). Berlaku global semua outlet.
          </p>
          <div className="space-y-3">
            {shifts.map(s => (
              <div key={s.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-800">{s.nama}{s.lintas_hari ? ' (lintas hari)' : ''}</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={s.aktif !== false}
                      onChange={e => updateShiftField(s.id, 'aktif', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded" />
                    <span className="text-xs text-gray-600">Aktif</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Jam Mulai</label>
                    <input type="time" value={s.jam_mulai}
                      onChange={e => updateShiftField(s.id, 'jam_mulai', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Jam Selesai</label>
                    <input type="time" value={s.jam_selesai}
                      onChange={e => updateShiftField(s.id, 'jam_selesai', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Toleransi (menit)</label>
                    <input type="number" min="0" value={s.toleransi_menit}
                      onChange={e => updateShiftField(s.id, 'toleransi_menit', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Interval (menit)</label>
                    <input type="number" min="1" value={s.interval_menit}
                      onChange={e => updateShiftField(s.id, 'interval_menit', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Potongan/Interval (Rp)</label>
                    <input type="number" min="0" value={s.potongan_per_interval}
                      onChange={e => updateShiftField(s.id, 'potongan_per_interval', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Maks/Hari (Rp)</label>
                    <input type="number" min="0" value={s.potongan_maks_harian || 0}
                      onChange={e => updateShiftField(s.id, 'potongan_maks_harian', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={simpanShifts} disabled={savingShift}
            className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium">
            {savingShift ? 'Menyimpan...' : 'Simpan Pengaturan Shift'}
          </button>
        </div>

        {/* ─── BERSIHKAN FOTO LAMA ─── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Bersihkan Foto Absensi Lama</h2>
          <p className="text-xs text-gray-500 mb-4">
            Hapus foto absensi yang berusia lebih dari 3 bulan untuk menghemat penyimpanan. Data absensi (kehadiran, jam masuk/keluar) tetap tersimpan, hanya fotonya yang dihapus.
          </p>
          {cleanResult && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-3 text-sm">{cleanResult}</div>
          )}
          <button onClick={bersihkanFotoLama} disabled={cleaningFoto}
            className="bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 disabled:opacity-50 px-5 py-2 rounded-lg text-sm font-medium">
            {cleaningFoto ? 'Membersihkan...' : '🗑 Bersihkan Foto > 3 Bulan'}
          </button>
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