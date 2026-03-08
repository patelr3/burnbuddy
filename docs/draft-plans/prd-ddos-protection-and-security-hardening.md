# PRD: DDoS Protection & Security Hardening

## Introduction

Add infrastructure-level DDoS protection, WAF rules, and bot protection to burnbuddy using Cloudflare (already the DNS provider) and Azure networking controls. Currently, all four custom domains (web + API × beta + prod) resolve via Cloudflare DNS but traffic may bypass Cloudflare and hit Azure Container Apps directly. This PRD hardens the edge and origin to prevent volumetric attacks, application-layer attacks, and bot abuse — all without application code changes.

## Goals

- Protect all four public endpoints against volumetric and application-layer DDoS attacks
- Enable Cloudflare WAF managed rulesets to block common exploits (SQLi, XSS, etc.)
- Enable bot detection and mitigation for login/signup and API endpoints
- Lock down Azure Container Apps origins so only Cloudflare IP ranges can reach them
- Apply consistent security posture across both beta and production environments
- Achieve all of the above with zero application code changes

## User Stories

### US-001: Enable Cloudflare Proxy on All Domains
**Description:** As an operator, I want all four custom domains proxied through Cloudflare so that traffic is filtered at the edge before reaching Azure.

**Acceptance Criteria:**
- [ ] All four CNAME records (`burnbuddy`, `burnbuddy-beta`, `burnbuddy-api`, `burnbuddy-beta-api`) have Cloudflare proxy enabled (orange cloud)
- [ ] SSL/TLS mode set to "Full (Strict)" for the `arayosun.com` zone
- [ ] Websites and API respond correctly through the proxy (no certificate errors, no redirect loops)
- [ ] Verify `cf-ray` header is present in responses (confirms traffic flows through Cloudflare)

### US-002: Configure Cloudflare DDoS Protection Settings
**Description:** As an operator, I want Cloudflare's DDoS protection tuned for burnbuddy's traffic patterns so that attacks are mitigated automatically.

**Acceptance Criteria:**
- [ ] HTTP DDoS Attack Protection ruleset is enabled with sensitivity set to "High"
- [ ] L3/L4 DDoS protection is active (automatic with proxy)
- [ ] Rate limiting rule created: max 100 requests/minute per IP to API endpoints (`burnbuddy-api.arayosun.com` and `burnbuddy-beta-api.arayosun.com`)
- [ ] Rate limiting rule created: max 20 requests/minute per IP to auth-related paths (`/api/auth/*`, `/login`, `/signup`)
- [ ] Challenge action configured for rate limit violations (not hard block — allows legitimate users to retry)

### US-003: Enable Cloudflare WAF Managed Rulesets
**Description:** As an operator, I want Cloudflare WAF rules active so that common web exploits are blocked at the edge.

**Acceptance Criteria:**
- [ ] Cloudflare Managed Ruleset enabled (covers OWASP Top 10: SQLi, XSS, RCE, etc.)
- [ ] Cloudflare OWASP Core Ruleset enabled with paranoia level 1 (balanced — avoids false positives)
- [ ] WAF rules applied to all four domains
- [ ] Verified no false positives on normal app usage (login, signup, workout logging, profile updates)
- [ ] WAF events visible in Cloudflare Security > Events dashboard

### US-004: Configure Bot Protection
**Description:** As an operator, I want bot traffic identified and challenged so that automated abuse is mitigated.

**Acceptance Criteria:**
- [ ] Bot Fight Mode enabled for the zone
- [ ] "Definitely automated" traffic action set to "Block"
- [ ] "Likely automated" traffic action set to "Managed Challenge"
- [ ] "Verified bots" (e.g., Googlebot) allowed through
- [ ] API health check endpoints (`/health`) excluded from bot challenges via a WAF custom rule (skip action)

### US-005: Lock Down Azure Container Apps Origins
**Description:** As an operator, I want Azure Container Apps to reject traffic that doesn't come from Cloudflare so that attackers can't bypass the edge.

**Acceptance Criteria:**
- [ ] Azure Container Apps ingress configured to only accept traffic from [Cloudflare IP ranges](https://www.cloudflare.com/ips/)
- [ ] Direct access to `*.azurecontainerapps.io` FQDNs is blocked or restricted
- [ ] Document the approach (IP restriction via Azure networking or Cloudflare Authenticated Origin Pulls)
- [ ] Verify: requests through custom domains work; direct requests to Azure FQDNs are rejected
- [ ] CI/CD workflows updated if they use raw Azure FQDNs for health checks (use internal/managed identity access instead)

### US-006: Configure Security Headers via Cloudflare
**Description:** As an operator, I want security headers added at the edge so that browsers enforce security policies without app code changes.

**Acceptance Criteria:**
- [ ] Cloudflare Transform Rule adds these headers to all responses:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] Headers verified via `curl -I` on all four domains
- [ ] No conflicts with existing application headers

