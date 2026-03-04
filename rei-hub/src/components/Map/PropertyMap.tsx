/**
 * PropertyMap — Reusable Leaflet map component for displaying
 * deals, portfolio properties, and markets as pins on a map.
 *
 * Uses free OpenStreetMap tiles (no API key needed).
 */

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ── Fix Leaflet default marker icon (broken by bundlers) ────────────
// Leaflet expects marker icons at specific paths; Vite bundling breaks this.
// We recreate the icons using the CDN.
const ICON_CDN = 'https://unpkg.com/leaflet@1.9.4/dist/images'

const defaultIcon = L.icon({
  iconUrl: `${ICON_CDN}/marker-icon.png`,
  iconRetinaUrl: `${ICON_CDN}/marker-icon-2x.png`,
  shadowUrl: `${ICON_CDN}/marker-shadow.png`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// Colored marker icons for different entity types
function createColoredIcon(color: string) {
  return L.divIcon({
    className: 'custom-map-marker',
    html: `<div style="
      background-color: ${color};
      width: 28px;
      height: 28px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  })
}

const MARKER_ICONS = {
  deal: createColoredIcon('#3B82F6'),      // blue
  property: createColoredIcon('#10B981'),   // green
  market: createColoredIcon('#F59E0B'),     // amber/orange
  default: defaultIcon,
}

// ── Types ──────────────────────────────────────────────────────────────

export interface MapPin {
  id: string
  latitude: number
  longitude: number
  label: string          // Primary text (address or city)
  sublabel?: string      // Secondary text (price, stage, etc.)
  type: 'deal' | 'property' | 'market' | 'default'
  onClick?: () => void
}

interface PropertyMapProps {
  pins: MapPin[]
  height?: string        // CSS height (default: '400px')
  className?: string
  zoom?: number          // Default zoom level (default: auto-fit)
}

// ── Auto-fit bounds helper ─────────────────────────────────────────────

function FitBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap()

  useEffect(() => {
    if (pins.length === 0) return

    if (pins.length === 1) {
      map.setView([pins[0].latitude, pins[0].longitude], 12)
      return
    }

    const bounds = L.latLngBounds(
      pins.map((p) => [p.latitude, p.longitude] as [number, number])
    )
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }, [pins, map])

  return null
}

// ── Component ──────────────────────────────────────────────────────────

export default function PropertyMap({
  pins,
  height = '400px',
  className = '',
  zoom,
}: PropertyMapProps) {
  const mapRef = useRef<L.Map | null>(null)

  // Filter out pins without valid coordinates
  const validPins = pins.filter(
    (p) => p.latitude != null && p.longitude != null && !isNaN(p.latitude) && !isNaN(p.longitude)
  )

  if (validPins.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 ${className}`}
        style={{ height }}
      >
        <div className="text-center text-slate-500 dark:text-slate-400">
          <p className="text-sm font-medium">No locations to display</p>
          <p className="text-xs mt-1">Properties will appear here once they have coordinates</p>
        </div>
      </div>
    )
  }

  // Default center: center of all pins or first pin
  const centerLat = validPins.reduce((sum, p) => sum + p.latitude, 0) / validPins.length
  const centerLng = validPins.reduce((sum, p) => sum + p.longitude, 0) / validPins.length

  return (
    <div className={`rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 ${className}`} style={{ height }}>
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={zoom ?? 10}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds pins={validPins} />

        {validPins.map((pin) => (
          <Marker
            key={pin.id}
            position={[pin.latitude, pin.longitude]}
            icon={MARKER_ICONS[pin.type] || MARKER_ICONS.default}
            eventHandlers={{
              click: () => pin.onClick?.(),
            }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{pin.label}</p>
                {pin.sublabel && (
                  <p className="text-slate-600 text-xs mt-0.5">{pin.sublabel}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
