# ContentHub Multi-Business Support Implementation Plan

**Date:** March 14, 2026
**Requested by:** Chris
**Status:** PLANNING — Approved by Chris, ready to build

---

## Chris's Businesses

### Business 1: TriPoint Home Solutions
- **Description:** Real estate solutions company helping investors, homeowners, and buyers
- **Mission/Core Values:** (Chris to fill in during setup)
- **WordPress sites (3):**
  - Investors site
  - Homeowners site
  - Home buyers site
- **Audience Segments (Customer Avatars):**
  - **Investors** — Real estate investors looking for off-market deals, wholesale properties, fix-and-flip opportunities. Motivated by ROI, deal flow, market data.
  - **Homeowners** — Homeowners facing financial difficulty, foreclosure, tax liens, or life transitions. Need guidance, empathy, and clear options.
  - **Home Buyers** — First-time or experienced home buyers looking for properties. Value education, market insights, and trustworthy guidance.
- **Content Types:**
  - Educational Tips — How-to guides, advice
  - Market Updates — Local market data, trends, neighborhood spotlights
  - Success Stories — Case studies, testimonials, before/after deals

### Business 2: REIFundamentals
- **Description:** Real estate education and technology company
- **Mission/Core Values:** (Chris to fill in during setup)
- **WordPress sites (2):**
  - REIFundamentals (education site)
  - REIFundamentalsHub (software platform)
- **Audience Segments (Customer Avatars):**
  - **New Investors** — People just getting into real estate investing. Need step-by-step education, confidence building, foundational knowledge.
  - **Experienced Investors** — Active investors looking for advanced strategies, technology tools, and efficiency. Value time-saving, automation, data.
  - **Hub Users** — Software users of REIFundamentalsHub. Need product tips, feature updates, how-to guides, best practices.
- **Content Types:**
  - Educational Content — Strategies, tutorials, investing concepts
  - Product Updates — New Hub features, announcements, how-to guides
  - Industry News — Market analysis, regulatory changes, investment trends

---

## How It Will Work (User Experience)

### 1. Business Selector (header dropdown)
```
[TriPoint Home Solutions ▼]
├─ REIFundamentals
├─ ──────────────
├─ + Create New Business
```
- Always visible at the top of the app
- Switch between businesses — everything on the page updates

### 2. Settings → WordPress Section
```
WordPress Sites for: TriPoint Home Solutions

  Investors Site | https://invest.tripointhomesolutions.org | Connected ✓ | [Edit] [Remove]
  Homeowners Site | https://tripointhomesolutions.org       | Connected ✓ | [Edit] [Remove]
  Buyers Site     | https://buyers.tripoint.com              | Not Set Up  | [Set Up]

  [+ Add Another WordPress Site]
```
- Each business shows its own list of WordPress sites
- Click "Add Another" to connect a new one — give it a label + URL + credentials

### 3. Settings → Social Media Section
```
Social Media for: TriPoint Home Solutions

  Facebook  | TriPoint Home Solutions Page | Connected ✓ | [Disconnect]
  Instagram | @tripoint_homes              | Connected ✓ | [Disconnect]
  LinkedIn  | Not connected                             | [Connect]
  X         | Not connected                             | [Connect]
```
- Each business has its own set of social accounts
- Connect different Facebook Pages, Instagram accounts per business

### 4. ContentHub — Creating Content
```
Business: [TriPoint Home Solutions ▼]
Content Type: [Market Updates ▼]

Paste URL or text: [________________________]
[Generate Content Waterfall]
```
- Pick your business first, then content type
- Generated content gets tagged to that business + type

### 5. ContentHub — Publishing
```
Publish "March 2026 Market Report" to:

WordPress Sites:
  ☑ Investors Site (invest.tripointhomesolutions.org)
  ☑ Homeowners Site (tripointhomesolutions.org)
  ☐ Buyers Site (buyers.tripoint.com)

Social Media:
  ☑ Facebook — TriPoint Home Solutions Page
  ☑ Instagram — @tripoint_homes
  ☐ LinkedIn — Not connected
```
- Only shows WordPress sites and social accounts for the CURRENT business
- Check whichever ones you want to publish to

---

## Architecture Overview

### Current State (everything per-user)
```
User (Chris)
  ├─ 1 WordPress site
  ├─ 1 set of social accounts (Facebook, Instagram, LinkedIn, X)
  └─ Content (all mixed together)
```

### New State (organized by business)
```
User (Chris)
  ├─ Business: TriPoint Home Solutions
  │   ├─ WordPress: Investors Site
  │   ├─ WordPress: Homeowners Site
  │   ├─ WordPress: Buyers Site
  │   ├─ Social: Facebook, Instagram, LinkedIn, X
  │   ├─ Content Types: Tips, Market Updates, Success Stories
  │   └─ Content Library (filtered to this business)
  │
  └─ Business: REIFundamentals
      ├─ WordPress: REIFundamentals Site
      ├─ WordPress: REIFundamentalsHub Site
      ├─ Social: Facebook, Instagram, LinkedIn, X
      ├─ Content Types: Educational, Product Updates, Industry News
      └─ Content Library (filtered to this business)
```

---

## Database Changes

### New Tables

#### 1. `businesses`
```
id                UUID (primary key)
user_id           int (FK → users)
name              string — "TriPoint Home Solutions"
description       text (nullable) — what the business does
mission_statement text (nullable) — core values / mission
is_active         boolean (default true)
is_primary        boolean (default false) — the default-selected business
created_at        datetime
updated_at        datetime
```

