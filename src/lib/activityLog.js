// lib/activityLog.js - Utility untuk mencatat history log aktivitas
import { supabase } from './supabase'

export async function logActivity({ aksi, modul, detail, user_nama, outlet_id = null }) {
  try {
    await supabase.from('activity_logs').insert({
      aksi,
      modul,
      detail,
      user_nama,
      outlet_id,
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('Log activity failed:', e.message)
  }
}