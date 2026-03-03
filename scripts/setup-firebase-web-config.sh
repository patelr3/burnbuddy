#!/usr/bin/env bash
# scripts/setup-firebase-web-config.sh
#
# Stores Firebase Web SDK config in Azure Key Vault and optionally in
# GitHub Actions environment secrets. Run this once per environment after
# creating the Firebase project and registering a Web App.
#
# Prerequisites:
#   - az cli authenticated (`az login`)
#   - gh cli authenticated (`gh auth login`)
#   - Firebase Web App registered in Firebase Console
#
# Usage:
#   ./scripts/setup-firebase-web-config.sh --env beta
#   ./scripts/setup-firebase-web-config.sh --env production
#
# You can also pass values as environment variables:
#   FIREBASE_API_KEY=AIza... FIREBASE_AUTH_DOMAIN=project.firebaseapp.com \
#     ./scripts/setup-firebase-web-config.sh --env beta
set -euo pipefail

usage() {
  echo "Usage: $0 --env <beta|production> [--vault <vault-name>] [--skip-github]"
  echo ""
  echo "Options:"
  echo "  --env          Target environment (beta or production)"
  echo "  --vault        Key Vault name (default: buddyburn-<env>-kv)"
  echo "  --skip-github  Skip setting GitHub environment secrets"
  echo ""
  echo "Firebase config can be provided interactively or via env vars:"
  echo "  FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,"
  echo "  FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID"
  exit 1
}

ENV=""
VAULT=""
SKIP_GITHUB=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENV="$2"; shift 2 ;;
    --vault) VAULT="$2"; shift 2 ;;
    --skip-github) SKIP_GITHUB=true; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$ENV" ]]; then
  echo "Error: --env is required"
  usage
fi

if [[ "$ENV" != "beta" && "$ENV" != "production" ]]; then
  echo "Error: --env must be 'beta' or 'production'"
  exit 1
fi

# Default vault name
if [[ -z "$VAULT" ]]; then
  VAULT="buddyburn-${ENV}-kv"
fi

echo "🔥 Firebase Web Config Setup — $ENV"
echo "   Key Vault: $VAULT"
echo ""

# Prompt for values if not set in environment
prompt_value() {
  local var_name="$1"
  local display_name="$2"
  local current="${!var_name:-}"

  if [[ -n "$current" ]]; then
    echo "  $display_name: $current (from env)"
  else
    read -rp "  $display_name: " current
    if [[ -z "$current" ]]; then
      echo "Error: $display_name is required"
      exit 1
    fi
    eval "$var_name='$current'"
  fi
}

echo "Enter Firebase Web SDK config (from Firebase Console > Project Settings):"
echo ""
prompt_value FIREBASE_API_KEY "API Key"
prompt_value FIREBASE_AUTH_DOMAIN "Auth Domain"
prompt_value FIREBASE_PROJECT_ID "Project ID"
prompt_value FIREBASE_STORAGE_BUCKET "Storage Bucket"
prompt_value FIREBASE_MESSAGING_SENDER_ID "Messaging Sender ID"
prompt_value FIREBASE_APP_ID "App ID"

echo ""
echo "📦 Storing in Azure Key Vault ($VAULT)..."

az keyvault secret set --vault-name "$VAULT" --name firebase-web-api-key --value "$FIREBASE_API_KEY" --output none
az keyvault secret set --vault-name "$VAULT" --name firebase-web-auth-domain --value "$FIREBASE_AUTH_DOMAIN" --output none
az keyvault secret set --vault-name "$VAULT" --name firebase-web-project-id --value "$FIREBASE_PROJECT_ID" --output none
az keyvault secret set --vault-name "$VAULT" --name firebase-web-storage-bucket --value "$FIREBASE_STORAGE_BUCKET" --output none
az keyvault secret set --vault-name "$VAULT" --name firebase-web-messaging-sender-id --value "$FIREBASE_MESSAGING_SENDER_ID" --output none
az keyvault secret set --vault-name "$VAULT" --name firebase-web-app-id --value "$FIREBASE_APP_ID" --output none

echo "  ✅ Key Vault secrets stored"

if [[ "$SKIP_GITHUB" == "false" ]]; then
  echo ""
  echo "📦 Storing in GitHub environment secrets ($ENV)..."

  echo "$FIREBASE_API_KEY" | gh secret set NEXT_PUBLIC_FIREBASE_API_KEY --env "$ENV"
  echo "$FIREBASE_AUTH_DOMAIN" | gh secret set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN --env "$ENV"
  echo "$FIREBASE_PROJECT_ID" | gh secret set NEXT_PUBLIC_FIREBASE_PROJECT_ID --env "$ENV"
  echo "$FIREBASE_STORAGE_BUCKET" | gh secret set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET --env "$ENV"
  echo "$FIREBASE_MESSAGING_SENDER_ID" | gh secret set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --env "$ENV"
  echo "$FIREBASE_APP_ID" | gh secret set NEXT_PUBLIC_FIREBASE_APP_ID --env "$ENV"

  echo "  ✅ GitHub environment secrets stored"
fi

echo ""
echo "🎉 Done! Firebase Web config stored for $ENV."
echo ""
echo "Next steps:"
echo "  1. Trigger a deploy: gh workflow run deploy-web.yml"
echo "  2. Verify the login page works in the browser"
