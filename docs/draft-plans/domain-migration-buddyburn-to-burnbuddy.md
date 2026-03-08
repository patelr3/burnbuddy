# Domain Migration: buddyburn → burnbuddy

Rename all custom domains from `buddyburn*.arayosun.com` to `burnbuddy*.arayosun.com`.

| Old Domain | New Domain |
|---|---|
| `buddyburn.arayosun.com` | `burnbuddy.arayosun.com` |
| `buddyburn-beta.arayosun.com` | `burnbuddy-beta.arayosun.com` |
| `buddyburn-api.arayosun.com` | `burnbuddy-api.arayosun.com` |
| `buddyburn-beta-api.arayosun.com` | `burnbuddy-beta-api.arayosun.com` |

Azure resource names (resource groups, container apps, Key Vaults, ACR) remain unchanged.

---

## Steps

### 1. Add new DNS records in Cloudflare

Add **TXT** records for domain validation (same verification token — it's per-environment, not per-hostname):

| Type | Name | Value |
|---|---|---|
| TXT | `asuid.burnbuddy` | `CAD5E97203EDE3062FA3D8CD8B7499EE757F66085A6FD6870E30124030627C0B` |
| TXT | `asuid.burnbuddy-beta` | `CAD5E97203EDE3062FA3D8CD8B7499EE757F66085A6FD6870E30124030627C0B` |
| TXT | `asuid.burnbuddy-api` | `CAD5E97203EDE3062FA3D8CD8B7499EE757F66085A6FD6870E30124030627C0B` |
| TXT | `asuid.burnbuddy-beta-api` | `CAD5E97203EDE3062FA3D8CD8B7499EE757F66085A6FD6870E30124030627C0B` |

Add **CNAME** records (set Cloudflare proxy to **OFF / grey cloud** during setup):

| Type | Name | Target |
|---|---|---|
| CNAME | `burnbuddy` | `buddyburn-prod-web.bravepebble-01e00c04.eastus.azurecontainerapps.io` |
| CNAME | `burnbuddy-beta` | `buddyburn-beta-web.gentletree-d517e76a.eastus.azurecontainerapps.io` |
| CNAME | `burnbuddy-api` | `buddyburn-prod-api.bravepebble-01e00c04.eastus.azurecontainerapps.io` |
| CNAME | `burnbuddy-beta-api` | `buddyburn-beta-api.gentletree-d517e76a.eastus.azurecontainerapps.io` |

### 2. Register new domains in Azure Container Apps

```bash
./scripts/setup-custom-domains.sh
```

This adds the new hostnames and binds managed TLS certificates.

### 3. Deploy the API with updated CORS origins

The CORS defaults in `services/api/src/index.ts` have been updated. Deploy to both environments:

```bash
gh workflow run deploy-api.yml   # triggers beta then prod
```

### 4. Update Firebase authorized domains

In the [Firebase Console](https://console.firebase.google.com/) → Authentication → Settings → Authorized domains:

- **Add**: `burnbuddy.arayosun.com`, `burnbuddy-beta.arayosun.com`
- Keep the old domains until migration is verified

### 5. Verify new domains work

```bash
# Web
curl -sI https://burnbuddy-beta.arayosun.com | head -5
curl -sI https://burnbuddy.arayosun.com | head -5

# API
curl -s https://burnbuddy-beta-api.arayosun.com/health
curl -s https://burnbuddy-api.arayosun.com/health
```

Also test login flow in a browser at `https://burnbuddy-beta.arayosun.com/login`.

### 6. Remove old domains

After verifying the new domains work:

```bash
./scripts/remove-old-domains.sh
```

Then in Cloudflare, delete the old DNS records:
- `buddyburn.arayosun.com` (CNAME + TXT `asuid.buddyburn`)
- `buddyburn-beta.arayosun.com` (CNAME + TXT `asuid.buddyburn-beta`)
- `buddyburn-api.arayosun.com` (CNAME + TXT `asuid.buddyburn-api`)
- `buddyburn-beta-api.arayosun.com` (CNAME + TXT `asuid.buddyburn-beta-api`)

And in Firebase Console → Authentication → Settings → Authorized domains, remove the old `buddyburn*.arayosun.com` entries.

### 7. Enable Cloudflare proxy

Once certificates are provisioned and verified, switch the new CNAME records to **proxied (orange cloud)** and ensure Cloudflare SSL mode is set to **Full (Strict)**.

---

## Code changes included

| File | Change |
|---|---|
| `scripts/setup-custom-domains.sh` | Updated domain names + DNS record comments |
| `scripts/remove-old-domains.sh` | **New** — removes old domains from Azure |
| `services/api/src/index.ts` | CORS default origins updated |
| `.github/copilot-instructions.md` | Environment table URLs updated |
| `CLAUDE.md` | Environment table URLs updated |
| `AGENTS.md` | Environment table URLs updated |
| `scripts/setup-firestore.sh` | Example curl URL updated |
| `docs/prds/complete/burnbuddiesv1.md` | Domain reference updated |

**Not changed** (historical archives): `scripts/ralph/archive/` files are left as-is since they document what happened at the time.