#### 2. `business_wordpress_sites` (multiple per business)
```
id                      UUID (primary key)
business_id             UUID (FK → businesses)
user_id                 int (FK → users)
label                   string — "Investors Site", "Homeowners Site"
wp_url_encrypted        text
wp_username_encrypted   text
wp_app_password_encrypted text
is_active               boolean (default true)
created_at              datetime
updated_at              datetime
```
**Key change from v1 plan:** No unique constraint on business_id — allows MULTIPLE WordPress sites per business.

#### 3. `business_social_connections` (per platform per business)
```
id                      UUID (primary key)
business_id             UUID (FK → businesses)
user_id                 int (FK → users)
platform                string — facebook, instagram, linkedin, x
account_name            string — "@tripoint_homes"
account_id              string — platform ID
access_token_encrypted  text
refresh_token_encrypted text (nullable)
token_data_json         text (nullable) — extra token info (e.g., page_access_token)
token_expires_at        datetime (nullable)
is_active               boolean (default true)
created_at              datetime
updated_at              datetime
```

#### 4. `content_types` (per business)
```
id              UUID (primary key)
business_id     UUID (FK → businesses)
user_id         int (FK → users)
name            string — "Market Updates"
description     text (nullable)
color           string (nullable) — hex color for UI tag
sort_order      int (default 0)
created_at      datetime
updated_at      datetime
```

### Modified Tables

#### `content_entries` — add columns
```
business_id     UUID (FK → businesses) — which business this content belongs to
content_type_id UUID (FK → content_types, nullable) — which content type
```

#### `content_publish_records` — add columns
```
business_id             UUID (FK → businesses)
wordpress_site_id       UUID (FK → business_wordpress_sites, nullable)
```

#### `users` — add column
```
current_business_id     UUID (FK → businesses, nullable) — last-selected business
```

---

## API Endpoints

### Business CRUD
- `POST   /api/businesses` — Create business
- `GET    /api/businesses` — List all businesses
- `GET    /api/businesses/{id}` — Get business details
- `PATCH  /api/businesses/{id}` — Update business
- `DELETE /api/businesses/{id}` — Soft delete

### WordPress (per business, multiple sites)
- `POST   /api/businesses/{id}/wordpress` — Add WordPress site
- `GET    /api/businesses/{id}/wordpress` — List WordPress sites
- `PATCH  /api/businesses/{id}/wordpress/{site_id}` — Update site
- `DELETE /api/businesses/{id}/wordpress/{site_id}` — Remove site
- `POST   /api/businesses/{id}/wordpress/{site_id}/test` — Test connection

### Social Media (per business)
- `GET    /api/businesses/{id}/social/status` — All platform statuses
- `GET    /api/businesses/{id}/social/{platform}/auth-url` — Start OAuth
- `POST   /api/businesses/{id}/social/{platform}/callback` — Complete OAuth
- `POST   /api/businesses/{id}/social/{platform}/disconnect` — Disconnect

### Content Types
- `POST   /api/businesses/{id}/content-types` — Create
- `GET    /api/businesses/{id}/content-types` — List
- `PATCH  /api/businesses/{id}/content-types/{type_id}` — Update
- `DELETE /api/businesses/{id}/content-types/{type_id}` — Delete

### ContentHub (add business_id filter)
- All existing content endpoints get `?business_id=` parameter
- Publish endpoint gets `wordpress_site_id` to pick which site

---

## Migration Strategy

### Existing Data Safety
1. On first login after update, auto-create a default business from user's company name
2. Migrate existing WordPress config → new `business_wordpress_sites` table
3. Migrate existing social connections → new `business_social_connections` table
4. Migrate existing content → set `business_id` to default business
5. Keep old columns as fallback for 60 days

### Rollback Plan
- Old user-level columns stay intact
- If anything breaks, old code paths still work
- Feature flag to enable/disable multi-business UI

---

## Implementation Phases

### Phase 1: Database + Backend (Week 1-2)
- [ ] Create new database tables via migrations
- [ ] Build business CRUD endpoints
- [ ] Build multi-WordPress endpoints
- [ ] Build per-business social OAuth flow
- [ ] Build content types endpoints
- [ ] Migration script for existing data
- [ ] Test all endpoints

### Phase 2: Frontend UI (Week 2-3)
- [ ] Business selector dropdown component
- [ ] Settings: WordPress sites list per business
- [ ] Settings: Social media per business
- [ ] Settings: Content types management
- [ ] ContentHub: business + content type selectors
- [ ] ContentHub: publish to specific WordPress sites

### Phase 3: Polish + Testing (Week 3-4)
- [ ] End-to-end testing with Chris
- [ ] Edge cases (no businesses, switching, etc.)
- [ ] Content library filtering by business + type
- [ ] Seed default content types per business

---

## Success Criteria

- [ ] Chris can create TriPoint + REIFundamentals businesses
- [ ] Chris can add 3 WordPress sites to TriPoint, 2 to REIFundamentals
- [ ] Chris can connect different social accounts per business
- [ ] Chris can create content tagged to a business + content type
- [ ] Chris can publish to specific WordPress sites from the publish dialog
- [ ] Switching businesses shows only that business's data
- [ ] Existing data migrated safely to default business

---

**END OF PLAN**
