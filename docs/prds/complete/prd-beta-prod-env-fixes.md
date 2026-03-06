# PRD: Beta/Prod Environment Fixes (CSS, Firebase Auth, Friend Flow)

## Introduction

The BurnBuddy beta and production web deployments have three categories of issues: broken CSS (Tailwind styles not rendering, resulting in unstyled pages), a Firebase Auth API key error preventing login, and potentially broken user flows. This PRD covers investigating and fixing the CSS and Firebase issues in beta first (then prod), and verifying the "add a friend" flow in beta.

## Goals

- Fix CSS rendering in beta and production so that deployed UI matches localhost
- Fix the Firebase `auth/api-key-not-valid` error in both environments so login works
- Verify the "add a friend" happy path (search → send request → accept) works in beta
- Fix any broken friend flow issues discovered during verification

## User Stories

### US-001: Investigate and fix broken CSS in beta
**Description:** As a user, I want the beta web app to render with proper Tailwind CSS styling so that it looks the same as localhost.

**Acceptance Criteria:**
- [ ] Investigate why CSS is broken — likely causes: Tailwind v4 + Next.js standalone output not including CSS, Docker build not processing PostCSS, or static assets not being copied in the Dockerfile
- [ ] Identify root cause and apply fix (may involve Dockerfile changes, next.config.mjs, or PostCSS/Tailwind config)
- [ ] Redeploy to beta
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill: beta web URL renders with proper styling (orange primary buttons, proper layout, font sizing) matching localhost

### US-002: Fix broken CSS in production
**Description:** As a user, I want the production web app to render with proper Tailwind CSS styling, matching the fix applied to beta.

**Acceptance Criteria:**
- [ ] Apply the same CSS fix from US-001 to production (deploy the same image or trigger prod deploy)
- [ ] Verify in browser using dev-browser skill: production web URL renders with proper styling matching localhost and beta

### US-003: Investigate and fix Firebase API key error in beta
**Description:** As a user, I want to log in to the beta web app without seeing "Error (auth/api-key-not-valid.-please-pass-a-valid-api-key.)".

**Acceptance Criteria:**
- [ ] Investigate the root cause — likely causes: `NEXT_PUBLIC_FIREBASE_API_KEY` build arg not set or set to wrong value in the deploy-web workflow, GitHub environment secrets not configured for beta, or Key Vault secret not populated
- [ ] Verify that the `beta` GitHub Actions environment has the correct `NEXT_PUBLIC_FIREBASE_API_KEY` secret set (this value is baked into the Next.js build at Docker image build time)
- [ ] Redeploy to beta with the correct Firebase config
- [ ] Verify in browser using dev-browser skill: beta login page loads FirebaseUI widget without API key errors
- [ ] Verify in browser using dev-browser skill: a test user can sign in successfully

### US-004: Fix Firebase API key error in production
**Description:** As a user, I want to log in to the production web app without Firebase API key errors.

**Acceptance Criteria:**
- [ ] Apply the same Firebase config fix from US-003 to production
- [ ] Verify that the `production` GitHub Actions environment has the correct `NEXT_PUBLIC_FIREBASE_API_KEY` secret
- [ ] Redeploy to production
- [ ] Verify in browser using dev-browser skill: production login page loads without errors and a test user can sign in

### US-005: Verify "add a friend" flow in beta
**Description:** As a user, I want to verify that the add-a-friend happy path works correctly in the beta environment.

**Acceptance Criteria:**
- [ ] Verify in browser using dev-browser skill: navigate to Friends page in beta
- [ ] Click "+ Add Friend" button, search for a user by email, confirm the search result appears
- [ ] Click the found user, confirm the "Send Friend Request?" dialog appears
- [ ] Send the friend request, confirm it appears under "Pending Requests" as outgoing
- [ ] Log in as the other user, confirm the incoming request appears, click "Accept"
- [ ] Verify both users now appear in each other's Friends list
- [ ] Document any issues found (proceed to US-006 if broken)

### US-006: Fix friend flow issues (if any)
**Description:** As a developer, I want to fix any issues discovered in US-005 so that the add-a-friend flow works end-to-end in beta.

**Acceptance Criteria:**
- [ ] Fix all issues identified in US-005 (this story is skipped if US-005 passes cleanly)
- [ ] Typecheck passes
- [ ] API tests pass (`cd services/api && yarn test`)
- [ ] Re-verify the full friend flow in beta using dev-browser skill

## Functional Requirements

- FR-1: The deployed web Docker image must include all compiled Tailwind CSS in the Next.js standalone output
- FR-2: All `NEXT_PUBLIC_FIREBASE_*` build args must be correctly passed during the Docker build step in both beta and prod deploy workflows
- FR-3: The Firebase API key used at build time must match a valid key for the Firebase project
- FR-4: The Friends page must load and display the friend list, pending requests, and search UI when authenticated
- FR-5: The friend request flow (search → send → accept) must complete without errors against the beta API

## Non-Goals

- No changes to the mobile app
- No changes to the friend flow beyond the happy path (decline, duplicate request handling, unfriending are out of scope)
- No CI/CD pipeline changes beyond what's needed to fix the deploy (e.g., no new E2E tests in this PRD)
- No redesign of the UI — just fixing CSS so it matches what works locally

## Technical Considerations

- **Tailwind v4 + Next.js standalone**: The app uses Tailwind v4 (`@import "tailwindcss"` syntax) with `@tailwindcss/postcss` plugin and Next.js `output: 'standalone'`. The standalone build copies `server.js` but static assets (including CSS) must be explicitly copied in the Dockerfile from `.next/static`. The current Dockerfile does copy `.next/static` — the issue may be in PostCSS processing during the Docker build or missing Tailwind content paths.
- **Firebase config is build-time**: Next.js `NEXT_PUBLIC_*` env vars are inlined at build time. They must be passed as `--build-arg` in the Docker build. If the GitHub Actions environment secrets are empty or incorrect, the fallback values in `firebase-client.ts` (`demo-api-key`, etc.) will be used, causing the API key error.
- **Friend flow depends on auth**: Testing the friend flow requires two authenticated users. The Firebase API key fix (US-003) must be completed before US-005 can be tested.
- **Deployment workflow**: `deploy-web.yml` deploys beta first, runs E2E, then deploys prod. Manual deploys can be triggered via `workflow_dispatch`.

## Success Metrics

- Beta and prod web apps render with full Tailwind CSS styling, visually matching localhost
- Users can log in to both beta and prod without Firebase API key errors
- The add-a-friend happy path completes successfully in beta

## Open Questions

- Is there a single Firebase project shared across beta and prod, or separate projects? (Affects whether the same API key works for both)
- Are the GitHub Actions environment secrets (`NEXT_PUBLIC_FIREBASE_API_KEY`, etc.) already populated for both `beta` and `production` environments, or do they need to be set?
