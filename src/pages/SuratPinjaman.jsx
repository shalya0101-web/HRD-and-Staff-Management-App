import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const FMT = n => new Intl.NumberFormat('id-ID').format(n || 0)
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

// ─── KOMPONEN UPLOAD TANDA TANGAN ────────────────────────────────────────────

function UploadTandaTangan({ loanId, currentTtd, onUpload }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('File harus berupa gambar.'); return }
    if (file.size > 2 * 1024 * 1024) { setError('Ukuran file maksimal 2MB.'); return }

    setUploading(true); setError('')
    const fileName = `ttd_${loanId}_${Date.now()}.${file.name.split('.').pop()}`
    const { error: uploadErr } = await supabase.storage
      .from('signatures')
      .upload(fileName, file, { contentType: file.type, upsert: true })

    if (uploadErr) { setError('Gagal upload: ' + uploadErr.message); setUploading(false); return }

    const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(fileName)
    const url = urlData.publicUrl

    await supabase.from('loans').update({ ttd_pemohon: url }).eq('id', loanId)
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

// ─── PREVIEW SURAT ────────────────────────────────────────────────────────────

function generateSuratHTML(loan, employee, companyInfo, isApproved) {
  const nomorSurat = `PKP/${loan.id?.slice(0,6).toUpperCase()}/${new Date(loan.created_at).getMonth()+1}/${new Date(loan.created_at).getFullYear()}`
  const tglSurat = formatTanggalHari(loan.created_at?.split('T')[0] || new Date().toISOString().split('T')[0])
  const tglDisetujui = loan.tgl_disetujui ? formatTanggal(loan.tgl_disetujui) : formatTanggal(new Date().toISOString().split('T')[0])
  const cicilan = Math.ceil(loan.jumlah / loan.jumlah_bulan)

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Surat Pengajuan Pinjaman - ${employee?.nama}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #111; background: white; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 25mm; }
    
    /* Kop Surat */
    .kop { display: flex; align-items: center; gap: 16px; padding-bottom: 12px; border-bottom: 3px solid #1e40af; margin-bottom: 20px; }
    .kop-logo { width: 70px; height: 70px; object-fit: contain; }
    .kop-logo-placeholder { width: 70px; height: 70px; background: #1e40af; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: bold; flex-shrink: 0; }
    .kop-text { flex: 1; }
    .kop-nama { font-size: 18pt; font-weight: bold; color: #1e40af; margin-bottom: 2px; }
    .kop-alamat { font-size: 9pt; color: #555; line-height: 1.5; }

    /* Judul */
    .judul { text-align: center; margin: 20px 0; }
    .judul h2 { font-size: 13pt; font-weight: bold; text-transform: uppercase; text-decoration: underline; margin-bottom: 4px; }
    .judul p { font-size: 10pt; color: #555; }

    /* Nomor surat */
    .nomor { font-size: 10pt; margin-bottom: 16px; }

    /* Body surat */
    .body { font-size: 11pt; line-height: 1.8; }
    .body p { margin-bottom: 8px; text-align: justify; }
    .indent { text-indent: 2em; }

    /* Tabel data */
    .data-table { width: 100%; margin: 12px 0; border-collapse: collapse; font-size: 11pt; }
    .data-table td { padding: 4px 8px; vertical-align: top; }
    .data-table td:first-child { width: 180px; font-weight: 500; }
    .data-table td:nth-child(2) { width: 16px; }

    /* Tanda tangan */
    .ttd-section { display: flex; justify-content: space-between; margin-top: 32px; }
    .ttd-box { text-align: center; width: 45%; }
    .ttd-box .ttd-label { font-size: 10pt; margin-bottom: 4px; }
    .ttd-img-container { height: 64px; display: flex; align-items: center; justify-content: center; margin: 8px 0; }
    .ttd-img { max-height: 60px; max-width: 150px; object-fit: contain; }
    .ttd-name { font-weight: bold; font-size: 11pt; border-top: 1px solid #333; padding-top: 4px; margin-top: 4px; display: inline-block; min-width: 160px; }
    .ttd-jabatan { font-size: 10pt; color: #555; }
    .ttd-empty { height: 60px; border-bottom: 1px dashed #ccc; margin: 8px auto; width: 160px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 4px; color: #aaa; font-size: 9pt; }

    /* Status badge */
    .status-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 9pt; font-weight: bold; }
    .status-pending { background: #fef3c7; color: #92400e; border: 1px solid #d97706; }
    .status-approved { background: #d1fae5; color: #065f46; border: 1px solid #059669; }

    @media print {
      body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .page { padding: 15mm 20mm; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;margin-bottom:0">
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
        : `<div class="kop-logo-placeholder">${(companyInfo?.nama || 'K').charAt(0)}</div>`
      }
      <div class="kop-text">
        <div class="kop-nama">${companyInfo?.nama || 'Klinik Pillar Medika'}</div>
        <div class="kop-alamat">
          ${companyInfo?.alamat || 'Alamat Klinik'}<br>
          ${companyInfo?.telepon ? `Telp: ${companyInfo.telepon}` : ''}
          ${companyInfo?.email ? ` | Email: ${companyInfo.email}` : ''}
        </div>
      </div>
      <div style="text-align:right">
        <span class="status-badge ${isApproved ? 'status-approved' : 'status-pending'}">
          ${isApproved ? '✓ DISETUJUI' : '⏳ PENDING'}
        </span>
      </div>
    </div>

    <!-- Judul -->
    <div class="judul">
      <h2>Surat Pengajuan Pinjaman Karyawan</h2>
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

      <p class="indent">Dengan ini mengajukan permohonan pinjaman kepada perusahaan dengan rincian sebagai berikut:</p>

      <table class="data-table">
        <tr><td>Jenis Pinjaman</td><td>:</td><td><strong>${loan.jenis === 'cicilan' ? 'Cicilan (Pinjaman Bertahap)' : 'Kasbon'}</strong></td></tr>
        <tr><td>Jumlah Pinjaman</td><td>:</td><td><strong>Rp ${FMT(loan.jumlah)}</strong></td></tr>
        ${loan.jenis === 'cicilan' ? `
        <tr><td>Jangka Waktu</td><td>:</td><td>${loan.jumlah_bulan} bulan</td></tr>
        <tr><td>Cicilan per Bulan</td><td>:</td><td>Rp ${FMT(cicilan)}</td></tr>
        <tr><td>Mulai Cicilan</td><td>:</td><td>${loan.tgl_mulai ? formatTanggal(loan.tgl_mulai) : '-'}</td></tr>
        ` : ''}
        <tr><td>Keperluan</td><td>:</td><td>${loan.keterangan || '-'}</td></tr>
        <tr><td>Tanggal Pengajuan</td><td>:</td><td>${tglSurat}</td></tr>
      </table>

      <p class="indent">Saya berjanji untuk melunasi pinjaman tersebut sesuai dengan ketentuan yang telah disepakati dan bersedia menerima pemotongan gaji setiap bulan sesuai jumlah cicilan yang telah ditetapkan.</p>

      <p class="indent">Demikian surat pengajuan ini saya buat dengan sebenar-benarnya dan penuh rasa tanggung jawab.</p>
    </div>

    <!-- Tanda Tangan -->
    <div class="ttd-section">
      <!-- Pemohon -->
      <div class="ttd-box">
        <div class="ttd-label">Pemohon,</div>
        <div style="font-size:9pt;color:#777;margin-bottom:4px">${tglSurat}</div>
        <div class="ttd-img-container">
          ${loan.ttd_pemohon
            ? `<img src="${loan.ttd_pemohon}" class="ttd-img" alt="TTD Pemohon" />`
            : `<div class="ttd-empty">Tanda tangan</div>`
          }
        </div>
        <div>
          <div class="ttd-name">${employee?.nama || '-'}</div>
          <div class="ttd-jabatan">${employee?.jabatan || '-'}</div>
        </div>
      </div>

      <!-- Direktur -->
      <div class="ttd-box">
        <div class="ttd-label">${isApproved ? 'Menyetujui,' : 'Mengetahui,'}</div>
        <div style="font-size:9pt;color:#777;margin-bottom:4px">
          ${isApproved && loan.tgl_disetujui ? tglDisetujui : '&nbsp;'}
        </div>
        <div class="ttd-img-container" style="position:relative">
          ${isApproved && companyInfo?.logo_url
            ? `<img src="${companyInfo.logo_url}" alt="Stempel" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);height:80px;opacity:0.22;object-fit:contain;pointer-events:none" />`
            : ''
          }
          ${isApproved && companyInfo?.ttd_direktur
            ? `<img src="${companyInfo.ttd_direktur}" class="ttd-img" alt="TTD Direktur" style="position:relative;z-index:1" />`
            : isApproved
              ? `<div style="font-family:'Times New Roman',serif;font-size:22pt;font-style:italic;color:#1e40af;border-bottom:1px solid #1e40af;padding:0 8px;position:relative;z-index:1">${companyInfo?.direktur?.split(' ')[0] || 'Direktur'}</div>`
              : `<div class="ttd-empty">Tanda tangan</div>`
          }
        </div>
        <div>
          <div class="ttd-name">${companyInfo?.direktur || 'Direktur'}</div>
          <div class="ttd-jabatan">Direktur</div>
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

export default function SuratPinjaman({ loanId, employee: empProp, onClose }) {
  const [loan, setLoan] = useState(null)
  const [employee, setEmployee] = useState(empProp || null)
  const [companyInfo, setCompanyInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ttdUrl, setTtdUrl] = useState('')

  useEffect(() => { fetchAll() }, [loanId])

  async function fetchAll() {
    setLoading(true)
    const [loanRes, companyRes] = await Promise.all([
      supabase.from('loans').select('*, employees(id, nama, jabatan, departemen, nik)').eq('id', loanId).single(),
      supabase.from('company_info').select('*').single(),
    ])
    if (loanRes.error) { setError('Gagal memuat data pinjaman.'); setLoading(false); return }
    setLoan(loanRes.data)
    setTtdUrl(loanRes.data.ttd_pemohon || '')
    if (!empProp && loanRes.data.employees) setEmployee(loanRes.data.employees)
    setCompanyInfo(companyRes.data || null)
    setLoading(false)
  }

  function bukaPreview() {
    if (!loan || !employee) return
    const html = generateSuratHTML(loan, employee, companyInfo, loan.status === 'approved')
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

  const isApproved = loan?.status === 'approved'
  const cicilan = loan ? Math.ceil(loan.jumlah / loan.jumlah_bulan) : 0

  return (
    <div className="space-y-4">
      {/* Preview mini surat */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white font-semibold">Surat Pengajuan Pinjaman</p>
              <p className="text-blue-200 text-xs mt-0.5">{companyInfo?.nama}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              isApproved ? 'bg-green-100 text-green-700' :
              loan?.status === 'rejected' ? 'bg-red-100 text-red-600' :
              'bg-yellow-100 text-yellow-700'}`}>
              {isApproved ? '✓ Disetujui' : loan?.status === 'rejected' ? 'Ditolak' : '⏳ Pending'}
            </span>
          </div>
        </div>

        {/* Info pinjaman */}
        <div className="px-5 py-4 space-y-2 border-b border-gray-100">
          {[
            ['Pemohon', employee?.nama],
            ['Jabatan', employee?.jabatan],
            ['Jenis', loan?.jenis === 'cicilan' ? 'Cicilan' : 'Kasbon'],
            ['Jumlah', `Rp ${FMT(loan?.jumlah)}`],
            ...(loan?.jenis === 'cicilan' ? [
              ['Cicilan/Bulan', `Rp ${FMT(cicilan)}`],
              ['Jangka Waktu', `${loan?.jumlah_bulan} bulan`],
            ] : []),
            ['Keperluan', loan?.keterangan || '-'],
            ['Tanggal Pengajuan', formatTanggal(loan?.created_at?.split('T')[0])],
            ...(isApproved ? [['Disetujui Oleh', loan?.disetujui_oleh || companyInfo?.direktur]] : []),
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-500 text-xs">{label}</span>
              <span className="text-gray-800 text-xs font-medium text-right max-w-48">{val || '-'}</span>
            </div>
          ))}
        </div>

        {/* Tanda tangan pemohon */}
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-600 mb-2">Tanda Tangan Pemohon</p>
          <UploadTandaTangan
            loanId={loanId}
            currentTtd={ttdUrl}
            onUpload={(url) => { setTtdUrl(url); setLoan(prev => ({...prev, ttd_pemohon: url})) }}
          />
          {!ttdUrl && (
            <p className="text-xs text-gray-400 mt-1">Upload tanda tangan untuk melengkapi surat</p>
          )}
        </div>

        {/* Tanda tangan direktur */}
        {isApproved && (
          <div className="px-5 py-4 border-b border-gray-100 bg-green-50">
            <p className="text-xs font-medium text-gray-600 mb-1">Tanda Tangan Direktur</p>
            <div className="flex items-center gap-3">
              <div className="font-serif italic text-blue-700 text-2xl border-b border-blue-400 px-2">
                {companyInfo?.direktur?.split(' ')[0] || 'Dir'}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{companyInfo?.direktur}</p>
                <p className="text-xs text-gray-500">Direktur · {formatTanggal(loan?.tgl_disetujui)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tombol aksi */}
        <div className="px-5 py-4 flex gap-3">
          <button onClick={bukaPreview}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium">
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
          💡 Tanda tangan direktur akan muncul otomatis setelah pengajuan disetujui oleh HR/Manager.
        </div>
      )}
    </div>
  )
}