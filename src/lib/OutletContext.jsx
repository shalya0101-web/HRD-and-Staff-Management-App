import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const OutletContext = createContext(null)

const PAYROLL_ONLY_OUTLETS = ['Manajemen']
const APOTEK_OUTLETS = ['Apotek Pillar Seruni', 'Apotek Pillar Air']

export function OutletProvider({ children }) {
  const [outlets, setOutlets] = useState([])
  const [areas, setAreas] = useState([])
  const [areaOutlets, setAreaOutlets] = useState([])
  const [activeOutlet, setActiveOutlet] = useState(() => {
    return localStorage.getItem('activeOutlet') || ''
  })

  useEffect(() => { fetchAll() }, [])

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
    setOutlets(outletData)
    setAreas(areaRes.data || [])
    setAreaOutlets(areaOutletRes.data || [])
    if (!activeOutlet && outletData.length > 0) setActiveOutlet(outletData[0].id)
  }

  const activeOutletData = outlets.find(o => o.id === activeOutlet)
  const isPayrollOnly = PAYROLL_ONLY_OUTLETS.includes(activeOutletData?.nama)
  const isApotek = APOTEK_OUTLETS.includes(activeOutletData?.nama)

  function getOutletsByArea(areaId) {
    const ids = areaOutlets.filter(ao => ao.area_id === areaId).map(ao => ao.outlet_id)
    return outlets.filter(o => ids.includes(o.id))
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
    return outlets.filter(o => ids.includes(o.id))
  }

  return (
    <OutletContext.Provider value={{
      outlets, areas, areaOutlets,
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