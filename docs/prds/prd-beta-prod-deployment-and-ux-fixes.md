# PRD: Beta/Prod Deployment, CI/CD Refactor, and UX Consistency Fixes

## Introduction

This PRD covers a set of related improvements: fixing a UX inconsistency in Burn Squad creation (friends should be optional), provisioning a beta production environment in Azure, updating GitHub Actions to support both beta and production deployments, splitting CI/CD into independent API and web workflows, and adding post-deployment integration tests that verify both environments are stable after each deploy.

---

## Goals

- Remove the "add friends first" blocker from the Burn Squad creation flow so it is consistent with how Burn Buddies works
- Provision a beta Azure environment using existing Bicep templates
- Get a green, automated deploy to both beta and production from GitHub Actions
- Split CI/CD into separate API and web workflows that only trigger on relevant file changes
- Add automated integration tests (API endpoint + browser E2E) that run against beta and production after each deployment

---

## User Stories

### US-034: Remove "add friends first" requirement from Burn Squad creation

**Description:** As a user, I want to create a Burn Squad without having friends added yet, so that I can set up my squad name and schedule first and invite people later.

**Acceptance Criteria:**
- [ ] When the user has no friends, the Burn Squad creation page shows an informational message (e.g. "No friends to invite yet — you can add them later") but does NOT block form submission
- [ ] The "Create Burn Squad" button remains enabled when a squad name is entered, regardless of whether any friends are selected
- [ ] A squad created with zero inviteUids is accepted by the API and returns 201
- [ ] The user is redirected to the home page after creating an empty squad
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-035: Add beta Bicep parameter file

**Description:** As a developer, I need a beta environment parameter file so that Bicep deployments can target a `buddyburn-beta` resource group using a consistent naming convention.

**Acceptance Criteria:**
- [ ] `infra/main.beta.bicepparam` exists with `environment = 'beta'` (note: Bicep `@allowed` must be updated to include `'beta'`)
- [ ] `infra/main.bicep` `@allowed` constraint updated to `['dev', 'beta', 'prod']`
- [ ] Beta param file references `buddyburn-beta-kv` as the Key Vault name and `buddyburn-beta` as its resource group
- [ ] Beta param file uses `burnbuddyacr.azurecr.io` as the container registry server
- [ ] Dry-run of `az deployment group create --what-if` succeeds without errors (documented in PR)

---

### US-036: Push current branch and provision beta environment

**Description:** As a developer, I need the current feature branch pushed to GitHub and the beta Azure infrastructure provisioned so that automated deploys have a live target environment.

**Acceptance Criteria:**
- [ ] Branch `ralph/buddyburn-v1` is pushed to the remote
- [ ] `buddyburn-beta` resource group exists in Azure
- [ ] `buddyburn-beta-kv` Key Vault exists with required secrets (Firebase service account, etc.) mirrored from prod
- [ ] Beta Container Apps environment (`buddyburn-beta-env`) is provisioned via Bicep
- [ ] Beta API Container App (`buddyburn-beta-api`) is reachable at its FQDN and returns 200 on `GET /health`
- [ ] Beta Web Container App (`buddyburn-beta-web`) is reachable at its FQDN and returns 200

---

### US-037: Split GitHub Actions into separate API and web workflows

**Description:** As a developer, I want separate CI/CD workflows for the API and web app so that a change to one does not trigger a redundant build and deploy of the other.

**Acceptance Criteria:**
- [ ] `.github/workflows/deploy-api.yml` exists and triggers on pushes to `main` when any of these paths change: `services/api/**`, `packages/shared/**`, `infra/**`
- [ ] `.github/workflows/deploy-web.yml` exists and triggers on pushes to `main` when any of these paths change: `apps/web/**`, `packages/shared/**`
- [ ] The original `deploy.yml` is removed or renamed to avoid duplicate runs
- [ ] Each workflow includes its own quality checks (typecheck + relevant tests) before building
- [ ] Each workflow builds only its relevant Docker image and deploys only its Container App
- [ ] Both workflows deploy to **both** beta and production (beta first, then prod) in sequence
- [ ] Typecheck passes

---

### US-038: Deploy API to beta and production via GitHub Actions and iterate until green

**Description:** As a developer, I need the API deploy workflow to successfully push a Docker image and update the beta and production Container Apps so that the pipeline is verified end-to-end.

**Acceptance Criteria:**
- [ ] API workflow runs without errors on push to `main`
- [ ] Docker image is built, tagged with the short commit SHA, and pushed to `burnbuddyacr`
- [ ] `buddyburn-beta-api` Container App is updated to the new image
- [ ] `buddyburn-prod-api` Container App is updated to the new image
- [ ] All workflow steps show green in the GitHub Actions UI
- [ ] If any step fails, the root cause is identified and fixed before marking this story complete — iterate as needed

---

### US-039: Deploy web to beta and production via GitHub Actions and iterate until green

**Description:** As a developer, I need the web deploy workflow to successfully push a Docker image and update the beta and production web Container Apps.

**Acceptance Criteria:**
- [ ] Web workflow runs without errors on push to `main`
- [ ] Docker image for `apps/web` is built with the correct build args (Firebase config, API URL) for each environment
- [ ] `buddyburn-beta-web` Container App is updated to the new image
- [ ] `buddyburn-prod-web` Container App is updated to the new image
- [ ] All workflow steps show green in the GitHub Actions UI
- [ ] If any step fails, the root cause is identified and fixed before marking this story complete — iterate as needed

