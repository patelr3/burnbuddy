# PRD: Group Workout Detail Page

## Introduction

When users view their Burn Buddy or Burn Squad detail pages, the Group Workout Log currently shows only a date, workout count, and relative time for each group workout. Users have no way to see _who_ did _what_ during a group workout session.

This feature adds a dedicated detail page for each group workout entry. Clicking a row in the Group Workout Log navigates to a subpage that shows each participant's individual workout — including workout type, start time, and duration — giving users a full picture of their shared sessions.

## Goals

- Let users see exactly what each participant did during a group workout
- Display workout type, start time, and duration per participant
- Link each participant's name to their profile for easy navigation
- Support both Burn Buddy (2 participants) and Burn Squad (2+ participants) group workouts
- Provide a clear "In Progress" indicator for workouts that haven't ended yet

## User Stories

### US-001: Create API endpoint for group workout detail

**Description:** As a developer, I need a new endpoint that returns a group workout along with each participant's individual workout details so the frontend can display them.

**Acceptance Criteria:**

- [ ] New `GET /group-workouts/:id` endpoint exists and requires authentication
- [ ] Response includes the `GroupWorkout` fields plus an array of participant workout details
- [ ] Each participant entry includes: `uid`, `displayName`, `workoutType`, `startedAt`, `endedAt`, and `status`
- [ ] Returns 404 if the group workout doesn't exist
- [ ] Returns 403 if the authenticated user is not a member of the group workout
- [ ] Unit tests cover success, 404, and 403 cases following the existing `vi.mock` + `vi.hoisted` pattern
- [ ] Typecheck passes

### US-002: Make Group Workout Log rows clickable on Burn Buddy page

**Description:** As a user viewing my Burn Buddy detail page, I want to click a group workout entry so I can see the full details of that session.

**Acceptance Criteria:**

- [ ] Each row in the Group Workout Log on `/burn-buddies/[id]` is a clickable link
- [ ] Clicking navigates to `/burn-buddies/[id]/group-workouts/[gwId]`
- [ ] Row has a hover state indicating it's interactive (e.g., background highlight or chevron icon)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Make Group Workout Log rows clickable on Burn Squad page

**Description:** As a user viewing my Burn Squad detail page, I want to click a group workout entry so I can see the full details of that session.

**Acceptance Criteria:**

- [ ] Each row in the Group Workout Log on `/burn-squads/[id]` is a clickable link
- [ ] Clicking navigates to `/burn-squads/[id]/group-workouts/[gwId]`
- [ ] Row has a hover state matching the Burn Buddy page treatment from US-002
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Build group workout detail page for Burn Buddies

**Description:** As a user, I want to see a detail page for a group workout that shows what each buddy did during the session.

**Acceptance Criteria:**

- [ ] New page at `/burn-buddies/[id]/group-workouts/[gwId]`
- [ ] Page header shows the date of the group workout and a back link to the buddy detail page
- [ ] Displays a card for each participant showing:
  - Participant's display name (linked to their burn buddy profile)
  - Workout type (e.g., "Running", "HIIT", "Weightlifting")
  - Start time formatted as a human-readable time (e.g., "7:32 AM")
  - Duration (e.g., "45 min") or "In Progress" badge if workout has no `endedAt` and status is `active`
- [ ] Shows loading state while fetching data
- [ ] Shows error state if the group workout is not found or user is not authorized
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Build group workout detail page for Burn Squads

**Description:** As a user, I want to see a detail page for a squad group workout that shows what each squad member did during the session.

**Acceptance Criteria:**

- [ ] New page at `/burn-squads/[id]/group-workouts/[gwId]`
- [ ] Page header shows the date of the group workout and a back link to the squad detail page
- [ ] Displays a card for each participant showing the same fields as US-004
- [ ] Participant names link to the squad detail page (since squad members may not be direct burn buddies)
- [ ] Handles squads with 3+ members gracefully (cards stack vertically)
- [ ] Shows loading and error states
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: New `GET /group-workouts/:id` API endpoint returns a single group workout with enriched participant data
- FR-2: Participant data includes `uid`, `displayName`, `workoutType`, `startedAt`, `endedAt`, and `status` for each member's individual workout
- FR-3: The endpoint fetches individual workouts by the IDs stored in `GroupWorkout.workoutIds` and enriches them with user profile display names
- FR-4: The endpoint returns 404 when the group workout ID doesn't exist and 403 when the user is not in `memberUids`
- FR-5: Group Workout Log rows on both Burn Buddy and Burn Squad detail pages become clickable links to the new detail page
- FR-6: Clickable rows show a visual hover indicator (background highlight or right chevron)
- FR-7: The detail page displays each participant's workout in a card layout with: display name, workout type, start time, and duration
- FR-8: Duration is computed as `endedAt - startedAt` and displayed in a human-readable format (e.g., "45 min", "1 hr 12 min")
- FR-9: Workouts with `status: 'active'` and no `endedAt` display an "In Progress" badge instead of a duration
- FR-10: Participant display names are clickable links — on the buddy page they link back to the buddy detail, and on the squad page they link to the squad detail page

## Non-Goals

- No editing or deleting group workouts from the detail view
- No real-time updates (page shows data as of load time; no live "In Progress" countdown)
- No comments, reactions, or social features on the detail page
- No map or location data for workouts
- No aggregated stats on the detail page (e.g., total calories, combined duration)

## Dependencies

- [prd-tla-verification-fixes](prd-tla-verification-fixes.md) — must be completed before this PRD begins

## Design Considerations

- Match the existing dark theme used on Burn Buddy and Burn Squad detail pages (dark backgrounds, white/gray text, colored accents)
- Reuse the existing card styling patterns from the buddy/squad detail pages
- Participant cards should show an avatar or initial next to the display name, consistent with how names appear elsewhere in the app
- The "In Progress" badge should use a green or pulsing accent to indicate liveness
- On mobile-width screens, cards should stack vertically with no horizontal overflow

## Technical Considerations

- The `GroupWorkout` type already stores `workoutIds` and `memberUids` — the new endpoint will fetch individual `Workout` documents by ID and `UserProfile` documents by UID to build the enriched response
- Firestore reads: 1 (group workout) + N (individual workouts) + N (user profiles) where N is the number of participants. For buddies N=2, for squads N is typically 2-5 — well within acceptable limits
- The new page routes use Next.js App Router nested dynamic segments: `app/(main)/burn-buddies/[id]/group-workouts/[gwId]/page.tsx`
- Use `getDb()` from `lib/firestore.ts` for all Firestore access in the new endpoint
- API test should follow the existing pattern: `vi.mock` + `vi.hoisted`, `buildApp()`, and `supertest`

## Success Metrics

- Users can navigate from the Group Workout Log to the detail page in one click
- All participant workout details (type, time, duration) are visible without scrolling on typical screens
- No regression in load time for the Burn Buddy or Burn Squad detail pages

## Open Questions

- Should we paginate the Group Workout Log if a buddy pair has a very large number of group workouts, or is that a separate concern?
- Should the detail page show the group workout "window" (the 20-minute detection period) or just the individual workout times?
