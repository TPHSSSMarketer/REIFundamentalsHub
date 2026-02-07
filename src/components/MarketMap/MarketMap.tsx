import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MapPin,
  Filter,
  Layers,
  TrendingUp,
  Home,
  DollarSign,
  Search,
  X,
  Flame,
  ThermometerSun,
  Snowflake,
  Navigation,
  Loader2,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface MapProperty {
  id: string
  address: string
  city: string
  state: string
  lat: number
  lng: number
  price: number
  arv: number
  equity: number
  score: number // 0-100 deal score
  type: 'pre_foreclosure' | 'vacant' | 'absentee' | 'high_equity' | 'distressed' | 'tax_lien'
  daysOnMarket?: number
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  yearBuilt?: number
}

type FilterType = 'all' | MapProperty['type']
type HeatType = 'score' | 'equity' | 'price'

// Generate sample properties around any location
function generateSampleProperties(centerLat: number, centerLng: number, locationName: string): MapProperty[] {
  const types: MapProperty['type'][] = ['pre_foreclosure', 'vacant', 'absentee', 'high_equity', 'distressed', 'tax_lien']
  const streetNames = ['Oak', 'Elm', 'Main', 'Pine', 'Cedar', 'Walnut', 'Birch', 'Maple', 'Spruce', 'Pecan', 'Ash', 'Poplar']
  const streetSuffixes = ['St', 'Ave', 'Blvd', 'Dr', 'Ln', 'Way', 'Ct', 'Rd']

  return Array.from({ length: 12 }, (_, i) => {
    const latOffset = (Math.random() - 0.5) * 0.15
    const lngOffset = (Math.random() - 0.5) * 0.15
    const price = Math.round((80000 + Math.random() * 180000) / 1000) * 1000
    const arvMultiplier = 1.3 + Math.random() * 0.5
    const arv = Math.round((price * arvMultiplier) / 1000) * 1000
    const equity = Math.round(30 + Math.random() * 70)
    const score = Math.round(50 + Math.random() * 50)
    const num = Math.round(100 + Math.random() * 9000)

    return {
      id: String(i + 1),
      address: `${num} ${streetNames[i]} ${streetSuffixes[i % streetSuffixes.length]}`,
      city: locationName,
      state: '',
      lat: centerLat + latOffset,
      lng: centerLng + lngOffset,
      price,
      arv,
      equity,
      score,
      type: types[i % types.length],
      bedrooms: 2 + Math.floor(Math.random() * 3),
      bathrooms: 1 + Math.floor(Math.random() * 2),
      sqft: Math.round((900 + Math.random() * 1500) / 50) * 50,
      yearBuilt: 1950 + Math.floor(Math.random() * 60),
    }
  })
}

const TYPE_LABELS: Record<MapProperty['type'], { label: string; color: string }> = {
  pre_foreclosure: { label: 'Pre-Foreclosure', color: '#ef4444' },
  vacant: { label: 'Vacant', color: '#f59e0b' },
  absentee: { label: 'Absentee Owner', color: '#8b5cf6' },
  high_equity: { label: 'High Equity', color: '#10b981' },
  distressed: { label: 'Distressed', color: '#f97316' },
  tax_lien: { label: 'Tax Lien', color: '#ec4899' },
}

