# Buyer Linking + Retail Buyer Subject-To Fields

## Plan

### What we're building:
1. Buyer field on Deals and Tax Deals — second contact search filtered to buyer/investor roles
2. Retail Buyers "Subject-To Details" section — subject-to buying questions
3. Retail Buyers down payment and source of funds fields
4. Plaid tie-in — "Request Proof of Funds" button when buyer is linked

### Files to modify:

Backend (3 files):
- [ ] server/rei/models/crm.py — Add buyer_id, buyer_name, buyer_type + retail buyer fields
- [ ] server/rei/migrations/create_tables.py — Migration entries
- [ ] server/rei/api/crm_deals_routes.py — Pydantic model, field map, response builder

Frontend (2 files):
- [ ] src/types/index.ts — Add buyer + retail buyer fields to Deal interface
- [ ] src/components/Pipeline/NewDealModal.tsx — Buyer search, subject-to section, POF button
