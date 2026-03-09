# PRD: User Profile — Health Info & Workout Goals

## Introduction

Extend the user profile to include health-related fields (height, weight, date of birth) and a primary workout goal. These fields enable personalized experiences (e.g., calorie estimates based on weight), goal-based motivation, and richer context for the user. Height, weight, and date of birth are **private** — visible only to the profile owner. The workout goal is also private by default. Users are prompted to fill in these fields during onboarding but may skip and complete them later in account settings.

## Goals

- Allow users to store height, weight, and date of birth on their profile
- Allow users to select a primary workout goal from a preset list
- Keep health data private (visible only to the profile owner)
- Introduce a unit preference (metric/imperial) so height and weight display correctly
- Prompt new users to complete their health profile during onboarding (skippable)
- Lay groundwork for future personalization features (calorie estimates, goal-based nudges)

## User Stories

### US-001: Add health and goal fields to shared types and API
**Description:** As a developer, I need the `UserProfile` type and API to support health fields and workout goals so they can be stored and retrieved.

**Acceptance Criteria:**
- [ ] `UserProfile` type in `@burnbuddy/shared` includes new optional fields: `heightCm?: number`, `weightKg?: number`, `dateOfBirth?: string` (ISO 8601 date), `workoutGoal?: WorkoutGoal`, `unitPreference?: 'metric' | 'imperial'`
- [ ] New `WorkoutGoal` type exported from `@burnbuddy/shared`: `'lose_weight' | 'build_muscle' | 'stay_active' | 'improve_endurance' | 'reduce_stress'`
- [ ] `PUT /users/me` accepts and persists all new fields
- [ ] `GET /users/me` returns all new fields when present
- [ ] Validation: `heightCm` must be 50–300, `weightKg` must be 10–500, `dateOfBirth` must be a valid past date (user must be at least 13 years old), `workoutGoal` must be one of the allowed values, `unitPreference` must be `'metric'` or `'imperial'`
- [ ] Invalid values return 400 with a descriptive error message
- [ ] Existing API tests continue to pass
- [ ] New unit tests cover validation and persistence of each field
- [ ] Typecheck passes

### US-002: Add health info section to account settings
**Description:** As a user, I want to view and edit my height, weight, date of birth, and unit preference in account settings so I can keep my profile up to date.

**Acceptance Criteria:**
- [ ] New "Health & Body" section in account settings page (below existing profile section)
- [ ] Height field: numeric input that displays in ft/in or cm based on `unitPreference`
- [ ] Weight field: numeric input that displays in lbs or kg based on `unitPreference`
- [ ] Date of birth field: date picker (or month/day/year selects)
- [ ] Unit preference toggle: Metric (kg, cm) / Imperial (lbs, ft/in)
- [ ] Switching unit preference converts displayed values (no data loss — always stored as cm/kg)
- [ ] Each field saves on blur or explicit save, consistent with existing settings UX
- [ ] Empty/unset fields show placeholder text encouraging the user to add them
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Add workout goal selector to account settings
**Description:** As a user, I want to select my primary workout goal so the app knows what I'm working toward.

**Acceptance Criteria:**
- [ ] New "Workout Goal" section in account settings (below Health & Body section)
- [ ] Displays 5 goal options as selectable cards or radio buttons: Lose Weight, Build Muscle, Stay Active, Improve Endurance, Reduce Stress
- [ ] Each option has a short label and an icon/emoji for visual clarity
- [ ] Currently selected goal is visually highlighted
- [ ] Selecting a goal saves immediately via `PUT /users/me`
- [ ] User can deselect (set to no goal) if they change their mind
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Onboarding prompt for health info and goal
**Description:** As a new user, I want to be prompted to set up my health info and workout goal so I get a personalized experience from the start.

**Acceptance Criteria:**
- [ ] After initial profile creation (first login), user sees a setup prompt before the dashboard
- [ ] Prompt includes: unit preference toggle, height, weight, date of birth, and workout goal
- [ ] User can fill in any combination of fields or skip entirely
- [ ] "Skip" and "Save & Continue" buttons at the bottom
- [ ] On save or skip, user proceeds to the normal dashboard with the getting started card
- [ ] Skipped users see a subtle nudge in account settings to complete their profile (e.g., "Complete your health profile" banner)
- [ ] Prompt only appears once — tracked via a new `healthProfilePromptDismissed` field on `UserProfile`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Display age (computed) on own profile
**Description:** As a user, I want to see my age displayed on my profile (computed from date of birth) so I don't have to calculate it myself.

