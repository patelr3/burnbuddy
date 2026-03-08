# PRD: Mobile Workout Button Relocation & Badge Cleanup

## Introduction

The "Start Workout" button is currently positioned inline within the scrollable home page content on both the web mobile view and the React Native mobile app. This makes it easy to lose as users scroll through their buddy/squad lists. Moving it to a fixed position at the bottom of the screen (above the navigation bar) makes the primary action always accessible, following common mobile UX patterns (e.g., floating action areas).

Additionally, the "🔥 Burn Buddy" and "🔥 Burn Squad" badge labels on buddy/squad list cards are unnecessary visual noise — the context already makes it clear whether an item is a buddy or squad. Removing them declutters the card UI.

## Goals

- Make the "Start Workout" action always visible and reachable regardless of scroll position
- Move the active workout banner to the same bottom area for consistency
- Remove redundant "🔥 Burn Buddy" / "🔥 Burn Squad" badges from list cards
- Apply changes to both the web mobile view and the React Native mobile app

## User Stories

### US-001: Move Start Workout button to fixed bottom position (Web)
**Description:** As a mobile web user, I want the "Start Workout" button pinned above the bottom nav bar so I can always start a workout without scrolling.

**Acceptance Criteria:**
- [ ] "Start Workout" button renders in a fixed-position container above the bottom navigation bar on mobile viewports (below `md` breakpoint)
- [ ] Button is not visible on desktop layout (desktop keeps existing inline placement, or hides since desktop has no bottom nav — match current behavior)
- [ ] Button remains full-width within the content area max-width (`max-w-xl`)
- [ ] Scroll content has enough bottom padding so no content is hidden behind the fixed button
- [ ] Tapping the button still opens the workout type selector modal
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-002: Move active workout banner to fixed bottom position (Web)
**Description:** As a mobile web user with an active workout, I want the active workout controls pinned at the bottom so I can always access Strike/End actions.

**Acceptance Criteria:**
- [ ] When an active workout exists, the active workout banner replaces the "Start Workout" button in the fixed bottom area
- [ ] Banner shows the workout type, elapsed time, and Strike/End Workout buttons
- [ ] Banner is fixed above the bottom nav bar on mobile viewports
- [ ] On desktop, active workout banner stays in its current top-of-page position
- [ ] Scroll content has enough bottom padding so no content is hidden
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Move Start Workout button to fixed bottom position (Mobile App)
**Description:** As a React Native mobile user, I want the "Start Workout" button pinned at the bottom of the screen so I can always start a workout without scrolling.

**Acceptance Criteria:**
- [ ] "Start Workout" button renders outside the `ScrollView`, positioned at the bottom of the screen
- [ ] Button sits above any tab navigation (if applicable) or at the screen's safe-area bottom
- [ ] ScrollView content is not obscured by the button (appropriate bottom padding or inset)
- [ ] Tapping the button still opens the workout type selector modal
- [ ] Typecheck passes

### US-004: Move active workout banner to fixed bottom position (Mobile App)
**Description:** As a React Native mobile user with an active workout, I want the active workout controls pinned at the bottom for consistent access.

**Acceptance Criteria:**
- [ ] When an active workout exists, the active workout banner replaces the "Start Workout" button at the bottom
- [ ] Banner shows workout type, elapsed time, and Strike/End Workout buttons
- [ ] Banner is positioned outside the ScrollView at the bottom of the screen
- [ ] ScrollView content is not obscured by the banner
- [ ] Typecheck passes

### US-005: Remove burn buddy/squad badge from list cards (Web)
**Description:** As a user, I want a cleaner buddy/squad card design without the redundant "🔥 Burn Buddy" / "🔥 Burn Squad" badge label.

