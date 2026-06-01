import { useState, useRef, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { OutletProvider, useOutlet } from './lib/OutletContext'
import { AuthProvider, useAuth, LEVEL_LABELS, LEVEL_COLORS } from './lib/AuthContext'
import LoginPage from './pages/LoginPage'
import Employees from './pages/Employees'
import Scheduling from './pages/Scheduling'
import Attendance from './pages/Attendance'
import Payroll from './pages/Payroll'
import SlipGaji from './pages/SlipGaji'
import LoanManagement from './pages/LoanManagement'
import Performance from './pages/Performance'
import Dashboard from './pages/Dashboard'
import ESS from './pages/ESS'
import ESSAdmin from './pages/ESSAdmin'
import CompanySettings from './pages/CompanySettings'
import HRAnalytics from './pages/HRAnalytics'
import KPIOKR from './pages/KPIOKR'
import ActivityLog from './pages/ActivityLog'
import EmployeeDocuments from './pages/EmployeeDocuments'


// ─── NOTIFIKASI BADGE ────────────────────────────────────────────────────────

function useNotifications(activeOutlet) {
  const [counts, setCounts] = useState({ jadwal: 0, cuti: 0, pinjaman: 0, total: 0 })

  const fetch = useCallback(async () => {
    if (!activeOutlet) return
    const in30days = new Date()
    in30days.setDate(in30days.getDate() + 30)
    const in30str = in30days.toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]

    const [jadwalRes, cutiRes, pinjamanRes, docRes] = await Promise.all([
      supabase.from('schedule_requests').select('id', { count: 'exact', head: true })
        .eq('outlet_id', activeOutlet).eq('status', 'pending'),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase.from('loans').select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase.from('employee_documents').select('id', { count: 'exact', head: true })
        .not('expired_at', 'is', null).lte('expired_at', in30str),
    ])
    const jadwal = jadwalRes.count || 0
    const cuti = cutiRes.count || 0
    const pinjaman = pinjamanRes.count || 0
    const dokumenExpired = docRes.count || 0
    setCounts({ jadwal, cuti, pinjaman, dokumenExpired, total: jadwal + cuti + pinjaman })
  }, [activeOutlet])

  useEffect(() => {
    fetch()
    const interval = setInterval(fetch, 60000) // refresh tiap 1 menit
    return () => clearInterval(interval)
  }, [fetch])

  return counts
}

function Badge({ count }) {
  if (!count) return null
  return (
    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center leading-none font-bold">
      {count > 9 ? '9+' : count}
    </span>
  )
}

// ─── MENU STRUKTUR ────────────────────────────────────────────────────────────

const MENU_FULL = [
  { to: '/', label: 'Dashboard' },
  {
    label: 'Kepegawaian', group: true,
    children: [
      { to: '/employees', label: 'Pegawai' },
      { to: '/scheduling', label: 'Jadwal Piket' },
      { to: '/attendance', label: 'Absensi' },
      { to: '/documents', label: 'Dokumen Staff' },
    ]
  },
  {
    label: 'Staff Payroll', group: true,
    children: [
      { to: '/payroll', label: 'Payroll' },
      { to: '/slip-gaji', label: 'Slip Gaji' },
      { to: '/loans', label: 'Cicilan & Kasbon' },
    ]
  },
  {
    label: 'Performance', group: true,
    children: [
      { to: '/performance', label: 'Penilaian Staff' },
      { to: '/kpi-okr', label: 'KPI & OKR HRD' },
      { to: '/analytics', label: 'HR Analytics' },
      { to: '/activity-log', label: 'History Log' },
    ]
  },
  {
    label: 'Pengaturan', group: true,
    children: [
      { to: '/ess-admin', label: 'ESS Admin' },
      { to: '/settings', label: 'Pengaturan Sistem' },
    ]
  },
  { to: '/ess', label: '👤 ESS Saya', ess: true },
]

const MENU_PJ = [
  { to: '/', label: 'Dashboard' },
  {
    label: 'Kepegawaian', group: true,
    children: [
      { to: '/employees', label: 'Pegawai' },
      { to: '/scheduling', label: 'Jadwal Piket' },
      { to: '/attendance', label: 'Absensi' },
      { to: '/documents', label: 'Dokumen Staff' },
    ]
  },
  {
    label: 'Performance', group: true,
    children: [
      { to: '/performance', label: 'Penilaian Staff' },
      { to: '/kpi-okr', label: 'KPI & OKR HRD' },
    ]
  },
  { to: '/ess', label: '👤 ESS Saya', ess: true },
]

// ─── DROPDOWN MENU ────────────────────────────────────────────────────────────

