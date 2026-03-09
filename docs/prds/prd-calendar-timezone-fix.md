# PRD: Calendar Timezone Fix

## Introduction

The "Add to Calendar" button on burn buddy and burn squad detail pages generates `.ics` files that display workout times incorrectly on the user's device. The root cause: `WorkoutSchedule.time` stores a bare `HH:MM` string (e.g., `"07:00"`) with no timezone context, and the ICS generator (`ics-generator.ts`) treats this as UTC by calling `setUTCHours()`. When a user in EST sets their workout to 7:00 AM, the calendar event appears at 2:00 AM local time.

This PRD adds timezone awareness by storing the user's IANA timezone (e.g., `America/New_York`) on their profile, auto-detecting it from the browser, and generating `.ics` files with proper `VTIMEZONE` components so events appear at the intended local time.

## Goals

- Fix calendar events to display at the correct local time the user intended when setting their schedule
- Auto-detect and persist user timezone with zero friction (no manual selection required)
- Use RFC 5545 `VTIMEZONE` for maximum calendar app compatibility (Apple Calendar, Google Calendar, Outlook)
- Backfill timezone for existing users silently on their next session

## User Stories

### US-001: Add timezone field to UserProfile type

**Description:** As a developer, I need to store a user's IANA timezone string on their profile so it can be used when generating calendar events.

**Acceptance Criteria:**
- [ ] Add optional `timezone?: string` field to the `UserProfile` interface in `packages/shared/src/types.ts`
- [ ] Field stores IANA timezone identifiers (e.g., `"America/New_York"`, `"Europe/London"`, `"Asia/Tokyo"`)
- [ ] Rebuild shared package (`cd packages/shared && yarn build`)
- [ ] Typecheck passes for all workspaces that import `@burnbuddy/shared`

### US-002: Accept and persist timezone on profile creation and update

**Description:** As a developer, I need the API to accept a `timezone` field when creating or updating a user profile so the frontend can send the detected timezone.

**Acceptance Criteria:**
- [ ] `POST /users` accepts optional `timezone` field in the request body and stores it on the profile
- [ ] `PUT /users/me` accepts optional `timezone` field and updates it on the profile
- [ ] Invalid timezone values (empty string, non-string) are silently ignored — do not reject the request
- [ ] Existing profile data is not affected when timezone is not provided
- [ ] Add unit tests: profile creation with timezone, profile update with timezone, profile update without timezone (no regression)
- [ ] Typecheck passes

### US-003: Auto-detect and send timezone from web app

**Description:** As a user, I want my timezone to be automatically detected and saved so my calendar exports show the correct time — without needing to configure anything.

**Acceptance Criteria:**
- [ ] On login (after Firebase Auth completes), the web app reads the browser's timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`
- [ ] The detected timezone is sent to `PUT /users/me` with the `timezone` field
- [ ] This happens silently on every session start (login/page load with existing session), keeping the timezone current if the user travels
- [ ] If `Intl.DateTimeFormat` is unavailable (very old browsers), the call is skipped gracefully — no errors shown
- [ ] Typecheck passes

### US-004: Generate timezone-aware .ics files

**Description:** As a user, I want the downloaded .ics file to contain events in my local timezone so they appear at the time I intended on my calendar.

**Acceptance Criteria:**
- [ ] `generateIcs()` accepts an optional `timezone` parameter (IANA string, e.g., `"America/New_York"`)
- [ ] When timezone is provided, the `.ics` file includes a `VTIMEZONE` component and `DTSTART`/`DTEND` use `TZID=` parameter instead of the `Z` (UTC) suffix
- [ ] When timezone is not provided (legacy/fallback), behavior is unchanged — events use UTC as before
- [ ] The schedule time `"07:00"` with timezone `"America/New_York"` results in an event at 7:00 AM Eastern, not 7:00 AM UTC
- [ ] Events with `VTIMEZONE` import correctly into Apple Calendar, Google Calendar, and Outlook (verified manually)
- [ ] Add unit tests: ICS generation with timezone, ICS generation without timezone (backward compat), different timezone values produce different `VTIMEZONE` blocks
- [ ] Typecheck passes

### US-005: Pass user timezone to calendar endpoints

**Description:** As a developer, I need the burn buddy and burn squad calendar endpoints to look up the requesting user's timezone and pass it to the ICS generator.

