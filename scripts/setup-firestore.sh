#!/usr/bin/env bash
# setup-firestore.sh — Enable Cloud Firestore API and create the default database
#
# Prerequisites:
#   - gcloud CLI installed and authenticated as a project Owner/Editor
#   - OR: firebase CLI with user-level auth (firebase login)
#
# Usage:
#   ./scripts/setup-firestore.sh
#   ./scripts/setup-firestore.sh --project patelr3-site --location nam5

set -euo pipefail

PROJECT="${1:---project}"
LOCATION="nam5"

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --location) LOCATION="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Default project
if [[ "$PROJECT" == "--project" || -z "$PROJECT" ]]; then
  PROJECT="patelr3-site"
fi

echo "=== Firestore Setup ==="
echo "Project:  $PROJECT"
echo "Location: $LOCATION"
echo ""

# Step 1: Enable the Firestore API
echo "Step 1: Enabling Cloud Firestore API..."
if command -v gcloud &>/dev/null; then
  gcloud services enable firestore.googleapis.com --project "$PROJECT"
  echo "  ✅ Firestore API enabled via gcloud"
else
  echo "  ⚠️  gcloud not found. Please enable manually:"
  echo "  https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=$PROJECT"
  echo ""
  read -rp "Press Enter once you've enabled the Firestore API..."
fi

# Step 2: Create the default Firestore database
echo ""
echo "Step 2: Creating default Firestore database in Native mode..."
if command -v firebase &>/dev/null; then
  firebase firestore:databases:create '(default)' --project "$PROJECT" --location "$LOCATION" && \
    echo "  ✅ Database created" || \
    echo "  ℹ️  Database may already exist (check output above)"
elif command -v gcloud &>/dev/null; then
  gcloud firestore databases create --project "$PROJECT" --location="$LOCATION" --type=firestore-native && \
    echo "  ✅ Database created" || \
    echo "  ℹ️  Database may already exist (check output above)"
else
  echo "  ⚠️  Neither firebase nor gcloud CLI found."
  echo "  Please create the database manually:"
  echo "  https://console.firebase.google.com/project/$PROJECT/firestore"
  echo "  → Create database → Native mode → $LOCATION"
fi

# Step 3: Verify
echo ""
echo "Step 3: Verifying Firestore access..."
if command -v firebase &>/dev/null; then
  firebase firestore:databases:list --project "$PROJECT" 2>/dev/null && \
    echo "  ✅ Firestore is accessible" || \
    echo "  ❌ Firestore verification failed"
fi

echo ""
echo "=== Done ==="
echo "After Firestore is enabled, redeploy the API to pick up the changes:"
echo "  gh workflow run deploy-api.yml"
echo ""
echo "Then verify with:"
echo "  curl https://burnbuddy-beta-api.arayosun.com/friends -H 'Authorization: Bearer <token>'"
