import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useOutlet } from '../lib/OutletContext'

const BULAN_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const FMT = n => new Intl.NumberFormat('id-ID').format(n || 0)

export default function SlipGaji() {
  const { activeOutlet, activeOutletData } = useOutlet()
  const today = new Date()
  const [bulan, setBulan] = useState(today.getMonth() + 1)
  const [tahun, setTahun] = useState(today.getFullYear())
  const [tipe, setTipe] = useState('gaji')
  const [employees, setEmployees] = useState([])
  const [payrolls, setPayrolls] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [companyInfo, setCompanyInfo] = useState(null)
  const [outletLogo, setOutletLogo] = useState(null)

  useEffect(() => { fetchCompanyInfo() }, [])
  useEffect(() => { if (activeOutlet) { fetchData(); fetchOutletLogo() } }, [bulan, tahun, tipe, activeOutlet])

  async function fetchCompanyInfo() {
    const { data } = await supabase.from('company_info').select('*').single()
    setCompanyInfo(data || null)
  }

  async function fetchOutletLogo() {
    const { data } = await supabase.from('outlets').select('logo_url').eq('id', activeOutlet).single()
    setOutletLogo(data?.logo_url || null)
  }

  async function fetchData() {
    setLoading(true)
    const [empRes, payRes] = await Promise.all([
      supabase.from('employee_outlets')
        .select('employee_id, employees(id, nama, jabatan, departemen, nik, tgl_masuk, gaji_pokok, piket_per_bulan, status)')
        .eq('outlet_id', activeOutlet),
      supabase.from('payroll')
        .select('*')
        .eq('bulan', bulan).eq('tahun', tahun)
        .eq('outlet_id', activeOutlet).eq('tipe', tipe)
    ])
    const emps = (empRes.data || []).map(r => r.employees).filter(e => e?.status === 'aktif')
    setEmployees(emps)
    setPayrolls(payRes.data || [])
    setLoading(false)
  }

  function hitungTotal(p) {
    if (!p) return 0
    if (tipe === 'gaji') {
      const pemasukan = (p.gaji_pokok||0) + (p.tunjangan_makan||0) + (p.tunjangan_transport||0) +
        (p.tunjangan_telephone||0) + (p.tunjangan_jabatan_pj||0) + (p.tunjangan_jabatan_lain||0) +
        (p.sip||0) + (p.lembur||0)
      const potongan = (p.potongan_bpjs||0) + (p.potongan_cicilan||0) + (p.potongan_kasbon||0) +
        (p.potongan_absensi||0) + (p.potongan_arisan||0) + (p.potongan_lainnya||0)
      return pemasukan - potongan
    } else {
      return (p.jasa_pelayanan||0) + (p.bonus_outlet||0) - (p.potongan_lainnya||0)
    }
  }

  function generateSlipHTML(emp, p) {
    const total = hitungTotal(p)
    const tglMasuk = emp.tgl_masuk ? new Date(emp.tgl_masuk).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' }) : '-'
    const periode = `${BULAN_NAMES[bulan-1]} ${tahun}`
    const tanggalBayar = tipe === 'gaji' ? `01 ${periode}` : `10 ${periode}`
    const namaOutlet = activeOutletData?.nama || 'Klinik'
    const namaPerusahaan = companyInfo?.nama || 'Klinik Pillar Medika'
    const alamat = companyInfo?.alamat || ''
    const telepon = companyInfo?.telepon || ''
    const email = companyInfo?.email || ''
    const logoPerusahaan = companyInfo?.logo_url || null
    const logoOutlet = outletLogo || null

    const rowGaji = (label, nilai, isPotongan = false) => nilai > 0 ? `
      <tr>
        <td style="padding:5px 8px;color:#374151;font-size:13px">${label}</td>
        <td style="padding:5px 8px;text-align:right;font-size:13px;${isPotongan?'color:#dc2626':'color:#374151'}">
          ${isPotongan ? '- ' : ''}Rp ${FMT(nilai)}
        </td>
      </tr>` : ''

    const komponenGaji = tipe === 'gaji' ? `
      <tr style="background:#f0f9ff">
        <td colspan="2" style="padding:6px 8px;font-weight:600;font-size:12px;color:#1e40af;text-transform:uppercase;letter-spacing:0.05em">Penghasilan</td>
      </tr>
      ${rowGaji('Gaji Pokok', p.gaji_pokok)}
      ${rowGaji('Surat Izin Praktek (SIP)', p.sip)}
      ${rowGaji('Tunjangan Makan', p.tunjangan_makan)}
      ${rowGaji('Tunjangan Transport', p.tunjangan_transport)}
      ${rowGaji('Tunjangan Telephone', p.tunjangan_telephone)}
      ${rowGaji('Tunjangan Jabatan (PJ)', p.tunjangan_jabatan_pj)}
      ${rowGaji('Tunjangan Jabatan (Lainnya)', p.tunjangan_jabatan_lain)}
      ${rowGaji('Lembur', p.lembur)}
      <tr style="background:#f9fafb;border-top:1px solid #e5e7eb">
        <td style="padding:6px 8px;font-weight:600;font-size:13px">Total Penghasilan</td>
        <td style="padding:6px 8px;text-align:right;font-weight:600;font-size:13px;color:#059669">
          Rp ${FMT((p.gaji_pokok||0)+(p.tunjangan_makan||0)+(p.tunjangan_transport||0)+(p.tunjangan_telephone||0)+(p.tunjangan_jabatan_pj||0)+(p.tunjangan_jabatan_lain||0)+(p.sip||0)+(p.lembur||0))}
        </td>
      </tr>
      <tr style="background:#fff5f5">
        <td colspan="2" style="padding:6px 8px;font-weight:600;font-size:12px;color:#dc2626;text-transform:uppercase;letter-spacing:0.05em">Potongan</td>
      </tr>
      ${rowGaji('BPJS', p.potongan_bpjs, true)}
      ${rowGaji('Cicilan', p.potongan_cicilan, true)}
      ${rowGaji('Kasbon', p.potongan_kasbon, true)}
      ${rowGaji('Potongan Absensi', p.potongan_absensi, true)}
      ${rowGaji('Arisan', p.potongan_arisan, true)}
      ${rowGaji('Lainnya', p.potongan_lainnya, true)}
      <tr style="background:#f9fafb;border-top:1px solid #e5e7eb">
        <td style="padding:6px 8px;font-weight:600;font-size:13px">Total Potongan</td>
        <td style="padding:6px 8px;text-align:right;font-weight:600;font-size:13px;color:#dc2626">
          - Rp ${FMT((p.potongan_bpjs||0)+(p.potongan_cicilan||0)+(p.potongan_kasbon||0)+(p.potongan_absensi||0)+(p.potongan_arisan||0)+(p.potongan_lainnya||0))}
        </td>
      </tr>
    ` : `
      <tr style="background:#f0f9ff">
        <td colspan="2" style="padding:6px 8px;font-weight:600;font-size:12px;color:#1e40af;text-transform:uppercase;letter-spacing:0.05em">Jasa Pelayanan</td>
      </tr>
      ${rowGaji('Jasa Pelayanan', p.jasa_pelayanan)}
      ${rowGaji('Bonus Outlet', p.bonus_outlet)}
      ${p.potongan_lainnya > 0 ? `
      <tr style="background:#fff5f5">
        <td colspan="2" style="padding:6px 8px;font-weight:600;font-size:12px;color:#dc2626;text-transform:uppercase;letter-spacing:0.05em">Potongan</td>
      </tr>
      ${rowGaji('Potongan Lainnya', p.potongan_lainnya, true)}` : ''}
    `

    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slip Gaji - ${emp.nama} - ${periode}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px; }
    .slip { background: white; max-width: 600px; margin: 0 auto; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    @media print {
      body { background: white; padding: 0; }
      .slip { box-shadow: none; border-radius: 0; max-width: 100%; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:16px">
    <button onclick="window.print()" style="background:#2563eb;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600">
      🖨 Print / Save PDF
    </button>
    <button onclick="window.close()" style="margin-left:8px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:10px 16px;border-radius:8px;font-size:14px;cursor:pointer">
      Tutup
    </button>
  </div>

  <div class="slip">
    <!-- Kop Surat -->
    <div style="padding:16px 20px;border-bottom:3px solid #1e40af;display:flex;align-items:center;justify-content:space-between;gap:12px">
      <!-- Kiri: Logo perusahaan + info -->
      <div style="display:flex;align-items:center;gap:12px;flex:1">
        ${logoPerusahaan
          ? `<img src="${logoPerusahaan}" style="width:60px;height:60px;object-fit:contain;flex-shrink:0" alt="Logo" />`
          : `<div style="width:60px;height:60px;background:#1e40af;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:22px;font-weight:bold;flex-shrink:0">${namaPerusahaan.charAt(0)}</div>`
        }
        <div>
          <div style="font-size:17px;font-weight:700;color:#1e40af">${namaPerusahaan}</div>
          ${alamat ? `<div style="font-size:11px;color:#6b7280;margin-top:1px">${alamat}</div>` : ''}
          <div style="font-size:11px;color:#6b7280">
            ${telepon ? `Telp: ${telepon}` : ''}${telepon && email ? ' | ' : ''}${email ? email : ''}
          </div>
        </div>
      </div>
      <!-- Kanan: Logo outlet -->
      <div style="text-align:center;flex-shrink:0">
        ${logoOutlet
          ? `<img src="${logoOutlet}" style="width:56px;height:56px;object-fit:contain" alt="${namaOutlet}" />`
          : `<div style="width:56px;height:56px;background:#e0f2fe;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#0284c7;text-align:center;padding:4px">${namaOutlet}</div>`
        }
        <div style="font-size:10px;color:#6b7280;margin-top:3px;max-width:70px;text-align:center">${namaOutlet}</div>
      </div>
    </div>

    <!-- Sub Header: Judul slip -->
    <div style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:12px 20px;display:flex;justify-content:space-between;align-items:center">
      <div style="color:white">
        <div style="font-size:14px;font-weight:700">Slip ${tipe === 'gaji' ? 'Gaji Bulanan' : 'Jasa Pelayanan'}</div>
        <div style="font-size:11px;opacity:0.8">Tgl Bayar: ${tanggalBayar}</div>
      </div>
      <div style="text-align:right;color:white">
        <div style="font-size:11px;opacity:0.8">Periode</div>
        <div style="font-size:15px;font-weight:700">${periode}</div>
      </div>
    </div>

    <!-- Info Pegawai -->
    <div style="padding:16px 20px;background:#f8fafc;border-bottom:1px solid #e5e7eb">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Nama</div>
          <div style="font-size:15px;font-weight:600;color:#111827">${emp.nama}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">NIK</div>
          <div style="font-size:14px;color:#374151;font-family:monospace">${emp.nik || '-'}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Jabatan</div>
          <div style="font-size:14px;color:#374151">${emp.jabatan}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Departemen</div>
          <div style="font-size:14px;color:#374151">${emp.departemen}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Tgl Masuk</div>
          <div style="font-size:14px;color:#374151">${tglMasuk}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Outlet</div>
          <div style="font-size:14px;color:#374151">${namaOutlet}</div>
        </div>
      </div>
    </div>

    <!-- Komponen Gaji -->
    <div style="padding:0 20px">
      <table style="width:100%;border-collapse:collapse;margin:12px 0">
        <tbody>
          ${komponenGaji}
        </tbody>
      </table>
    </div>

    <!-- Total -->
    <div style="margin:0 20px 20px;background:linear-gradient(135deg,#065f46,#059669);border-radius:8px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="color:rgba(255,255,255,0.8);font-size:12px">Total ${tipe === 'gaji' ? 'Gaji Bersih' : 'Jasa Bersih'}</div>
          <div style="color:white;font-size:22px;font-weight:700">Rp ${FMT(total)}</div>
        </div>
        <div style="text-align:right">
          <div style="background:rgba(255,255,255,0.2);border-radius:20px;padding:4px 12px">
            <span style="color:white;font-size:12px;font-weight:600">${p.status?.toUpperCase() || 'DRAFT'}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:12px 20px 16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between">
      <div style="font-size:11px;color:#9ca3af">Dicetak: ${new Date().toLocaleDateString('id-ID', {day:'2-digit',month:'long',year:'numeric'})}</div>
      <div style="font-size:11px;color:#9ca3af">Dokumen ini digenerate otomatis oleh sistem HR Klinik</div>
    </div>
  </div>
</body>
</html>`
  }

  function cetakSlip(emp) {
    const p = payrolls.find(pr => pr.employee_id === emp.id)
    if (!p) return
    const html = generateSlipHTML(emp, p)
    const win = window.open('', '_blank', 'width=700,height=800')
    win.document.write(html)
    win.document.close()
  }

  function cetakSemua() {
    const empsWithPayroll = employees.filter(emp => payrolls.find(p => p.employee_id === emp.id))
    if (empsWithPayroll.length === 0) return

    let allHTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Slip Gaji - ${BULAN_NAMES[bulan-1]} ${tahun}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:Arial,sans-serif; background:#f3f4f6; padding:20px; }
    .slip { background:white; max-width:600px; margin:0 auto 32px; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.1); }
    .page-break { page-break-after: always; }
    @media print {
      body { background:white; padding:0; }
      .no-print { display:none !important; }
      .slip { box-shadow:none; border-radius:0; max-width:100%; margin:0; }
      .page-break { page-break-after:always; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:16px">
    <button onclick="window.print()" style="background:#2563eb;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600">
      🖨 Print Semua Slip
    </button>
    <span style="margin-left:12px;font-size:13px;color:#6b7280">${empsWithPayroll.length} slip gaji</span>
  </div>`

    empsWithPayroll.forEach((emp, idx) => {
      const p = payrolls.find(pr => pr.employee_id === emp.id)
      const total = hitungTotal(p)
      const periode = `${BULAN_NAMES[bulan-1]} ${tahun}`
      const tglMasuk = emp.tgl_masuk ? new Date(emp.tgl_masuk).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}) : '-'
      const namaOutlet = activeOutletData?.nama || 'Klinik'
      const tanggalBayar = tipe === 'gaji' ? `01 ${periode}` : `10 ${periode}`

      const rowGaji = (label, nilai, isPotongan=false) => nilai > 0 ? `
        <tr>
          <td style="padding:5px 8px;color:#374151;font-size:13px">${label}</td>
          <td style="padding:5px 8px;text-align:right;font-size:13px;${isPotongan?'color:#dc2626':'color:#374151'}">
            ${isPotongan?'- ':''}Rp ${FMT(nilai)}
          </td>
        </tr>` : ''

      allHTML += `
      <div class="slip${idx < empsWithPayroll.length-1 ? ' page-break' : ''}">
        <div style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:20px;color:white">
          <div style="display:flex;justify-content:space-between">
            <div><div style="font-size:18px;font-weight:700">${namaOutlet}</div>
            <div style="font-size:11px;opacity:0.85">Slip ${tipe==='gaji'?'Gaji Bulanan':'Jasa Pelayanan'}</div></div>
            <div style="text-align:right"><div style="font-size:11px;opacity:0.85">Periode</div>
            <div style="font-size:15px;font-weight:600">${periode}</div>
            <div style="font-size:11px;opacity:0.75">Tgl Bayar: ${tanggalBayar}</div></div>
          </div>
        </div>
        <div style="padding:14px 20px;background:#f8fafc;border-bottom:1px solid #e5e7eb">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div><div style="font-size:10px;color:#6b7280">NAMA</div><div style="font-size:14px;font-weight:600">${emp.nama}</div></div>
            <div><div style="font-size:10px;color:#6b7280">NIK</div><div style="font-size:13px;font-family:monospace">${emp.nik||'-'}</div></div>
            <div><div style="font-size:10px;color:#6b7280">JABATAN</div><div style="font-size:13px">${emp.jabatan}</div></div>
            <div><div style="font-size:10px;color:#6b7280">DEPARTEMEN</div><div style="font-size:13px">${emp.departemen}</div></div>
          </div>
        </div>
        <div style="padding:0 20px">
          <table style="width:100%;border-collapse:collapse;margin:10px 0">
            <tbody>
              ${tipe==='gaji'?`
              <tr style="background:#f0f9ff"><td colspan="2" style="padding:5px 8px;font-weight:600;font-size:11px;color:#1e40af;text-transform:uppercase">Penghasilan</td></tr>
              ${rowGaji('Gaji Pokok',p.gaji_pokok)}
              ${rowGaji('SIP',p.sip)}
              ${rowGaji('Tj. Makan',p.tunjangan_makan)}
              ${rowGaji('Tj. Transport',p.tunjangan_transport)}
              ${rowGaji('Tj. Telephone',p.tunjangan_telephone)}
              ${rowGaji('Tj. Jabatan PJ',p.tunjangan_jabatan_pj)}
              ${rowGaji('Tj. Jabatan Lain',p.tunjangan_jabatan_lain)}
              ${rowGaji('Lembur',p.lembur)}
              <tr style="background:#fff5f5"><td colspan="2" style="padding:5px 8px;font-weight:600;font-size:11px;color:#dc2626;text-transform:uppercase">Potongan</td></tr>
              ${rowGaji('BPJS',p.potongan_bpjs,true)}
              ${rowGaji('Cicilan',p.potongan_cicilan,true)}
              ${rowGaji('Kasbon',p.potongan_kasbon,true)}
              ${rowGaji('Pot. Absensi',p.potongan_absensi,true)}
              ${rowGaji('Arisan',p.potongan_arisan,true)}
              ${rowGaji('Lainnya',p.potongan_lainnya,true)}`:`
              <tr style="background:#f0f9ff"><td colspan="2" style="padding:5px 8px;font-weight:600;font-size:11px;color:#1e40af;text-transform:uppercase">Jasa Pelayanan</td></tr>
              ${rowGaji('Jasa Pelayanan',p.jasa_pelayanan)}
              ${rowGaji('Bonus Outlet',p.bonus_outlet)}
              ${rowGaji('Potongan',p.potongan_lainnya,true)}`}
            </tbody>
          </table>
        </div>
        <div style="margin:0 20px 16px;background:linear-gradient(135deg,#065f46,#059669);border-radius:8px;padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="color:rgba(255,255,255,0.8);font-size:11px">Total Bersih</div>
              <div style="color:white;font-size:20px;font-weight:700">Rp ${FMT(total)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.2);border-radius:20px;padding:3px 10px">
              <span style="color:white;font-size:11px;font-weight:600">${(p.status||'draft').toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>`
    })

    allHTML += '</body></html>'
    const win = window.open('', '_blank', 'width=700,height=900')
    win.document.write(allHTML)
    win.document.close()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Slip Gaji</h1>
            <p className="text-sm text-gray-500 mt-1">{activeOutletData?.nama} · {BULAN_NAMES[bulan-1]} {tahun}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { if(bulan===1){setBulan(12);setTahun(t=>t-1)}else setBulan(b=>b-1) }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-100">←</button>
            <span className="font-medium text-gray-800 min-w-max">{BULAN_NAMES[bulan-1]} {tahun}</span>
            <button onClick={() => { if(bulan===12){setBulan(1);setTahun(t=>t+1)}else setBulan(b=>b+1) }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-100">→</button>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-3 mb-6 flex-wrap">
          {[['gaji','Gaji Bulanan (Tgl 1)'],['jasa','Jasa Pelayanan (Tgl 10)']].map(([val,label]) => (
            <button key={val} onClick={() => setTipe(val)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tipe===val?'bg-blue-600 text-white':'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
          <button onClick={cetakSemua}
            disabled={employees.filter(e => payrolls.find(p => p.employee_id === e.id)).length === 0}
            className="ml-auto border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium">
            🖨 Print Semua Slip
          </button>
        </div>

        {/* Tabel */}
        {loading ? (
          <div className="text-center py-10 text-gray-400">Memuat data...</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Nama','NIK','Jabatan','Total Gaji Bersih','Status','Aksi'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employees.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Tidak ada staff di outlet ini.</td></tr>
                  ) : employees.map(emp => {
                    const p = payrolls.find(pr => pr.employee_id === emp.id)
                    const total = hitungTotal(p)
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{emp.nama}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{emp.nik||'-'}</td>
                        <td className="px-4 py-3 text-gray-700 text-xs">{emp.jabatan}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {p ? `Rp ${FMT(total)}` : <span className="text-gray-400 text-xs italic">Belum ada payroll</span>}
                        </td>
                        <td className="px-4 py-3">
                          {p && <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            p.status==='lunas'?'bg-green-100 text-green-700':
                            p.status==='proses'?'bg-yellow-100 text-yellow-700':
                            'bg-gray-100 text-gray-600'}`}>
                            {p.status}
                          </span>}
                        </td>
                        <td className="px-4 py-3">
                          {p ? (
                            <button onClick={() => cetakSlip(emp)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
                              🖨 Cetak Slip
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}