# Multi-User Seat Management — Implementation Plan

## Overview
Account owners on Pro (3 seats) and Team (unlimited seats) plans can invite users to their account via email. Invited users get their own login but share the owner's workspace (same contacts, deals, pipeline, etc.) and inherit the owner's plan features without being billed separately.

## Architecture
- **Parent-child model**: Add `owner_id` (nullable FK → users.id) on User table
  - `owner_id IS NULL` → account owner
  - `owner_id IS NOT NULL` → team member under that owner
- **Invitations table**: Tracks pending email invites with expiring tokens
- **Shared workspace**: Team members use the owner's ID as the data partition key for Supabase queries
- **Feature gating**: `_can_access()` checks the owner's plan for team members

---

## Phase 1: Database Layer
- [ ] Add `owner_id` column to User model (nullable Integer FK to users.id)
- [ ] Create `Invitation` model (id, owner_id, email, token, status, created_at, expires_at, accepted_at, joined_user_id)
- [ ] Add migration entries in `create_tables.py` (IF NOT EXISTS)
- [ ] Add `team_members` relationship on User model

## Phase 2: Backend API
- [ ] Create `server/rei/api/team_routes.py` with endpoints:
  - `GET /team/members` — list team members (owner only)
  - `GET /team/seats` — seat capacity info
  - `POST /team/invite` — send invite email
  - `GET /team/invite/{token}` — validate invite token (public)
  - `POST /team/accept` — register as team member via invite token (public)
  - `DELETE /team/members/{member_id}` — remove team member
  - `GET /team/pending` — list pending invitations
  - `DELETE /team/invite/{invitation_id}` — cancel pending invite
- [ ] Register team_router in `server/main.py`
- [ ] Modify `_can_access()` in `billing_routes.py` — team members inherit owner's plan
- [ ] Modify `billing_status` endpoint — include `owner_id`, `max_seats`, `seats_used`
- [ ] Add invite email template in `services/email.py`

## Phase 3: Frontend — Invite Accept Page
- [ ] Create `src/components/Auth/AcceptInvitePage.tsx` — public page at `/accept-invite?token=xyz`
- [ ] Add route in App router
- [ ] Create `src/services/teamApi.ts` — API service for all team endpoints

## Phase 4: Frontend — Team Management UI
- [ ] Create `src/components/Settings/TeamManagementTab.tsx`
  - Current members table (email, name, joined date, remove button)
  - Invite form (email input + send button)
  - Pending invitations list (email, expires, cancel button)
  - Seat capacity display ("2 of 3 seats used")
- [ ] Add "Team" tab to Settings page (only show for Pro/Team plans)

## Phase 5: Shared Workspace — Supabase Query Changes
- [ ] Add `workspace_user_id()` helper — returns `owner_id || user.id`
- [ ] Update Supabase queries to use workspace_user_id for data partitioning
- [ ] Ensure team members see owner's contacts, deals, pipeline, documents

## Phase 6: Edge Cases & Polish
- [ ] Prevent downgrade if team members exceed new plan's seat limit
- [ ] Handle owner account deletion (cascade team members)
- [ ] Invitation expiration (14 days)
- [ ] Prevent duplicate invites to same email
- [ ] Prevent inviting existing account owners

## Phase 7: Verification
- [ ] Test invite → accept → login flow end-to-end
- [ ] Verify team member sees owner's data
- [ ] Verify seat limits enforced
- [ ] Test removal of team member
- [ ] Deploy to Railway and verify in production
