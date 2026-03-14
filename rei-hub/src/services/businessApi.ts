/**
 * Multi-business API service
 *
 * Handles all business-related operations including:
 * - Business CRUD (create, read, update, delete, switch)
 * - WordPress site management
 * - Audience segment management
 * - Content type management
 * - Module settings per business
 *
 * All endpoints use apiFetchWithAuth for automatic token refresh and error handling.
 */

import { apiFetchWithAuth } from './fetchWithAuth'

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Core business entity
 */
export interface Business {
  id: string
  name: string
  description: string | null
  mission_statement: string | null
  is_active: boolean
  is_primary: boolean
  created_at: string
  updated_at: string
  audience_segments_count?: number
  content_types_count?: number
}

/**
 * WordPress site configuration for a business
 */
export interface BusinessWordPressSite {
  id: string
  business_id: string
  label: string
  wp_url: string
  wp_username: string
  wp_app_password: string
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Audience segment for targeting content
 */
export interface AudienceSegment {
  id: string
  business_id: string
  name: string
  description: string | null
  pain_points: string | null
  goals: string | null
  tone: string | null
  demographics: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

/**
 * Content type/category for organizing content
 */
export interface ContentType {
  id: string
  business_id: string
  name: string
  description: string | null
  color: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

/**
 * Module enable/disable settings per business
 */
export interface ModuleBusinessSetting {
  id: string
  user_id: number
  business_id: string
  module: string // 'lead_center' | 'ai_studio' | 'content_hub'
  is_enabled: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// BUSINESS CRUD
// ============================================================================

/**
 * List all businesses for the current user
 */
export async function listBusinesses(): Promise<{
  businesses: Business[]
  count: number
}> {
  return apiFetchWithAuth('/api/businesses')
}

/**
 * Get a single business by ID (includes audience/content counts)
 */
export async function getBusiness(id: string): Promise<Business> {
  return apiFetchWithAuth(`/api/businesses/${id}`)
}

/**
 * Create a new business
 */
export async function createBusiness(data: {
  name: string
  description?: string
  mission_statement?: string
}): Promise<Business> {
  return apiFetchWithAuth('/api/businesses', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * Update an existing business
 */
export async function updateBusiness(
  id: string,
  data: Partial<{
    name: string
    description: string
    mission_statement: string
    is_primary: boolean
  }>,
): Promise<Business> {
  return apiFetchWithAuth(`/api/businesses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

/**
 * Delete a business (soft or hard delete depends on backend)
 */
export async function deleteBusiness(id: string): Promise<void> {
  return apiFetchWithAuth(`/api/businesses/${id}`, {
    method: 'DELETE',
  })
}

/**
 * Switch the active/primary business
 */
export async function switchBusiness(id: string): Promise<Business> {
  return apiFetchWithAuth(`/api/businesses/${id}/switch`, {
    method: 'POST',
  })
}

// ============================================================================
// WORDPRESS SITES
// ============================================================================

/**
 * List all WordPress sites for a business
 */
export async function listWordPressSites(
  businessId: string,
): Promise<{
  sites: BusinessWordPressSite[]
  count: number
}> {
  return apiFetchWithAuth(`/api/businesses/${businessId}/wordpress`)
}

/**
 * Add a WordPress site to a business
 */
export async function addWordPressSite(
  businessId: string,
  data: {
    label: string
    wp_url: string
    wp_username: string
    wp_app_password: string
  },
): Promise<BusinessWordPressSite> {
  return apiFetchWithAuth(`/api/businesses/${businessId}/wordpress`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * Update a WordPress site configuration
 */
export async function updateWordPressSite(
  businessId: string,
  siteId: string,
  data: Partial<{
    label: string
    wp_url: string
    wp_username: string
    wp_app_password: string
    is_active: boolean
  }>,
): Promise<BusinessWordPressSite> {
  return apiFetchWithAuth(
    `/api/businesses/${businessId}/wordpress/${siteId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  )
}

/**
 * Delete a WordPress site from a business
 */
export async function deleteWordPressSite(
  businessId: string,
  siteId: string,
): Promise<void> {
  return apiFetchWithAuth(
    `/api/businesses/${businessId}/wordpress/${siteId}`,
    {
      method: 'DELETE',
    },
  )
}

// ============================================================================
// AUDIENCE SEGMENTS
// ============================================================================

/**
 * List all audience segments for a business
 */
export async function listAudienceSegments(
  businessId: string,
): Promise<{
  segments: AudienceSegment[]
  count: number
}> {
  return apiFetchWithAuth(`/api/businesses/${businessId}/audiences`)
}

/**
 * Create a new audience segment
 */
export async function createAudienceSegment(
  businessId: string,
  data: {
    name: string
    description?: string
    pain_points?: string
    goals?: string
    tone?: string
    demographics?: string
  },
): Promise<AudienceSegment> {
  return apiFetchWithAuth(`/api/businesses/${businessId}/audiences`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * Update an audience segment
 */
export async function updateAudienceSegment(
  businessId: string,
  audienceId: string,
  data: Partial<{
    name: string
    description: string
    pain_points: string
    goals: string
    tone: string
    demographics: string
  }>,
): Promise<AudienceSegment> {
  return apiFetchWithAuth(
    `/api/businesses/${businessId}/audiences/${audienceId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  )
}

/**
 * Delete an audience segment
 */
export async function deleteAudienceSegment(
  businessId: string,
  audienceId: string,
): Promise<void> {
  return apiFetchWithAuth(
    `/api/businesses/${businessId}/audiences/${audienceId}`,
    {
      method: 'DELETE',
    },
  )
}

// ============================================================================
// CONTENT TYPES
// ============================================================================

/**
 * List all content types for a business
 */
export async function listContentTypes(
  businessId: string,
): Promise<{
  types: ContentType[]
  count: number
}> {
  return apiFetchWithAuth(`/api/businesses/${businessId}/content-types`)
}

/**
 * Create a new content type
 */
export async function createContentType(
  businessId: string,
  data: {
    name: string
    description?: string
    color?: string
  },
): Promise<ContentType> {
  return apiFetchWithAuth(`/api/businesses/${businessId}/content-types`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * Update a content type
 */
export async function updateContentType(
  businessId: string,
  typeId: string,
  data: Partial<{
    name: string
    description: string
    color: string
  }>,
): Promise<ContentType> {
  return apiFetchWithAuth(
    `/api/businesses/${businessId}/content-types/${typeId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  )
}

/**
 * Delete a content type
 */
export async function deleteContentType(
  businessId: string,
  typeId: string,
): Promise<void> {
  return apiFetchWithAuth(
    `/api/businesses/${businessId}/content-types/${typeId}`,
    {
      method: 'DELETE',
    },
  )
}

// ============================================================================
// MODULE SETTINGS
// ============================================================================

/**
 * Get module settings for all businesses
 */
export async function getModuleSettings(): Promise<{
  settings: ModuleBusinessSetting[]
  count: number
}> {
  return apiFetchWithAuth('/api/module-settings')
}

/**
 * Update a module setting for a business
 */
export async function updateModuleSetting(data: {
  business_id: string
  module: string
  is_enabled: boolean
}): Promise<ModuleBusinessSetting> {
  return apiFetchWithAuth('/api/module-settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
