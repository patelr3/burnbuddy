# PRD: Automated Mobile Testing

## Introduction

The burnbuddy mobile app (`apps/mobile`) currently has zero automated tests — all verification is manual on simulators or physical devices. This PRD covers adding a two-layer testing strategy: **Jest unit/component tests** for fast feedback on individual modules and screens, and **Maestro E2E flows** for validating critical user journeys on a running app. The goal is to prevent regressions, enable confident refactoring, and establish quality gates for PRs.

## Goals

- Establish a Jest + React Native Testing Library test suite covering all screens with basic happy-path tests
- Create reusable mock infrastructure for Firebase Auth, API client, AsyncStorage, and expo-notifications
- Add Maestro E2E flows for critical user journeys (login, home navigation, friend management)
- Wire unit/component tests into GitHub Actions CI so they run on every PR touching mobile code
- Document how to run both test layers locally

## User Stories

### US-001: Configure Jest with jest-expo
**Description:** As a developer, I want a working Jest test runner in the mobile app so that I can write and run unit/component tests locally and in CI.

**Acceptance Criteria:**
- [ ] `jest`, `jest-expo`, `@testing-library/react-native`, `@testing-library/jest-native`, `@types/jest` added as devDependencies in `apps/mobile/package.json`
- [ ] `apps/mobile/jest.config.js` created, extending `jest-expo` preset
- [ ] `apps/mobile/jest.setup.ts` created with baseline React Native module mocks (e.g., `Animated`, `Linking`)
- [ ] `"test"` script added to `apps/mobile/package.json` running `jest`
- [ ] A trivial smoke test (`src/__tests__/smoke.test.ts`) passes when running `yarn workspace mobile test`
- [ ] Typecheck passes

### US-002: Create shared mock infrastructure
**Description:** As a developer, I want pre-built mocks for Firebase Auth, the API client, AsyncStorage, and expo-notifications so that every test file doesn't have to reinvent mocking.

**Acceptance Criteria:**
- [ ] `apps/mobile/src/__mocks__/firebase.ts` mocks `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `onAuthStateChanged`, `getIdToken`, `signOut`
- [ ] `apps/mobile/src/__mocks__/api.ts` mocks `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete` as `jest.fn()` stubs
- [ ] `apps/mobile/src/__mocks__/notifications.ts` mocks `expo-notifications` registration and listeners
- [ ] `apps/mobile/src/__mocks__/async-storage.ts` mocks `@react-native-async-storage/async-storage` with in-memory store
- [ ] Each mock file exports a `reset()` or similar helper to clear state between tests
- [ ] Mocks are documented with inline comments explaining usage
- [ ] Typecheck passes

### US-003: Test AuthContext and auth flows
**Description:** As a developer, I want tests for the `AuthProvider` and `useAuth()` hook so that auth regressions are caught automatically.

**Acceptance Criteria:**
- [ ] Test file at `apps/mobile/src/lib/__tests__/auth-context.test.tsx`
- [ ] Test: `AuthProvider` renders children when `onAuthStateChanged` emits a user
- [ ] Test: `useAuth()` returns `{ user, loading, getToken }` with correct values
- [ ] Test: loading state is `true` initially, then `false` after auth state resolves
- [ ] Test: unauthenticated state (`user` is `null`) when `onAuthStateChanged` emits `null`
- [ ] Test: `getToken()` calls Firebase `getIdToken()` and returns the token string
- [ ] All tests pass via `yarn workspace mobile test`

### US-004: Test API client module
**Description:** As a developer, I want tests for the API client (`src/lib/api.ts`) so that auth header injection and error handling are verified.

**Acceptance Criteria:**
- [ ] Test file at `apps/mobile/src/lib/__tests__/api.test.ts`
- [ ] Test: `apiGet(path)` sends GET request with `Authorization: Bearer <token>` header
- [ ] Test: `apiPost(path, body)` sends POST with JSON body and auth header
- [ ] Test: API client uses `EXPO_PUBLIC_API_URL` env var for base URL, falls back to `http://localhost:3001`
- [ ] Test: network error throws/rejects with meaningful error
- [ ] Test: 401 response is handled (not silently swallowed)
- [ ] All tests pass via `yarn workspace mobile test`

### US-005: Test LoginScreen component
**Description:** As a developer, I want component tests for the LoginScreen so that login UI and auth calls are verified.

**Acceptance Criteria:**
- [ ] Test file at `apps/mobile/src/screens/__tests__/LoginScreen.test.tsx`
- [ ] Test: renders email and password text inputs
- [ ] Test: renders a "Sign In" button
- [ ] Test: tapping "Sign In" with valid inputs calls `signInWithEmailAndPassword`
- [ ] Test: displays error message when auth fails (e.g., wrong password)
- [ ] Test: tapping "Sign Up" link/button triggers navigation to signup screen
- [ ] All tests pass via `yarn workspace mobile test`

### US-006: Test HomeScreen component
**Description:** As a developer, I want component tests for the HomeScreen (the most complex screen at ~26KB) so that core data loading and display are verified.

**Acceptance Criteria:**
- [ ] Test file at `apps/mobile/src/screens/__tests__/HomeScreen.test.tsx`
- [ ] Test: shows loading indicator while API calls are in flight
- [ ] Test: renders list of burn buddies returned by `apiGet('/burn-buddies')`
- [ ] Test: renders list of burn squads returned by `apiGet('/burn-squads')`
- [ ] Test: displays empty state message when user has no buddies or squads
- [ ] Test: displays incoming buddy/squad request indicators when requests exist
- [ ] All tests pass via `yarn workspace mobile test`

