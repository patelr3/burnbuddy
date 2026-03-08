# Plan: Run BurnBuddy on a Physical iPhone via Expo Go

## Problem

The mobile app (`apps/mobile`) has never been run on a physical iPhone. There is no `.env` file, no Expo account linked, and no EAS configuration. The fastest path without an Apple Developer account is **Expo Go**.

## Approach

Use **Expo Go** (free iOS app) to run the Expo development build on a physical iPhone connected to the same Wi-Fi network as the dev machine. This requires:

1. An Expo account (free)
2. Expo Go installed on the iPhone
3. Environment variables configured (Firebase + API URL)
4. The Expo dev server and API server running locally

### Limitations of Expo Go

- No custom native modules (the app currently doesn't use any beyond what Expo provides)
- Push notifications won't work on device (requires a development build with `expo-dev-client`)
- Google OAuth may need extra configuration for the iOS redirect URI

---

## Todos

### 1. Create an Expo account

- Go to https://expo.dev/signup and create a free account
- This is needed so Expo Go on your phone can discover your dev server

### 2. Install Expo Go on iPhone

- Download "Expo Go" from the App Store on your iPhone
- Sign in with the Expo account created in step 1

### 3. Create the `.env` file for the mobile app

Create `apps/mobile/.env` with the required environment variables:

```bash
# API — use your dev machine's LAN IP (not localhost!)
EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:3001

# Firebase config (same values as web app — fetch from Azure Key Vault)
EXPO_PUBLIC_FIREBASE_API_KEY=<from KV: firebase-web-api-key>
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<from KV: firebase-web-auth-domain>
EXPO_PUBLIC_FIREBASE_PROJECT_ID=<from KV: firebase-web-project-id>
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=<from KV: firebase-web-storage-bucket>
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<from KV: firebase-web-messaging-sender-id>
EXPO_PUBLIC_FIREBASE_APP_ID=<from KV: firebase-web-app-id>

# Google OAuth (optional — needed for Google sign-in)
EXPO_PUBLIC_GOOGLE_CLIENT_ID=<google-oauth-web-client-id>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<google-oauth-ios-client-id>
```

**To find your LAN IP:** run `ifconfig | grep "inet "` or `hostname -I` on your dev machine.

**To fetch Firebase values from Key Vault:**
```bash
az keyvault secret show --vault-name buddyburn-beta-kv --name firebase-web-api-key --query value -o tsv
# Repeat for each secret
```

### 4. Log in to Expo CLI

```bash
cd apps/mobile
npx expo login
# Enter your Expo account credentials
```

### 5. Start the API server

```bash
# Terminal 1
yarn dev:api
```

The API needs to bind to `0.0.0.0` (not just `localhost`) so the iPhone can reach it. Check that `services/api` listens on all interfaces, or set the `HOST` env var if needed.

### 6. Start the Expo dev server

```bash
# Terminal 2
cd apps/mobile
npx expo start
```

This will show a QR code in the terminal. Scan it with your iPhone camera (iOS 11+) — it will open Expo Go and load the app.

### 7. Verify the app loads and can reach the API

- The app should show the login screen
- Sign in with email/password (Google OAuth may not work without iOS client ID)
- Verify API calls succeed (friends list, workouts, etc.)

---

## Notes

- **Firewall:** Your dev machine's firewall must allow inbound connections on ports 3001 (API) and 8081 (Metro bundler). On macOS, the system may prompt to allow this.
- **Remote / Codespace caveat:** If you're actually running in a GitHub Codespace or remote VM (the `/workspaces/` path suggests this), you'll need to use `npx expo start --tunnel` instead, which routes traffic through Expo's servers. Install `@expo/ngrok` first: `npx expo install @expo/ngrok`.
- **`.env` should be git-ignored:** Verify `apps/mobile/.gitignore` includes `.env`.
- **Hot reload:** Changes to JS/TS code will hot-reload on the phone automatically.
- **Shared package:** If you modify `packages/shared`, rebuild it (`cd packages/shared && yarn build`) — Metro watches the compiled output.
