#!/usr/bin/env bash
# smoke-test.sh — End-to-end smoke tests for REI Hub and Helm Hub.
# Usage: ./scripts/smoke-test.sh [base_url_rei] [base_url_helm]
set -euo pipefail

REI_BASE="${1:-http://localhost:8001}"
HELM_BASE="${2:-http://localhost:8000}"

PASSED=0
FAILED=0
TOKEN=""

pass() { printf "  \033[32mPASS\033[0m  %s\n" "$1"; PASSED=$((PASSED + 1)); }
fail() { printf "  \033[31mFAIL\033[0m  %s  (%s)\n" "$1" "$2"; FAILED=$((FAILED + 1)); }

# ── REI Hub Tests ─────────────────────────────────────────────────────────────

echo ""
echo "=== REI Hub Tests ($REI_BASE) ==="
echo ""

# 1. Health check
RESP=$(curl -sf "$REI_BASE/health" 2>/dev/null || true)
if echo "$RESP" | grep -q '"status".*"ok"'; then
  pass "REI /health returns status ok"
else
  fail "REI /health returns status ok" "got: $RESP"
fi

# 2. Plans endpoint — expect 200 with 3 plans
RESP=$(curl -sf "$REI_BASE/api/billing/plans" 2>/dev/null || true)
PLAN_COUNT=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('plans',{})))" 2>/dev/null || echo "0")
if [ "$PLAN_COUNT" = "3" ]; then
  pass "REI /api/billing/plans returns 3 plans"
else
  fail "REI /api/billing/plans returns 3 plans" "got $PLAN_COUNT plans"
fi

# 3. Register test user
RESP=$(curl -sf -X POST "$REI_BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoketest@test.com","password":"SmokeTest123!","name":"Smoke Test"}' 2>/dev/null || true)
REG_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || echo "")
if [ -n "$REG_TOKEN" ]; then
  pass "REI /api/auth/register returns token"
  TOKEN="$REG_TOKEN"
else
  fail "REI /api/auth/register returns token" "got: $RESP"
fi

# 4. Login
RESP=$(curl -sf -X POST "$REI_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoketest@test.com","password":"SmokeTest123!"}' 2>/dev/null || true)
LOGIN_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || echo "")
if [ -n "$LOGIN_TOKEN" ]; then
  pass "REI /api/auth/login returns token"
  TOKEN="$LOGIN_TOKEN"
else
  fail "REI /api/auth/login returns token" "got: $RESP"
fi

# 5. Billing status (authenticated)
if [ -n "$TOKEN" ]; then
  HTTP_CODE=$(curl -so /dev/null -w "%{http_code}" "$REI_BASE/api/billing/status" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    pass "REI /api/billing/status returns 200"
  else
    fail "REI /api/billing/status returns 200" "got HTTP $HTTP_CODE"
  fi
else
  fail "REI /api/billing/status returns 200" "skipped — no auth token"
fi

# 6. Feature gate — trial should be active
if [ -n "$TOKEN" ]; then
  RESP=$(curl -sf "$REI_BASE/api/billing/status" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null || true)
  IS_TRIAL=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('is_trial_active', False)).lower())" 2>/dev/null || echo "false")
  if [ "$IS_TRIAL" = "true" ]; then
    pass "REI billing status is_trial_active is true"
  else
    fail "REI billing status is_trial_active is true" "got: $IS_TRIAL"
  fi
else
  fail "REI billing status is_trial_active is true" "skipped — no auth token"
fi

# 7. Admin endpoint without admin — should 403
if [ -n "$TOKEN" ]; then
  HTTP_CODE=$(curl -so /dev/null -w "%{http_code}" "$REI_BASE/api/admin/stats" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "403" ]; then
    pass "REI /api/admin/stats returns 403 for non-admin"
  else
    fail "REI /api/admin/stats returns 403 for non-admin" "got HTTP $HTTP_CODE"
  fi
else
  fail "REI /api/admin/stats returns 403 for non-admin" "skipped — no auth token"
fi

# ── Helm Hub Tests ────────────────────────────────────────────────────────────

echo ""
echo "=== Helm Hub Tests ($HELM_BASE) ==="
echo ""

# 8. Health check
RESP=$(curl -sf "$HELM_BASE/api/health" 2>/dev/null || true)
if echo "$RESP" | grep -q '"status".*"ok"'; then
  pass "Helm /api/health returns status ok"
else
  fail "Helm /api/health returns status ok" "got: $RESP"
fi

# 9. Helm plans — expect 200 with 2 plans
RESP=$(curl -sf "$HELM_BASE/api/billing/helm/plans" 2>/dev/null || true)
PLAN_COUNT=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('plans',{})))" 2>/dev/null || echo "0")
if [ "$PLAN_COUNT" = "2" ]; then
  pass "Helm /api/billing/helm/plans returns 2 plans"
else
  fail "Helm /api/billing/helm/plans returns 2 plans" "got $PLAN_COUNT plans"
fi

# 10. Dashboard summary
HTTP_CODE=$(curl -so /dev/null -w "%{http_code}" "$HELM_BASE/api/dashboard/summary" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass "Helm /api/dashboard/summary returns 200"
else
  fail "Helm /api/dashboard/summary returns 200" "got HTTP $HTTP_CODE"
fi

# ── Cleanup ───────────────────────────────────────────────────────────────────

echo ""
echo "=== Cleanup ==="
echo "  Manual cleanup needed: smoketest@test.com"

# ── Summary ───────────────────────────────────────────────────────────────────

TOTAL=$((PASSED + FAILED))
echo ""
echo "==============================="
printf "  Results: \033[32m%d PASSED\033[0m / \033[31m%d FAILED\033[0m out of %d tests\n" "$PASSED" "$FAILED" "$TOTAL"
echo "==============================="
echo ""

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
exit 0
