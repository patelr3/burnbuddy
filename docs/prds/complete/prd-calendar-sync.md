# PRD: Calendar Sync for Burn Buddies & Squads

## Introduction

Add an "Add to Calendar" button on burn buddy and burn squad detail pages that downloads an `.ics` file containing the recurring workout schedule. This lets users see their committed workout times in Apple Calendar, Google Calendar, Outlook, or any calendar app that supports the iCalendar standard — keeping them accountable without having to check BurnBuddy separately.

## Goals

- Let users export their buddy/squad workout schedule to any calendar app with one tap
- Keep accountability visible by placing workouts alongside users' daily commitments
- Use the iCalendar (`.ics`) standard for maximum compatibility — no third-party API integrations needed
- Require zero configuration — sensible defaults for event title, duration, and reminder

## User Stories

### US-001: Generate .ics file from workout schedule (API)

**Description:** As a developer, I need an API endpoint that generates an `.ics` file from a burn buddy or burn squad's workout schedule so the frontend can trigger a download.

**Acceptance Criteria:**
- [ ] `GET /burn-buddies/:id/calendar` returns a valid `.ics` file with `Content-Type: text/calendar` and `Content-Disposition: attachment; filename="burnbuddy-workout.ics"`
- [ ] `GET /burn-squads/:id/calendar` returns a valid `.ics` file with the same headers
- [ ] The `.ics` file contains recurring `VEVENT` entries matching the `WorkoutSchedule.days` array
- [ ] If the schedule includes a `time`, events start at that time with a 1-hour default duration
- [ ] If the schedule has no `time`, events are created as all-day events
- [ ] Each event has title `🔥 Workout with [partner display name]` (buddy) or `🔥 [squad name] Workout` (squad)
- [ ] Each event includes a 30-minute `VALARM` reminder
- [ ] Returns 404 if buddy/squad not found or user is not a member
- [ ] Returns 400 if no workout schedule is configured
- [ ] Requires authentication (`requireAuth` middleware)
- [ ] Typecheck passes
- [ ] Unit tests cover: valid schedule with time, valid schedule without time, no schedule configured, unauthorized access

### US-002: Add "Add to Calendar" button on buddy detail page

**Description:** As a user viewing my burn buddy's detail page, I want an "Add to Calendar" button so I can download our workout schedule as a calendar file.

**Acceptance Criteria:**
- [ ] An "Add to Calendar" button (with a calendar icon) appears in the schedule section of the buddy detail page
- [ ] Button is only visible when a workout schedule is configured (days are selected)
- [ ] Clicking the button downloads an `.ics` file by calling `GET /burn-buddies/:id/calendar`
- [ ] While downloading, the button shows a brief loading state
- [ ] If the download fails, a toast or inline error message is shown
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Add "Add to Calendar" button on squad detail page

**Description:** As a squad member viewing the squad detail page, I want an "Add to Calendar" button so I can add our squad workout schedule to my calendar.

**Acceptance Criteria:**
- [ ] An "Add to Calendar" button (with a calendar icon) appears in the schedule/settings section of the squad detail page
- [ ] Button is only visible when a workout schedule is configured in squad settings
- [ ] Clicking the button downloads an `.ics` file by calling `GET /burn-squads/:id/calendar`
- [ ] While downloading, the button shows a brief loading state
- [ ] If the download fails, a toast or inline error message is shown
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Add `GET /burn-buddies/:id/calendar` endpoint that generates an `.ics` file from the buddy's `workoutSchedule`
- FR-2: Add `GET /burn-squads/:id/calendar` endpoint that generates an `.ics` file from the squad's `settings.workoutSchedule`
- FR-3: Generated `.ics` files must conform to [RFC 5545](https://tools.ietf.org/html/rfc5545) iCalendar specification
- FR-4: Events use `RRULE` for weekly recurrence based on `WorkoutSchedule.days` (e.g., `RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR`)
- FR-5: When `WorkoutSchedule.time` is set (HH:MM format), create timed events with 1-hour duration; otherwise create all-day events
- FR-6: Each event includes a `VALARM` (reminder) set to 30 minutes before the event start
- FR-7: Event title format: `🔥 Workout with [displayName]` for buddies, `🔥 [squadName] Workout` for squads
- FR-8: Both endpoints require authentication and verify the requesting user is a member of the buddy/squad
- FR-9: Return HTTP 400 with a message if no workout schedule is configured
- FR-10: The web app shows the "Add to Calendar" button only when a schedule exists (non-empty `days` array)
- FR-11: The `.ics` download is triggered client-side via a fetch + blob download pattern (not a direct `<a>` link, since auth headers are required)

## Non-Goals

- No Google Calendar API or Apple CalDAV integration — only static `.ics` file download
- No subscribe/polling URL (webcal://) — schedule changes require re-downloading the `.ics` file
- No customization of event title, duration, or reminder time
- No calendar sync for individual (non-group) workouts
- No dedicated calendar view within the BurnBuddy app
- No mobile app implementation (web only for now)

## Dependencies

None

## Design Considerations

- Place the "Add to Calendar" button adjacent to the existing schedule editor (day toggles + time picker) on both buddy and squad detail pages
- Use a calendar icon (e.g., `📅` emoji or an SVG icon consistent with the existing UI) alongside "Add to Calendar" text
- Button should use the same styling as other action buttons on the page (consistent with existing Tailwind classes)
- Disable the button (or hide it) when no days are selected in the schedule

## Technical Considerations

- **iCalendar generation:** Use a lightweight library like `ical-generator` (npm) or build the `.ics` string manually — the format is simple enough for this use case (a few VEVENT entries with RRULE). Evaluate package size vs. hand-rolling.
- **Day mapping:** `WorkoutSchedule.days` uses `Mon`, `Tue`, etc. which must map to iCalendar's `BYDAY` values: `MO`, `TU`, `WE`, `TH`, `FR`, `SA`, `SU`
- **Timezone handling:** Use UTC for generated events. The user's calendar app will display in their local timezone. Include a `VTIMEZONE` component if using local times.
- **Partner display name:** The buddy calendar endpoint needs to look up the partner's `UserProfile.displayName`. The squad endpoint uses `BurnSquad.name` directly.
- **Auth on download:** Since the API requires a Bearer token, the frontend cannot use a simple `<a href="...">` link. Instead, use `fetch()` with the auth header, create a Blob from the response, and trigger a download via a temporary object URL.
- **File naming:** Downloaded file should be named `burnbuddy-[buddy-name].ics` or `burnbuddy-[squad-name].ics` (slugified, lowercase, hyphens).

## Success Metrics

- Users can download a working `.ics` file in under 2 seconds
- Downloaded `.ics` file opens correctly in Apple Calendar, Google Calendar, and Outlook
- Button is discoverable — appears in the natural location near the schedule editor

## Open Questions

No open questions.