#!/usr/bin/env bash
set -euo pipefail

# Setup custom domains for Azure Container Apps
# Prerequisites: Add these TXT records in Cloudflare DNS first:
#
#   Type  Name                       Value
#   TXT   asuid.burnbuddy            CAD5E97203EDE3062FA3D8CD8B7499EE757F66085A6FD6870E30124030627C0B
#   TXT   asuid.burnbuddy-beta       CAD5E97203EDE3062FA3D8CD8B7499EE757F66085A6FD6870E30124030627C0B
#   TXT   asuid.burnbuddy-api        CAD5E97203EDE3062FA3D8CD8B7499EE757F66085A6FD6870E30124030627C0B
#   TXT   asuid.burnbuddy-beta-api   CAD5E97203EDE3062FA3D8CD8B7499EE757F66085A6FD6870E30124030627C0B
#
# Also ensure CNAME records exist (proxy OFF / grey cloud during setup):
#   burnbuddy          -> buddyburn-prod-web.bravepebble-01e00c04.eastus.azurecontainerapps.io
#   burnbuddy-beta     -> buddyburn-beta-web.gentletree-d517e76a.eastus.azurecontainerapps.io
#   burnbuddy-api      -> buddyburn-prod-api.bravepebble-01e00c04.eastus.azurecontainerapps.io
#   burnbuddy-beta-api -> buddyburn-beta-api.gentletree-d517e76a.eastus.azurecontainerapps.io

DOMAINS=(
  "buddyburn-prod-web|buddyburn-prod|burnbuddy.arayosun.com|buddyburn-prod-env"
  "buddyburn-beta-web|buddyburn-beta|burnbuddy-beta.arayosun.com|buddyburn-beta-env"
  "buddyburn-prod-api|buddyburn-prod|burnbuddy-api.arayosun.com|buddyburn-prod-env"
  "buddyburn-beta-api|buddyburn-beta|burnbuddy-beta-api.arayosun.com|buddyburn-beta-env"
)

for entry in "${DOMAINS[@]}"; do
  IFS='|' read -r app rg hostname env <<< "$entry"

  echo ""
  echo "=== Adding hostname $hostname to $app ==="
  if az containerapp hostname add \
    --name "$app" \
    --resource-group "$rg" \
    --hostname "$hostname" 2>&1; then
    echo "✅ Hostname added: $hostname"
  else
    echo "⚠️  Failed to add hostname $hostname (may already exist or TXT record missing)"
    continue
  fi

  echo "--- Binding managed certificate for $hostname ---"
  if az containerapp hostname bind \
    --name "$app" \
    --resource-group "$rg" \
    --hostname "$hostname" \
    --environment "$env" \
    --validation-method CNAME 2>&1; then
    echo "✅ Certificate bound: $hostname"
  else
    echo "⚠️  Failed to bind certificate for $hostname"
  fi
done

echo ""
echo "=== Done ==="
echo "After certificates are provisioned, you can enable Cloudflare proxy (orange cloud)."
echo "Set Cloudflare SSL mode to 'Full (Strict)' if using proxy."
