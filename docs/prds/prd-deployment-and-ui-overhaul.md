# PRD: Deployment Pipeline Fix, Security Hardening & UI Overhaul

## Introduction

The BurnBuddy web deployment pipeline is currently broken (Key Vault access denied in E2E tests, and production deploys without waiting for beta E2E to pass). This PRD covers fixing and verifying the web CI/CD pipeline end-to-end, replacing Azure client secrets with federated identity (OIDC), gating production deployments on beta E2E success, migrating Firebase config to Azure Key Vault runtime secrets, adopting FirebaseUI for the login page, adding Tailwind CSS across all pages, and adding a secrets-management rule to CLAUDE.md.

## Goals

- Fix the broken web deployment pipeline so it runs green end-to-end (quality → beta deploy → beta E2E → prod deploy → prod E2E)
- Gate production deployment on beta E2E test success (currently skipped)
- Replace Azure AD client secret authentication with OIDC workload identity federation in all GitHub Actions workflows
- Replace the custom login page with the official FirebaseUI drop-in auth widget
- Add Tailwind CSS and do a styling pass on every page in the web app
- Add a secrets-management rule to CLAUDE.md
- Eliminate stored passwords/secrets in favor of Azure Key Vault and federated auth wherever possible

## User Stories

### US-001: Fix web pipeline — gate prod on beta E2E
**Description:** As a developer, I want production deployments to only proceed if beta E2E tests pass, so that broken code never reaches production.

**Acceptance Criteria:**
- [ ] In `deploy-web.yml`, change `deploy-prod.needs` from `deploy-beta` to `test-beta`
- [ ] Pipeline runs: quality → deploy-beta → test-beta → deploy-prod → test-prod (in that order)
- [ ] If beta E2E fails, prod deploy does NOT run
- [ ] Verify by triggering a workflow run and confirming the dependency graph in GitHub Actions UI
- [ ] Typecheck passes

### US-002: Fix Key Vault access for E2E tests
**Description:** As a developer, I want the CI/CD service principal to have permission to read secrets from Azure Key Vault, so that E2E tests can retrieve test credentials.

**Acceptance Criteria:**
- [ ] Service principal (`appid` used in workflows) is granted "Key Vault Secrets User" role (or equivalent access policy) on `buddyburn-beta-kv`
- [ ] Same for `buddyburn-prod-kv` if production E2E tests also read secrets
- [ ] `az keyvault secret show` commands in `global-setup.ts` succeed in CI
- [ ] E2E test-beta job passes in a pipeline run

### US-003: Replace client secrets with OIDC federated auth
**Description:** As a developer, I want GitHub Actions to authenticate to Azure using OIDC workload identity federation instead of client secrets, so that we eliminate stored credentials and reduce secret rotation burden.

**Acceptance Criteria:**
- [ ] Configure federated credential on the Azure AD app registration for the GitHub repo (`patelr3/burnbuddy`, branches `main`, environments `beta` and `production`)
- [ ] Update `deploy-web.yml` to use `azure/login@v2` with `client-id`, `tenant-id`, `subscription-id` (no `creds` JSON, no `client-secret`)
- [ ] Update `deploy-api.yml` with the same OIDC login pattern
- [ ] Add `permissions: id-token: write` to workflow/job level
- [ ] Remove `AZURE_CLIENT_SECRET` from GitHub repo secrets once OIDC is verified working
- [ ] Both deploy-web and deploy-api pipelines pass with OIDC auth

### US-004: Replace login page with FirebaseUI
**Description:** As a user, I want a polished, professional login page using the official FirebaseUI drop-in widget, so that authentication feels trustworthy and looks clean.

**Acceptance Criteria:**
- [ ] Install `firebaseui` and `react-firebaseui` (or equivalent) packages
- [ ] Replace custom login form in `apps/web/src/app/login/page.tsx` with FirebaseUI `StyledFirebaseAuth` component
- [ ] Configure FirebaseUI with email/password and Google sign-in providers
- [ ] FirebaseUI handles error messages, loading states, and redirect after login
- [ ] Signup page (`/signup`) either integrates with FirebaseUI or redirects to the login page with FirebaseUI handling registration
- [ ] Styling is consistent with the Tailwind theme (see US-007)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Add Tailwind CSS to the web app
**Description:** As a developer, I want Tailwind CSS installed and configured in the web app, so that all pages can use utility-first styling instead of inline styles.

