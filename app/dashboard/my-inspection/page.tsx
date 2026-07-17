"use client"

import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/DashboardLayout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { toast } from "react-toastify"
import { useState, useEffect } from "react"
import { propertiesAPI } from "@/lib/api"
import { UnitSelectionModal } from "@/components/UnitSelectionModal"
import { ActionModal, EditPropertyModal } from "@/components/PropertyModals"
import { Country, State, City } from 'country-state-city'

import { Info, Search, MoreVertical, Globe, MapPin, Building, CreditCard } from "lucide-react"

export default function MyInspection() {
  const router = useRouter()
  const [propertyName, setPropertyName] = useState("")
  const [selectedCountry, setSelectedCountry] = useState("")
  const [selectedState, setSelectedState] = useState("")
  const [selectedCity, setSelectedCity] = useState("")
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [unitSelectionOpen, setUnitSelectionOpen] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<any>(null)
  const [actionModalOpen, setActionModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)

  // Location data
  const [countries, setCountries] = useState<any[]>([])
  const [states, setStates] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])
  const [loadingStates, setLoadingStates] = useState(false)
  const [loadingCities, setLoadingCities] = useState(false)

  // Initialize countries on component mount (only 4 allowed countries)
  useEffect(() => {
    const allowedCountries = ['US', 'CA', 'GB', 'AU']
    const allCountries = Country.getAllCountries()
    const filteredCountries = allCountries
      .filter(country => allowedCountries.includes(country.isoCode))
      .sort((a, b) => a.name.localeCompare(b.name))
    setCountries(filteredCountries)
  }, [])

  // Load states when country changes
  useEffect(() => {
    if (selectedCountry) {
      setLoadingStates(true)
      setSelectedState('')
      setSelectedCity('')
      setCities([])

      const countryStates = State.getStatesOfCountry(selectedCountry)
      setStates(countryStates.sort((a, b) => a.name.localeCompare(b.name)))
      setLoadingStates(false)
    } else {
      setStates([])
      setCities([])
    }
  }, [selectedCountry])

  // Load cities when state changes
  useEffect(() => {
    if (selectedCountry && selectedState) {
      setLoadingCities(true)
      setSelectedCity('')

      const stateCities = City.getCitiesOfState(selectedCountry, selectedState)
      setCities(stateCities.sort((a, b) => a.name.localeCompare(b.name)))
      setLoadingCities(false)
    } else {
      setCities([])
    }
  }, [selectedCountry, selectedState])

  const handleUnitSelectionContinue = (selectedUnits: string[]) => {
    setUnitSelectionOpen(false)
    localStorage.setItem('selectedUnits', JSON.stringify(selectedUnits))
    toast.success(`${selectedUnits.length} units selected for inspection`, {
      position: "top-right",
      autoClose: 2000,
    })
    router.push('/dashboard/inspection/summary')
  }

  useEffect(() => {
    fetchProperties()
  }, [])

  const fetchProperties = async () => {
    try {
      setLoading(true)
      const response = await propertiesAPI.getAll({
        search: propertyName || undefined,
        state: selectedState || undefined,
        city: selectedCity || undefined,
      })
      if (response.success) {
        setProperties(response.properties)
      }
    } catch (error: any) {
      console.error('Error fetching properties:', error)
      toast.error("Failed to load properties")
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    fetchProperties()
  }

  const handleActionClick = (property: any) => {
    setSelectedProperty(property)
    setActionModalOpen(true)
  }

  const handleEditProperty = () => {
    setActionModalOpen(false)
    setEditModalOpen(true)
  }

  const handleHoldInspection = async () => {
    if (!selectedProperty) return
    try {
      const response = await propertiesAPI.hold(selectedProperty._id)
      if (response.success) {
        toast.success(response.message, { position: "top-right" })
        fetchProperties()
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to hold inspection")
    } finally {
      setActionModalOpen(false)
    }
  }

  const handleRemoveProperty = async () => {
    if (!selectedProperty) return
    if (confirm(`Are you sure you want to remove ${selectedProperty.name}?`)) {
      try {
        const response = await propertiesAPI.delete(selectedProperty._id)
        if (response.success) {
          toast.success("Property removed successfully", { position: "top-right" })
          fetchProperties()
        }
      } catch (error: any) {
        toast.error(error.message || "Failed to remove property")
      } finally {
        setActionModalOpen(false)
      }
    }
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 text-slate-900 font-lexend space-y-6">
        {/* Info Banner */}
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-r from-teal-50/50 to-slate-50/30 border border-slate-200/80 border-l-4 border-l-teal-600 rounded-2xl shadow-sm p-5 flex items-start gap-3">
            <Info className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                You can manage properties, buildings, and units here. To perform inspections, please use the <span className="font-extrabold text-teal-600">INSPIRE app</span> on your tablet device.
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header & Action bar */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Your Properties</h1>
              <p className="text-slate-500 text-xs sm:text-sm font-medium mt-0.5">Search and view current inspection properties</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setUnitSelectionOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all border-0 shadow-sm shadow-emerald-600/10 text-xs sm:text-sm"
              >
                Select Units for Inspection
              </Button>
            </div>
          </div>

          {/* Search section */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Search className="w-4 h-4 text-teal-600" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Search Filters</h2>
            </div>

            <div className="bg-teal-50/40 border border-teal-100/70 p-4 rounded-xl flex items-start gap-2.5">
              <Globe className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-teal-800 font-bold leading-normal">
                Inspector Portal supports addresses within the United States, Canada, United Kingdom, and Australia.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Property Name</label>
                <input
                  type="text"
                  placeholder="e.g. Oakridge Apts"
                  value={propertyName}
                  onChange={(e) => setPropertyName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/50 hover:bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm font-medium text-slate-800 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Country</label>
                <input
                  type="text"
                  placeholder="e.g. US"
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/50 hover:bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm font-medium text-slate-800 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">State</label>
                <input
                  type="text"
                  placeholder="e.g. California"
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/50 hover:bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm font-medium text-slate-800 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">City</label>
                <input
                  type="text"
                  placeholder="e.g. Los Angeles"
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/50 hover:bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm font-medium text-slate-800 transition-all"
                />
              </div>

              <div className="flex items-end">
                <Button
                  onClick={handleSearch}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl transition-all border-0 shadow-sm shadow-teal-600/10 text-xs sm:text-sm"
                >
                  <Search className="w-4 h-4 mr-1.5 inline" /> Search
                </Button>
              </div>
            </div>
          </div>

          {/* Properties Table Card */}
          <Card className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Property Directory</h3>
              <span className="text-xs font-bold text-teal-600 bg-teal-50 border border-teal-100/60 px-3 py-1 rounded-lg">
                {properties.length} Active {properties.length === 1 ? 'Property' : 'Properties'}
              </span>
            </div>
            
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-12 text-center text-slate-400 font-bold text-sm">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-3"></div>
                  Loading properties...
                </div>
              ) : properties.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold text-sm">
                  No properties found matching the criteria.
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Property ID</th>
                      <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Name</th>
                      <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Buildings</th>
                      <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Units</th>
                      <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Address</th>
                      <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">City</th>
                      <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">State</th>
                      <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Zip Code</th>
                      <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {properties.map((property) => (
                      <tr key={property._id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="py-4 px-6 text-center">
                          <span className="bg-teal-50 text-teal-700 font-extrabold px-3 py-1.5 rounded-xl text-xs border border-teal-100/50 inline-block shadow-sm">
                            {property.propertyId || property._id?.slice(-8)?.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-4 px-6 font-extrabold text-sm text-slate-900 text-center">{property.name}</td>
                        <td className="py-4 px-6 text-center font-bold text-slate-700 text-sm">{property.buildings || 1}</td>
                        <td className="py-4 px-6 text-center font-bold text-slate-700 text-sm">{property.units || 1}</td>
                        <td className="py-4 px-6 font-bold text-xs text-slate-500 max-w-[150px] truncate text-center" title={property.address}>{property.address}</td>
                        <td className="py-4 px-6 font-bold text-xs text-slate-700 text-center">{property.city}</td>
                        <td className="py-4 px-6 text-center">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                            {property.state}
                          </span>
                        </td>
                        <td className="py-4 px-6 font-bold text-xs text-slate-500 text-center">{property.zipCode}</td>
                        <td className="py-4 px-6 text-center">
                          <button
                            onClick={() => handleActionClick(property)}
                            className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-slate-700 border border-transparent hover:border-slate-200"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      </div>

      <ActionModal
        isOpen={actionModalOpen}
        onClose={() => setActionModalOpen(false)}
        onEdit={handleEditProperty}
        onStartInspection={() => {
          setActionModalOpen(false)
          router.push(`/dashboard/property-details/${selectedProperty?._id}`)
        }}
        onHoldInspection={handleHoldInspection}
        onRemoveProperty={handleRemoveProperty}
        propertyData={selectedProperty}
      />

      <UnitSelectionModal
        isOpen={unitSelectionOpen}
        onClose={() => setUnitSelectionOpen(false)}
        onContinue={handleUnitSelectionContinue}
        totalUnits={selectedProperty?.units || 20}
      />

      <EditPropertyModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSuccess={fetchProperties}
        propertyData={selectedProperty}
      />
    </DashboardLayout>
  )
}
