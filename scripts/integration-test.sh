#!/usr/bin/env bash
# API Integration Test Script
# Usage: BASE_URL=https://my-api.example.com ./scripts/integration-test.sh
#
# Verifies live API endpoints return expected status codes.
# Exits non-zero on any test failure.

set -euo pipefail

BASE_URL="${BASE_URL:?BASE_URL environment variable is required (e.g. https://my-api.example.com)}"
# Strip trailing slash
BASE_URL="${BASE_URL%/}"

PASS=0
FAIL=0
ERRORS=()

# ── helpers ──────────────────────────────────────────────────────────────────

check_status() {
  local method="$1"
  local path="$2"
  local expected="$3"
  local description="$4"
  local body="${5:-}"

  local curl_args=(-s -o /dev/null -w "%{http_code}" -X "$method")
  if [[ -n "$body" ]]; then
    curl_args+=(-H "Content-Type: application/json" -d "$body")
  fi
  curl_args+=("${BASE_URL}${path}")

  local status
  status=$(curl "${curl_args[@]}" --max-time 15 2>/dev/null) || status="000"

  if [[ "$status" == "$expected" ]]; then
    echo "  ✅ PASS  $method $path → $status (expected $expected)  $description"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL  $method $path → $status (expected $expected)  $description"
    ERRORS+=("$method $path: got $status, expected $expected — $description")
    FAIL=$((FAIL + 1))
  fi
}

# ── test suite ───────────────────────────────────────────────────────────────

echo "============================================"
echo " API Integration Tests"
echo " Target: $BASE_URL"
echo "============================================"
echo ""

echo "── Waiting for API to be ready ──"
MAX_RETRIES=6
RETRY_DELAY=10
for i in $(seq 1 "$MAX_RETRIES"); do
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${BASE_URL}/health" 2>/dev/null) || status="000"
  if [[ "$status" == "200" ]]; then
    echo "  ✅ API is ready (attempt $i)"
    break
  fi
  if [[ "$i" == "$MAX_RETRIES" ]]; then
    echo "  ❌ API not ready after $MAX_RETRIES attempts"
  else
    echo "  ⏳ Attempt $i: got $status, retrying in ${RETRY_DELAY}s..."
    sleep "$RETRY_DELAY"
  fi
done
echo ""

echo "── Health Check ──"
check_status GET /health 200 "Health endpoint should return 200"

echo ""
echo "── Unauthenticated requests should return 401 ──"
check_status POST /users   401 "Create user without token"  '{"displayName":"test"}'
check_status GET  /users/me 401 "Get current user without token"
check_status GET  /friends  401 "List friends without token"
check_status POST /workouts 401 "Start workout without token" '{"type":"run"}'

# ── summary ──────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo " Results: $PASS passed, $FAIL failed"
echo "============================================"

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo ""
  echo "Failures:"
  for err in "${ERRORS[@]}"; do
    echo "  • $err"
  done
  exit 1
fi

echo ""
echo "All integration tests passed! 🎉"
exit 0
