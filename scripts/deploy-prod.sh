#!/usr/bin/env bash
# scripts/deploy-prod.sh — Local production deploy to Azure Container Apps
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Docker running locally
#   - AZURE_SUBSCRIPTION_ID set in environment or ~/.azure/config
#
# Usage:
#   ./scripts/deploy-prod.sh [IMAGE_TAG]
#
#   IMAGE_TAG defaults to the current git short SHA.
#
# Required environment variables (or set defaults below):
#   ACR_NAME              Azure Container Registry name (default: burnbuddyacr)
#   AZURE_RESOURCE_GROUP  Resource group (default: buddyburn-prod)
#   API_APP_NAME          API Container App name (default: buddyburn-prod-api)
#   WEB_APP_NAME          Web Container App name (default: buddyburn-prod-web)

set -euo pipefail

ACR_NAME="${ACR_NAME:-burnbuddyacr}"
ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"
AZURE_RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-buddyburn-prod}"
API_APP_NAME="${API_APP_NAME:-buddyburn-prod-api}"
WEB_APP_NAME="${WEB_APP_NAME:-buddyburn-prod-web}"
TAG="${1:-$(git rev-parse --short HEAD)}"

echo "==> Deploying tag: $TAG"
echo "==> Resource group: $AZURE_RESOURCE_GROUP"

echo ""
echo "==> Logging in to ACR..."
az acr login --name "$ACR_NAME"

echo ""
echo "==> Building and pushing API image..."
docker build \
  -f services/api/Dockerfile \
  -t "$ACR_LOGIN_SERVER/burnbuddy/api:$TAG" \
  .
docker push "$ACR_LOGIN_SERVER/burnbuddy/api:$TAG"

echo ""
echo "==> Building and pushing web image..."
docker build \
  -f apps/web/Dockerfile \
  -t "$ACR_LOGIN_SERVER/burnbuddy/web:$TAG" \
  .
docker push "$ACR_LOGIN_SERVER/burnbuddy/web:$TAG"

echo ""
echo "==> Deploying API to Container App..."
az containerapp update \
  --name "$API_APP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --image "$ACR_LOGIN_SERVER/burnbuddy/api:$TAG"

echo ""
echo "==> Deploying web to Container App..."
az containerapp update \
  --name "$WEB_APP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --image "$ACR_LOGIN_SERVER/burnbuddy/web:$TAG"

echo ""
echo "==> Deploy complete! Tag: $TAG"
