# PRD: Fix Profile Picture Upload — Missing Azure Storage Accounts

## Introduction

Profile picture upload fails on **production** (`burnbuddy.arayosun.com`) and **beta** (`burnbuddy-beta.arayosun.com`) with HTTP 503: "Storage service unavailable. Please try again." The API attempts to upload processed images to Azure Blob Storage, but the storage accounts were never created. The Bicep module (`infra/modules/storage-account.bicep`) was added in commit `11ab619` and wired into `infra/main.bicep`, but the infrastructure was never redeployed after that change.

**Root Cause:**

| Resource | Expected | Actual |
|---|---|---|
| `burnbuddyprodsa` storage account | Exists | ❌ Missing |
| `burnbuddybetasa` storage account | Exists | ❌ Missing |
| `AZURE_STORAGE_ACCOUNT_URL` env var (prod) | Points to valid account | ⚠️ Set but points to non-existent account |
| `AZURE_STORAGE_ACCOUNT_URL` env var (beta) | Points to valid account | ⚠️ Set but points to non-existent account |
| RBAC: Storage Blob Data Contributor (prod) | Assigned to API identity | ❌ No account to assign to |
| RBAC: Storage Blob Data Contributor (beta) | Assigned to API identity | ❌ No account to assign to |

**Managed identity principal IDs (already provisioned):**
- Prod API (`buddyburn-prod-api`): `98741ca4-30cd-4148-8995-52deab36564f`
- Beta API (`buddyburn-beta-api`): `71e4c958-eb58-4611-9c2f-6cb7d10502e6`

## Goals

- Restore profile picture upload functionality on both beta and production environments
- Deploy the existing Bicep storage account module that was never applied
- Verify end-to-end upload flow works in both environments
- Add a test fixture image for reproducible testing

## User Stories

### US-001: Deploy storage infrastructure to beta

**Description:** As a developer, I want the beta storage account (`burnbuddybetasa`) created with proper RBAC so that profile picture uploads work on the beta environment.

**Acceptance Criteria:**
- [ ] Run `az deployment group create --what-if` on `buddyburn-beta` — confirm only the storage account, container, and role assignment are new resources
- [ ] Deploy: `az deployment group create --resource-group buddyburn-beta --template-file infra/main.bicep --parameters infra/main.beta.bicepparam`
- [ ] Verify storage account exists: `az storage account show -n burnbuddybetasa -g buddyburn-beta`
- [ ] Verify `uploads` container exists: `az storage container list --account-name burnbuddybetasa --auth-mode login`
- [ ] Verify RBAC role: `az role assignment list --scope /subscriptions/{sub}/resourceGroups/buddyburn-beta/providers/Microsoft.Storage/storageAccounts/burnbuddybetasa --assignee 71e4c958-eb58-4611-9c2f-6cb7d10502e6`

### US-002: Verify upload on beta

**Description:** As a developer, I want to upload a profile picture on beta and see it succeed so that I have confidence the fix works before deploying to prod.

**Acceptance Criteria:**
- [ ] Use a test image (JPEG or PNG, under 5 MB) to upload via the beta web app or API
- [ ] Upload returns 200 with a `profilePictureUrl` containing a cache-bust query param
- [ ] The returned URL is accessible and displays the image
- [ ] The image appears on the account page after refresh
- [ ] Verify in browser using dev-browser skill

### US-003: Deploy storage infrastructure to prod

**Description:** As a developer, I want the prod storage account (`burnbuddyprodsa`) created with proper RBAC so that profile picture uploads work on production.

**Acceptance Criteria:**
- [ ] Run `az deployment group create --what-if` on `buddyburn-prod` — confirm only the storage account, container, and role assignment are new resources
- [ ] Deploy: `az deployment group create --resource-group buddyburn-prod --template-file infra/main.bicep --parameters infra/main.prod.bicepparam`
- [ ] Verify storage account exists: `az storage account show -n burnbuddyprodsa -g buddyburn-prod`
- [ ] Verify `uploads` container exists
- [ ] Verify RBAC role assigned to prod API identity `98741ca4-30cd-4148-8995-52deab36564f`

### US-004: Verify upload on prod

**Description:** As a developer, I want to upload a profile picture on production and see it succeed so that the user-facing bug is resolved.

**Acceptance Criteria:**
- [ ] Upload a test image via production web app or API
- [ ] Upload returns 200 with valid `profilePictureUrl`
- [ ] The returned URL is accessible
- [ ] Error message "Storage service unavailable" no longer appears
- [ ] Verify in browser using dev-browser skill

### US-005: Add test fixture image to repo

**Description:** As a developer, I want a committed test image in the repo so that E2E and manual tests for profile picture upload are reproducible.

**Acceptance Criteria:**
- [ ] Small JPEG image committed at `tests/fixtures/test-avatar.jpg` (under 100 KB)
- [ ] Image is a valid JPEG that passes the API's MIME type validation
- [ ] Documented in this PRD as the standard test asset for upload flows

## Functional Requirements

- FR-1: Deploy the existing `infra/modules/storage-account.bicep` module to `buddyburn-beta` resource group, creating storage account `burnbuddybetasa`
- FR-2: Deploy the same module to `buddyburn-prod` resource group, creating storage account `burnbuddyprodsa`
- FR-3: Each storage account must have an `uploads` container with Blob-level public access
- FR-4: The `Storage Blob Data Contributor` RBAC role must be assigned to the corresponding API managed identity on each storage account
- FR-5: Existing Container App resources must not be modified during deployment (validated via `--what-if`)
- FR-6: A test fixture image (`tests/fixtures/test-avatar.jpg`) must be committed for reproducible upload testing

## Non-Goals

- No code changes to the API or web app — this is purely an infrastructure deployment
- No changes to the Bicep templates themselves — they are already correct
- No changes to the CI/CD pipeline — infrastructure deployment remains manual
- No migration of existing profile pictures (none exist since uploads have always failed)

## Dependencies

None

## Technical Considerations

- Deploy the existing Bicep infrastructure to both environments. **No code changes required.** The storage account module already handles: storage account creation (Standard_LRS, StorageV2), `uploads` container with Blob-level public access, and `Storage Blob Data Contributor` RBAC role assignment to the API managed identity
- **Strategy: Beta first, verify, then prod**
- `deploy-api.yml` only pushes container images — it does NOT run Bicep. Infrastructure deployment is manual via `az deployment group create`
- The Bicep has a dependency: `storageAccount` module needs `apiApp.outputs.principalId`. The full Bicep deployment resolves this automatically since both modules are declared in `main.bicep`
- Existing Container App resources should not be modified — the `what-if` step confirms this before each deploy

## Success Metrics

- Profile picture upload returns HTTP 200 on both beta and production
- Uploaded images are accessible via their returned URLs
- HTTP 503 "Storage service unavailable" error no longer occurs

## Open Questions

- None
