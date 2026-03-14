/**
 * Per-business social media API service
 *
 * Business-scoped social connections — each business can have its own
 * Facebook, LinkedIn, X, and Instagram accounts. Falls back to the
 * legacy user-level connections in socialMediaApi.ts when no business
 * is selected.
 */

import { apiFetchWithAuth } from './fetchWithAuth'

// ============================================================================
// TYPES
// ============================================================================

export interface BusinessSocialConnection {
  id: string
  business_id: string
  platform: string // 'facebook' | 'linkedin' | 'x' | 'instagram'
  account_name: string | null
  account_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SocialStatus {
  connected: boolean
  account_name?: string
}

// ============================================================================
// LIST ALL CONNECTIONS
// ============================================================================

/**
 * List all social connections for a business
 */
export async function listBusinessSocialConnections(
  businessId: string,
): Promise<{ connections: BusinessSocialConnection[]; count: number }> {
  return apiFetchWithAuth(`/api/businesses/${businessId}/social`)
}

// ============================================================================
// OAUTH FLOW
// ============================================================================

/**
 * Get the OAuth authorization URL for a platform (scoped to a business)
 */
export async function getBusinessSocialAuthUrl(
  businessId: string,
  platform: string,
): Promise<{ auth_url: string }> {
  return apiFetchWithAuth(`/api/businesses/${businessId}/social/${platform}/auth-url`)
}

/**
 * Submit OAuth callback code for a platform (scoped to a business)
 */
export async function submitBusinessSocialCallback(
  businessId: string,
  platform: string,
  code: string,
  codeVerifier?: string,
): Promise<{ status: string; account_name?: string }> {
  const body: Record<string, string> = { code }
  if (codeVerifier) body.code_verifier = codeVerifier
  return apiFetchWithAuth(`/api/businesses/${businessId}/social/${platform}/callback`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ============================================================================
// STATUS & DISCONNECT
// ============================================================================

/**
 * Check connection status for a specific platform on a business
 */
export async function getBusinessSocialStatus(
  businessId: string,
  platform: string,
): Promise<SocialStatus> {
  return apiFetchWithAuth(`/api/businesses/${businessId}/social/${platform}/status`)
}

/**
 * Get statuses for all 4 platforms at once
 */
export async function getAllBusinessSocialStatuses(
  businessId: string,
): Promise<Record<string, SocialStatus>> {
  const platforms = ['facebook', 'linkedin', 'x', 'instagram']
  const results = await Promise.all(
    platforms.map((p) =>
      getBusinessSocialStatus(businessId, p).catch(() => ({ connected: false })),
    ),
  )
  const statuses: Record<string, SocialStatus> = {}
  platforms.forEach((p, i) => {
    statuses[p] = results[i]
  })
  return statuses
}

/**
 * Disconnect a platform from a business
 */
export async function disconnectBusinessSocial(
  businessId: string,
  platform: string,
): Promise<{ status: string }> {
  return apiFetchWithAuth(`/api/businesses/${businessId}/social/${platform}/disconnect`, {
    method: 'POST',
  })
}

// ============================================================================
// PUBLISH
// ============================================================================

/**
 * Publish content to a platform using business-level connection
 */
export async function publishToBusinessSocial(
  businessId: string,
  platform: string,
  content: string,
  imageUrl?: string,
): Promise<{ status: string; post_id?: string; error?: string }> {
  const body: Record<string, string> = { content }
  if (imageUrl) body.image_url = imageUrl
  return apiFetchWithAuth(`/api/businesses/${businessId}/social/${platform}/publish`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
