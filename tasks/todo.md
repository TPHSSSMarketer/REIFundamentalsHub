# Deal Files, Manual Buyer Emails, Zip Code Markets

## What We're Building

### 1. Change Auto-Email to Manual Review & Send
- Remove the automatic email when a deal moves to "Under Contract"
- Instead: run the matching, store matched buyers on the deal
- On the Deal Detail page: show a "Matched Buyers" section
- User reviews matched buyers, previews the email, and clicks "Send" when ready

### 2. Deal File Manager (Photos + Documents)
- New `deal_files` table for ALL deal files (photos, contracts, inspections, etc.)
- Each file has a `category` for organization
- **Photo categories:** front, back, kitchen, living_room, bedroom_1, bedroom_2, bedroom_3, bathroom_1, bathroom_2, garage, yard, miscellaneous
- **Document categories:** contract, inspection, title, appraisal, insurance, disclosure, other
- Images compressed on upload using Pillow (resize to max 1920px, JPEG quality 85)
- Base64 storage in database (with compression, sizes stay reasonable)
- Cloud storage can be added later as an upgrade path

### 3. Deal Detail Page — Photos Tab
- New "Photos" tab on the Deal Detail page
- Grid layout organized by room/area category
- Upload button per category (drag & drop or click)
- Thumbnail gallery with lightbox preview
- Delete capability per photo

### 4. Zip Code → Market Mapping (SuperAdmin)
- New `market_zip_codes` table: zip_code, market_name, state
- SuperAdmin CSV upload endpoint to bulk import/update zip codes
- New tab on Admin page: "Markets / Zip Codes"
- Buyer matching service updated to use zip code → market lookup
- When matching: convert deal's zip code to market name, compare against buyer's target markets

## Files to Create/Modify

### Backend:
- [ ] `server/rei/models/crm.py` — DealFile model + DealBuyerMatch model
- [ ] `server/rei/models/user.py` — MarketZipCode model
- [ ] `server/rei/migrations/create_tables.py` — New table migrations
- [ ] `server/rei/api/crm_deals_routes.py` — Remove auto-email, store matches instead
- [ ] `server/rei/api/crm_deal_files_routes.py` — NEW: File upload/list/delete CRUD
- [ ] `server/rei/api/crm_deal_matches_routes.py` — NEW: View matches + send emails
- [ ] `server/rei/api/superadmin_routes.py` — Add zip code CSV upload endpoint
- [ ] `server/rei/services/buyer_matching.py` — Update to use zip-to-market lookup
- [ ] `server/main.py` — Register new routers

### Frontend:
- [ ] `src/types/index.ts` — DealFile + DealBuyerMatch types
- [ ] `src/components/Pipeline/DealDetailPage.tsx` — Photos tab + Matched Buyers section
- [ ] `src/components/Admin/AdminPage.tsx` — Markets/Zip Codes tab