### US-007: Test FriendsScreen component
**Description:** As a developer, I want component tests for the FriendsScreen so that friend management flows are verified.

**Acceptance Criteria:**
- [ ] Test file at `apps/mobile/src/screens/__tests__/FriendsScreen.test.tsx`
- [ ] Test: renders list of current friends from API
- [ ] Test: renders incoming and outgoing friend request sections
- [ ] Test: tapping "Accept" on a friend request calls `apiPost` with correct endpoint
- [ ] Test: tapping "Decline" on a friend request calls the correct API endpoint
- [ ] All tests pass via `yarn workspace mobile test`

### US-008: Add GitHub Actions CI workflow for mobile tests
**Description:** As a developer, I want mobile unit/component tests to run automatically on PRs so that regressions are caught before merge.

**Acceptance Criteria:**
- [ ] `.github/workflows/test-mobile.yml` created
- [ ] Triggers on `push` to `main` and `pull_request` when files in `apps/mobile/**` or `packages/shared/**` change
- [ ] Job steps: checkout → Node.js setup → `yarn install --frozen-lockfile` → `yarn workspace mobile test`
- [ ] Test results reported to GitHub Actions summary
- [ ] Workflow runs successfully on a test push

### US-009: Install and configure Maestro for E2E testing
**Description:** As a developer, I want Maestro configured in the mobile app so that I can write and run E2E test flows locally against a simulator.

**Acceptance Criteria:**
- [ ] `apps/mobile/.maestro/` directory created
- [ ] `apps/mobile/.maestro/config.yaml` created with app identifier and Expo dev server settings
- [ ] `"test:e2e"` script added to `apps/mobile/package.json` that runs Maestro test suite
- [ ] `docs/mobile-testing.md` created with instructions for installing Maestro CLI, starting Expo, and running E2E flows
- [ ] Instructions specify tests run against local API (`localhost:3001`)

### US-010: Write Maestro E2E flows for critical journeys
**Description:** As a developer, I want Maestro E2E flows covering the most critical user journeys so that full-stack mobile behavior is validated.

**Acceptance Criteria:**
- [ ] `apps/mobile/.maestro/login.yaml` — enters email/password, taps Sign In, verifies Home screen appears
- [ ] `apps/mobile/.maestro/signup.yaml` — fills signup form, creates account, verifies Home screen appears
- [ ] `apps/mobile/.maestro/home-navigation.yaml` — navigates between Home, Friends, and Account tabs, verifies each loads
- [ ] `apps/mobile/.maestro/add-friend.yaml` — opens Friends tab, searches for a user, sends friend request
- [ ] Each flow has descriptive step names and uses `testID` attributes for element selection
- [ ] Flows documented in `docs/mobile-testing.md`

## Functional Requirements

- FR-1: Jest test runner must work with Expo's module resolution and React Native transforms via `jest-expo` preset
- FR-2: All React Native core modules that access native APIs (AsyncStorage, Notifications, Animated) must be mocked in `jest.setup.ts`
- FR-3: Firebase Auth mock must support controlling auth state via a trigger function (simulating `onAuthStateChanged` callbacks)
- FR-4: API client mock must capture call arguments so tests can assert on endpoints, headers, and bodies
- FR-5: Component tests must wrap rendered components in `AuthProvider` (mocked) to supply auth context
- FR-6: Maestro flows must use `testID` props for element selection — add `testID` to key interactive elements in screens if missing
- FR-7: CI workflow must only run when mobile-relevant files change (path filter on `apps/mobile/**` and `packages/shared/**`)
- FR-8: Test coverage should include both happy paths and basic error states (auth failure, network error, empty data)

## Non-Goals

- No Maestro E2E in CI (requires simulator — deferred to future work)
- No visual regression / screenshot testing
- No performance or load testing
- No testing of native-only features (push notification delivery, deep links)
- No test coverage enforcement thresholds (let the team establish a baseline first)
- No refactoring of HomeScreen into smaller components (may be a follow-up)

## Technical Considerations

- **Jest vs Vitest:** The rest of the monorepo uses Vitest, but mobile uses Jest because Expo ships native Jest support via `jest-expo`. React Native Testing Library's ecosystem is optimized for Jest.
- **React Native mocking:** React Native modules that bridge to native code (e.g., `Animated`, `Linking`, `Platform`) need explicit mocks or the `jest-expo` preset handles them. Test to confirm which are auto-mocked.
- **Manual navigation:** The app uses state-based tab navigation (no React Navigation library), so navigation testing asserts on state changes rather than mocking a navigation object.
- **Large HomeScreen:** At ~26KB, HomeScreen is complex. Tests should focus on data loading and key interactions — deeper testing may motivate extracting sub-components in a follow-up.
- **testID attributes:** Maestro (and Testing Library) both benefit from `testID` props on interactive elements. Some screens may need `testID` added to buttons, inputs, and list items.
- **Expo SDK 55 + React 19:** Ensure test library versions are compatible with React 19.2.0 and RN 0.83.

## Success Metrics

- All mobile unit/component tests pass in CI on every PR
- At least one test file per screen in `apps/mobile/src/screens/`
- Auth context and API client have dedicated test files with ≥80% line coverage
- Maestro E2E flows complete successfully on a local iOS or Android simulator
- Developer can run full test suite in under 30 seconds locally

## Open Questions

- Should we add `testID` props to all interactive elements now, or only as needed by Maestro flows?
- Should there be a shared test utilities file (e.g., `renderWithProviders` helper) or keep it per-test?
- Will React 19 + RN 0.83 require any workarounds for `@testing-library/react-native`?
