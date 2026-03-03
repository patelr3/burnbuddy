# Copilot Instructions

## Project

**burnbuddy** is an app that motivates buddies to burn calories. Monorepo with a Next.js web app, Express API, Expo mobile app, and shared types package.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js 24 (via devcontainer base image `mcr.microsoft.com/devcontainers/typescript-node:4-24-trixie`)
- **Package manager**: Yarn (v1 workspaces)
- **Backend**: Express + firebase-admin + Firestore, Pino logging, OpenTelemetry tracing
- **Web**: Next.js 14 (App Router) + React 18 + Tailwind v4 + Firebase Auth (client SDK)
- **Mobile**: Expo 55 + React Native 0.83
- **Shared**: `@burnbuddy/shared` package — domain types and Logger interface
- **Testing**: Vitest (API unit tests), Playwright (E2E)
- **Infrastructure**: Azure Container Apps, ACR, Key Vault, Bicep templates in `infra/`

## Commands

```bash
yarn build                        # Build all packages
yarn typecheck                    # Typecheck all packages
yarn dev:web                      # Next.js at http://localhost:3000
yarn dev:api                      # Express API at http://localhost:3001
cd services/api && yarn test      # Run all API tests (vitest)
cd services/api && yarn test -- workouts.test  # Run a single test file
```

## Architecture

### Workspace layout

| Workspace | Name | Description |
|---|---|---|
| `apps/web` | `web` | Next.js web app. Firebase Auth on client side, cookie-based session gating via Next.js middleware. |
| `apps/mobile` | `mobile` | Expo/React Native app. Uses `@burnbuddy/shared` logger stub (no pino). |
| `services/api` | `api` | Express REST API. Firebase Admin for auth verification + Firestore for data. |
| `packages/shared` | `@burnbuddy/shared` | Shared domain types (`UserProfile`, `Workout`, `BurnBuddy`, `BurnSquad`, etc.) and `Logger` interface. |

### API request flow

1. Client sends `Authorization: Bearer <firebase-id-token>` header
2. `requireAuth` middleware verifies token via `firebase-admin` and sets `req.user.uid`
3. Route handlers access Firestore through `getDb()` (lazy singleton from `lib/firestore.ts`)
4. Background side-effects (group workout detection, push notifications) run as fire-and-forget promises — errors are swallowed so they don't fail the main request

### Web auth flow

- Firebase Auth client SDK handles login/signup
- An `auth_session` cookie gates protected routes via Next.js middleware (`apps/web/src/middleware.ts`)
- API calls use `getIdToken()` from the Firebase client to build Bearer headers (`apps/web/src/lib/api.ts`)

### Shared package build caveat

`packages/shared/tsconfig.json` excludes `src/testing/` from compilation. The `testing/emulators.ts` module imports `firebase-admin` which is not available in web/mobile builds — never add it to the shared package's published exports.

## Key Conventions

### API test pattern

Tests use `vi.mock` + `vi.hoisted` to stub firebase-admin and Firestore — no emulators needed. Each test file:
1. Declares mock functions with `vi.hoisted(() => { ... })`
2. Mocks modules (`../lib/firebase`, `../lib/firestore`) using those hoisted mocks
3. Imports the router under test _after_ mocks are declared
4. Builds a standalone Express app with `buildApp()` and tests via `supertest`
5. Calls `vi.resetAllMocks()` in `beforeEach` and re-applies default mock implementations

### Express Request augmentation

`req.user` is typed via a global augmentation in `services/api/src/types/express.d.ts`. Use `req.user!.uid` in handlers protected by `requireAuth`.

### Firestore access

Always use `getDb()` from `lib/firestore.ts` — never call `admin.firestore()` directly in route handlers.

### Logging

Use `pino` in API and web. The mobile app uses `createMobileLogger()` from `@burnbuddy/shared` (console wrapper matching the `Logger` interface).

## Environments

| | Beta | Production |
|---|---|---|
| **Resource group** | `buddyburn-beta` | `buddyburn-prod` |
| **Key Vault** | `buddyburn-beta-kv` | `buddyburn-prod-kv` |
| **API URL** | `https://buddyburn-beta-api.arayosun.com` | `https://buddyburn-api.arayosun.com` |
| **Web URL** | `https://buddyburn-beta.arayosun.com` | `https://buddyburn.arayosun.com` |
| **ACR** | `burnbuddyacr.azurecr.io` (shared) | `burnbuddyacr.azurecr.io` (shared) |

### Testing against environments

All changes must be verified against the **beta** environment before completing tasks.

For UI changes, follow this order:

1. **Local** — Run `yarn dev:web` and verify the change at `http://localhost:3000` using the `dev-browser` skill
2. **Beta** — After deploying to beta, use the `dev-browser` skill to verify the change at the beta web URL above

API-only changes should be tested against the beta API URL (e.g., via `curl` or the API test suite).

## Secrets & Security

Store all secrets in Azure Key Vault. Prefer managed identity and federated credentials over passwords/client secrets. Firebase config values (`firebase-api-key`, `firebase-auth-domain`, etc.) are stored in AKV and injected into Container Apps via Bicep-managed Key Vault references.

## Development Environment

This project uses a Dev Container. You do not need to open a devcontainer, but other users in the system will.
