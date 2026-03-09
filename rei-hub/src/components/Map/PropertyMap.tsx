/**
 * PropertyMap — Reusable map component for displaying deals, portfolio
 * properties, and markets as pins.
 *
 * Automatically uses Google Maps when a key is configured in Admin > Credentials,
 * otherwise falls back to free Leaflet + OpenStreetMap.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getMapsConfig } from '@/services/geocodingApi'

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

// ── Google Maps colors by pin type ────────────────────────────────────

const GOOGLE_PIN_COLORS: Record<string, string> = {
  deal: '#3B82F6',       // blue
  property: '#10B981',   // green
  market: '#F59E0B',     // amber/orange
  default: '#EF4444',    // red
}

// ── Google Maps loader (singleton) ────────────────────────────────────

let googleMapsPromise: Promise<void> | null = null
let googleMapsLoaded = false

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (googleMapsLoaded) return Promise.resolve()
  if (googleMapsPromise) return googleMapsPromise

  googleMapsPromise = new Promise<void>((resolve, reject) => {
    if ((window as any).google?.maps) {
      googleMapsLoaded = true
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker`
    script.async = true
    script.defer = true
    script.onload = () => {
      googleMapsLoaded = true
      resolve()
    }
    script.onerror = () => reject(new Error('Failed to load Google Maps'))
    document.head.appendChild(script)
  })

  return googleMapsPromise
}

// ── Google Maps Component ─────────────────────────────────────────────

function GoogleMapView({ pins, height, className, zoom }: PropertyMapProps & { apiKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  const initMap = useCallback(() => {
    if (!containerRef.current || !(window as any).google?.maps) return

    const google = (window as any).google

    // Create map
    const centerLat = pins.reduce((s, p) => s + p.latitude, 0) / pins.length
    const centerLng = pins.reduce((s, p) => s + p.longitude, 0) / pins.length

    const map = new google.maps.Map(containerRef.current, {
      center: { lat: centerLat, lng: centerLng },
      zoom: zoom ?? 10,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT,
      },
      streetViewControl: true,
      fullscreenControl: true,
      mapId: 'rei-hub-property-map',
    })

    mapInstanceRef.current = map

    // Clear old markers
    markersRef.current.forEach((m) => m.map = null)
    markersRef.current = []

    // Create markers
    const bounds = new google.maps.LatLngBounds()

    pins.forEach((pin) => {
      const position = { lat: pin.latitude, lng: pin.longitude }
      bounds.extend(position)

      // Create colored pin element
      const pinEl = document.createElement('div')
      pinEl.style.cssText = `
        width: 28px; height: 28px;
        background-color: ${GOOGLE_PIN_COLORS[pin.type] || GOOGLE_PIN_COLORS.default};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer;
      `

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position,
        content: pinEl,
        title: pin.label,
      })

      // Info window
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="font-size: 14px; font-family: system-ui, sans-serif;">
            <p style="font-weight: 600; margin: 0;">${pin.label}</p>
            ${pin.sublabel ? `<p style="color: #64748b; font-size: 12px; margin: 2px 0 0;">${pin.sublabel}</p>` : ''}
          </div>
        `,
      })

      marker.addListener('click', () => {
        infoWindow.open({ anchor: marker, map })
        pin.onClick?.()
      })

      markersRef.current.push(marker)
    })

    // Fit bounds
    if (pins.length > 1) {
      map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 })
    } else if (pins.length === 1) {
      map.setCenter({ lat: pins[0].latitude, lng: pins[0].longitude })
      map.setZoom(zoom ?? 12)
    }
  }, [pins, zoom])

  useEffect(() => {
    initMap()
  }, [initMap])

  return (
    <div
      className={`rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 ${className}`}
      style={{ height }}
    >
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  )
}

// ── Leaflet Helpers ───────────────────────────────────────────────────

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
  deal: createColoredIcon('#3B82F6'),
  property: createColoredIcon('#10B981'),
  market: createColoredIcon('#F59E0B'),
  default: defaultIcon,
}

function FitBounds({ pins }: { pins: MapPin[] }): null {
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

// ── Leaflet Map Component ─────────────────────────────────────────────

function LeafletMapView({ pins, height, className, zoom }: PropertyMapProps) {
  const mapRef = useRef<L.Map | null>(null)

  const centerLat = pins.reduce((sum, p) => sum + p.latitude, 0) / pins.length
  const centerLng = pins.reduce((sum, p) => sum + p.longitude, 0) / pins.length

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
        <FitBounds pins={pins} />

        {pins.map((pin) => (
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

// ── Main Component (auto-selects Google Maps or Leaflet) ──────────────

export default function PropertyMap({
  pins,
  height = '400px',
  className = '',
  zoom,
}: PropertyMapProps) {
  const [mapProvider, setMapProvider] = useState<'loading' | 'google' | 'leaflet'>('loading')
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    let cancelled = false

    getMapsConfig().then(async (config) => {
      if (cancelled) return
      if (config.enabled && config.google_maps_api_key) {
        try {
          await loadGoogleMaps(config.google_maps_api_key)
          if (!cancelled) {
            setApiKey(config.google_maps_api_key)
            setMapProvider('google')
          }
        } catch {
          if (!cancelled) setMapProvider('leaflet')
        }
      } else {
        if (!cancelled) setMapProvider('leaflet')
      }
    }).catch(() => {
      if (!cancelled) setMapProvider('leaflet')
    })

    return () => { cancelled = true }
  }, [])

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

  if (mapProvider === 'loading') {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 rounded-lg border border-slate-200 ${className}`}
        style={{ height }}
      >
        <div className="text-slate-400 text-sm">Loading map...</div>
      </div>
    )
  }

  if (mapProvider === 'google') {
    return (
      <GoogleMapView
        pins={validPins}
        height={height}
        className={className}
        zoom={zoom}
        apiKey={apiKey}
      />
    )
  }

  return (
    <LeafletMapView
      pins={validPins}
      height={height}
      className={className}
      zoom={zoom}
    />
  )
}