### US-007: Set Up Security Monitoring & Alerting
**Description:** As an operator, I want visibility into attacks and security events so that I can respond to incidents.

**Acceptance Criteria:**
- [ ] Cloudflare email notifications enabled for DDoS attacks (under Notifications)
- [ ] Cloudflare notification for WAF block spikes (high volume of blocked requests)
- [ ] Document a runbook: what to do when an alert fires (check Security > Events, adjust rules if false positive, escalate if sustained attack)
- [ ] Verify alerts fire by reviewing Cloudflare notification settings

## Functional Requirements

- FR-1: All four custom domains (`burnbuddy.arayosun.com`, `burnbuddy-beta.arayosun.com`, `burnbuddy-api.arayosun.com`, `burnbuddy-beta-api.arayosun.com`) must be proxied through Cloudflare
- FR-2: SSL/TLS encryption mode must be "Full (Strict)" to prevent downgrade attacks
- FR-3: Cloudflare DDoS protection must be enabled at both L3/L4 and L7 (HTTP) layers
- FR-4: Rate limiting must apply per-IP with different thresholds for general API (100 req/min) vs auth endpoints (20 req/min)
- FR-5: WAF managed rulesets (Cloudflare Managed + OWASP Core) must be active on all domains
- FR-6: Bot Fight Mode must be enabled; definitely-automated traffic must be blocked
- FR-7: Azure Container Apps must reject traffic not originating from Cloudflare IP ranges
- FR-8: Security response headers (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy) must be injected at the edge
- FR-9: Health check endpoints (`/health`) must be excluded from bot challenges and rate limiting
- FR-10: Cloudflare notifications must alert on DDoS attacks and WAF block spikes

## Non-Goals

- No application code changes (no helmet.js, no express-rate-limit, no middleware changes)
- No Azure Front Door or Application Gateway — Cloudflare handles the edge
- No changes to Firebase Auth flow or JWT verification
- No CAPTCHA integration at the application level
- No changes to CI/CD pipelines beyond updating health check URLs if needed
- No paid Cloudflare plan features (design for Free/Pro tier; note where Business/Enterprise features would help)

## Dependencies

None

## Technical Considerations

- **Cloudflare is already the DNS provider** for `arayosun.com` — no DNS migration needed
- **Azure Container Apps IP restriction**: Container Apps doesn't natively support IP allowlisting on ingress. Options:
  1. **Cloudflare Authenticated Origin Pulls** (mTLS between Cloudflare and origin) — most secure
  2. **Azure Container Apps Environment VNet + NSG** — requires VNet integration (may need environment recreation)
  3. **Application-level header check** (`CF-Connecting-IP` header validation) — but this PRD is infra-only
  - Recommendation: Start with Cloudflare Authenticated Origin Pulls (no Azure networking changes). Document VNet approach as a future enhancement.
- **CI/CD impact**: Deployment workflows use raw Azure FQDNs for integration tests. If origin is locked down, tests must either:
  1. Continue using Azure FQDNs (if only custom domain ingress is restricted)
  2. Switch to using the Cloudflare-proxied domains
  3. Use Azure Container Apps internal endpoints
- **Cloudflare plan tier**: Free tier includes basic DDoS protection, 5 WAF custom rules, and Bot Fight Mode. Rate limiting requires Pro ($20/mo) or custom rules on Free. WAF managed rulesets require Pro.
- **Certificate compatibility**: Azure-managed certificates + Cloudflare proxy with "Full (Strict)" SSL works if Cloudflare trusts Azure's CA (it does for Azure-issued certs). Alternatively, use Cloudflare Origin Certificates on the Azure side.

## Success Metrics

- All traffic to custom domains flows through Cloudflare (100% `cf-ray` header presence)
- DDoS attacks mitigated at edge with zero application impact
- WAF blocks common exploit attempts (verifiable in Security > Events)
- Direct-to-origin access is prevented or restricted
- Zero downtime during implementation (changes are DNS/config-level)
- No false positives affecting normal user workflows (login, workout logging, etc.)

## Open Questions

- What Cloudflare plan tier is currently active for `arayosun.com`? Free vs Pro affects available WAF/rate-limiting features.
- Are the Cloudflare proxy (orange cloud) toggles already enabled on any of the domains, or are they all currently DNS-only (grey cloud)?
- Is the Azure Container Apps environment VNet-integrated, or is it using the default managed networking? This affects origin lockdown options.
- Should the raw Azure `*.azurecontainerapps.io` FQDNs remain accessible for debugging, or should they be fully locked down?
