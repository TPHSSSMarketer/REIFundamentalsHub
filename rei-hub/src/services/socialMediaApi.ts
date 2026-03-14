/**
 * Social Media API — frontend wrapper for OAuth + publishing.
 *
 * Mirrors backend routes in server/rei/api/social_media_routes.py
 */

import { getAuthHeader } from './auth';

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001';

// ── Types ───────────────────────────────────────────────────────────────

export type SocialPlatform = "facebook" | "linkedin" | "x" | "instagram";

export interface SocialAuthUrlResponse {
  auth_url: string;
}

export interface SocialStatusResponse {
  connected: boolean;
  account_name: string;
}

export interface SocialPublishResponse {
  success: boolean;
  post_id?: string;
  post_url?: string;
  error?: string;
}

// ── OAuth Flow ──────────────────────────────────────────────────────────

/** Get the OAuth redirect URL for a platform. */
export async function getSocialAuthUrl(
  platform: SocialPlatform
): Promise<SocialAuthUrlResponse> {
  const response = await fetch(`${BASE_URL}/api/social/${platform}/auth-url`, {
    method: 'GET',
    headers: getAuthHeader(),
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to get auth URL for ${platform}`);
  }
  return response.json();
}

/** Exchange the OAuth callback code for tokens (stores server-side). */
export async function submitSocialCallback(
  platform: SocialPlatform,
  code: string,
  codeVerifier?: string
): Promise<{ status?: string; success?: boolean; account_name?: string; error?: string }> {
  const body: Record<string, string> = { code };
  if (codeVerifier) body.code_verifier = codeVerifier;
  const response = await fetch(`${BASE_URL}/api/social/${platform}/callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Failed to submit callback for ${platform}`);
  }
  return response.json();
}

/** Check whether a platform is connected for the current user. */
export async function getSocialStatus(
  platform: SocialPlatform
): Promise<SocialStatusResponse> {
  const response = await fetch(`${BASE_URL}/api/social/${platform}/status`, {
    method: 'GET',
    headers: getAuthHeader(),
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to get status for ${platform}`);
  }
  return response.json();
}

/** Disconnect a social platform (clear tokens). */
export async function disconnectSocial(
  platform: SocialPlatform
): Promise<{ success: boolean }> {
  const response = await fetch(`${BASE_URL}/api/social/${platform}/disconnect`, {
    method: 'POST',
    headers: getAuthHeader(),
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to disconnect ${platform}`);
  }
  return response.json();
}

// ── Publishing ──────────────────────────────────────────────────────────

/** Publish content to a connected social platform. */
export async function publishToSocial(
  platform: SocialPlatform,
  content: string,
  imageUrl?: string
): Promise<SocialPublishResponse> {
  const body: Record<string, string> = { content };
  if (imageUrl) body.image_url = imageUrl;
  const response = await fetch(`${BASE_URL}/api/social/${platform}/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Failed to publish to ${platform}`);
  }
  return response.json();
}

// ── Convenience: fetch status for all platforms at once ─────────────────

export interface AllSocialStatuses {
  facebook: SocialStatusResponse;
  linkedin: SocialStatusResponse;
  x: SocialStatusResponse;
  instagram: SocialStatusResponse;
}

export async function getAllSocialStatuses(): Promise<AllSocialStatuses> {
  const platforms: SocialPlatform[] = [
    "facebook",
    "linkedin",
    "x",
    "instagram",
  ];
  const results = await Promise.allSettled(
    platforms.map((p) => getSocialStatus(p))
  );

  const fallback: SocialStatusResponse = {
    connected: false,
    account_name: "",
  };

  return {
    facebook:
      results[0].status === "fulfilled" ? results[0].value : fallback,
    linkedin:
      results[1].status === "fulfilled" ? results[1].value : fallback,
    x: results[2].status === "fulfilled" ? results[2].value : fallback,
    instagram:
      results[3].status === "fulfilled" ? results[3].value : fallback,
  };
}
