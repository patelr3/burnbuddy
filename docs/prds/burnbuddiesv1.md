# Product Requirements Document: buddyburn

> **Status**: Draft

---

## 1. Overview

**Product name**: buddyburn
**Tagline**: An app that motivates buddies to burn calories!
**Summary**: This app allows users to "check-in" remotely together when they begin their workout. It helps you have a workout partner, even if they aren't physically there with you!

---

## 2. Problem Statement

People struggle to maintain discipline with working out. Having a workout partner is always more motivating, but you can't always be with a workout partner physically.

---

## 3. Goals & Non-Goals

### Goals
This app will allow users to start a workout together through the app. Additionally, the app allows users to create groups, and a Burn Streak is maintained as long as any member works out on back-to-back days. Users can add each other as friends, and friends can see each other's workout log in groups feed.

### Non-Goals
This app will not support commenting on workout logs. There is no communication built-in for v1.

---

## 4. Target Users

**The Consistent Athlete**: Active adult (25–40) who works out 4–5x/week. Already has established fitness habits and wants accountability and friendly competition with existing workout partners. Uses buddyburn to stay connected with training partners who don't live nearby.

**The Habit Builder**: Young adult (18–30) who is trying to build a workout routine. Has low intrinsic motivation and needs external accountability to stay consistent. Uses buddyburn to stay committed alongside a friend who is also just starting out.

---

## 5. Key Features

### Feature: Authentication

- What it does: Users can create an account and log in to buddyburn
- Why it matters: All app functionality requires an authenticated user identity
- Acceptance criteria:
    - Users can create an account and log in via email/password OR Google OAuth via Firebase Authentication
    - The Firebase Auth token is attached to all API calls for authentication and authorization

### Feature: Adding Friends

- What it does: Users can add each other as friends
- Why it matters: This allows users to connect with others and form Burn Buddies and Burn Squads
- Acceptance criteria:
    - Users can search for other users by email address
    - Users can request to add another user as a "friend"
    - Users can accept "friend requests"
    - Users can delete a friend without approval

### Feature: Creating a Burn Buddy

- What it does: Users can designate a single friend as their one-on-one workout partner (a Burn Buddy)
- Why it matters: A Burn Buddy is the core bilateral relationship in the app — it is distinct from a Burn Squad, has no admin role, and has no group settings. It is a direct, mutual commitment between two users.
- Acceptance Criteria:
    - Users can send a Burn Buddy request to an existing friend
    - The recipient sees the pending Burn Buddy request at the top of the Burn Buddies page
    - The recipient can accept or decline the request
    - Once accepted, both users see each other as Burn Buddies
    - A user can have multiple Burn Buddies and can also have a separate Burn Squad with the same person

### Feature: Creating Burn Squads

- What it does: Users can create groups with their friends
- Why it matters: Allows users to "start a workout" with a group
- Acceptance Criteria
    - Users can create an empty group. The user that creates the group is an admin
    - User can add friends into the group
    - Group has settings
        - Friends: Either only admins can add friends to the group, or all members can add friends to the group
        - Workout Schedule: This is the times the group will workout at the same time. For example, Monday, Wednesday, and Friday mornings at 7AM. This is purely for notification/is mostly informational in v1
    - Groups are always called "Burn Squads" regardless of member count
    - Admins can delete groups

### Feature: Start Workout

- What it does: This allows a user to start a workout
- Why it matters: This is the action that the user wants to share with all applicable groups
- Acceptance Criteria
    - User can start a workout
    - User can specify what type of workout it is
    - All of user's groups where ALL members have started working out within 20 min of each other starts a "Group Workout". This should be recorded.
    - User can manually end a workout; if not ended, the workout automatically ends after 1.5 hours

### Feature: Push Notifications

- What it does: Users are notified when a connected partner starts a workout
- Why it matters: Timely notifications are what allow the 20-min group workout window to work — a user needs to know their buddy has started so they can join in
- Acceptance Criteria:
    - Users receive a push notification when a Burn Buddy starts a workout
    - Users receive a push notification when any member of one of their Burn Squads starts a workout
    - Notifications are delivered via the mobile app (iOS and Android) and as browser notifications on web

---

## 6. User Flows

### Onboarding

1. User navigates to app/website
2. User is sent to login page
3. User creates account w/ email/password OR uses Google OAuth supported by Firebase Authentication
4. Server stores necessary login information as needed into Firebase Storage
5. Users are brought to the Burn Buddies page, which shows a Getting Started card which describes how to add a friend
6. User can 'x' out of the Getting Started card so that it does not appear again
7. User can use the account tab to re-enable the getting started card at any time.

### Adding a friend

