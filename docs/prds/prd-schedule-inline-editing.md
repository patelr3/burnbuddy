# PRD: Schedule Inline Editing

## Introduction

The current schedule editing experience on Burn Buddy and Burn Squad detail pages requires users to click a dedicated "Edit Schedule" (or "Edit Settings") button in the page header. This is unintuitive — the schedule display itself should be the entry point for editing. This PRD redesigns the schedule UX so that:

- The schedule box is the sole entry point for schedule management (for Burn Buddies).
- When no schedule exists, a dashed-border placeholder invites the user to add one.
- Tapping an existing schedule expands the inline editor directly below it.

For Burn Squads, schedule editing is available both inline (via the schedule box) **and** in the existing settings panel, since the settings button serves other purposes (squad name, admin controls, delete).

## Goals

- Remove the "Edit Schedule" button from the Burn Buddy detail page header
- Replace the empty schedule state with an inviting "Add a schedule" placeholder box
- Make the existing schedule box clickable to toggle inline editing
- Apply the same inline schedule interaction pattern to Burn Squads
- Keep schedule editing in the Burn Squad settings panel as an additional access point

## User Stories

### US-001: Remove Edit Schedule button from Burn Buddy header
**Description:** As a user, I no longer see an "Edit Schedule" button in the top-right of the Burn Buddy detail page, because schedule management is handled entirely through the schedule box.

**Acceptance Criteria:**
- [ ] The "Edit Schedule" button is removed from the Burn Buddy detail page header
- [ ] No regression in other header elements (back button, buddy name, etc.)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-002: Add a schedule placeholder for Burn Buddies
**Description:** As a user viewing a Burn Buddy with no schedule, I see a dashed-border placeholder box with a "+" icon and "Add a schedule" text, so I know I can create one.

**Acceptance Criteria:**
- [ ] When no schedule is set, a dashed-border box is displayed in the schedule area
- [ ] The box contains a "+" icon and "Add a schedule" text
- [ ] The box uses a muted/secondary color scheme (not the orange of an active schedule)
- [ ] A small chevron indicator is shown on the box to hint at interactivity
- [ ] Clicking the placeholder expands the inline day/time editor below it
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Tap schedule to edit for Burn Buddies
**Description:** As a user viewing a Burn Buddy with an existing schedule, I can tap the orange schedule box to expand the inline editor and modify days/time.

**Acceptance Criteria:**
- [ ] The existing orange schedule box is visually clickable (cursor pointer, hover state)
- [ ] A small chevron indicator (▾ collapsed, ▴ expanded) is shown on the box
- [ ] Clicking the schedule box toggles the inline day/time editor open/closed below it
- [ ] The editor is pre-populated with the current schedule days and time
- [ ] The editor only collapses via Save or Cancel buttons (not by clicking outside)
- [ ] Saving the schedule collapses the editor and updates the displayed schedule
- [ ] The "Add to Calendar" button remains accessible (not hidden by the editor)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Add a schedule placeholder for Burn Squads
**Description:** As a user viewing a Burn Squad with no schedule, I see the same dashed-border "Add a schedule" placeholder, consistent with the Burn Buddy experience.

**Acceptance Criteria:**
- [ ] When no schedule is set on a squad, a dashed-border placeholder box appears in the schedule area
- [ ] The box contains a "+" icon and "Add a schedule" text
- [ ] A small chevron indicator is shown on the box
- [ ] Clicking the placeholder expands the inline day/time editor below it
- [ ] Only squad admins can interact with the placeholder (non-admins see nothing or a read-only state)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Tap schedule to edit for Burn Squads
**Description:** As a squad admin viewing a squad with an existing schedule, I can tap the schedule box to expand the inline editor.

