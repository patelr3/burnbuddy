#!/usr/bin/env bash
set -euo pipefail

# Remove OLD custom domains (buddyburn*.arayosun.com) from Azure Container Apps
# Run this AFTER the new domains are verified working.

OLD_DOMAINS=(
  "buddyburn-prod-web|buddyburn-prod|buddyburn.arayosun.com"
  "buddyburn-beta-web|buddyburn-beta|buddyburn-beta.arayosun.com"
  "buddyburn-prod-api|buddyburn-prod|buddyburn-api.arayosun.com"
  "buddyburn-beta-api|buddyburn-beta|buddyburn-beta-api.arayosun.com"
)

echo "=== Removing old buddyburn*.arayosun.com domains ==="
for entry in "${OLD_DOMAINS[@]}"; do
  IFS='|' read -r app rg hostname <<< "$entry"

  echo ""
  echo "--- Removing $hostname from $app ---"
  if az containerapp hostname delete \
    --name "$app" \
    --resource-group "$rg" \
    --hostname "$hostname" \
    --yes 2>&1; then
    echo "✅ Removed: $hostname"
  else
    echo "⚠️  Failed to remove $hostname (may not exist)"
  fi
done

echo ""
echo "=== Done ==="
echo "You can now delete the old DNS records in Cloudflare:"
echo "  - buddyburn.arayosun.com (CNAME + TXT asuid.buddyburn)"
echo "  - buddyburn-beta.arayosun.com (CNAME + TXT asuid.buddyburn-beta)"
echo "  - buddyburn-api.arayosun.com (CNAME + TXT asuid.buddyburn-api)"
echo "  - buddyburn-beta-api.arayosun.com (CNAME + TXT asuid.buddyburn-beta-api)"