**Acceptance Criteria:**
- [ ] Install `tailwindcss`, `@tailwindcss/postcss`, and `postcss` as dev dependencies in `apps/web`
- [ ] Create/update `tailwind.config.ts` with content paths covering `src/**/*.{ts,tsx}`
- [ ] Configure `postcss.config.js` with the Tailwind plugin
- [ ] Add Tailwind directives (`@tailwind base; @tailwind components; @tailwind utilities;`) to the global CSS file
- [ ] Define a color palette in the Tailwind config reflecting BurnBuddy's brand (orange primary `#f97316`, gray neutrals, green/blue accents)
- [ ] Verify Tailwind classes render correctly by adding a test class to the home page
- [ ] Existing inline styles still work (no regressions) — can migrate incrementally
- [ ] Typecheck passes
- [ ] `yarn build` succeeds with Tailwind

### US-006: Restyle home/dashboard page
**Description:** As a user, I want the home page to look modern and polished, so that the app feels professional and engaging.

**Acceptance Criteria:**
- [ ] Replace all inline `style` props with Tailwind utility classes
- [ ] Active workout banner has rounded corners, shadow, and clear visual hierarchy
- [ ] "Start Workout" button uses brand orange with hover/active states
- [ ] Buddy and squad cards have consistent card styling (border, shadow, padding, rounded)
- [ ] Responsive layout: looks good on mobile (375px) and desktop (1280px)
- [ ] Nav bar is styled with Tailwind (sticky top, shadow, clear active state for current route)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Restyle friends page
**Description:** As a user, I want the friends page to look polished with clear visual hierarchy.

**Acceptance Criteria:**
- [ ] Replace inline styles with Tailwind classes
- [ ] Friend list items have card-style layout with avatar placeholder, name, and action buttons
- [ ] Add/search friends section is clearly separated and styled
- [ ] Empty state has a friendly illustration or message
- [ ] Responsive layout
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Restyle account page
**Description:** As a user, I want the account settings page to look clean and organized.

**Acceptance Criteria:**
- [ ] Replace inline styles with Tailwind classes
- [ ] Form fields have consistent sizing, labels, and focus states
- [ ] Sign-out button is clearly styled as a destructive action (red or outlined)
- [ ] Responsive layout
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Restyle burn buddy pages (new + detail)
**Description:** As a user, I want the burn buddy creation and detail pages to look polished.

**Acceptance Criteria:**
- [ ] `/burn-buddies/new`: Form fields styled with Tailwind, clear submit button
- [ ] `/burn-buddies/[id]`: Detail view with card layout, burn streak visualization, action buttons styled
- [ ] Responsive layout
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-010: Restyle burn squad pages (new + detail)
**Description:** As a user, I want the burn squad creation and detail pages to look polished.

**Acceptance Criteria:**
- [ ] `/burn-squads/new`: Form fields styled with Tailwind, clear submit button
- [ ] `/burn-squads/[id]`: Detail view with card layout, member list, burn stats styled
- [ ] Responsive layout
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-011: Add secrets-management rule to CLAUDE.md
**Description:** As a developer, I want CLAUDE.md to include a rule about storing secrets in Azure Key Vault and avoiding passwords, so that all future development follows this convention.

**Acceptance Criteria:**
- [ ] Add a new section to `CLAUDE.md` (e.g., "## Secrets & Security") with the rule: "Store all secrets in Azure Key Vault (AKV). Avoid passwords and client secrets wherever possible; prefer managed identity and federated credentials."
- [ ] Rule references `buddyburn-beta-kv` and `buddyburn-prod-kv` as the Key Vaults
- [ ] Mentions that `firebase-api-key` and `firebase-auth-domain` should be fetched from AKV at runtime

## Functional Requirements