1. User is on a "Friends" page. This is just for friends.
2. There is a button to add a friend
3. This leads to a new textbox that searches for friend based on email ID
4. Selecting a user brings a confirmation window for sending the friend request
5. User can see pending friend requests at the top, both outgoing and incoming
6. User can accept incoming friend requests

### Creating a Burn Squad

1. User is on a "Burn Buddies" page.
2. there is a button to add a new group
3. The group creation experience is on a new subpage
4. User selects all friends to create a group with
5. User sets a workout schedule for the group
6. User creates the group
7. All friends in the group are sent a "group join request"
8. Friends must accept the "group join request" and will see pending requests at the top of the Burn Buddies page.

### Creating a Burn Buddy

1. User is on a "Burn Buddies" page.
2. There is a button to add a new "Burn Buddy" from list of friends
3. The burn buddy creation experience is on a new subpage
4. User sets a workout schedule for the burn buddy
5. User creates the burn buddy request
6. Friend must accept the "burn buddy" request and will see pending requests at the top of the Burn Buddies page.

### Starting a workout

1. User can start a workout
2. All matching Burn Buddies and Burn Squads will get notified of that friend starting the workout
3. If a Burn Buddy or if all members of a Burn Squad also begin their workout within 20 min of the initial workout, a "group workout" begins
4. The group workout is logged/recorded every time this criteria is satisfied
5. User can end a workout, or otherwise the workout auto-ends after 1.5 hrs.
6. User can specify what type of workout they are doing... i.e. "Weightlifting", "Running", "Barre", etc. This should be a pre-defined list. Allow the user to create a custom workout type and type in the appropriate text

### Viewing a Burn Buddy or Burn Squad

1. User selects a Burn Buddy or Burn Squad
2. On either Burn Buddies or Burn Squads, the number of group workouts completed per week and per month is recorded
3. If _any_ member of a buddy or squad completes a workout back-to-back days, this creates a "Burn Streak" for each day in a row this was maintained
4. If _all_ members of a buddy or squad completes a workout back-to-back days, this creates a "Supernova Streak" for each day in a row this was maintained
5. Each member can see a full logs of workouts specific to that burn buddy or group
6. User can see how long the Burn Buddy or Burn Squad has existed
7. User can edit the burn buddy or burn squad here

### Viewing the Burn Buddies page

1. User can see each burn buddy or group here. They can see the their streaks in each item, as well as how long it has been since the last group workout
2. User can select burn buddy or burn squad
3. Burn Buddies and Burn Squads are ordered by most recent group workout completed, started at the top

### Account Management

1. There should be an account management page for generic account management and user-specific settings
2. User can toggle the "Get Started" card here


---

## 7. Success Metrics

1. Number of Burn Buddies
2. Number of Burn Squads
3. Number of Burn Buddy group workouts completed
4. Number of Burn Squad group workouts completed
5. Streak retention
6. DAU

---

## 8. Technical Constraints

- Use Test-Driven Development to create changes
- Use Expo (React Native) + Next.js.
- Use Firebase Storage​
- Use Firebase Authentication (useful secrets in .env)
- Use the custom domain `buddyburn.arayosun.com`
- Must support both web and mobile app (iOS and Android). Reduce code redundancy as much as possible
- Must support a generic API using the Firebase Auth tokens
- Make sure to use microservices for frontend + any other services necessary. Use docker.
- Use GitHub Actions to deploy to "production" as necessary. Use Azure Container Apps, deployed to a new resource group, and deployed via Bicep, to deploy the app
    - Make sure that we can deploy to production using local commands as well to reduce GitHub Actions runs
- Use OpenTelemetry for logging and tracing
- Use structured logging
- Do NOT store secrets in GitHub. Store all secrets in an Azure Key Vault.

---

## 9. Decisions & Notes

### Structured logging library
Use **pino** with `pino-opentelemetry-transport`. Justification: best-in-class performance for Node.js, native JSON output, and first-class OpenTelemetry integration. Works in Next.js API routes and the backend service. For the React Native/Expo client, use a lightweight wrapper that maps to pino on the server and `console` on device.

### Firebase and Azure testing
- **Firebase**: Use the Firebase Local Emulator Suite for unit and integration tests (Auth emulator, Firestore emulator). No live Firebase project is required for tests.
- **Azure**: Use a dedicated `buddyburn-dev` resource group separate from production. Secrets are stored in the existing Azure Key Vault (referenced in `.notes`); CI/CD reads them via a service principal. Local dev reads from `.env`.

### Edge Cases / Out of Scope for v1
The following are known gaps intentionally deferred to keep v1 scope contained:
- Account deletion flow
- Declining a Burn Buddy or Burn Squad request (UI treatment and cleanup)