const getScoreColor = (score: number) => {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

const getScoreLabel = (score: number) => {
  if (score >= 80) return 'Hot'
  if (score >= 60) return 'Warm'
  return 'Cold'
}

export default function MarketMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markersRef = useRef<L.CircleMarker[]>([])

  const [filterType, setFilterType] = useState<FilterType>('all')
  const [heatType, setHeatType] = useState<HeatType>('score')
  const [propertySearch, setPropertySearch] = useState('')
  const [selectedProperty, setSelectedProperty] = useState<MapProperty | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [minScore, setMinScore] = useState(0)

  // Location search state
  const [locationQuery, setLocationQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [currentLocation, setCurrentLocation] = useState('Enter an address or ZIP code to get started')
  const [properties, setProperties] = useState<MapProperty[]>([])
  const [mapReady, setMapReady] = useState(false)

  const filteredProperties = properties.filter((p) => {
    if (filterType !== 'all' && p.type !== filterType) return false
    if (p.score < minScore) return false
    if (propertySearch && !`${p.address} ${p.city}`.toLowerCase().includes(propertySearch.toLowerCase())) return false
    return true
  })

  // Geocode using OpenStreetMap Nominatim (free, no API key)
  const geocodeLocation = useCallback(async (query: string) => {
    setIsSearching(true)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=us`
      )
      const results = await response.json()
      if (results.length > 0) {
        const { lat, lon, display_name } = results[0]
        const centerLat = parseFloat(lat)
        const centerLng = parseFloat(lon)
        const shortName = display_name.split(',').slice(0, 2).join(',').trim()

        // Move map to new location
        mapInstance.current?.setView([centerLat, centerLng], 11)

        // Generate sample properties for this area
        const newProperties = generateSampleProperties(centerLat, centerLng, shortName)
        setProperties(newProperties)
        setCurrentLocation(shortName)
        setSelectedProperty(null)
      }
    } catch {
      // Geocoding failed — silently ignore
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleLocationSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (locationQuery.trim()) {
      geocodeLocation(locationQuery.trim())
    }
  }

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    const map = L.map(mapRef.current).setView([39.8283, -98.5795], 4) // Start zoomed out on US
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    mapInstance.current = map
    setMapReady(true)

    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  // Update markers when filters change
  useEffect(() => {
    if (!mapInstance.current) return

    // Clear old markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    filteredProperties.forEach((property) => {
      let color: string
      let radius: number

      if (heatType === 'score') {
        color = getScoreColor(property.score)
        radius = 6 + (property.score / 100) * 10
      } else if (heatType === 'equity') {
        color = property.equity >= 70 ? '#10b981' : property.equity >= 40 ? '#f59e0b' : '#ef4444'
        radius = 6 + (property.equity / 100) * 10
      } else {
        color = TYPE_LABELS[property.type].color
        radius = 10
      }

      const marker = L.circleMarker([property.lat, property.lng], {
        radius,
        fillColor: color,
        fillOpacity: 0.7,
        color: '#fff',
        weight: 2,
      })
        .addTo(mapInstance.current!)
        .on('click', () => setSelectedProperty(property))

      marker.bindTooltip(
        `<strong>${property.address}</strong><br/>Score: ${property.score}/100 | ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(property.price)}`,
        { direction: 'top', offset: [0, -10] }
      )

      markersRef.current.push(marker)
    })
  }, [filteredProperties, heatType])

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MapPin className="w-7 h-7 text-primary-600" />
            Market Heatmap
          </h1>
          <p className="text-slate-600">Interactive property map with deal scoring and market insights</p>
        </div>
        <div className="flex items-center gap-2">
          {properties.length > 0 && (
            <span className="text-sm text-slate-500">{filteredProperties.length} properties</span>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
              showFilters ? 'bg-primary-50 border-primary-300 text-primary-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>
      </div>

      {/* Location Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <form onSubmit={handleLocationSearch} className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              placeholder="Enter address, city, ZIP code, or neighborhood..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !locationQuery.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Search Area
          </button>
        </form>
        {currentLocation && (
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {currentLocation}
          </p>
        )}
      </div>

      {/* Filters Bar */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Search within results */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-slate-500 mb-1">Filter Properties</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={propertySearch}
                  onChange={(e) => setPropertySearch(e.target.value)}
                  placeholder="Address or city..."
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Property Type Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Property Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as FilterType)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Types</option>
                {Object.entries(TYPE_LABELS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Heat Layer */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Color By</label>
              <select
                value={heatType}
                onChange={(e) => setHeatType(e.target.value as HeatType)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="score">Deal Score</option>
                <option value="equity">Equity %</option>
                <option value="price">Property Type</option>
              </select>
            </div>

            {/* Min Score */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Min Score: {minScore}</label>
              <input
                type="range"
                min="0"
                max="100"
                value={minScore}
                onChange={(e) => setMinScore(parseInt(e.target.value))}
                className="w-32 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
              />
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">Legend:</span>
            {heatType === 'score' ? (
              <>
                <span className="flex items-center gap-1 text-xs"><Flame className="w-3.5 h-3.5 text-emerald-500" /> Hot (80+)</span>
                <span className="flex items-center gap-1 text-xs"><ThermometerSun className="w-3.5 h-3.5 text-amber-500" /> Warm (60-79)</span>
                <span className="flex items-center gap-1 text-xs"><Snowflake className="w-3.5 h-3.5 text-red-500" /> Cold (&lt;60)</span>
              </>
            ) : heatType === 'equity' ? (
              <>
                <span className="flex items-center gap-1 text-xs"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> High (70%+)</span>
                <span className="flex items-center gap-1 text-xs"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Medium (40-69%)</span>
                <span className="flex items-center gap-1 text-xs"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Low (&lt;40%)</span>
              </>
            ) : (
              Object.entries(TYPE_LABELS).map(([key, { label, color }]) => (
                <span key={key} className="flex items-center gap-1 text-xs">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: color }} /> {label}
                </span>
              ))
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map */}
        <div className="lg:col-span-2">
          <div ref={mapRef} className="w-full h-[550px] rounded-xl border border-slate-200 overflow-hidden" />
        </div>

        {/* Property Detail / List */}
        <div className="space-y-3">
          {properties.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <Navigation className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="font-medium text-slate-500">Search a location</p>
              <p className="text-sm text-slate-400 mt-1">Enter an address, city, or ZIP code above to explore properties in that area</p>
            </div>
          ) : selectedProperty ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-slate-800">{selectedProperty.address}</h3>
                  <p className="text-sm text-slate-500">{selectedProperty.city}{selectedProperty.state ? `, ${selectedProperty.state}` : ''}</p>
                </div>
                <button onClick={() => setSelectedProperty(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Score Badge */}
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold mb-4 ${
                selectedProperty.score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                selectedProperty.score >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
              }`}>
                {selectedProperty.score >= 80 ? <Flame className="w-4 h-4" /> :
                 selectedProperty.score >= 60 ? <ThermometerSun className="w-4 h-4" /> :
                 <Snowflake className="w-4 h-4" />}
                Deal Score: {selectedProperty.score}/100 ({getScoreLabel(selectedProperty.score)})
              </div>

              {/* Type badge */}
              <div className="mb-4">
                <span
                  className="inline-block px-2 py-1 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: TYPE_LABELS[selectedProperty.type].color }}
                >
                  {TYPE_LABELS[selectedProperty.type].label}
                </span>
              </div>

              {/* Details */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Asking Price</span>
                  <span className="font-bold">{formatCurrency(selectedProperty.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Est. ARV</span>
                  <span className="font-bold text-primary-700">{formatCurrency(selectedProperty.arv)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Equity</span>
                  <span className="font-bold text-emerald-600">{selectedProperty.equity}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Potential Spread</span>
                  <span className="font-bold text-accent-600">{formatCurrency(selectedProperty.arv - selectedProperty.price)}</span>
                </div>
                <div className="h-px bg-slate-100" />
                {selectedProperty.bedrooms && (
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Beds / Baths</span>
                    <span className="text-sm font-medium">{selectedProperty.bedrooms} / {selectedProperty.bathrooms}</span>
                  </div>
                )}
                {selectedProperty.sqft && (
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Sq Ft</span>
                    <span className="text-sm font-medium">{selectedProperty.sqft.toLocaleString()}</span>
                  </div>
                )}
                {selectedProperty.yearBuilt && (
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Year Built</span>
                    <span className="text-sm font-medium">{selectedProperty.yearBuilt}</span>
                  </div>
                )}
              </div>

              <button className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors text-sm font-medium">
                <TrendingUp className="w-4 h-4" />
                Analyze This Deal
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary-500" />
                Properties
              </h3>
              <p className="text-xs text-slate-500 mb-3">Click a marker on the map or a property below</p>
            </div>
          )}

          {/* Property List */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {filteredProperties.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedProperty(p)
                  mapInstance.current?.setView([p.lat, p.lng], 13)
                }}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedProperty?.id === p.id
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.address}</p>
                    <p className="text-xs text-slate-500">{p.city} | {TYPE_LABELS[p.type].label}</p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-sm font-bold">{formatCurrency(p.price)}</p>
                    <div className={`text-xs font-bold ${
                      p.score >= 80 ? 'text-emerald-600' : p.score >= 60 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {p.score}/100
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
