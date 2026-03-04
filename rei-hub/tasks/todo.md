# Social Media Publishing Integration — Implementation Plan

## Overview
Add direct posting to **Facebook Pages**, **LinkedIn**, **X (Twitter)**, and **Instagram** from ContentHub. Each platform uses OAuth 2.0 so your users connect their own accounts, then can publish their generated content with one click.

---

## What Each Platform Requires

| Platform | OAuth Type | Posting Scope | Free Limits | Key Requirement |
|----------|-----------|---------------|-------------|-----------------|
| **Facebook** | OAuth 2.0 → Page Token | `pages_manage_posts` | Unlimited posts | Must post to a **Page** (not personal profile). User must be a Page admin. |
| **LinkedIn** | OAuth 2.0 (3-legged) | `w_member_social` | Unlimited posts | Posts to the user's personal LinkedIn profile. |
| **X (Twitter)** | OAuth 2.0 with PKCE | `tweet.write` | 1,500 tweets/month (free tier) | Free tier = write-only. Must set app to "Read & Write." |
| **Instagram** | Via Facebook Graph API | `instagram_content_publish` | 25 posts/day | Must be a **Business** account linked to a Facebook Page. Text-only not supported — requires an image URL. |

---

## Phase 1: Backend Infrastructure

### 1A. Add User model fields for social tokens
**File:** `server/rei/models/user.py`

Add after the Dropbox fields (~line 247):
```
facebook_page_token   — Text, nullable (long-lived page access token as JSON)
facebook_connected    — Boolean, default False
linkedin_token        — Text, nullable (JSON with access_token, refresh_token, expires_at)
linkedin_connected    — Boolean, default False
x_twitter_token       — Text, nullable (JSON with access_token, refresh_token)
x_twitter_connected   — Boolean, default False
instagram_token       — Text, nullable (JSON — uses Facebook page token + IG user ID)
instagram_connected   — Boolean, default False
```

### 1B. Add SuperAdmin credential providers
**Files:** `server/rei/models/credentials.py`, `server/rei/config.py`, `src/services/superadminApi.ts`

New providers (admin enters their developer app credentials):
- `facebook_oauth` — App ID, App Secret, Redirect URI
- `linkedin_oauth` — Client ID, Client Secret, Redirect URI
- `x_twitter_oauth` — Client ID, Client Secret, Redirect URI (OAuth 2.0 PKCE)
- `instagram_oauth` — (shares Facebook app credentials, just flag it)

### 1C. Create backend OAuth routes
**New file:** `server/rei/api/social_media_routes.py`

For each platform, 4 endpoints:
- `GET /social/{platform}/auth-url` — returns the OAuth URL to redirect user to
- `POST /social/{platform}/callback` — exchanges auth code for tokens, stores in user record
- `GET /social/{platform}/status` — returns { connected: bool, account_name: string }
- `POST /social/{platform}/disconnect` — clears tokens from user record

### 1D. Create backend posting services
**New files (one per platform):**
- `server/rei/services/facebook_posting_service.py`
  - `post_to_facebook_page(content, page_token)` → calls Graph API `/{page-id}/feed`
  - Token refresh logic (long-lived tokens last ~60 days)
- `server/rei/services/linkedin_posting_service.py`
  - `post_to_linkedin(content, access_token)` → calls Posts API
- `server/rei/services/x_posting_service.py`
  - `post_to_x(content, access_token)` → calls `/2/tweets`
- `server/rei/services/instagram_posting_service.py`
  - `post_to_instagram(content, image_url, ig_user_id, page_token)` → 2-step: create media container → publish

### 1E. Create posting routes
**Same file:** `server/rei/api/social_media_routes.py`

- `POST /social/{platform}/publish` — accepts `{ content: string, image_url?: string }`, calls the appropriate service

---

## Phase 2: Frontend Integration

### 2A. Create frontend API service
**New file:** `src/services/socialMediaApi.ts`
- `getSocialAuthUrl(platform)` → GET
- `submitSocialCallback(platform, code)` → POST
- `getSocialStatus(platform)` → GET
- `disconnectSocial(platform)` → POST
- `publishToSocial(platform, content, imageUrl?)` → POST

### 2B. Add "Social Accounts" section to Settings page
**File:** `src/components/Settings/Settings.tsx`

New card between Cloud Storage and Currency Converter with:
- Facebook — Connect/Disconnect button (shows page name when connected)
- LinkedIn — Connect/Disconnect button (shows profile name)
- X (Twitter) — Connect/Disconnect button (shows @handle)
- Instagram — Connect/Disconnect button (shows IG username)
- Each uses the same OAuth flow pattern as Google Drive/Dropbox

### 2C. Add publish buttons to ContentHub
**File:** `src/components/ContentHub/ContentHub.tsx`

Replace the single "Publish to WordPress" button with a **Publish dropdown** that shows:
- Publish to WordPress (existing)
- Publish to Facebook (only if connected, only on facebook tab)
- Publish to LinkedIn (only if connected, only on linkedin tab)
- Publish to X (only if connected, applies to facebook/linkedin/instagram tabs with character trim)
- Publish to Instagram (only if connected, only on instagram tab — will warn if no image)

Each button shows connected/disconnected status and a quick "Connect in Settings" link if not connected.

---

## Phase 3: Verification
- [ ] Python syntax check on all new/modified backend files
- [ ] Vite frontend build succeeds
- [ ] OAuth flow pattern matches existing Google Drive/Dropbox pattern
- [ ] All 4 platforms appear in SuperAdmin credentials page
- [ ] Settings page shows all 4 social account connect buttons
- [ ] ContentHub shows publish buttons for connected platforms

---

## File Summary

**New files (8):**
1. `server/rei/api/social_media_routes.py` — OAuth + publish routes
2. `server/rei/services/facebook_posting_service.py`
3. `server/rei/services/linkedin_posting_service.py`
4. `server/rei/services/x_posting_service.py`
5. `server/rei/services/instagram_posting_service.py`
6. `src/services/socialMediaApi.ts` — frontend API wrapper

**Modified files (6):**
1. `server/rei/models/user.py` — add social token fields
2. `server/rei/models/credentials.py` — add OAuth providers
3. `server/rei/config.py` — add env vars
4. `server/main.py` — register social_media_router
5. `src/services/superadminApi.ts` — add provider metadata
6. `src/components/Settings/Settings.tsx` — add Social Accounts section
7. `src/components/ContentHub/ContentHub.tsx` — add publish buttons