- FR-1: `deploy-web.yml` must have `deploy-prod.needs: [test-beta]` so production only deploys after beta E2E passes
- FR-2: The CI/CD service principal must have "Key Vault Secrets User" RBAC role on `buddyburn-beta-kv` (and `buddyburn-prod-kv` if needed)
- FR-3: All `azure/login@v2` steps in `deploy-web.yml` and `deploy-api.yml` must use OIDC (`client-id` + `tenant-id` + `subscription-id`) instead of the `creds` JSON with `clientSecret`
- FR-4: Workflow files must include `permissions: id-token: write` at the workflow or job level for OIDC to work
- FR-5: The login page must use FirebaseUI's `StyledFirebaseAuth` (or `AuthUI`) component with email/password and Google providers
- FR-6: Tailwind CSS must be installed and configured with a BurnBuddy-branded color palette (orange primary)
- FR-7: Every page in the web app (`/`, `/login`, `/signup`, `/account`, `/friends`, `/burn-buddies/*`, `/burn-squads/*`) must use Tailwind classes instead of inline styles
- FR-8: `CLAUDE.md` must include a secrets-management rule directing developers to use Azure Key Vault and avoid passwords

## Non-Goals

- No changes to the API deployment pipeline beyond OIDC auth migration (US-003)
- No changes to the Expo mobile app
- No changes to the shared types package (beyond what Tailwind config requires)
- No new features or business logic — this is purely infrastructure, security, and styling
- No custom design system or component library — Tailwind utilities only
- No dark mode (can be added later)
- No changes to Firebase project configuration or Firestore rules
- No migration away from Firebase Auth to Azure AD for end-user auth

## Design Considerations

- **Color Palette (Tailwind config):**
  - Primary: Orange `#f97316` (brand color, used for CTAs and workout actions)
  - Secondary: Blue `#3b82f6` (squads, links)
  - Success: Green `#22c55e` (buddy creation, positive states)
  - Danger: Red `#ef4444` (destructive actions, errors)
  - Neutrals: Slate gray scale (`#f8fafc` → `#0f172a`)
- **UI Inspiration:** Modern fitness/social apps — clean cards, rounded corners, subtle shadows, generous whitespace. Reference: https://github.com/topics/good-ui for community examples.
- **FirebaseUI:** Use the default FirebaseUI stylesheet with minor overrides to match the orange brand color.
- **Layout:** Keep max-width 600px centered container for content; nav bar full-width.
- **Responsive:** Mobile-first — all pages must work at 375px width.

## Technical Considerations

- **OIDC Federation:** Requires creating a federated credential on the existing Azure AD app registration. The `subject` claim must match `repo:patelr3/burnbuddy:environment:beta` (and `:production`). Reference: [Azure docs on workload identity federation](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust).
- **FirebaseUI Compatibility:** `react-firebaseui` may need `firebaseui` CSS imported globally. Ensure it works with Next.js App Router (may need `'use client'` directive).
- **Tailwind + Existing Inline Styles:** Tailwind can coexist with inline styles. Migration can be done page-by-page without breaking anything.
- **Existing Failures:** API tests have 10 pre-existing dist/ failures (CommonJS vs ESM) — these are unrelated and should be ignored.

## Success Metrics

- Web deployment pipeline runs green end-to-end (all 5 jobs pass: quality, deploy-beta, test-beta, deploy-prod, test-prod)
- Zero client secrets stored in GitHub Actions secrets for Azure auth (replaced by OIDC)
- Firebase API key and auth domain are stored in Azure Key Vault and retrievable as needed
- Login page renders FirebaseUI widget with email/password and Google sign-in
- All 9 web pages use Tailwind classes with no inline `style` props remaining
- CLAUDE.md contains the secrets-management rule
- No regressions in existing functionality (auth flows, buddy/squad creation, workouts)

## Open Questions

- Should the signup page be a separate page or should FirebaseUI handle both login and signup on a single `/login` page?
- Should we add a shared layout component (e.g., `<PageContainer>`, `<Card>`) to reduce Tailwind class repetition, or keep it as raw utility classes for now?
