/**
 * Email Template API — CRUD operations for admin-editable email templates.
 */

import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ──────────────────────────────────────────────────────────

export interface EmailTemplateStatus {
  template_type: string
  display_name: string
  category: string
  description: string
  variables: string[]
  cta_text: string
  cta_url_template: string
  is_custom: boolean
  subject: string
  body_html: string
  updated_at: string | null
}

export interface EmailTemplateDetail extends EmailTemplateStatus {
  default_subject: string
  default_body_html: string
}

export interface EmailTemplatePreview {
  subject: string
  html: string
}

// ── API Functions ──────────────────────────────────────────────────

/** Fetch all template types with their current content and status. */
export async function getEmailTemplates(): Promise<EmailTemplateStatus[]> {
  const res = await fetch(`${BASE_URL}/api/superadmin/email-templates`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to fetch templates: ${res.status}`)
  return res.json()
}

/** Fetch a single template with its default and custom versions. */
export async function getEmailTemplate(
  templateType: string
): Promise<EmailTemplateDetail> {
  const res = await fetch(
    `${BASE_URL}/api/superadmin/email-templates/${templateType}`,
    {
      headers: getAuthHeader(),
      credentials: 'include',
    }
  )
  if (!res.ok) throw new Error(`Failed to fetch template: ${res.status}`)
  return res.json()
}

/** Save a custom template (creates or updates). */
export async function saveEmailTemplate(
  templateType: string,
  data: { subject: string; body_html: string }
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(
    `${BASE_URL}/api/superadmin/email-templates/${templateType}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      credentials: 'include',
      body: JSON.stringify(data),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to save template: ${res.status}`)
  }
  return res.json()
}

/** Reset a template to default (deletes custom version). */
export async function resetEmailTemplate(
  templateType: string
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(
    `${BASE_URL}/api/superadmin/email-templates/${templateType}`,
    {
      method: 'DELETE',
      headers: getAuthHeader(),
      credentials: 'include',
    }
  )
  if (!res.ok) throw new Error(`Failed to reset template: ${res.status}`)
  return res.json()
}

/** Render a template with sample data for live preview. */
export async function previewEmailTemplate(
  templateType: string,
  data: { subject: string; body_html: string }
): Promise<EmailTemplatePreview> {
  const res = await fetch(
    `${BASE_URL}/api/superadmin/email-templates/${templateType}/preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      credentials: 'include',
      body: JSON.stringify(data),
    }
  )
  if (!res.ok) throw new Error(`Failed to preview template: ${res.status}`)
  return res.json()
}

/** Send a test email using the current template to the logged-in admin. */
export async function testEmailTemplate(
  templateType: string
): Promise<{ ok: boolean; sent_to: string }> {
  const res = await fetch(
    `${BASE_URL}/api/superadmin/email-templates/${templateType}/test`,
    {
      method: 'POST',
      headers: getAuthHeader(),
      credentials: 'include',
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to send test email: ${res.status}`)
  }
  return res.json()
}
