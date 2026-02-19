const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

interface TokenResponse {
  access_token: string
  token_type: string
  user_id: number
  email: string
  plan: string | null
}

interface UserResponse {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
  is_verified: boolean
  plan: string | null
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

export async function register(
  email: string,
  password: string,
  fullName?: string
): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name: fullName || null }),
  })
  return handleResponse<TokenResponse>(res)
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handleResponse<TokenResponse>(res)
}

export async function getMe(token: string): Promise<UserResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<UserResponse>(res)
}

export async function refreshToken(token: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  return handleResponse<TokenResponse>(res)
}