**Acceptance Criteria:**
- [ ] The schedule box on the squad detail page is clickable for admins
- [ ] A small chevron indicator (▾ collapsed, ▴ expanded) is shown on the box
- [ ] Clicking toggles the inline day/time editor open/closed below it
- [ ] The editor is pre-populated with the current schedule
- [ ] The editor only collapses via Save or Cancel buttons
- [ ] Saving updates the displayed schedule and collapses the editor
- [ ] Non-admin members see the schedule box but cannot click to edit
- [ ] Schedule editing in the settings panel continues to work independently
- [ ] The "Add to Calendar" button remains accessible
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Remove the "Edit Schedule" button from the Burn Buddy detail page header bar
- FR-2: When a Burn Buddy has no `workoutSchedule`, display a dashed-border placeholder box with a "+" icon and "Add a schedule" text in place of the schedule display area
- FR-3: Clicking the "Add a schedule" placeholder on a Burn Buddy page expands the existing inline day/time editor (same day toggles + time input + save button)
- FR-4: When a Burn Buddy has a `workoutSchedule`, the orange schedule info box must be clickable (cursor pointer, subtle hover effect) and toggle the inline editor on click
- FR-5: The inline editor must be pre-populated with the current `workoutSchedule.days` and `workoutSchedule.time` when opened
- FR-6: Saving from the inline editor collapses it and refreshes the displayed schedule
- FR-7: When a Burn Squad has no `workoutSchedule`, display the same dashed-border placeholder (admin-only interaction)
- FR-8: When a Burn Squad has a `workoutSchedule`, the schedule box is clickable for admins to toggle inline editing
- FR-9: Non-admin squad members see the schedule display (or nothing if no schedule) but cannot open the editor
- FR-10: The Burn Squad settings panel retains its existing schedule editing section unchanged
- FR-11: The "Add to Calendar" button remains visible and functional when the inline editor is open

## Non-Goals

- No changes to the schedule data model (`WorkoutSchedule` type stays the same)
- No changes to API endpoints (schedule save uses the same PUT endpoints)
- No changes to the Burn Squad settings panel schedule section
- No changes to the dashboard/home page schedule display
- No changes to calendar export functionality
- No animation or transition effects required (nice-to-have, not required)

## Dependencies

None

## Design Considerations

- **Placeholder box style:** Dashed border (`border-dashed`), muted text color, centered "+" icon above "Add a schedule" text. Should feel like an empty-state invitation, not a disabled element.
- **Clickable schedule box:** Add `cursor-pointer`, a subtle hover effect (slight brightness change or border highlight), and a small chevron/arrow indicator to the existing orange/violet schedule info box to signal interactivity.
- **Editability indicator:** A small chevron (▾ when collapsed, ▴ when expanded) on the right side of the schedule box and the "Add a schedule" placeholder hints that clicking opens the editor.
- **Editor placement:** The day/time editor expands directly below the schedule box, pushing content down. Same layout as the current edit mode but without the header button trigger.
- **Collapse behavior:** The editor only collapses via "Save Schedule" or "Cancel" buttons — clicking outside does not dismiss it, preventing accidental loss of changes. Both buttons are shown side-by-side at the bottom of the editor.
- **Reuse existing components:** The day toggle buttons, time input, and save logic already exist in both pages — refactor into a shared `ScheduleEditor` component if practical.

## Technical Considerations

- The Burn Buddy detail page currently uses a single `isEditing` boolean state to control the edit panel. This can be repurposed to be toggled by clicking the schedule box instead of the header button.
- The Burn Squad detail page uses `isEditingSettings` which controls the entire settings panel. A separate `isEditingSchedule` state will be needed for the inline schedule editor.
- Consider extracting shared schedule editor UI (day toggles, time input, save button) into a reusable component to reduce duplication across buddy and squad pages.
- No API changes required — the same PUT endpoints are used for saving schedule data.

## Success Metrics

- Schedule editing is accessible in fewer clicks (1 click to open editor vs. current 1 click on header button — parity, but more discoverable)
- Empty schedule state is visually clear and inviting (no more hidden "Edit Schedule" button)
- No increase in user confusion — the schedule box affordance is obvious

## Open Questions

All resolved:

- **Collapse behavior:** The inline editor only collapses via Save or Cancel buttons — clicking outside does not dismiss it. This prevents accidental loss of changes.
- **Editability indicator:** A small chevron/arrow indicator is displayed on the schedule box (and the "Add a schedule" placeholder) to hint that it is interactive.
