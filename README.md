# buddyburn
An app that motivates buddies to burn calories!

## Development

```bash
yarn install
yarn dev:web    # Next.js at http://localhost:3000
yarn dev:api    # Express API at http://localhost:3001
```

## Quality checks

```bash
yarn typecheck          # Typecheck all packages
yarn workspace api test # Run API tests (uses vi.mock — no emulators needed)
```

## Local testing with Firebase emulators

The API tests use `vi.mock` by default and require no external services. For full integration tests against local emulators:

**Prerequisites:** [Firebase CLI](https://firebase.google.com/docs/cli) and Java 11+ installed.

```bash
# 1. Start emulators (Auth on :9099, Firestore on :8080, UI on :4000)
firebase emulators:start --only auth,firestore

# 2. Run tests against the emulators
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
FIRESTORE_EMULATOR_HOST=localhost:8080 \
FIREBASE_PROJECT_ID=burnbuddy-test \
yarn workspace api test
```

See `.env.test` for all required environment variables. The emulator configuration lives in `firebase.json`.

The test helper in `packages/shared/src/testing/emulators.ts` initializes firebase-admin against the running emulators when `FIREBASE_AUTH_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST` are set; it is a no-op otherwise.

## CI/CD

The `.github/workflows/deploy.yml` workflow runs automatically on every push to `main`:

1. **Quality checks** — typechecks all packages and runs API tests
2. **Build** — builds Docker images for `services/api` and `apps/web`, pushes to Azure Container Registry (`burnbuddyacr.azurecr.io`)
3. **Deploy** — updates `buddyburn-prod-api` and `buddyburn-prod-web` Container Apps via `az containerapp update`

### Required GitHub Actions secrets

Configure these in **Settings → Secrets and variables → Actions** (never commit them):

| Secret | Description |
|---|---|
| `AZURE_CLIENT_ID` | Service principal app ID |
| `AZURE_CLIENT_SECRET` | Service principal password |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |

The service principal needs **AcrPush** on the Container Registry and **Contributor** on the `buddyburn-prod` resource group.

App secrets (Firebase credentials, etc.) are stored in Azure Key Vault (`buddyburn-prod-kv`) and injected into the Container Apps via managed-identity Key Vault references configured in the Bicep templates (`infra/`).

### Local production deploy

Run the deploy script directly (requires `az login` and Docker):

```bash
./scripts/deploy-prod.sh             # deploys current git SHA
./scripts/deploy-prod.sh my-tag      # deploys a specific tag
```

### Infrastructure

Bicep templates live in `infra/`. To provision or update Azure resources:

```bash
# Dry run
az deployment group create \
  --resource-group buddyburn-prod \
  --template-file infra/main.bicep \
  --parameters infra/main.prod.bicepparam \
  --what-if

# Apply
az deployment group create \
  --resource-group buddyburn-prod \
  --template-file infra/main.bicep \
  --parameters infra/main.prod.bicepparam
```