---

### US-040: Add post-deployment API integration tests for beta and production

**Description:** As a developer, I want automated API integration tests to run against the live beta and production environments after each successful deployment so that regressions are caught immediately.

**Acceptance Criteria:**
- [ ] A test script (e.g. `scripts/integration-test.sh` or a Vitest/Jest test file under `tests/integration/`) accepts a `BASE_URL` environment variable and runs against it
- [ ] Tests cover: `GET /health` (200), `POST /users` (auth required → 401 without token), `GET /users/me` (auth required), `GET /friends` (auth required), `POST /workouts/start` (auth required)
- [ ] Tests use a fixed test Firebase user whose credentials are fetched from Azure Key Vault at runtime (not GitHub Actions secrets)
- [ ] The API deploy workflow runs these tests against beta after beta deploy, and against prod after prod deploy
- [ ] If integration tests fail, the workflow job fails and alerts the team (no silent failures)
- [ ] Test results are visible in the GitHub Actions summary

---

### US-041: Add post-deployment browser E2E tests for beta and production

**Description:** As a developer, I want Playwright browser tests to run against the live web app after each deployment so that critical user flows are verified in both beta and production.

**Acceptance Criteria:**
- [ ] Playwright is added as a dev dependency in the repo (root or a dedicated `tests/e2e/` package)
- [ ] E2E tests cover: load the home/login page (200, no JS errors), sign up a new user, log in with existing credentials, navigate to Burn Squads page, create a new Burn Squad (no friends required)
- [ ] Tests accept `BASE_URL` as an environment variable to target beta or production
- [ ] Test account credentials (email + password) are fetched from Azure Key Vault at the start of each CI run using the existing Azure login step
- [ ] The web deploy workflow runs E2E tests against beta after beta deploy and against prod after prod deploy
- [ ] Test artifacts (screenshots, traces) are uploaded as GitHub Actions artifacts on failure
- [ ] Typecheck passes for any TypeScript test files

---

## Functional Requirements

- FR-1: Burn Squad creation form must allow submission with zero friends selected, provided a squad name is entered
- FR-2: When a user has no friends, the Burn Squad invite section shows a non-blocking informational message rather than a redirect prompt
- FR-3: `infra/main.bicep` must accept `'beta'` as a valid environment value
- FR-4: A `main.beta.bicepparam` file must target `buddyburn-beta` resource group and `buddyburn-beta-kv` Key Vault
- FR-5: GitHub Actions path filters must ensure `services/api/**` and `packages/shared/**` changes trigger the API workflow, and `apps/web/**` and `packages/shared/**` changes trigger the web workflow
- FR-6: Both deploy workflows must deploy to beta first, run integration tests, then deploy to production, then run integration tests again — failing fast if beta tests fail
- FR-7: Integration test script must be parameterized by `BASE_URL` and exit non-zero on failure
- FR-8: Playwright E2E tests must be parameterized by `BASE_URL` and upload failure artifacts to GitHub Actions
- FR-9: Each deploy workflow must include a quality gate (typecheck + unit tests) before any Docker build or deploy step

---

## Non-Goals

- No mobile app (React Native/Expo) CI/CD changes in this PRD
- No monitoring, alerting, or on-call setup beyond what GitHub Actions provides
- No database seeding or migration tooling for beta (secrets mirror is manual/one-time)
- No load testing or performance benchmarking
- Burn Buddies creation flow is not changed (it already handles the no-friends state acceptably)

---

## Technical Considerations

- The `@allowed` constraint in `infra/main.bicep` currently only allows `['dev', 'prod']` — adding `'beta'` requires a one-line change
- The Burn Squads page already submits `inviteUids: [...selectedUids]` which can be an empty array — the only change needed is to the UI messaging and to not block the submit button when friends list is empty
- For authenticated integration tests, a Firebase custom token or a long-lived service account token will be stored in Azure Key Vault (`buddyburn-beta-kv` and `buddyburn-prod-kv`) and fetched at runtime during CI using the existing Azure credentials — not stored as GitHub Actions secrets
- Playwright should be configured with `baseURL` set from env, and `retries: 1` for flakiness tolerance in CI
- Both deploy workflows should use `needs: quality` to gate on the quality job before deploying
- Azure secrets required for beta deployment: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` — these are likely already set in the repo and can be reused

---

## Success Metrics

- Burn Squad can be created with zero friends selected — no UI blocker
- Push to `main` with only API changes does not trigger a web Docker build (and vice versa)
- Both beta and production Container Apps are automatically updated within 10 minutes of a push to `main`
- Post-deployment tests catch a broken `/health` endpoint within 1 CI run
- GitHub Actions shows two separate workflow runs with clear names ("Deploy API", "Deploy Web")

---

## Decisions

- **Shared package triggers:** `packages/shared/**` changes trigger both the API and web deploy workflows, since the shared package is compiled into both Docker images.
- **Beta Firebase project:** Beta uses the same Firebase project as production. Mirror prod Firebase secrets into `buddyburn-beta-kv`. No separate Firebase project needed.
- **E2E test accounts:** Use a fixed test account that persists between runs. Credentials are stored in Azure Key Vault (`buddyburn-beta-kv` / `buddyburn-prod-kv`) and fetched at runtime during CI — not stored as GitHub Actions secrets.
