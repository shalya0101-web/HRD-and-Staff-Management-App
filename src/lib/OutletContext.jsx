import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

const OutletContext = createContext(null)

const PAYROLL_ONLY_OUTLETS = ['Manajemen']
const APOTEK_OUTLETS = ['Apotek Pillar Seruni', 'Apotek Pillar Air']

export function OutletProvider({ children }) {
  const { employee, isPJ } = useAuth()
  const [outlets, setOutlets] = useState([])
  const [allOutlets, setAllOutlets] = useState([])
  const [areas, setAreas] = useState([])
  const [areaOutlets, setAreaOutlets] = useState([])
  const [myOutletIds, setMyOutletIds] = useState([])
  const [activeOutlet, setActiveOutlet] = useState(() => {
    return localStorage.getItem('activeOutlet') || ''
  })

  useEffect(() => { fetchAll() }, [employee?.id, isPJ])

  useEffect(() => {
    if (activeOutlet) localStorage.setItem('activeOutlet', activeOutlet)
  }, [activeOutlet])

  async function fetchAll() {
    const [outletRes, areaRes, areaOutletRes] = await Promise.all([
      supabase.from('outlets').select('*').order('nama'),
      supabase.from('areas').select('*').order('nama'),
      supabase.from('area_outlets').select('*'),
    ])
    const outletData = outletRes.data || []
    setAllOutlets(outletData)
    setAreas(areaRes.data || [])
    setAreaOutlets(areaOutletRes.data || [])

    // Filter outlet untuk PJ Klinik: outlet yang dikelola + outlet lain se-area
    let visibleOutlets = outletData
    let myIds = []
    if (isPJ && employee?.id) {
      const { data: eo } = await supabase.from('employee_outlets')
        .select('outlet_id').eq('employee_id', employee.id)
      myIds = (eo || []).map(r => r.outlet_id)

      // Cari semua area dari outlet yang dikelola PJ
      const myAreaIds = [...new Set(
        (areaOutletRes.data || [])
          .filter(ao => myIds.includes(ao.outlet_id))
          .map(ao => ao.area_id)
      )]
      // Semua outlet dalam area-area tersebut
      const areaOutletIds = (areaOutletRes.data || [])
        .filter(ao => myAreaIds.includes(ao.area_id))
        .map(ao => ao.outlet_id)
      const visibleIds = [...new Set([...myIds, ...areaOutletIds])]
      visibleOutlets = outletData.filter(o => visibleIds.includes(o.id))
    } else {
      myIds = outletData.map(o => o.id)
    }
    setOutlets(visibleOutlets)
    setMyOutletIds(myIds)

    // Set active outlet: kalau yang tersimpan tidak dalam akses, ganti ke yang pertama
    if (visibleOutlets.length > 0) {
      const validActive = visibleOutlets.find(o => o.id === activeOutlet)
      if (!validActive) setActiveOutlet(visibleOutlets[0].id)
    }
  }

  const activeOutletData = allOutlets.find(o => o.id === activeOutlet)
  const isPayrollOnly = PAYROLL_ONLY_OUTLETS.includes(activeOutletData?.nama)
  const isApotek = APOTEK_OUTLETS.includes(activeOutletData?.nama)

  // getOutletsByArea pakai allOutlets agar PJ tetap lihat outlet se-area (untuk jadwal/penugasan)
  function getOutletsByArea(areaId) {
    const ids = areaOutlets.filter(ao => ao.area_id === areaId).map(ao => ao.outlet_id)
    return allOutlets.filter(o => ids.includes(o.id))
  }

  function getAreaByOutlet(outletId) {
    const ao = areaOutlets.find(a => a.outlet_id === outletId)
    if (!ao) return null
    return areas.find(a => a.id === ao.area_id)
  }

  // Filter outlet untuk PJ Klinik berdasarkan employee_outlets
  async function getOutletsForEmployee(employeeId) {
    const { data } = await supabase
      .from('employee_outlets')
      .select('outlet_id')
      .eq('employee_id', employeeId)
    const ids = (data || []).map(r => r.outlet_id)
    return allOutlets.filter(o => ids.includes(o.id))
  }

  return (
    <OutletContext.Provider value={{
      outlets, allOutlets, areas, areaOutlets,
      myOutletIds,
      activeOutlet, setActiveOutlet,
      activeOutletData,
      isPayrollOnly, isApotek,
      getOutletsByArea, getAreaByOutlet,
      getOutletsForEmployee,
    }}>
      {children}
    </OutletContext.Provider>
  )
}

export function useOutlet() {
  return useContext(OutletContext)
}