import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// Google Drive endpoints
export async function getGoogleDriveAuthUrl() {
  const res = await fetch(`${BASE_URL}/api/cloud-storage/google-drive/auth-url`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to get Google Drive auth URL')
  return res.json() as Promise<{ url: string }>
}

export async function submitGoogleDriveCode(code: string) {
  const res = await fetch(`${BASE_URL}/api/cloud-storage/google-drive/callback`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to connect Google Drive')
  return res.json() as Promise<{ connected: true }>
}

export async function disconnectGoogleDrive() {
  const res = await fetch(`${BASE_URL}/api/cloud-storage/google-drive/disconnect`, {
    method: 'POST',
    headers: getAuthHeader(),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to disconnect Google Drive')
  return res.json() as Promise<{ disconnected: true }>
}

export async function getGoogleDriveStatus() {
  const res = await fetch(`${BASE_URL}/api/cloud-storage/google-drive/status`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to get Google Drive status')
  return res.json() as Promise<{ connected: boolean; email?: string }>
}

// Dropbox endpoints
export async function getDropboxAuthUrl() {
  const res = await fetch(`${BASE_URL}/api/cloud-storage/dropbox/auth-url`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to get Dropbox auth URL')
  return res.json() as Promise<{ url: string }>
}

export async function submitDropboxCode(code: string) {
  const res = await fetch(`${BASE_URL}/api/cloud-storage/dropbox/callback`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to connect Dropbox')
  return res.json() as Promise<{ connected: true }>
}

export async function disconnectDropbox() {
  const res = await fetch(`${BASE_URL}/api/cloud-storage/dropbox/disconnect`, {
    method: 'POST',
    headers: getAuthHeader(),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to disconnect Dropbox')
  return res.json() as Promise<{ disconnected: true }>
}

export async function getDropboxStatus() {
  const res = await fetch(`${BASE_URL}/api/cloud-storage/dropbox/status`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to get Dropbox status')
  return res.json() as Promise<{ connected: boolean; email?: string }>
}
