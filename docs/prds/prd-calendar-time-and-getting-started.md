# PRD: Required Workout Time & Getting Started Card Update

## Introduction

Two related UX improvements to the BurnBuddy onboarding and scheduling experience:

1. **Required workout time**: The "Add to Calendar" flow currently allows users to save a workout schedule without specifying a time, resulting in vague all-day calendar events. Making the time field required ensures every calendar event has a specific, actionable time.

2. **Getting Started card rewrite**: The current Getting Started card loosely describes adding friends and creating groups. It needs to clearly communicate the two-step flow: first add a friend, then request to be a Burn Buddy with that friend. Burn Squads are intentionally omitted to keep the onboarding message focused.

Both changes apply to web and mobile.

## Goals

- Eliminate all-day calendar events by requiring a workout time on every schedule
- Provide clear inline validation when time is missing
- Rewrite the Getting Started card to explicitly describe the add-friend → request-burn-buddy flow
- Keep web and mobile Getting Started cards consistent in messaging

## User Stories

### US-001: Make time field required in shared types
**Description:** As a developer, I need the `WorkoutSchedule.time` field to be required so that all downstream code enforces a time value.

**Acceptance Criteria:**
- [ ] Change `time?: string` to `time: string` in `WorkoutSchedule` interface (`packages/shared/src/types.ts`)
- [ ] Rebuild shared package (`yarn build` in `packages/shared`)
- [ ] Typecheck passes across all workspaces that compile (`services/api`, `apps/web`)

### US-002: Validate required time in API schedule endpoints
**Description:** As a developer, I need the API to reject schedule saves that omit a time value, returning a clear validation error.

**Acceptance Criteria:**
- [ ] `PUT /burn-buddies/:id/schedule` returns 400 if `time` is missing or empty
- [ ] `POST /burn-squads` returns 400 if `workoutSchedule` is provided without `time`
- [ ] `PUT /burn-squads/:id/settings` returns 400 if `workoutSchedule` is provided without `time`
- [ ] Error response body includes a human-readable message (e.g. `"Workout time is required"`)
- [ ] Existing API tests updated to reflect the new requirement
- [ ] New test cases cover the missing-time validation
- [ ] Typecheck passes

### US-003: Require time in web Burn Buddy schedule editor
**Description:** As a user editing my Burn Buddy workout schedule on the web, I must provide a time before I can save so my calendar events are specific.

**Acceptance Criteria:**
- [ ] Time input is always visible when editing a schedule (not hidden until days are selected)
- [ ] "Save Schedule" button is disabled until both days and time are provided
- [ ] Inline validation message appears if the user tries to save without a time (e.g. "Please select a workout time")
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Require time in web Burn Squad creation/settings
**Description:** As a user creating or editing a Burn Squad on the web, I must provide a time when setting a workout schedule.

**Acceptance Criteria:**
- [ ] Time input is always visible in the squad creation form when days are selected
- [ ] Squad creation form prevents submission if days are selected but time is empty
- [ ] Squad settings form prevents saving schedule without a time
- [ ] Inline validation message appears for missing time
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Require time in mobile schedule forms
**Description:** As a mobile user, I must provide a workout time when setting a schedule for a Burn Buddy or Burn Squad.

**Acceptance Criteria:**
- [ ] Time input is required in mobile Burn Buddy schedule editor
- [ ] Time input is required in mobile Burn Squad creation/settings
- [ ] Validation prevents saving without a time, with a visible error message
- [ ] Typecheck passes

### US-006: Update Getting Started card on web
**Description:** As a new web user, I see a Getting Started card that clearly tells me to (1) add a friend, then (2) request to be a Burn Buddy with that friend.

**Acceptance Criteria:**
- [ ] Card text is rewritten with two clearly numbered steps:
  1. Add a friend (search by email on the Friends page)
  2. Request to be a Burn Buddy with that friend
- [ ] No mention of Burn Squads in the card (keep it focused)
- [ ] Dismiss behavior and re-enable on Account page still work as before
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Update Getting Started card on mobile
**Description:** As a new mobile user, I see a Getting Started card that matches the web's two-step messaging.

**Acceptance Criteria:**
- [ ] Card text matches the web version's two-step flow (add friend → request Burn Buddy)
- [ ] No mention of Burn Squads
- [ ] Branding says "BurnBuddy" (not "buddyburn" — fix existing typo)
- [ ] Typecheck passes

## Functional Requirements

- FR-1: `WorkoutSchedule.time` field must be required (non-optional) in the shared types package
- FR-2: API must return HTTP 400 with descriptive error when a schedule is saved without a `time` value
- FR-3: Web Burn Buddy schedule editor must show time input whenever editing, disable save until time is provided, and show inline validation error if time is missing
- FR-4: Web Burn Squad creation and settings forms must require time when a workout schedule includes days
- FR-5: Mobile schedule forms must require time with visible validation errors
- FR-6: Web Getting Started card must display exactly two numbered steps: (1) add a friend by email, (2) request to be a Burn Buddy
- FR-7: Mobile Getting Started card must display the same two-step flow as web
- FR-8: ICS generator continues to produce timed events (the all-day fallback path can be removed or kept as dead code)

## Non-Goals

- No changes to how the calendar `.ics` file is generated (beyond removing the all-day fallback if desired)
- No changes to the Account page onboarding toggle
- No mention of Burn Squads in the Getting Started card
- No changes to the workout logging flow (only the schedule/calendar flow)
- No time zone selection — time is stored as a simple HH:MM string as today

## Dependencies

None

## Design Considerations

- Time input should use `<input type="time">` on web for native time picker UX
- Validation messages should appear inline near the time field, not as alerts/toasts
- Getting Started card should keep its current visual style (bordered card with dismiss button)
- Mobile Getting Started card should match the web's messaging but use platform-appropriate layout

## Technical Considerations

- Changing `time` from optional to required in the shared types will cause TypeScript errors anywhere a `WorkoutSchedule` is constructed without `time` — these must all be fixed
- Existing Firestore documents may have schedules without `time`. The API should handle reads gracefully (treat missing time as needing an update) but enforce time on all writes
- The ICS generator's all-day event branch (`lines 48-53` of `ics-generator.ts`) becomes unreachable once time is required — consider removing it or keeping it as a safety fallback

## Success Metrics

- 100% of new calendar events generated have a specific time (no all-day events)
- Zero 400 errors from users attempting to save schedules (validation prevents submission client-side)
- New users understand the add-friend → burn-buddy flow without external guidance

## Open Questions

- Should existing schedules without a time prompt users to add one (e.g., a banner on the Burn Buddy page saying "Add a time to your schedule")?
- Should the time field default to a placeholder like "09:00" to hint at expected format, or remain blank?
