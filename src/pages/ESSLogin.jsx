import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ESSLogin({ onLogin }) {
  const [nik, setNik] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    if (!nik.trim() || !password.trim()) { setError('NIK dan password wajib diisi.'); return }
    setLoading(true); setError('')

    // Cari employee berdasarkan NIK (case-insensitive)
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id, nama, jabatan, departemen, nik, email, no_hp, status, user_id')
      .ilike('nik', nik.trim())
      .single()

    if (empErr || !emp) { setError('NIK tidak ditemukan.'); setLoading(false); return }
    if (emp.status !== 'aktif') { setError('Akun Anda tidak aktif. Hubungi HR.'); setLoading(false); return }

    // Login via Supabase Auth menggunakan email = NIK@klinik.internal
    const email = `${nik.trim().toLowerCase()}@klinik.internal`
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password })

    if (authErr) {
      if (authErr.message.includes('Invalid login')) setError('Password salah.')
      else setError('Login gagal: ' + authErr.message)
      setLoading(false); return
    }

    onLogin({ ...emp, session: data.session })
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-8 text-center">
          <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">🏥</span>
          </div>
          <h1 className="text-white font-bold text-xl">HR Klinik</h1>
          <p className="text-blue-200 text-sm mt-1">Employee Self Service</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="px-6 py-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="text-xs font-medium text-gray-600 block mb-1">NIK / ID Pegawai</label>
            <input type="text" placeholder="Contoh: KLN-001"
              value={nik} onChange={e => setNik(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="mb-5">
            <label className="text-xs font-medium text-gray-600 block mb-1">Password</label>
            <input type="password" placeholder="Password Anda"
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors">
            {loading ? 'Memproses...' : 'Masuk'}
          </button>

          <p className="text-center text-xs text-gray-400 mt-4">
            Lupa password? Hubungi HR untuk reset password.
          </p>
        </form>
      </div>
    </div>
  )
}