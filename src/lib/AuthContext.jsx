import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export const LEVEL_LABELS = {
  direktur: 'Direktur',
  manager: 'Manager',
  pj_klinik: 'Penanggung Jawab Klinik',
  staff: 'Staff',
}

export const LEVEL_COLORS = {
  direktur: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  pj_klinik: 'bg-green-100 text-green-700',
  staff: 'bg-gray-100 text-gray-600',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       // Supabase auth user
  const [employee, setEmployee] = useState(null) // Employee data
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Cek session aktif
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) fetchEmployee(data.session)
      else setLoading(false)
    })

    // Listen perubahan auth
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) fetchEmployee(session)
      else { setUser(null); setEmployee(null); setLoading(false) }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchEmployee(session) {
    setUser(session.user)
    const email = session.user.email
    const nik = email.replace('@klinik.internal', '')

    const { data } = await supabase
      .from('employees')
      .select('id, nama, jabatan, departemen, nik, email, no_hp, status, user_id, level_akses, tgl_masuk, gaji_pokok')
      .ilike('nik', nik)
      .single()

    setEmployee(data || null)
    setLoading(false)
  }

  async function login(nik, password) {
    const email = `${nik.trim().toLowerCase()}@klinik.internal`
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.includes('Invalid login credentials')) throw new Error('NIK atau password salah.')
      throw new Error(error.message)
    }
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setEmployee(null)
  }

  // Level checks
  const isStaff = employee?.level_akses === 'staff'
  const isPJ = employee?.level_akses === 'pj_klinik'
  const isManager = employee?.level_akses === 'manager'
  const isDirektur = employee?.level_akses === 'direktur'
  const isFullAccess = isDirektur || isManager
  const hasHRAccess = isDirektur || isManager || isPJ

  return (
    <AuthContext.Provider value={{
      user, employee, loading,
      login, logout,
      isStaff, isPJ, isManager, isDirektur,
      isFullAccess, hasHRAccess,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}