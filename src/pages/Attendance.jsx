import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useOutlet } from '../lib/OutletContext'

const STATUS_COLORS = {
  hadir: 'bg-green-100 text-green-700',
  izin: 'bg-blue-100 text-blue-700',
  sakit: 'bg-yellow-100 text-yellow-700',
  alpha: 'bg-red-100 text-red-600',
}

const RADIUS_METER = 1000

function hitungJarak(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function Attendance() {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const { outlets, activeOutlet } = useOutlet()

  const [mode, setMode] = useState('checkin')
  const [employees, setEmployees] = useState([])
  const [attendance, setAttendance] = useState([])
  const [todaySchedule, setTodaySchedule] = useState([])
  const [shifts, setShifts] = useState([])
  const [selectedEmp, setSelectedEmp] = useState('')
  const [selectedOutletCheckin, setSelectedOutletCheckin] = useState('')
  const [locating, setLocating] = useState(false)
  const [checkInDone, setCheckInDone] = useState(null)
  const [error, setError] = useState('')
  const [filterDate, setFilterDate] = useState(todayStr)
  const [jarakInfo, setJarakInfo] = useState(null)

  // Kamera
  const [showCamera, setShowCamera] = useState(false)
  const [captureType, setCaptureType] = useState(null) // 'checkin' | 'checkout'
  const [fotoPreview, setFotoPreview] = useState(null)
  const [fotoBlob, setFotoBlob] = useState(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  // GPS state (disimpan sementara sebelum foto)
  const [pendingGps, setPendingGps] = useState(null)

  const filterTahun = String(today.getFullYear())
  const [filterBulan] = useState(String(today.getMonth() + 1).padStart(2, '0'))
  const [rekapBulan, setRekapBulan] = useState(today.getMonth() + 1)
  const [rekapTahun, setRekapTahun] = useState(today.getFullYear())
  const [monthAttendance, setMonthAttendance] = useState([])
  const [rekapMode, setRekapMode] = useState('harian') // 'harian' | 'bulanan'
  const [filterMode, setFilterMode] = useState('harian') // 'harian' | 'minggu' | 'range'
  const [filterDateFrom, setFilterDateFrom] = useState(todayStr)
  const [filterDateTo, setFilterDateTo] = useState(todayStr)

  useEffect(() => { fetchEmployees() }, [])
  useEffect(() => { fetchTodaySchedule() }, [activeOutlet])
  useEffect(() => { fetchAttendance() }, [filterDate, filterDateFrom, filterDateTo, filterMode, activeOutlet])
  useEffect(() => {
    if (outlets.length > 0 && !selectedOutletCheckin) setSelectedOutletCheckin(outlets[0].id)
  }, [outlets])

  // Cleanup kamera saat unmount
  useEffect(() => {
    return () => { stopCamera() }
  }, [])

  async function fetchEmployees() {
    const { data } = await supabase.from('employees').select('id, nama, jabatan').eq('status', 'aktif').order('nama')
    setEmployees(data || [])
  }

  async function fetchTodaySchedule() {
    if (!activeOutlet) return
    const { data } = await supabase.from('schedules')
      .select('*, employees(id, nama, jabatan, default_shift)')
      .eq('tanggal', todayStr).eq('outlet_id', activeOutlet)
    setTodaySchedule(data || [])
    if (shifts.length === 0) {
      const { data: shiftData } = await supabase.from('shift_settings').select('*')
      if (shiftData) setShifts(shiftData)
    }
  }

  // Hitung keterlambatan & potongan berdasarkan shift
  function hitungKeterlambatan(shiftKode, waktuMasuk) {
    const shift = shifts.find(s => s.kode === shiftKode)
    if (!shift) return { menit: 0, potongan: 0, shift: shiftKode }
    const [jamH, jamM] = (shift.jam_mulai || '08:00').split(':').map(Number)
    const masuk = new Date(waktuMasuk)
    const batas = new Date(masuk)
    batas.setHours(jamH, jamM + (shift.toleransi_menit || 0), 0, 0)
    let menit = Math.round((masuk - batas) / 60000)
    if (menit <= 0) return { menit: 0, potongan: 0, shift: shiftKode }
    const interval = shift.interval_menit || 30
    const perInterval = shift.potongan_per_interval || 0
    const potongan = Math.ceil(menit / interval) * perInterval
    return { menit, potongan, shift: shiftKode }
  }

  async function fetchAttendance() {
    if (!activeOutlet) return
    const { data } = await supabase.from('attendance')
      .select('*, employees(id, nama, jabatan), outlets(nama)')
      .eq('tanggal', filterDate).eq('outlet_id', activeOutlet)
      .order('waktu_masuk', { ascending: false })
    setAttendance(data || [])
  }

  async function fetchMonthAttendance() {
    if (!activeOutlet) return
    const lastDay = new Date(parseInt(filterTahun), parseInt(filterBulan), 0).getDate()
    const { data } = await supabase.from('attendance')
      .select('*, employees(id, nama, jabatan), outlets(nama)')
      .gte('tanggal', `${filterTahun}-${filterBulan}-01`)
      .lte('tanggal', `${filterTahun}-${filterBulan}-${lastDay}`)
      .eq('outlet_id', activeOutlet)
      .order('tanggal', { ascending: false })
    setAttendance(data || [])
  }

  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('GPS tidak didukung browser ini')); return }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => {
          navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            err2 => {
              if (err2.code === 1) reject(new Error('Izin lokasi ditolak. Buka pengaturan browser dan izinkan akses lokasi.'))
              else if (err2.code === 2) reject(new Error('Lokasi tidak tersedia. Pastikan GPS aktif.'))
              else reject(new Error('Gagal ambil lokasi (code: ' + err2.code + '). Coba lagi.'))
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
          )
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      )
    })
  }

  // ─── KAMERA ────────────────────────────────────────────────

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setCameraReady(true)
        }
      }
    } catch (e) {
      setError('Kamera tidak dapat diakses: ' + e.message)
      setShowCamera(false)
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraReady(false)
  }

  function ambilFoto() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    // Mirror effect (selfie)
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      setFotoBlob(blob)
      setFotoPreview(canvas.toDataURL('image/jpeg', 0.8))
    }, 'image/jpeg', 0.8)
    stopCamera()
    setShowCamera(false)
  }

  function ulangFoto() {
    setFotoBlob(null)
    setFotoPreview(null)
    setShowCamera(true)
    setTimeout(() => startCamera(), 100)
  }

  async function uploadFoto(empId, type) {
    if (!fotoBlob) return null
    const fileName = `${empId}_${type}_${todayStr}_${Date.now()}.jpg`
    console.log('Uploading foto:', fileName, fotoBlob.size, 'bytes')
    const { data, error } = await supabase.storage
      .from('attendance-photos')
      .upload(fileName, fotoBlob, { contentType: 'image/jpeg', upsert: true })
    if (error) {
      console.error('Upload error:', error)
      setError('Foto gagal upload: ' + error.message)
      return null
    }
    console.log('Upload success:', data)
    const { data: urlData } = supabase.storage
      .from('attendance-photos').getPublicUrl(fileName)
    console.log('Public URL:', urlData.publicUrl)
    return urlData.publicUrl
  }

  // ─── CHECK-IN / CHECK-OUT ──────────────────────────────────

  async function mulaiAbsen() {
    if (!selectedEmp) { setError('Pilih nama Anda terlebih dahulu.'); return }
    if (!selectedOutletCheckin) { setError('Pilih outlet tempat Anda bertugas.'); return }

    const outletData = outlets.find(o => o.id === selectedOutletCheckin)
    if (!outletData?.lat || !outletData?.lng) { setError('Koordinat outlet belum diatur. Hubungi admin.'); return }

    setError(''); setJarakInfo(null); setLocating(true)
    try {
      const { lat, lng } = await getLocation()
      const jarak = hitungJarak(lat, lng, parseFloat(outletData.lat), parseFloat(outletData.lng))
      const jarakBulat = Math.round(jarak)
      setJarakInfo({ jarak: jarakBulat, outlet: outletData.nama })

      if (jarak > RADIUS_METER) {
        setError(`Anda berada ${jarakBulat}m dari ${outletData.nama}. Maksimal ${RADIUS_METER}m untuk absen.`)
        setLocating(false); return
      }

      // Simpan GPS sementara, lalu buka kamera
      setPendingGps({ lat, lng, jarak: jarakBulat, outletData })

      // Cek tipe absen (checkin atau checkout)
      const { data: existing } = await supabase.from('attendance')
        .select('id, waktu_masuk, waktu_keluar')
        .eq('employee_id', selectedEmp).eq('tanggal', todayStr)
        .eq('outlet_id', selectedOutletCheckin).single()

      if (existing?.waktu_keluar) {
        setError('Anda sudah check-in dan check-out di outlet ini hari ini.')
        setLocating(false); return
      }

      setCaptureType(existing ? 'checkout' : 'checkin')
      setFotoBlob(null); setFotoPreview(null)
      setShowCamera(true)
      setTimeout(() => startCamera(), 100)
    } catch (e) {
      setError(e.message)
    }
    setLocating(false)
  }

  async function prosesAbsen() {
    if (!pendingGps) return
    setUploadingFoto(true)
    const { lat, lng, jarak, outletData } = pendingGps

    try {
      const fotoUrl = await uploadFoto(selectedEmp, captureType)

      const { data: existing } = await supabase.from('attendance')
        .select('id, waktu_masuk, waktu_keluar')
        .eq('employee_id', selectedEmp).eq('tanggal', todayStr)
        .eq('outlet_id', selectedOutletCheckin).single()

      if (captureType === 'checkout' && existing) {
        const { error: err } = await supabase.from('attendance').update({
          waktu_keluar: new Date().toISOString(),
          lat_keluar: lat, lng_keluar: lng,
          foto_keluar: fotoUrl,
        }).eq('id', existing.id)
        if (err) throw new Error(err.message)
      } else {
        // Tentukan shift staff hari ini (dari jadwal, fallback default staff)
        const sched = todaySchedule.find(s => s.employee_id === selectedEmp)
        const shiftKode = sched?.shift || sched?.employees?.default_shift || 'full'
        const now = new Date()
        const late = hitungKeterlambatan(shiftKode, now.toISOString())
        // Warning kalau absen jauh di luar jam shift (>3 jam sebelum mulai)
        const shiftDef = shifts.find(s => s.kode === shiftKode)
        if (shiftDef) {
          const [jamH, jamM] = (shiftDef.jam_mulai||'08:00').split(':').map(Number)
          const mulai = new Date(now); mulai.setHours(jamH, jamM, 0, 0)
          const selisihJam = (now - mulai) / 3600000
          if (selisihJam < -3 && !shiftDef.lintas_hari) {
            const jamSebelum = Math.abs(Math.round(selisihJam))
            if (!confirm('Anda absen ' + jamSebelum + ' jam sebelum shift ' + shiftDef.nama + ' (' + shiftDef.jam_mulai + ') dimulai. Lanjutkan absen?')) {
              setUploadingFoto(false); return
            }
          }
        }
        const { error: err } = await supabase.from('attendance').insert({
          employee_id: selectedEmp,
          outlet_id: selectedOutletCheckin,
          tanggal: todayStr,
          waktu_masuk: now.toISOString(),
          lat_masuk: lat, lng_masuk: lng,
          foto_masuk: fotoUrl,
          status: 'hadir',
          shift: shiftKode,
          menit_terlambat: late.menit,
          potongan_terlambat: late.potongan,
        })
        if (err) throw new Error(err.message)
      }

      setCheckInDone({ type: captureType, lat, lng, jarak, outlet: outletData.nama, foto: fotoUrl })
      setFotoBlob(null); setFotoPreview(null); setPendingGps(null)
      fetchAttendance(); fetchTodaySchedule()
    } catch (e) {
      setError(e.message)
    }
    setUploadingFoto(false)
  }

  async function updateStatus(id, status) {
    await supabase.from('attendance').update({ status }).eq('id', id)
    fetchAttendance()
  }

  async function fetchRekapBulanan() {
    const from = `${rekapTahun}-${String(rekapBulan).padStart(2,'0')}-01`
    const lastDay = new Date(rekapTahun, rekapBulan, 0).getDate()
    const to = `${rekapTahun}-${String(rekapBulan).padStart(2,'0')}-${lastDay}`
    const { data } = await supabase.from('attendance')
      .select('employee_id, status, tanggal, waktu_masuk, employees(id, nama, jabatan)')
      .eq('outlet_id', activeOutlet)
      .gte('tanggal', from).lte('tanggal', to)
    setMonthAttendance(data || [])
  }

  async function tandaiAlpha() {
    const sudahAbsen = attendance.map(a => a.employee_id)
    const belumAbsen = todaySchedule.filter(s => !sudahAbsen.includes(s.employee_id))
    if (belumAbsen.length === 0) { setError('Semua staff terjadwal sudah absen.'); return }
    await supabase.from('attendance').insert(
      belumAbsen.map(s => ({ employee_id: s.employee_id, outlet_id: activeOutlet, tanggal: todayStr, status: 'alpha' }))
    )
    fetchAttendance()
  }

  function formatWaktu(iso) {
    if (!iso) return '-'
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }

  function formatTanggal(str) {
    if (!str) return '-'
    return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const todayRecord = attendance.find(a => a.employee_id === selectedEmp && a.outlet_id === selectedOutletCheckin)
  const activeOutletNama = outlets.find(o => o.id === activeOutlet)?.nama || ''

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Absensi</h1>
          <p className="text-sm text-gray-500 mt-1">{formatTanggal(todayStr)} · {activeOutletNama}</p>
        </div>

        <div className="flex gap-2 mb-6">
          {[['checkin','Check-in / Check-out'],['rekap','Rekap Absensi']].map(([val, label]) => (
            <button key={val} onClick={() => { setMode(val); setError('') }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode===val ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ─── CHECK-IN MODE ─── */}
        {mode === 'checkin' && (
          <div className="space-y-4">

            {/* Jadwal piket hari ini */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Jadwal piket hari ini · {activeOutletNama}</p>
              {todaySchedule.length === 0
                ? <p className="text-sm text-gray-400">Belum ada jadwal untuk hari ini.</p>
                : <div className="flex flex-wrap gap-2">
                  {todaySchedule.map(s => {
                    const sudahAbsen = attendance.find(a => a.employee_id === s.employee_id)
                    return (
                      <div key={s.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs ${sudahAbsen ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                        {sudahAbsen ? '✓' : '○'} {s.employees?.nama}
                      </div>
                    )
                  })}
                </div>
              }
            </div>

            {/* Form absen */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-medium text-gray-700 mb-4">Form Absensi</p>

              <div className="mb-3">
                <label className="text-xs font-medium text-gray-600 block mb-1">Saya bertugas di:</label>
                <select value={selectedOutletCheckin}
                  onChange={e => { setSelectedOutletCheckin(e.target.value); setCheckInDone(null); setError(''); setJarakInfo(null) }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Pilih outlet --</option>
                  {outlets.map(o => <option key={o.id} value={o.id}>{o.nama}</option>)}
                </select>
              </div>

              <div className="mb-4">
                <label className="text-xs font-medium text-gray-600 block mb-1">Nama saya:</label>
                <select value={selectedEmp}
                  onChange={e => { setSelectedEmp(e.target.value); setCheckInDone(null); setError(''); setJarakInfo(null) }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Pilih nama --</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.nama} — {e.jabatan}</option>)}
                </select>
              </div>

              {selectedOutletCheckin && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4 text-xs text-gray-500">
                  📍 Absensi hanya bisa dalam radius <strong>{RADIUS_METER}m</strong> dari <strong>{outlets.find(o => o.id === selectedOutletCheckin)?.nama}</strong>
                  <br/>📷 Foto wajib diambil saat absen
                </div>
              )}

              {selectedEmp && selectedOutletCheckin && (
                <div className={`rounded-lg px-4 py-3 mb-4 text-sm ${!todayRecord ? 'bg-blue-50 border border-blue-200 text-blue-700' : !todayRecord.waktu_keluar ? 'bg-yellow-50 border border-yellow-200 text-yellow-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
                  {!todayRecord && 'Belum check-in hari ini.'}
                  {todayRecord && !todayRecord.waktu_keluar && `Check-in pukul ${formatWaktu(todayRecord.waktu_masuk)}. Belum check-out.`}
                  {todayRecord?.waktu_keluar && `Selesai. Check-in ${formatWaktu(todayRecord.waktu_masuk)} — Check-out ${formatWaktu(todayRecord.waktu_keluar)}`}
                </div>
              )}

              {jarakInfo && (
                <div className={`rounded-lg px-4 py-3 mb-4 text-sm flex items-center gap-2 ${jarakInfo.jarak <= RADIUS_METER ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {jarakInfo.jarak <= RADIUS_METER ? '✓' : '✗'} Jarak dari {jarakInfo.outlet}: <strong>{jarakInfo.jarak}m</strong>
                  {jarakInfo.jarak <= RADIUS_METER ? ' — dalam zona absensi' : ` — terlalu jauh`}
                </div>
              )}

              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}

              {/* Preview foto yang sudah diambil */}
              {fotoPreview && !showCamera && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-600 mb-2">Foto {captureType === 'checkin' ? 'Check-in' : 'Check-out'}:</p>
                  <div className="relative inline-block">
                    <img src={fotoPreview} alt="Foto absen" className="w-40 h-32 object-cover rounded-lg border border-gray-200" />
                    <button onClick={ulangFoto}
                      className="absolute top-1 right-1 bg-black bg-opacity-50 text-white text-xs px-2 py-0.5 rounded">
                      Ulangi
                    </button>
                  </div>
                  <button onClick={prosesAbsen} disabled={uploadingFoto}
                    className="mt-3 w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-medium transition-colors block">
                    {uploadingFoto ? 'Menyimpan...' : `✓ Konfirmasi ${captureType === 'checkin' ? 'Check-in' : 'Check-out'}`}
                  </button>
                </div>
              )}

              {checkInDone && (
                <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">
                  {checkInDone.type === 'checkin' ? '✓ Check-in berhasil!' : '✓ Check-out berhasil!'}
                  <br/><span className="text-xs text-green-600">{checkInDone.outlet} · Jarak: {checkInDone.jarak}m</span>
                  {checkInDone.foto && (
                    <div className="mt-2">
                      <img src={checkInDone.foto} alt="Foto absen" className="w-24 h-20 object-cover rounded-lg border border-green-200" />
                    </div>
                  )}
                </div>
              )}

              {!fotoPreview && !showCamera && (
                <button onClick={mulaiAbsen}
                  disabled={locating || !selectedEmp || !selectedOutletCheckin || !!todayRecord?.waktu_keluar}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                  {locating ? '📍 Mengambil lokasi GPS...' :
                    !todayRecord ? '📍 Check-in Sekarang' :
                    !todayRecord.waktu_keluar ? '📍 Check-out Sekarang' :
                    'Sudah selesai hari ini'}
                </button>
              )}
              <p className="text-xs text-gray-400 text-center mt-2">Pastikan GPS dan kamera aktif di browser Anda</p>
            </div>

            {todaySchedule.length > 0 && (
              <button onClick={tandaiAlpha}
                className="w-full border border-red-200 text-red-600 hover:bg-red-50 py-2 rounded-lg text-sm transition-colors">
                Tandai Alpha — Staff Terjadwal yang Belum Absen
              </button>
            )}
          </div>
        )}

        {/* ─── REKAP MODE ─── */}
        {mode === 'rekap' && (
          <div>
            {/* Sub-mode tabs */}
            <div className="flex gap-2 mb-4">
              {[['harian','Per Tanggal'],['bulanan','Rekap Bulanan']].map(([val,label]) => (
                <button key={val} onClick={() => setRekapMode(val)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${rekapMode===val?'bg-blue-600 text-white':'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>

            {rekapMode === 'harian' && (
            <div className="space-y-3 mb-4">
              {/* Filter mode selector */}
              <div className="flex gap-2 flex-wrap">
                {[['harian','Per Hari'],['minggu','Per Minggu'],['range','Range Custom']].map(([val,label]) => (
                  <button key={val} onClick={() => setFilterMode(val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterMode===val?'bg-blue-600 text-white border-blue-600':'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {/* Filter input */}
              <div className="flex flex-wrap items-center gap-2">
                {filterMode === 'harian' && (
                  <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                )}
                {filterMode === 'minggu' && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600">Pilih tanggal dalam minggu:</label>
                    <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
                {filterMode === 'range' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <span className="text-gray-500 text-sm">s/d</span>
                    <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
                <button onClick={fetchMonthAttendance}
                  className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                  Lihat Bulan Ini
                </button>
              </div>
            </div>
            )}

            {rekapMode === 'bulanan' && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-4">
                <select value={rekapBulan} onChange={e => setRekapBulan(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'].map((b,i) => (
                    <option key={i+1} value={i+1}>{b}</option>
                  ))}
                </select>
                <select value={rekapTahun} onChange={e => setRekapTahun(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={fetchRekapBulanan}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  Tampilkan
                </button>
              </div>

              {monthAttendance.length > 0 && (() => {
                // Hitung rekap per staff
                const empMap = {}
                monthAttendance.forEach(a => {
                  const id = a.employee_id
                  if (!empMap[id]) empMap[id] = { nama: a.employees?.nama, jabatan: a.employees?.jabatan, hadir: 0, izin: 0, sakit: 0, alpha: 0, terlambat: 0 }
                  if (a.status === 'hadir') empMap[id].hadir++
                  else if (a.status === 'izin') empMap[id].izin++
                  else if (a.status === 'sakit') empMap[id].sakit++
                  else if (a.status === 'alpha') empMap[id].alpha++
                })
                const rekap = Object.values(empMap).sort((a,b) => b.hadir - a.hadir)
                const totalHari = new Date(rekapTahun, rekapBulan, 0).getDate()

                return (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                      <p className="text-sm font-medium text-gray-700">
                        Rekap Kehadiran · {['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][rekapBulan-1]} {rekapTahun}
                      </p>
                      <p className="text-xs text-gray-400">{rekap.length} staff · {totalHari} hari</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            {['Nama','Jabatan','Hadir','Izin','Sakit','Alpha','% Hadir','Status'].map(h => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {rekap.map((r, i) => {
                            const total = r.hadir + r.izin + r.sakit + r.alpha
                            const pct = total > 0 ? Math.round(r.hadir / total * 100) : 0
                            return (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.nama}</td>
                                <td className="px-4 py-3 text-gray-500 text-xs">{r.jabatan}</td>
                                <td className="px-4 py-3 text-green-600 font-medium">{r.hadir}</td>
                                <td className="px-4 py-3 text-blue-600">{r.izin}</td>
                                <td className="px-4 py-3 text-yellow-600">{r.sakit}</td>
                                <td className="px-4 py-3 text-red-500">{r.alpha}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 bg-gray-100 rounded-full h-1.5">
                                      <div className={`h-1.5 rounded-full ${pct>=80?'bg-green-500':pct>=60?'bg-yellow-500':'bg-red-500'}`}
                                        style={{width:`${pct}%`}} />
                                    </div>
                                    <span className={`text-xs font-medium ${pct>=80?'text-green-600':pct>=60?'text-yellow-600':'text-red-500'}`}>{pct}%</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${pct>=80?'bg-green-100 text-green-700':pct>=60?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-600'}`}>
                                    {pct>=80?'Baik':pct>=60?'Perhatian':'Rendah'}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}

              {monthAttendance.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
                  Klik Tampilkan untuk melihat rekap bulanan.
                </div>
              )}
            </div>
            )}

            {rekapMode === 'harian' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Nama','Tgl','Masuk','Foto Masuk','Keluar','Foto Keluar','Status',''].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {attendance.length === 0
                      ? <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Belum ada data absensi.</td></tr>
                      : attendance.map(a => {
                        const outletAbsen = outlets.find(o => o.id === a.outlet_id)
                        const jarakMasuk = a.lat_masuk && outletAbsen?.lat
                          ? Math.round(hitungJarak(a.lat_masuk, a.lng_masuk, parseFloat(outletAbsen.lat), parseFloat(outletAbsen.lng)))
                          : null
                        return (
                          <tr key={a.id} className="hover:bg-gray-50">
                            <td className="px-3 py-3 font-medium text-gray-900">{a.employees?.nama}</td>
                            <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">{formatTanggal(a.tanggal)}</td>
                            <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                              {formatWaktu(a.waktu_masuk)}
                              {jarakMasuk != null && (
                                <span className={`ml-1 text-xs ${jarakMasuk <= RADIUS_METER ? 'text-green-500' : 'text-red-500'}`}>
                                  {jarakMasuk}m
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              {a.foto_masuk
                                ? <a href={a.foto_masuk} target="_blank" rel="noreferrer">
                                    <img src={a.foto_masuk} alt="Foto masuk" className="w-10 h-10 object-cover rounded-lg border border-gray-200 hover:opacity-80" />
                                  </a>
                                : <span className="text-xs text-gray-300">—</span>
                              }
                            </td>
                            <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{formatWaktu(a.waktu_keluar)}</td>
                            <td className="px-3 py-3">
                              {a.foto_keluar
                                ? <a href={a.foto_keluar} target="_blank" rel="noreferrer">
                                    <img src={a.foto_keluar} alt="Foto keluar" className="w-10 h-10 object-cover rounded-lg border border-gray-200 hover:opacity-80" />
                                  </a>
                                : <span className="text-xs text-gray-300">—</span>
                              }
                            </td>
                            <td className="px-3 py-3">
                              <select value={a.status} onChange={e => updateStatus(a.id, e.target.value)}
                                className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${STATUS_COLORS[a.status] || 'bg-gray-100 text-gray-600'}`}>
                                <option value="hadir">Hadir</option>
                                <option value="izin">Izin</option>
                                <option value="sakit">Sakit</option>
                                <option value="alpha">Alpha</option>
                              </select>
                            </td>
                            <td className="px-3 py-3">
                              {a.lat_masuk && (
                                <a href={`https://maps.google.com/?q=${a.lat_masuk},${a.lng_masuk}`}
                                  target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">Map</a>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      {/* ─── MODAL KAMERA ─── */}
      {showCamera && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-50 p-4">
          <p className="text-white text-sm font-medium mb-3">
            📷 Ambil foto {captureType === 'checkin' ? 'Check-in' : 'Check-out'}
          </p>
          <div className="relative rounded-xl overflow-hidden bg-black" style={{ width: '100%', maxWidth: '400px' }}>
            <video ref={videoRef} autoPlay playsInline muted
              className="w-full rounded-xl"
              style={{ transform: 'scaleX(-1)' }} />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-white text-sm">Memuat kamera...</p>
              </div>
            )}
            {/* Guide overlay */}
            <div className="absolute inset-0 border-4 border-transparent pointer-events-none">
              <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg"></div>
              <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg"></div>
              <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg"></div>
              <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg"></div>
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <p className="text-gray-400 text-xs mt-3 mb-4">Posisikan wajah Anda di dalam bingkai</p>
          <div className="flex gap-3">
            <button onClick={() => { stopCamera(); setShowCamera(false); setPendingGps(null) }}
              className="border border-gray-500 text-gray-300 px-5 py-2.5 rounded-xl text-sm">
              Batal
            </button>
            <button onClick={ambilFoto} disabled={!cameraReady}
              className="bg-white disabled:opacity-40 text-gray-900 px-8 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
              <span className="text-xl">⊙</span> Ambil Foto
            </button>
          </div>
        </div>
      )}
    </div>
  )
}