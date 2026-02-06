import { useState, useEffect, useRef } from 'react'
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

// Sample data — in production this comes from ATTOM/RealtyMole API
const SAMPLE_PROPERTIES: MapProperty[] = [
  { id: '1', address: '1234 Oak St', city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.7970, price: 145000, arv: 225000, equity: 72, score: 85, type: 'high_equity', bedrooms: 3, bathrooms: 2, sqft: 1450, yearBuilt: 1978 },
  { id: '2', address: '567 Elm Ave', city: 'Dallas', state: 'TX', lat: 32.7850, lng: -96.8100, price: 89000, arv: 180000, equity: 100, score: 92, type: 'vacant', bedrooms: 3, bathrooms: 1, sqft: 1200, yearBuilt: 1965 },
  { id: '3', address: '890 Main Blvd', city: 'Dallas', state: 'TX', lat: 32.7600, lng: -96.7800, price: 175000, arv: 240000, equity: 45, score: 68, type: 'pre_foreclosure', bedrooms: 4, bathrooms: 2, sqft: 1800, yearBuilt: 1985 },
  { id: '4', address: '321 Pine Dr', city: 'Irving', state: 'TX', lat: 32.8140, lng: -96.9490, price: 125000, arv: 195000, equity: 88, score: 78, type: 'absentee', bedrooms: 3, bathrooms: 2, sqft: 1350, yearBuilt: 1972 },
  { id: '5', address: '456 Cedar Ln', city: 'Garland', state: 'TX', lat: 32.9126, lng: -96.6389, price: 98000, arv: 165000, equity: 100, score: 88, type: 'tax_lien', bedrooms: 2, bathrooms: 1, sqft: 1100, yearBuilt: 1960 },
  { id: '6', address: '789 Walnut Way', city: 'Plano', state: 'TX', lat: 33.0198, lng: -96.6989, price: 215000, arv: 310000, equity: 55, score: 74, type: 'distressed', bedrooms: 4, bathrooms: 3, sqft: 2200, yearBuilt: 1990 },
  { id: '7', address: '111 Birch Ct', city: 'Arlington', state: 'TX', lat: 32.7357, lng: -97.1081, price: 110000, arv: 185000, equity: 90, score: 82, type: 'vacant', bedrooms: 3, bathrooms: 2, sqft: 1400, yearBuilt: 1975 },
  { id: '8', address: '222 Maple St', city: 'Fort Worth', state: 'TX', lat: 32.7555, lng: -97.3308, price: 78000, arv: 155000, equity: 100, score: 95, type: 'distressed', bedrooms: 3, bathrooms: 1, sqft: 1150, yearBuilt: 1958 },
  { id: '9', address: '333 Spruce Ave', city: 'Mesquite', state: 'TX', lat: 32.7668, lng: -96.5992, price: 135000, arv: 200000, equity: 60, score: 71, type: 'high_equity', bedrooms: 3, bathrooms: 2, sqft: 1550, yearBuilt: 1982 },
  { id: '10', address: '444 Pecan Rd', city: 'Grand Prairie', state: 'TX', lat: 32.7459, lng: -96.9978, price: 105000, arv: 175000, equity: 78, score: 80, type: 'absentee', bedrooms: 3, bathrooms: 2, sqft: 1300, yearBuilt: 1970 },
  { id: '11', address: '555 Ash Blvd', city: 'Richardson', state: 'TX', lat: 32.9483, lng: -96.7299, price: 195000, arv: 275000, equity: 42, score: 65, type: 'pre_foreclosure', bedrooms: 4, bathrooms: 2, sqft: 1900, yearBuilt: 1988 },
  { id: '12', address: '666 Poplar Dr', city: 'Carrollton', state: 'TX', lat: 32.9537, lng: -96.8903, price: 155000, arv: 230000, equity: 68, score: 76, type: 'high_equity', bedrooms: 3, bathrooms: 2, sqft: 1600, yearBuilt: 1980 },
]

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
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProperty, setSelectedProperty] = useState<MapProperty | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [minScore, setMinScore] = useState(0)

  const filteredProperties = SAMPLE_PROPERTIES.filter((p) => {
    if (filterType !== 'all' && p.type !== filterType) return false
    if (p.score < minScore) return false
    if (searchQuery && !`${p.address} ${p.city}`.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    const map = L.map(mapRef.current).setView([32.7767, -96.7970], 10)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    mapInstance.current = map

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MapPin className="w-7 h-7 text-primary-600" />
            Market Heatmap
          </h1>
          <p className="text-slate-600">Interactive property map with deal scoring and market insights</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{filteredProperties.length} properties</span>
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

      {/* Filters Bar */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
          {selectedProperty ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-slate-800">{selectedProperty.address}</h3>
                  <p className="text-sm text-slate-500">{selectedProperty.city}, {selectedProperty.state}</p>
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