**Acceptance Criteria:**
- [ ] `GET /burn-buddies/:id/calendar` reads the requesting user's `timezone` from their profile and passes it to `generateIcs()`
- [ ] `GET /burn-squads/:id/calendar` reads the requesting user's `timezone` from their profile and passes it to `generateIcs()`
- [ ] If the user has no timezone stored, the endpoints fall back to UTC (current behavior)
- [ ] No additional API calls are needed from the client — timezone comes from the server-side profile lookup
- [ ] Add unit tests: calendar download with user timezone set, calendar download without timezone (fallback)
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Add `timezone?: string` field to the `UserProfile` interface in `@burnbuddy/shared` (IANA timezone format)
- FR-2: `POST /users` and `PUT /users/me` accept and persist the `timezone` field
- FR-3: The web app auto-detects the browser timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` and sends it to the API on every session start
- FR-4: `generateIcs()` accepts an optional `timezone` parameter; when provided, it emits a `VTIMEZONE` component and uses `TZID=` on `DTSTART`/`DTEND` instead of UTC `Z` suffix
- FR-5: `GET /burn-buddies/:id/calendar` and `GET /burn-squads/:id/calendar` look up the requesting user's `timezone` and pass it to `generateIcs()`
- FR-6: When no timezone is stored on the user's profile, calendar endpoints fall back to UTC (backward-compatible)
- FR-7: The timezone detection and storage must not block or delay the user's login flow — it runs as a non-blocking side effect

## Non-Goals

- No manual timezone picker or settings UI — auto-detection only
- No timezone-aware streak calculations (streaks remain UTC-based; tracked separately in `prd-supernova-streak-fix.md`)
- No timezone display on the schedule editor UI
- No mobile app changes — timezone detection is web-only for now
- No re-download prompt when timezone changes — users re-download manually if needed
- No VTIMEZONE generation library — use a minimal inline approach for the single-timezone case

## Dependencies

- `prd-calendar-sync.md` (complete) — the original Add to Calendar feature this PRD fixes

## Design Considerations

- No UI changes are needed — timezone detection and storage happens invisibly
- The "Add to Calendar" button and download flow remain exactly the same from the user's perspective
- The only user-visible change is that downloaded `.ics` files now contain events at the correct local time

## Technical Considerations

### VTIMEZONE in .ics files

RFC 5545 requires a `VTIMEZONE` component when using `TZID` on event times. A minimal approach:

```
BEGIN:VTIMEZONE
TZID:America/New_York
X-LIC-LOCATION:America/New_York
END:VTIMEZONE

BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260309T070000
DTEND;TZID=America/New_York:20260309T080000
...
END:VEVENT
```

For maximum compatibility, include `STANDARD` and `DAYLIGHT` sub-components with the timezone's UTC offset rules. However, most modern calendar apps (Apple Calendar, Google Calendar, Outlook) recognize IANA timezone IDs in the `TZID` parameter and resolve offsets internally, so a minimal `VTIMEZONE` block (with `X-LIC-LOCATION`) is sufficient.

If broader compatibility is needed later, consider the `@touch4it/ical-timezones` npm package which provides pre-built VTIMEZONE definitions for all IANA zones.

### Timezone detection reliability

`Intl.DateTimeFormat().resolvedOptions().timeZone` returns an IANA timezone string in all modern browsers (Chrome 24+, Firefox 52+, Safari 10+, Edge 15+). It reflects the OS timezone setting and updates if the user changes their system timezone. No polyfill needed for our target browsers.

### Firestore schema

No migration needed — Firestore is schemaless. The new `timezone` field is simply written alongside existing profile fields. Existing documents without the field will return `undefined` for `timezone`, which triggers the UTC fallback.

### ICS generator changes

The `formatDateTimeUTC()` helper currently produces `YYYYMMDDTHHmmssZ`. When a timezone is provided, a new `formatDateTimeLocal()` helper should produce `YYYYMMDDTHHmmss` (no `Z` suffix) and the `DTSTART`/`DTEND` lines should use the `TZID=` parameter format.

## Success Metrics

- Calendar events from `.ics` downloads display at the same time the user set in the schedule editor
- Zero user-facing friction — timezone is captured and applied automatically
- No regression in calendar functionality for users without a stored timezone

## Open Questions

No open questions. All resolved:

- **Timezone validation:** Trust the browser — no server-side validation needed. `Intl.DateTimeFormat` only returns valid IANA strings, and the field is optional, so invalid values simply result in the UTC fallback.
- **Timezone at download time vs. schedule-creation time:** Use the user's current stored timezone at download time. Since we don't store a per-schedule timezone, the user's profile timezone is the best available signal. If a user travels and re-downloads, events will reflect their new timezone — they can re-download to correct if needed.