function DropdownMenu({ item, loc, notif = {} }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const isActive = item.children?.some(c => c.to === loc.pathname)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 text-xs transition-colors whitespace-nowrap ${
          isActive ? 'text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-800'
        }`}>
        {item.label}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50 min-w-36">
          {item.children.map(child => {
            const childNotif =
              child.to === '/ess-admin' ? notif.total :
              child.to === '/scheduling' ? notif.jadwal :
              child.to === '/documents' ? notif.dokumenExpired : 0
            return (
              <Link key={child.to} to={child.to}
                onClick={() => setOpen(false)}
                className={`relative flex items-center justify-between px-4 py-2 text-xs transition-colors ${
                  loc.pathname === child.to
                    ? 'text-blue-600 font-medium bg-blue-50'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}>
                <span>{child.label}</span>
                {childNotif > 0 && (
                  <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold ml-2 leading-none">
                    {childNotif > 9 ? '9+' : childNotif}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────

function Navbar() {
  const loc = useLocation()
  const { outlets, activeOutlet, setActiveOutlet } = useOutlet()
  const { employee, logout, isPJ } = useAuth()
  const menus = isPJ ? MENU_PJ : MENU_FULL
  const notif = useNotifications(activeOutlet)

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-wrap">
      <span className="font-semibold text-blue-600 text-sm whitespace-nowrap">HR Klinik</span>

      {/* Outlet Selector */}
      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
        <span className="text-xs text-blue-500 font-medium whitespace-nowrap">Outlet:</span>
        <select value={activeOutlet} onChange={e => setActiveOutlet(e.target.value)}
          className="text-sm font-medium text-blue-700 bg-transparent border-0 focus:outline-none cursor-pointer">
          {outlets.map(o => <option key={o.id} value={o.id}>{o.nama}</option>)}
        </select>
      </div>

      {/* Nav Links */}
      <div className="flex items-center gap-3 flex-wrap flex-1">
        {menus.map((item, idx) =>
          item.group ? (
            <DropdownMenu key={idx} item={item} loc={loc} notif={notif} />
          ) : (
            <Link key={item.to} to={item.to}
              className={`relative text-xs transition-colors whitespace-nowrap ${
                loc.pathname === item.to
                  ? item.ess ? 'text-green-600 font-medium' : 'text-blue-600 font-medium'
                  : item.ess ? 'text-green-600 hover:text-green-800 font-medium'
                  : 'text-gray-500 hover:text-gray-800'
              }`}>
              {item.label}
              {item.to === '/ess-admin' && <Badge count={notif.total} />}
            </Link>
          )
        )}
      </div>

      {/* User info + logout */}
      <div className="flex items-center gap-2 ml-auto">
        <div className="text-right">
          <p className="text-xs font-medium text-gray-700">{employee?.nama}</p>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${LEVEL_COLORS[employee?.level_akses] || 'bg-gray-100 text-gray-500'}`}>
            {LEVEL_LABELS[employee?.level_akses] || 'Staff'}
          </span>
        </div>
        <button onClick={logout}
          className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
          Keluar
        </button>
      </div>
    </nav>
  )
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────

function AppRouter() {
  const { employee, loading, isStaff, isPJ } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    </div>
  )

  if (!employee) return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )

  if (isStaff) return (
    <Routes>
      <Route path="/ess" element={<ESS />} />
      <Route path="*" element={<Navigate to="/ess" replace />} />
    </Routes>
  )

  if (isPJ) return (
    <OutletProvider>
      <Navbar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/scheduling" element={<Scheduling />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/analytics" element={<HRAnalytics />} />
        <Route path="/kpi-okr" element={<KPIOKR />} />
        <Route path="/documents" element={<EmployeeDocuments />} />
        <Route path="/activity-log" element={<ActivityLog />} />
        <Route path="/settings" element={<CompanySettings />} />
        <Route path="/ess" element={<ESS />} />
        <Route path="/payroll" element={<Navigate to="/" replace />} />
        <Route path="/slip-gaji" element={<Navigate to="/" replace />} />
        <Route path="/loans" element={<Navigate to="/" replace />} />
        <Route path="/ess-admin" element={<Navigate to="/" replace />} />
        <Route path="/analytics" element={<Navigate to="/" replace />} />
        <Route path="/kpi-okr" element={<Navigate to="/" replace />} />
        <Route path="/activity-log" element={<Navigate to="/" replace />} />
        <Route path="/documents" element={<EmployeeDocuments />} />
        <Route path="/settings" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </OutletProvider>
  )

  return (
    <OutletProvider>
      <Navbar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/scheduling" element={<Scheduling />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/slip-gaji" element={<SlipGaji />} />
        <Route path="/loans" element={<LoanManagement />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/ess-admin" element={<ESSAdmin />} />
        <Route path="/ess" element={<ESS />} />
        <Route path="/analytics" element={<HRAnalytics />} />
        <Route path="/kpi-okr" element={<KPIOKR />} />
        <Route path="/documents" element={<EmployeeDocuments />} />
        <Route path="/activity-log" element={<ActivityLog />} />
        <Route path="/settings" element={<CompanySettings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </OutletProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  )
}