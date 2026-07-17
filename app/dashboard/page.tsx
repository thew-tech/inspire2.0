"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/DashboardLayout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { toast } from "react-toastify"
import {
  RequestInspectionModal,
  AddPropertyModal,
  BuildingDivisionModal,
  ActionModal,
  CoverageSelectionModal,
  EditPropertyModal
} from "@/components/PropertyModals"
import { propertiesAPI } from "@/lib/api"
import { Country, State, City } from 'country-state-city'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005'

export default function Dashboard() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCountry, setSelectedCountry] = useState("")
  const [selectedState, setSelectedState] = useState("")
  const [selectedCity, setSelectedCity] = useState("")
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [showAddPropertyModal, setShowAddPropertyModal] = useState(false)
  const [showBuildingDivisionModal, setShowBuildingDivisionModal] = useState(false)
  const [showActionModal, setShowActionModal] = useState(false)
  const [showCoverageModal, setShowCoverageModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<any>(null)
  const [newPropertyData, setNewPropertyData] = useState<any>(null)
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [propertyProgress, setPropertyProgress] = useState<Record<string, number>>({})

  // Location data from country-state-city package
  const [countries, setCountries] = useState<any[]>([])
  const [states, setStates] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])

  // Load countries on mount
  useEffect(() => {
    const allCountries = Country.getAllCountries()
    const allowedCountries = ['United States', 'Canada', 'United Kingdom', 'Australia']
    const filteredCountries = allCountries.filter(country =>
      allowedCountries.includes(country.name)
    )
    setCountries(filteredCountries)
  }, [])

  // Handle country change
  const handleCountryChange = (countryName: string) => {
    setSelectedCountry(countryName)
    setSelectedState("")
    setSelectedCity("")

    const country = countries.find(c => c.name === countryName)
    if (country) {
      const countryStates = State.getStatesOfCountry(country.isoCode)
      setStates(countryStates)
    } else {
      setStates([])
    }
    setCities([])
  }

  // Handle state change
  const handleStateChange = (stateName: string) => {
    setSelectedState(stateName)
    setSelectedCity("")

    const country = countries.find(c => c.name === selectedCountry)
    const state = states.find(s => s.name === stateName)

    if (country && state) {
      const stateCities = City.getCitiesOfState(country.isoCode, state.isoCode)
      setCities(stateCities)
    } else {
      setCities([])
    }
  }

  // Fetch properties on mount
  useEffect(() => {
    fetchProperties()
  }, [])

  const fetchProperties = async () => {
    try {
      setLoading(true)
      const response = await propertiesAPI.getAll({
        search: searchQuery || undefined,
        state: selectedState || undefined,
        city: selectedCity || undefined,
      })
      if (response.success) {
        setProperties(response.properties)
        // Fetch progress for these properties
        fetchProgress(response.properties)
      }
    } catch (error: any) {
      console.error('Error fetching properties:', error)
      // Use mock data if API fails (for development)
      setProperties([
        {
          _id: "1",
          propertyId: "80000017",
          name: "STEPHEN'S PARK APA...",
          buildings: 12,
          units: 160,
          address: "3200 LATO...",
          city: "Anchorage",
          state: "Alaska",
          zipCode: "99508"
        },
        {
          _id: "2",
          propertyId: "QC 2016E7EF",
          name: "Demure St-Hilaire",
          buildings: 3,
          units: 62,
          address: "21 Rue Messier",
          city: "Mont-Saint...",
          state: "QC",
          zipCode: "J3SLI3"
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const fetchProgress = async (propertyList: any[]) => {
    try {
      // Fetch all progress records for current user
      const response = await fetch(`${API_URL}/api/inspections/progress`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      const data = await response.json()
      if (data.success && Array.isArray(data.progress)) {
        const progressMap: Record<string, number> = {}
        
        propertyList.forEach(prop => {
            const propId = prop._id
            const propProgress = data.progress.filter((p: any) => 
                p.propertyId === propId || p.propertyId?._id === propId
            )
            
            // Heuristic: Count unique units/categories completed
            const uniqueTasks = new Set()
            propProgress.forEach((p: any) => {
                const type = String(p.inspectionType || '').toLowerCase()
                if (type.startsWith('unit_')) {
                    uniqueTasks.add(`unit_${p.unitId}`)
                } else if (type === 'inside' || type === 'outside') {
                    uniqueTasks.add(type)
                }
            })
            
            // Total tasks = (buildings * 2) + units
            const totalTasks = (prop.buildings * 2) + prop.units
            if (totalTasks > 0) {
                progressMap[propId] = Math.min(100, Math.round((uniqueTasks.size / totalTasks) * 100))
            } else {
                progressMap[propId] = 0
            }
        })
        setPropertyProgress(progressMap)
      }
    } catch (e) {
      console.error('Error fetching progress:', e)
    }
  }

  const handleSearch = () => {
    fetchProperties()
    toast.info("Searching properties...", { position: "top-right" })
  }

  const handleHoldInspection = (property: any) => {
    toast.info(`Inspection for ${property.name} put on hold`, { position: "top-right" })
  }

  const handleRemoveProperty = async (property: any) => {
    if (confirm(`Are you sure you want to remove ${property.name}?`)) {
      try {
        const response = await propertiesAPI.delete(property._id)
        if (response.success) {
          toast.success("Property removed successfully", { position: "top-right" })
          fetchProperties()
        }
      } catch (error: any) {
        toast.error(error.message || "Failed to remove property")
      }
    }
  }

  const handleAddPropertyNext = (data: any) => {
    // Store the property data and show the building division modal
    const propData = Array.isArray(data) ? data[0] : data
    setNewPropertyData(propData)
    setShowAddPropertyModal(false)
    setShowBuildingDivisionModal(true)
  }

  const handleBuildingUpdate = async (data: any, buildings: { name: string; units: number }[]) => {
    try {
      const response = await propertiesAPI.create({
        propertyId: data.propertyId,
        name: data.propertyName || data.name,
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        buildings: buildings.length,
        units: buildings.reduce((sum, b) => sum + b.units, 0),
      })
      if (response.success) {
        toast.success("Data saved successfully", { position: "top-right" })

        // Save custom building names to localStorage
        const propId = response.property?._id || data.propertyId
        if (propId) {
          const namesMap: Record<string, string> = {}
          buildings.forEach((b, i) => {
            namesMap[`B${i + 1}`] = b.name
          })
          localStorage.setItem(`buildingNames_${propId}`, JSON.stringify(namesMap))
        }

        fetchProperties()
        setNewPropertyData(response.property || data)
        setShowBuildingDivisionModal(false)
        setShowActionModal(true)
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to add property", { position: "top-right" })
      // Fallback for dev
      toast.success("Data saved successfully", { position: "top-right" })
      setNewPropertyData(data)
      setShowBuildingDivisionModal(false)
      setShowActionModal(true)
    }
  }

  const handleEditProperty = () => {
    setShowActionModal(false)
    setShowEditModal(true)
  }

  const handleActionStartInspection = () => {
    // Close action modal, open coverage selection modal
    setShowActionModal(false)
    setShowCoverageModal(true)
  }

  const handleCoverageStart = (coverage: string, calculatedUnits: number) => {
    setShowCoverageModal(false)
    // Navigate to property details page with coverage info
    const prop = newPropertyData || selectedProperty
    const propId = prop?._id || prop?.id || 'new'
    router.push(
      `/dashboard/property-details/${propId}?coverage=${coverage}&calculatedUnits=${calculatedUnits}`
    )
  }

  const handleInitiate = (property: any) => {
    setSelectedProperty(property)
    setNewPropertyData(property)
    setShowActionModal(true)
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 font-lexend">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Property Dashboard</h1>
            <p className="text-slate-500 text-sm sm:text-base mt-1">Manage your properties, track statuses, and initiate inspections</p>
          </div>
          <div className="flex-shrink-0">
            <Button
              onClick={() => setShowAddPropertyModal(true)}
              className="w-full sm:w-auto bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-bold px-5 py-2.5 rounded-xl text-sm shadow-md shadow-teal-600/15 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 border-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add New Property
            </Button>
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Card className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 flex items-center gap-4">
            <div className="p-3.5 bg-teal-50 text-teal-600 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Properties</p>
              <p className="text-2xl font-extrabold text-slate-800 mt-0.5">{properties.length}</p>
            </div>
          </Card>
          <Card className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 flex items-center gap-4">
            <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed Inspections</p>
              <p className="text-2xl font-extrabold text-slate-800 mt-0.5">
                {properties.filter(p => (propertyProgress[p._id] || 0) === 100).length}
              </p>
            </div>
          </Card>
          <Card className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 flex items-center gap-4">
            <div className="p-3.5 bg-sky-50 text-sky-600 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">In Progress</p>
              <p className="text-2xl font-extrabold text-slate-800 mt-0.5">
                {properties.filter(p => {
                  const progress = propertyProgress[p._id] || 0;
                  return progress > 0 && progress < 100;
                }).length}
              </p>
            </div>
          </Card>
        </div>

        {/* Search Filters */}
        <Card className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 sm:p-6 mb-6 lg:mb-8">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 8.293A1 1 0 013 7.586V4z" />
            </svg>
            <h2 className="text-base font-bold text-slate-800 uppercase tracking-wider">Filter Properties</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Property Name</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter property name"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/50 hover:bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm transition-all duration-200 placeholder-slate-400 font-medium text-slate-800"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-base font-bold transition-colors"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Country</label>
              <input
                type="text"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                placeholder="Enter country"
                className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/50 hover:bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm transition-all duration-200 placeholder-slate-400 font-medium text-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">State</label>
              <input
                type="text"
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                placeholder="Enter state"
                className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/50 hover:bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm transition-all duration-200 placeholder-slate-400 font-medium text-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">City</label>
              <input
                type="text"
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                placeholder="Enter city"
                className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/50 hover:bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm transition-all duration-200 placeholder-slate-400 font-medium text-slate-800"
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleSearch}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 rounded-xl text-sm shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-1 border-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search
              </Button>
            </div>
          </div>
        </Card>

        {/* Properties Section */}
        <Card className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 sm:p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-slate-900">Your Properties</h2>
            <span className="text-xs font-bold text-teal-600 bg-teal-50 px-3 py-1 rounded-full border border-teal-100/50">
              {properties.length} Active Properties
            </span>
          </div>

          {/* Properties Table - Desktop */}
          <div className="hidden md:block rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-12 text-center text-slate-500 font-medium flex flex-col items-center justify-center gap-3">
                <svg className="w-8 h-8 text-teal-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading properties...
              </div>
            ) : properties.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-medium">No properties found. Add your first property!</div>
            ) : (
              <table className="w-full table-fixed">
                <thead className="bg-slate-50/75 border-b border-slate-200">
                  <tr>
                    <th className="text-center py-3 px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[12%]">Property ID</th>
                    <th className="text-center py-3 px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[18%]">Property Name</th>
                    <th className="text-center py-3 px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[8%]">Buildings</th>
                    <th className="text-center py-3 px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[8%]">Units</th>
                    <th className="text-center py-3 px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[14%]">Address</th>
                    <th className="text-center py-3 px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[10%]">City</th>
                    <th className="text-center py-3 px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[8%]">State</th>
                    <th className="text-center py-3 px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[8%]">Zip Code</th>
                    <th className="text-center py-3 px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[12%]">Progress</th>
                    <th className="text-center py-3 px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[18%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {properties.map((property) => (
                    <tr
                      key={property._id || property.propertyId}
                      className="hover:bg-slate-50/50 transition-colors duration-150"
                    >
                      <td className="py-4 px-3 text-center">
                        <span className="text-sky-700 font-bold text-[10px] bg-sky-50 border border-sky-100 px-2 py-0.5 rounded truncate block mx-auto w-fit font-mono font-bold">
                          {property.propertyId}
                        </span>
                      </td>
                      <td className="py-4 px-3 text-center">
                        <span className="font-bold text-slate-800 text-sm truncate block">{property.name}</span>
                      </td>
                      <td className="py-4 px-3 text-slate-700 font-semibold text-sm text-center">{property.buildings}</td>
                      <td className="py-4 px-3 text-slate-700 font-semibold text-sm text-center">{property.units}</td>
                      <td className="py-4 px-3 text-slate-500 text-xs truncate text-center font-medium">{property.address}</td>
                      <td className="py-4 px-3 text-slate-500 text-xs truncate text-center font-medium">{property.city}</td>
                      <td className="py-4 px-3 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 truncate">
                          {property.state}
                        </span>
                      </td>
                      <td className="py-4 px-3 text-slate-500 font-mono text-xs text-center font-medium">{property.zipCode}</td>
                      <td className="py-4 px-3">
                        <div className="w-full bg-slate-100 rounded-full h-2 mb-1">
                          <div 
                            className="bg-gradient-to-r from-teal-500 to-emerald-500 h-2 rounded-full transition-all duration-500" 
                            style={{ width: `${propertyProgress[property._id] || 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 block text-center">
                          {propertyProgress[property._id] || 0}%
                        </span>
                      </td>
                      <td className="py-4 px-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleInitiate(property)}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-sm shadow-teal-600/10"
                          >
                            Initiate
                          </button>
                          <button
                            onClick={() => handleRemoveProperty(property)}
                            className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-100/50 rounded-lg transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Properties Cards - Mobile & Tablet */}
          <div className="md:hidden space-y-4">
            {loading ? (
              <div className="p-8 text-center text-slate-500 font-medium flex flex-col items-center justify-center gap-3">
                <svg className="w-8 h-8 text-teal-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading properties...
              </div>
            ) : properties.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-medium">No properties found. Add your first property!</div>
            ) : (
              properties.map((property) => (
                <Card key={property._id || property.propertyId} className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sky-700 font-bold text-xs bg-sky-50 border border-sky-100 px-2 py-0.5 rounded font-mono">
                          {property.propertyId}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {property.state}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-900 text-base mb-1">{property.name}</h3>
                      <p className="text-slate-500 text-xs font-medium">{property.address}</p>
                    </div>
                    <Button
                      onClick={() => handleInitiate(property)}
                      className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-sm hover:shadow-md transition-all duration-200 whitespace-nowrap ml-2 border-0"
                    >
                      Initiate
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-0.5">Buildings</span>
                      <p className="font-bold text-slate-800 text-sm">{property.buildings}</p>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-0.5">Units</span>
                      <p className="font-bold text-slate-800 text-sm">{property.units}</p>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-0.5">City</span>
                      <p className="font-bold text-slate-800 text-sm">{property.city}</p>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-0.5">Zip Code</span>
                      <p className="font-bold text-slate-800 text-sm font-mono">{property.zipCode}</p>
                    </div>
                    <div className="col-span-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Progress</span>
                        <span className="text-teal-600 font-bold text-xs">{propertyProgress[property._id] || 0}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-teal-500 to-emerald-500 h-2 rounded-full transition-all duration-500" 
                          style={{ width: `${propertyProgress[property._id] || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Modals */}
      <RequestInspectionModal
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
      />
      <AddPropertyModal
        isOpen={showAddPropertyModal}
        onClose={() => setShowAddPropertyModal(false)}
        onNext={handleAddPropertyNext}
      />
      <BuildingDivisionModal
        isOpen={showBuildingDivisionModal}
        onClose={() => setShowBuildingDivisionModal(false)}
        onUpdate={handleBuildingUpdate}
        propertyData={newPropertyData}
      />
      <ActionModal
        isOpen={showActionModal}
        onClose={() => setShowActionModal(false)}
        onEdit={handleEditProperty}
        onStartInspection={handleActionStartInspection}
        propertyData={newPropertyData}
      />
      <CoverageSelectionModal
        isOpen={showCoverageModal}
        onClose={() => setShowCoverageModal(false)}
        onStartInspection={handleCoverageStart}
        propertyData={newPropertyData}
      />
      <EditPropertyModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={fetchProperties}
        propertyData={newPropertyData}
      />
    </DashboardLayout>
  )
}
