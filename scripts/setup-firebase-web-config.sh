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
#   ./scripts/setup-firebase-web-config.sh --env prod
#
# You can also pass values as environment variables:
#   FIREBASE_API_KEY=AIza... FIREBASE_AUTH_DOMAIN=project.firebaseapp.com \
#     ./scripts/setup-firebase-web-config.sh --env beta
set -euo pipefail

usage() {
  echo "Usage: $0 --env <beta|prod|all> [--vault <vault-name>] [--skip-github]"
  echo ""
  echo "Options:"
  echo "  --env          Target environment (beta, prod, or all)"
  echo "  --vault        Key Vault name (default: buddyburn-<env>-kv)"
  echo "  --skip-github  Skip setting GitHub environment secrets"
  echo ""
  echo "NOTE: Both beta and prod use the same Firebase project (buddyburn-beta)."
  echo "Use '--env all' to set config for both environments at once."
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

if [[ "$ENV" != "beta" && "$ENV" != "prod" && "$ENV" != "all" ]]; then
  echo "Error: --env must be 'beta', 'prod', or 'all'"
  exit 1
fi

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

echo "🔥 Firebase Web Config Setup"
echo ""
echo "Enter Firebase Web SDK config (from Firebase Console > Project Settings):"
echo ""
prompt_value FIREBASE_API_KEY "API Key"
prompt_value FIREBASE_AUTH_DOMAIN "Auth Domain"
prompt_value FIREBASE_PROJECT_ID "Project ID"
prompt_value FIREBASE_STORAGE_BUCKET "Storage Bucket"
prompt_value FIREBASE_MESSAGING_SENDER_ID "Messaging Sender ID"
prompt_value FIREBASE_APP_ID "App ID"

# Store config for a single environment
store_for_env() {
  local target_env="$1"
  local vault="${VAULT:-buddyburn-${target_env}-kv}"

  echo ""
  echo "📦 Storing in Azure Key Vault ($vault) for $target_env..."

  az keyvault secret set --vault-name "$vault" --name firebase-web-api-key --value "$FIREBASE_API_KEY" --output none
  az keyvault secret set --vault-name "$vault" --name firebase-web-auth-domain --value "$FIREBASE_AUTH_DOMAIN" --output none
  az keyvault secret set --vault-name "$vault" --name firebase-web-project-id --value "$FIREBASE_PROJECT_ID" --output none
  az keyvault secret set --vault-name "$vault" --name firebase-web-storage-bucket --value "$FIREBASE_STORAGE_BUCKET" --output none
  az keyvault secret set --vault-name "$vault" --name firebase-web-messaging-sender-id --value "$FIREBASE_MESSAGING_SENDER_ID" --output none
  az keyvault secret set --vault-name "$vault" --name firebase-web-app-id --value "$FIREBASE_APP_ID" --output none

  echo "  ✅ Key Vault secrets stored ($vault)"

  if [[ "$SKIP_GITHUB" == "false" ]]; then
    echo "📦 Storing in GitHub environment secrets ($target_env)..."

    echo "$FIREBASE_API_KEY" | gh secret set NEXT_PUBLIC_FIREBASE_API_KEY --env "$target_env"
    echo "$FIREBASE_AUTH_DOMAIN" | gh secret set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN --env "$target_env"
    echo "$FIREBASE_PROJECT_ID" | gh secret set NEXT_PUBLIC_FIREBASE_PROJECT_ID --env "$target_env"
    echo "$FIREBASE_STORAGE_BUCKET" | gh secret set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET --env "$target_env"
    echo "$FIREBASE_MESSAGING_SENDER_ID" | gh secret set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --env "$target_env"
    echo "$FIREBASE_APP_ID" | gh secret set NEXT_PUBLIC_FIREBASE_APP_ID --env "$target_env"

    echo "  ✅ GitHub environment secrets stored ($target_env)"
  fi
}

if [[ "$ENV" == "all" ]]; then
  store_for_env "beta"
  store_for_env "prod"
else
  store_for_env "$ENV"
fi

echo ""
echo "🎉 Done! Firebase Web config stored for $ENV."
echo ""
echo "Next steps:"
echo "  1. Trigger a deploy: gh workflow run deploy-web.yml"
echo "  2. Verify the login page works in the browser"
