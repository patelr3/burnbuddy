# Mobile Testing Guide

This guide covers the testing infrastructure for the BurnBuddy mobile app (`apps/mobile`).

## Table of Contents

- [Unit & Component Tests (Jest)](#unit--component-tests-jest)
- [E2E Tests (Maestro)](#e2e-tests-maestro)
  - [Prerequisites](#prerequisites)
  - [Installing Maestro CLI](#installing-maestro-cli)
  - [Running E2E Tests](#running-e2e-tests)
  - [Writing New Flows](#writing-new-flows)
  - [Test Configuration](#test-configuration)

---

## Unit & Component Tests (Jest)

Unit and component tests use **Jest** with **jest-expo** and **@testing-library/react-native**.

```bash
# Run all mobile tests
yarn workspace mobile test

# Run a specific test file
yarn workspace mobile test -- LoginScreen.test

# Run with coverage
yarn workspace mobile test -- --coverage
```

Tests live alongside source code in `__tests__/` directories:
- `src/__tests__/` — smoke tests
- `src/lib/__tests__/` — auth context, API client tests
- `src/screens/__tests__/` — screen component tests

Shared mocks are in `src/__mocks__/` (firebase, api, notifications, async-storage).

---

## E2E Tests (Maestro)

[Maestro](https://maestro.mobile.dev/) is used for end-to-end UI testing against a running app on a simulator/emulator.

### Prerequisites

1. **Local API running** at `http://localhost:3001`:
   ```bash
   yarn dev:api
   ```

2. **iOS Simulator** (macOS) or **Android Emulator** running:
   - iOS: Open Xcode → Window → Devices and Simulators → Boot a simulator
   - Android: Start an AVD from Android Studio or via `emulator -avd <name>`

3. **Expo Dev Server** running:
   ```bash
   cd apps/mobile
   npx expo start
   ```
   Then press `i` for iOS or `a` for Android to launch in the simulator/emulator.

### Installing Maestro CLI

**macOS / Linux:**
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

**Verify installation:**
```bash
maestro --version
```

> Maestro requires Java 11+. If not installed: `brew install openjdk@11` (macOS) or install via your package manager.

### Running E2E Tests

All Maestro flows live in `apps/mobile/.maestro/`.

```bash
# Run all E2E flows
cd apps/mobile
yarn test:e2e

# Or run directly with Maestro CLI
maestro test .maestro/

# Run a single flow
maestro test .maestro/login.yaml

# Run flows with a specific tag
maestro test --include-tags=smoke .maestro/

# Override test credentials
maestro test -e TEST_USER_EMAIL=myuser@test.com -e TEST_USER_PASSWORD=secret .maestro/
```

### Available E2E Flows

| Flow | File | Tags | Description |
|---|---|---|---|
| Login | `login.yaml` | smoke, auth | Enters email/password, taps Sign In, verifies Home screen appears |
| Sign Up | `signup.yaml` | auth | Fills signup form, creates account, verifies Home screen appears |
| Home Navigation | `home-navigation.yaml` | smoke, navigation | Navigates between Home, Friends, and Account tabs, verifies each loads |
| Add Friend | `add-friend.yaml` | friends | Opens Friends tab, searches for a user by email, sends friend request |

**Running individual flows:**

```bash
# Run login flow
maestro test .maestro/login.yaml

# Run signup flow with custom credentials
maestro test -e SIGNUP_EMAIL=custom@test.com -e SIGNUP_PASSWORD=secret123 .maestro/signup.yaml

# Run home navigation flow
maestro test .maestro/home-navigation.yaml

# Run add friend flow with a specific friend email
maestro test -e FRIEND_EMAIL=buddy@example.com .maestro/add-friend.yaml

# Run all auth-tagged flows
maestro test --include-tags=auth .maestro/

# Run all navigation-tagged flows
maestro test --include-tags=navigation .maestro/

# Run all friends-tagged flows
maestro test --include-tags=friends .maestro/
```

### Writing New Flows

Maestro flows are YAML files in `apps/mobile/.maestro/`. Each flow describes a sequence of user interactions:

```yaml
appId: host.exp.exponent
tags:
  - smoke
---
# Flow: Example
- launchApp
- tapOn:
    id: "login-email-input"
- inputText: "user@example.com"
- tapOn:
    id: "login-sign-in-button"
- assertVisible: "Home"
```

**Best practices:**
- Use `testID` props for element selection (convention: `screen-name-element`, e.g., `login-email-input`)
- Add descriptive step labels for readability
- Tag flows for selective execution
- Keep flows focused on a single user journey

### Test Configuration

Configuration is in `apps/mobile/.maestro/config.yaml`:

| Setting | Description |
|---|---|
| `appId` | Bundle identifier — `host.exp.exponent` for Expo Go, update for dev builds |
| `env.EXPO_PUBLIC_API_URL` | API base URL (default: `http://localhost:3001`) |
| `env.TEST_USER_EMAIL` | Default test user email (override via CLI `-e`) |
| `env.TEST_USER_PASSWORD` | Default test user password (override via CLI `-e`) |

### Custom Dev Build

For production-like E2E testing, create a custom Expo dev client:

```bash
cd apps/mobile
npx expo prebuild
npx expo run:ios   # or run:android
```

Then update `config.yaml` to use your custom `appId` (e.g., `com.burnbuddy.mobile`).

### Troubleshooting

| Issue | Solution |
|---|---|
| "App not found" | Ensure Expo Go is installed on the simulator and `appId` matches |
| "Element not found" | Check `testID` props match the flow YAML selectors |
| API calls fail | Verify `yarn dev:api` is running on port 3001 |
| Maestro hangs on launch | Kill the simulator and restart; ensure no other Maestro instance is running |
