/**
 * Authentication utilities for GHL API
 */

// Check if API key is configured
export function isApiKeyConfigured(): boolean {
  return !!import.meta.env.VITE_GHL_API_KEY
}

// Check if location ID is configured
export function isLocationConfigured(): boolean {
  return !!import.meta.env.VITE_GHL_LOCATION_ID
}

// Get current configuration status
export function getConfigStatus(): {
  hasApiKey: boolean
  hasLocationId: boolean
  isFullyConfigured: boolean
} {
  const hasApiKey = isApiKeyConfigured()
  const hasLocationId = isLocationConfigured()

  return {
    hasApiKey,
    hasLocationId,
    isFullyConfigured: hasApiKey && hasLocationId,
  }
}

// Store location ID in localStorage for multi-location support
export function setStoredLocationId(locationId: string): void {
  localStorage.setItem('ghl_location_id', locationId)
}

export function getStoredLocationId(): string | null {
  return localStorage.getItem('ghl_location_id')
}

export function clearStoredLocationId(): void {
  localStorage.removeItem('ghl_location_id')
}
