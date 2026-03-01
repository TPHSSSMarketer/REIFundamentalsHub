# Buyer Matching Database & Contact Enhancements

## What We're Building

### 1. Quick UI fixes (Investor Buyer pipeline)
- Relabel address fields to "Business Address" in Investor Buyer pipeline
- Add "Buying Entity / Company Name" field (the LLC or entity they'll buy in)

### 2. Contact enhancements
- Add `buyingEntity` field to all Contact cards (separate from their main `company`)
- Show buying entity in contact detail views

### 3. Buyer Criteria Database (the big one)
- New `buyer_criteria` table stores each buyer's preferences:
  - Property types wanted (SFR, multi-family, condo, land, etc.)
  - Target markets / areas
  - Budget range (min/max)
  - Property condition accepted (move-in ready, light rehab, full rehab, etc.)
  - Financing types (cash, conventional, hard money, etc.)
  - Timeline to purchase
  - Active flag (are they currently looking?)
- Buyer criteria editor on Contact detail page (for buyer-role contacts)
- Criteria also settable from Investor Buyer pipeline deal form

### 4. Deal-to-Buyer Matching + Email Notifications
- When a deal moves to "Under Contract" stage → automatically find all buyers whose criteria match
- Match on: property type, location/market, price within budget, condition
- Send each matched buyer an email: "New deal matches your criteria!"
- Email includes deal address, price, property type, and link to view

## Files to Modify

### Backend (Python/FastAPI):
- [ ] `server/rei/models/crm.py` — Add buying_entity to CrmContact + new BuyerCriteria model
- [ ] `server/rei/migrations/create_tables.py` — Column migrations
- [ ] `server/rei/api/crm_contacts_routes.py` — Handle buyingEntity in CRUD
- [ ] `server/rei/api/crm_buyer_criteria_routes.py` — NEW: Buyer criteria CRUD endpoints
- [ ] `server/rei/api/crm_deals_routes.py` — Stage change hook for matching
- [ ] `server/rei/services/buyer_matching.py` — NEW: Matching algorithm
- [ ] `server/rei/services/email.py` — Buyer match notification email template
- [ ] `server/rei/main.py` — Register new router

### Frontend (React/TypeScript):
- [ ] `src/types/index.ts` — Add buyingEntity + buyerCriteria to Contact
- [ ] `src/components/Pipeline/NewDealModal.tsx` — Business Address labels + buying entity field
- [ ] `src/components/CRM/ContactDetailPage.tsx` — Buyer criteria editor section
- [ ] `src/components/Contacts/NewContactModal.tsx` — Buyer criteria on creation (if role=buyer)