**Acceptance Criteria:**
- [ ] Account settings shows computed age next to the date of birth field (e.g., "March 15, 1990 (35 years old)")
- [ ] Age is computed client-side from `dateOfBirth`, not stored
- [ ] If `dateOfBirth` is not set, no age is shown
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- **FR-1:** Add optional fields to `UserProfile`: `heightCm` (number), `weightKg` (number), `dateOfBirth` (string, ISO 8601 date), `workoutGoal` (WorkoutGoal enum), `unitPreference` ('metric' | 'imperial'), `healthProfilePromptDismissed` (boolean)
- **FR-2:** Export `WorkoutGoal` type from `@burnbuddy/shared` with values: `'lose_weight'`, `'build_muscle'`, `'stay_active'`, `'improve_endurance'`, `'reduce_stress'`
- **FR-3:** Always store height in centimeters and weight in kilograms internally, regardless of display preference
- **FR-4:** `PUT /users/me` validates and persists all new fields; invalid input returns 400
- **FR-5:** `GET /users/me` returns new fields when present; `GET /users/:uid` and `GET /users/:uid/profile` do NOT expose health fields (they are private)
- **FR-6:** Account settings displays Health & Body and Workout Goal sections with inline editing
- **FR-7:** Unit preference toggle converts displayed height/weight values between metric and imperial
- **FR-8:** New user onboarding prompt appears once after first login, before the dashboard
- **FR-9:** Age is computed client-side from `dateOfBirth` and displayed as a read-only derived value
- **FR-10:** Default `unitPreference` is auto-detected from browser locale on first use (US/UK → imperial, others → metric). User can override anytime

## Non-Goals

- No calorie estimation or BMI calculation (future feature that would consume these fields)
- No sharing health data with burn buddies or on the public profile
- No historical tracking of weight/height changes over time
- No goal progress tracking or goal-based notifications (future feature)
- No integration with fitness wearables or health APIs (Apple Health, Google Fit)
- No mobile app changes (mobile will pick up shared type changes but UI is out of scope)

## Dependencies

None

## Design Considerations

- **Unit conversion helpers:** Create reusable utility functions for cm↔ft/in and kg↔lbs conversions in `@burnbuddy/shared` so both web and mobile can use them
- **Goal display labels:** Store goals as snake_case enum values (`lose_weight`) but display human-readable labels ("Lose Weight") with optional emoji (🏋️ Build Muscle, 🏃 Lose Weight, ✨ Stay Active, 💪 Improve Endurance, 🧘 Reduce Stress)
- **Onboarding UX:** Keep it lightweight — a single card/modal, not a multi-step wizard. The existing "Getting Started" card pattern is a good reference for dismissible prompts
- **Privacy indicator:** Consider showing a small lock icon next to the Health & Body section header to reinforce that this data is private

## Technical Considerations

- **Storage:** All new fields are optional on the Firestore `users` document. No migration needed — documents without these fields continue to work
- **Validation:** Server-side validation in the `PUT /users/me` handler. Client-side validation for UX but server is source of truth
- **Shared package:** After adding types, run `yarn build` in `packages/shared` before other packages can see the changes
- **Date of birth vs age:** Store `dateOfBirth` (stable), compute age at display time (changes yearly). Never store computed age
- **Internal units:** Always store metric (cm, kg). Convert at display time based on `unitPreference`. This avoids precision loss from repeated conversions

## Success Metrics

- Users can set and update all health fields within 2 clicks of reaching account settings
- Onboarding prompt completion rate > 40% (users who fill in at least one field when prompted)
- No regression in profile load times (new fields add negligible Firestore read cost)

## Open Questions

_All resolved._

- ~~Should the workout goal be visible to burn buddies?~~ **No** — fully private for now. Can revisit as a future social motivation feature.
- ~~Should we show workout goal on the dashboard?~~ **No** — keep it in account settings only for this iteration.
- ~~What default `unitPreference` should new users get?~~ **Auto-detect from browser locale** — US/UK → imperial, most others → metric. User can override in settings or during onboarding.
