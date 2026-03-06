#!/usr/bin/env bash
# check-env.sh — Verify all required environment variables are set before deploy.
# Usage: ./scripts/check-env.sh
set -euo pipefail

MISSING=0

check_var() {
  local var_name="$1"
  local val="${!var_name:-}"
  if [ -z "$val" ]; then
    printf "  \033[31mMISSING\033[0m: %s\n" "$var_name"
    MISSING=$((MISSING + 1))
  else
    printf "  \033[32mOK\033[0m:      %s\n" "$var_name"
  fi
}

echo ""
echo "=== REI Hub Required Variables ==="
echo ""
check_var REI_DATABASE_URL
check_var REI_JWT_SECRET
check_var STRIPE_SECRET_KEY
check_var STRIPE_WEBHOOK_SECRET
check_var SENDGRID_API_KEY
check_var REI_PLUGIN_SHARED_SECRET
check_var REI_HUB_URL

echo ""
echo "==============================="
if [ "$MISSING" -gt 0 ]; then
  printf "  \033[31m%d variable(s) missing\033[0m\n" "$MISSING"
  echo "==============================="
  echo ""
  exit 1
else
  printf "  \033[32mAll variables set\033[0m\n"
  echo "==============================="
  echo ""
  exit 0
fi
