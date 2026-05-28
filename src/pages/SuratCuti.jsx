import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const BULAN_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

function formatTanggal(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getDate()} ${BULAN_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

function formatTanggalHari(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']
  return `${hari[d.getDay()]}, ${d.getDate()} ${BULAN_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

function hitungHari(tglMulai, tglSelesai) {
  if (!tglMulai || !tglSelesai) return 0
  const a = new Date(tglMulai)
  const b = new Date(tglSelesai)
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24)) + 1
}

function judulSurat(jenis) {
  if (jenis === 'cuti') return 'Surat Permohonan Cuti'
  if (jenis === 'sakit') return 'Surat Keterangan Sakit'
  return 'Surat Permohonan Izin'
}

function labelJenis(jenis) {
  if (jenis === 'cuti') return 'Cuti'
  if (jenis === 'sakit') return 'Sakit'
  return 'Izin'
}

// ─── UPLOAD TANDA TANGAN ─────────────────────────────────────────────────────

function UploadTandaTangan({ leaveId, currentTtd, onUpload }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('File harus berupa gambar.'); return }
    if (file.size > 2 * 1024 * 1024) { setError('Ukuran file maksimal 2MB.'); return }

    setUploading(true); setError('')
    const fileName = `ttd_cuti_${leaveId}_${Date.now()}.${file.name.split('.').pop()}`
    const { error: uploadErr } = await supabase.storage
      .from('signatures')
      .upload(fileName, file, { contentType: file.type, upsert: true })

    if (uploadErr) { setError('Gagal upload: ' + uploadErr.message); setUploading(false); return }

    const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(fileName)
    const url = urlData.publicUrl

    await supabase.from('leave_requests').update({ ttd_pemohon: url }).eq('id', leaveId)
    onUpload(url)
    setUploading(false)
  }

  return (
    <div>
      {currentTtd ? (
        <div className="flex items-center gap-3">
          <img src={currentTtd} alt="Tanda tangan" className="h-12 object-contain border border-gray-200 rounded p-1 bg-white" />
          <button onClick={() => fileRef.current?.click()}
            className="text-xs text-blue-600 hover:underline">Ganti</button>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-xs font-medium w-full">
          {uploading ? 'Mengupload...' : '📎 Upload Tanda Tangan'}
        </button>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  )
}

// ─── GENERATE HTML SURAT ─────────────────────────────────────────────────────

function generateSuratHTML(leave, employee, companyInfo) {
  const isApproved = leave.status === 'approved'
  const nomorSurat = `SKL/${leave.id?.slice(0,6).toUpperCase()}/${new Date(leave.created_at).getMonth()+1}/${new Date(leave.created_at).getFullYear()}`
  const tglSurat = formatTanggalHari(leave.created_at?.split('T')[0])
  const tglDisetujui = leave.tgl_disetujui ? formatTanggal(leave.tgl_disetujui) : '-'
  const jumlahHari = hitungHari(leave.tgl_mulai, leave.tgl_selesai)
  const judul = judulSurat(leave.jenis)
  const jenis = labelJenis(leave.jenis)

  const bodyText = leave.jenis === 'cuti'
    ? `Dengan hormat, saya yang bertanda tangan di bawah ini mengajukan permohonan cuti selama <strong>${jumlahHari} hari kerja</strong>, terhitung mulai tanggal <strong>${formatTanggal(leave.tgl_mulai)}</strong> sampai dengan <strong>${formatTanggal(leave.tgl_selesai)}</strong>.`
    : leave.jenis === 'sakit'
    ? `Dengan hormat, saya yang bertanda tangan di bawah ini memberitahukan bahwa saya tidak dapat masuk kerja dikarenakan sakit selama <strong>${jumlahHari} hari</strong>, terhitung mulai tanggal <strong>${formatTanggal(leave.tgl_mulai)}</strong> sampai dengan <strong>${formatTanggal(leave.tgl_selesai)}</strong>.`
    : `Dengan hormat, saya yang bertanda tangan di bawah ini mengajukan permohonan izin tidak masuk kerja selama <strong>${jumlahHari} hari</strong>, terhitung mulai tanggal <strong>${formatTanggal(leave.tgl_mulai)}</strong> sampai dengan <strong>${formatTanggal(leave.tgl_selesai)}</strong>.`

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${judul} - ${employee?.nama}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Times New Roman',serif; font-size:12pt; color:#111; background:white; }
    .page { width:210mm; min-height:297mm; margin:0 auto; padding:20mm 25mm; }
    .kop { display:flex; align-items:center; gap:16px; padding-bottom:12px; border-bottom:3px solid #1e40af; margin-bottom:20px; }
    .kop-logo { width:70px; height:70px; object-fit:contain; }
    .kop-logo-placeholder { width:70px; height:70px; background:#1e40af; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:24px; font-weight:bold; flex-shrink:0; }
    .kop-nama { font-size:18pt; font-weight:bold; color:#1e40af; margin-bottom:2px; }
    .kop-alamat { font-size:9pt; color:#555; line-height:1.5; }
    .judul { text-align:center; margin:20px 0; }
    .judul h2 { font-size:13pt; font-weight:bold; text-transform:uppercase; text-decoration:underline; margin-bottom:4px; }
    .judul p { font-size:10pt; color:#555; }
    .body { font-size:11pt; line-height:1.8; }
    .body p { margin-bottom:8px; text-align:justify; }
    .indent { text-indent:2em; }
    .data-table { width:100%; margin:12px 0; border-collapse:collapse; font-size:11pt; }
    .data-table td { padding:4px 8px; vertical-align:top; }
    .data-table td:first-child { width:180px; font-weight:500; }
    .data-table td:nth-child(2) { width:16px; }
    .ttd-section { display:flex; justify-content:space-between; margin-top:32px; }
    .ttd-box { text-align:center; width:45%; }
    .ttd-label { font-size:10pt; margin-bottom:4px; }
    .ttd-img-container { height:64px; display:flex; align-items:center; justify-content:center; margin:8px 0; }
    .ttd-img { max-height:60px; max-width:150px; object-fit:contain; }
    .ttd-name { font-weight:bold; font-size:11pt; border-top:1px solid #333; padding-top:4px; margin-top:4px; display:inline-block; min-width:160px; }
    .ttd-jabatan { font-size:10pt; color:#555; }
    .ttd-empty { height:60px; border-bottom:1px dashed #ccc; margin:8px auto; width:160px; display:flex; align-items:flex-end; justify-content:center; padding-bottom:4px; color:#aaa; font-size:9pt; }
    .status-badge { display:inline-block; padding:2px 10px; border-radius:20px; font-size:9pt; font-weight:bold; }
    .status-pending { background:#fef3c7; color:#92400e; border:1px solid #d97706; }
    .status-approved { background:#d1fae5; color:#065f46; border:1px solid #059669; }
    .status-rejected { background:#fee2e2; color:#991b1b; border:1px solid #dc2626; }
    @media print {
      body { background:white; }
      .no-print { display:none !important; }
      .page { padding:15mm 20mm; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center">
    <button onclick="window.print()" style="background:#1e40af;color:white;border:none;padding:10px 28px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;margin-right:8px">
      🖨 Print / Save PDF
    </button>
    <button onclick="window.close()" style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer">
      Tutup
    </button>
  </div>

  <div class="page">
    <!-- Kop Surat -->
    <div class="kop">
      ${companyInfo?.logo_url
        ? `<img src="${companyInfo.logo_url}" class="kop-logo" alt="Logo" />`
        : `<div class="kop-logo-placeholder">${(companyInfo?.nama||'K').charAt(0)}</div>`}
      <div style="flex:1">
        <div class="kop-nama">${companyInfo?.nama || 'Klinik Pillar Medika'}</div>
        <div class="kop-alamat">
          ${companyInfo?.alamat || ''}<br>
          ${companyInfo?.telepon ? `Telp: ${companyInfo.telepon}` : ''}
          ${companyInfo?.email ? ` | Email: ${companyInfo.email}` : ''}
        </div>
      </div>
      <div style="text-align:right">
        <span class="status-badge ${isApproved ? 'status-approved' : leave.status === 'rejected' ? 'status-rejected' : 'status-pending'}">
          ${isApproved ? '✓ DISETUJUI' : leave.status === 'rejected' ? '✗ DITOLAK' : '⏳ PENDING'}
        </span>
      </div>
    </div>

    <!-- Judul -->
    <div class="judul">
      <h2>${judul}</h2>
      <p>Nomor: ${nomorSurat}</p>
    </div>

    <!-- Body -->
    <div class="body">
      <p>Yang bertanda tangan di bawah ini:</p>

      <table class="data-table">
        <tr><td>Nama Lengkap</td><td>:</td><td><strong>${employee?.nama || '-'}</strong></td></tr>
        <tr><td>NIK / ID Karyawan</td><td>:</td><td>${employee?.nik || '-'}</td></tr>
        <tr><td>Jabatan</td><td>:</td><td>${employee?.jabatan || '-'}</td></tr>
        <tr><td>Departemen</td><td>:</td><td>${employee?.departemen || '-'}</td></tr>
      </table>

      <p class="indent">${bodyText}</p>

      <table class="data-table">
        <tr><td>Jenis</td><td>:</td><td><strong>${jenis}</strong></td></tr>
        <tr><td>Tanggal Mulai</td><td>:</td><td>${formatTanggal(leave.tgl_mulai)}</td></tr>
        <tr><td>Tanggal Selesai</td><td>:</td><td>${formatTanggal(leave.tgl_selesai)}</td></tr>
        <tr><td>Jumlah Hari</td><td>:</td><td><strong>${jumlahHari} hari</strong></td></tr>
        <tr><td>Alasan</td><td>:</td><td>${leave.keterangan || '-'}</td></tr>
        <tr><td>Tanggal Pengajuan</td><td>:</td><td>${tglSurat}</td></tr>
        ${isApproved ? `<tr><td>Disetujui Oleh</td><td>:</td><td>${leave.disetujui_nama || companyInfo?.direktur || '-'}</td></tr>` : ''}
        ${isApproved ? `<tr><td>Tanggal Disetujui</td><td>:</td><td>${tglDisetujui}</td></tr>` : ''}
      </table>

      <p class="indent">Demikian surat ${leave.jenis === 'cuti' ? 'permohonan cuti' : 'keterangan ' + leave.jenis} ini saya buat dengan sebenar-benarnya. Saya berkomitmen untuk menyelesaikan pekerjaan yang menjadi tanggung jawab saya sebelum dan sesudah ${leave.jenis === 'cuti' ? 'cuti' : 'izin'} berlangsung.</p>
    </div>

    <!-- Tanda Tangan -->
    <div class="ttd-section">
      <!-- Pemohon -->
      <div class="ttd-box">
        <div class="ttd-label">Pemohon,</div>
        <div style="font-size:9pt;color:#777;margin-bottom:4px">${tglSurat}</div>
        <div class="ttd-img-container">
          ${leave.ttd_pemohon
            ? `<img src="${leave.ttd_pemohon}" class="ttd-img" alt="TTD Pemohon" />`
            : `<div class="ttd-empty">Tanda tangan</div>`}
        </div>
        <div>
          <div class="ttd-name">${employee?.nama || '-'}</div>
          <div class="ttd-jabatan">${employee?.jabatan || '-'}</div>
        </div>
      </div>

      <!-- Penyetuju -->
      <div class="ttd-box">
        <div class="ttd-label">${isApproved ? 'Menyetujui,' : 'Mengetahui,'}</div>
        <div style="font-size:9pt;color:#777;margin-bottom:4px">
          ${isApproved ? tglDisetujui : '&nbsp;'}
        </div>
        <div class="ttd-img-container">
          ${isApproved && companyInfo?.ttd_direktur
            ? `<img src="${companyInfo.ttd_direktur}" class="ttd-img" alt="TTD Penyetuju" />`
            : isApproved
              ? `<div style="font-family:'Times New Roman',serif;font-size:22pt;font-style:italic;color:#1e40af;border-bottom:1px solid #1e40af;padding:0 8px">${(leave.disetujui_nama || companyInfo?.direktur || 'Dir').split(' ')[0]}</div>`
              : `<div class="ttd-empty">Tanda tangan</div>`}
        </div>
        <div>
          <div class="ttd-name">${leave.disetujui_nama || companyInfo?.direktur || '-'}</div>
          <div class="ttd-jabatan">Manager / Direktur</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:9pt;color:#9ca3af;text-align:center">
      Dokumen ini digenerate otomatis oleh Sistem HR ${companyInfo?.nama || 'Klinik'} · ${new Date().toLocaleDateString('id-ID')}
    </div>
  </div>
</body>
</html>`
}

// ─── KOMPONEN UTAMA ───────────────────────────────────────────────────────────

export default function SuratCuti({ leaveId, employee: empProp, onClose }) {
  const [leave, setLeave] = useState(null)
  const [employee, setEmployee] = useState(empProp || null)
  const [companyInfo, setCompanyInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ttdUrl, setTtdUrl] = useState('')

  useEffect(() => { fetchAll() }, [leaveId])

  async function fetchAll() {
    setLoading(true)
    const [leaveRes, companyRes] = await Promise.all([
      supabase.from('leave_requests')
        .select('*, employees(id, nama, jabatan, departemen, nik)')
        .eq('id', leaveId).single(),
      supabase.from('company_info').select('*').single(),
    ])
    if (leaveRes.error) { setError('Gagal memuat data.'); setLoading(false); return }
    setLeave(leaveRes.data)
    setTtdUrl(leaveRes.data.ttd_pemohon || '')
    if (!empProp && leaveRes.data.employees) setEmployee(leaveRes.data.employees)
    setCompanyInfo(companyRes.data || null)
    setLoading(false)
  }

  function bukaPreview() {
    if (!leave || !employee) return
    const html = generateSuratHTML(leave, employee, companyInfo)
    const win = window.open('', '_blank', 'width=900,height=850')
    win.document.write(html)
    win.document.close()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
  )

  const isApproved = leave?.status === 'approved'
  const jumlahHari = hitungHari(leave?.tgl_mulai, leave?.tgl_selesai)
  const jenis = labelJenis(leave?.jenis)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-700 to-green-600 px-5 py-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white font-semibold">{judulSurat(leave?.jenis)}</p>
              <p className="text-green-200 text-xs mt-0.5">{companyInfo?.nama}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              isApproved ? 'bg-green-100 text-green-700' :
              leave?.status === 'rejected' ? 'bg-red-100 text-red-600' :
              'bg-yellow-100 text-yellow-700'}`}>
              {isApproved ? '✓ Disetujui' : leave?.status === 'rejected' ? 'Ditolak' : '⏳ Pending'}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="px-5 py-4 space-y-2 border-b border-gray-100">
          {[
            ['Pemohon', employee?.nama],
            ['Jabatan', employee?.jabatan],
            ['Jenis', jenis],
            ['Dari', formatTanggal(leave?.tgl_mulai)],
            ['Sampai', formatTanggal(leave?.tgl_selesai)],
            ['Jumlah Hari', `${jumlahHari} hari`],
            ['Alasan', leave?.keterangan || '-'],
            ...(isApproved ? [
              ['Disetujui Oleh', leave?.disetujui_nama || companyInfo?.direktur],
              ['Tgl Disetujui', formatTanggal(leave?.tgl_disetujui)],
            ] : []),
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-500 text-xs">{label}</span>
              <span className="text-gray-800 text-xs font-medium text-right max-w-48">{val || '-'}</span>
            </div>
          ))}
        </div>

        {/* Upload TTD Pemohon */}
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-600 mb-2">Tanda Tangan Pemohon</p>
          <UploadTandaTangan
            leaveId={leaveId}
            currentTtd={ttdUrl}
            onUpload={(url) => { setTtdUrl(url); setLeave(prev => ({...prev, ttd_pemohon: url})) }}
          />
          {!ttdUrl && <p className="text-xs text-gray-400 mt-1">Upload tanda tangan untuk melengkapi surat</p>}
        </div>

        {/* TTD Penyetuju */}
        {isApproved && (
          <div className="px-5 py-4 border-b border-gray-100 bg-green-50">
            <p className="text-xs font-medium text-gray-600 mb-2">Tanda Tangan Penyetuju</p>
            <div className="flex items-center gap-3">
              {companyInfo?.ttd_direktur
                ? <img src={companyInfo.ttd_direktur} alt="TTD" className="h-12 object-contain border border-gray-200 rounded p-1 bg-white" />
                : <div className="font-serif italic text-green-700 text-2xl border-b border-green-400 px-2">
                    {(leave?.disetujui_nama || companyInfo?.direktur || 'Dir').split(' ')[0]}
                  </div>
              }
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {leave?.disetujui_nama || companyInfo?.direktur}
                </p>
                <p className="text-xs text-gray-500">Manager / Direktur · {formatTanggal(leave?.tgl_disetujui)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tombol aksi */}
        <div className="px-5 py-4 flex gap-3">
          <button onClick={bukaPreview}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg text-sm font-medium">
            🖨 Lihat & Download PDF
          </button>
          {onClose && (
            <button onClick={onClose}
              className="border border-gray-300 px-4 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Tutup
            </button>
          )}
        </div>
      </div>

      {!isApproved && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
          💡 Tanda tangan penyetuju akan muncul otomatis setelah pengajuan disetujui.
        </div>
      )}
    </div>
  )
}