**Acceptance Criteria:**
- [ ] The `<span>` badge showing "🔥 Burn Buddy" or "🔥 Burn Squad" is removed from the combined buddy/squad list cards on the web home page (currently at ~line 482 in `page.tsx`)
- [ ] The rest of the card layout (name, avatar, streak count) remains unchanged
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Remove burn buddy/squad badge from list cards (Mobile App)
**Description:** As a mobile user, I want a cleaner buddy/squad card design without the redundant badge labels.

**Acceptance Criteria:**
- [ ] The "🔥 Burn Buddy" / "🔥 Burn Squad" type label text is removed from buddy and squad list cards in `HomeScreen.tsx` (currently at ~lines 460, 486)
- [ ] The rest of the card layout (name, avatar, streak count) remains unchanged
- [ ] Typecheck passes

## Functional Requirements

- FR-1: On web mobile viewports (below `md` breakpoint), render a fixed-position container above the bottom nav bar that holds either the "Start Workout" button or the active workout banner
- FR-2: On web desktop viewports, maintain current layout behavior (no fixed bottom element)
- FR-3: On the React Native mobile app, render the "Start Workout" button or active workout banner outside the ScrollView, fixed at the bottom of the screen above the safe area
- FR-4: Add sufficient bottom padding/margin to scrollable content areas so they are not obscured by the fixed bottom element
- FR-5: Remove the "🔥 Burn Buddy" / "🔥 Burn Squad" badge `<span>` from web home page list cards
- FR-6: Remove the equivalent badge text from React Native home screen list cards
- FR-7: The workout type selector modal must still open correctly when the relocated button is tapped
- FR-8: The Strike and End Workout actions must still function correctly from the relocated banner

## Non-Goals

- No changes to the "🔥 BurnBuddy" branding in the web nav bar or "buddyburn 🔥" mobile header
- No changes to the burn streak fire emoji displays (e.g., "🔥 3")
- No changes to workout selector modal design or behavior
- No changes to desktop web layout
- No addition of new floating action buttons or gesture-based interactions
- No changes to the "+ Burn Buddy" / "+ Burn Squad" action buttons

## Dependencies

None

## Design Considerations

- The fixed bottom container on web should use the same dark theme styling as the existing bottom nav bar (`bg-black/90`, `border-gray-800`)
- The "Start Workout" button should keep its current orange/primary color and full-width styling
- The active workout banner should maintain its current visual design but adapt to the narrower bottom bar context
- On web, the fixed container should respect the `max-w-xl` content width for visual consistency, or span full width like the nav bar — prefer full width with centered content to match the nav bar pattern
- On React Native, use `SafeAreaView` or appropriate bottom insets to avoid the home indicator area

## Technical Considerations

- **Web:** The bottom nav bar is in `NavBar.tsx` (lines 86-107, `fixed bottom-0`). The new workout area should sit directly above it. Consider adding it to the `(main)/layout.tsx` or as a sibling in `NavBar.tsx`. The main layout already has `pb-20 md:pb-0` for the nav bar — this padding will need to increase to accommodate the new element.
- **Web:** The Start Workout button and active workout banner state lives in `page.tsx`. The fixed bottom element will need access to `activeWorkout` state and the `setShowWorkoutSelector` callback. Consider lifting this into the layout or using a shared context/store.
- **Mobile:** The `HomeScreen.tsx` uses a `<View style={styles.container}>` → `<ScrollView>` structure. The button should move from inside the ScrollView to a sibling View below it, still inside the container.
- **Z-index:** Ensure the fixed bottom workout area renders above scroll content but below modals.

## Success Metrics

- "Start Workout" button is always visible on mobile without scrolling
- Active workout controls are always accessible on mobile without scrolling
- Home page buddy/squad cards look cleaner without redundant badge labels
- No regressions in workout start/end flows

## Open Questions

- Should the fixed bottom workout area have a subtle top shadow/border to visually separate it from scrolling content?
- Should there be a brief entrance animation when the bottom area appears (e.g., after ending a workout, the "Start Workout" button slides in)?
