# PRD: Primary Button Gradient

## Introduction

Add a red-orange to orange diagonal gradient to all primary (orange) action buttons across the BurnBuddy web app. Currently, primary buttons use a flat `#FF9500` orange background. This change introduces a subtle gradient that adds depth and visual energy to CTAs like "Start Workout", "Accept", "Send Request", and all other primary buttons — including the Firebase Auth widget buttons on the login page.

## Goals

- Apply a consistent red-orange → orange gradient to every primary button on the site
- Maintain visual harmony with the existing dark theme and orange brand color
- Centralize the gradient in a single CSS class for easy maintenance
- Ensure hover states darken the gradient appropriately

## User Stories

### US-001: Define gradient CSS class
**Description:** As a developer, I need a reusable CSS class that applies the primary gradient and hover state so I can use it across all buttons without duplicating styles.

**Acceptance Criteria:**
- [ ] Add a `.btn-primary-gradient` class in `apps/web/src/app/globals.css`
- [ ] Normal state: `linear-gradient(135deg, #FF6B35 0%, #FF9500 100%)` (red-orange to primary orange, diagonal)
- [ ] Hover state: darkened gradient `linear-gradient(135deg, #E55A2B 0%, #E08600 100%)`
- [ ] Typecheck passes

### US-002: Apply gradient to dashboard buttons
**Description:** As a user, I want the Start Workout button and other dashboard action buttons to have the gradient so they feel more vibrant and engaging.

**Acceptance Criteria:**
- [ ] Desktop "Start Workout" button uses `btn-primary-gradient` instead of `bg-primary` + `hover:bg-orange-600`
- [ ] Mobile "Start Workout" button (fixed bottom bar) uses `btn-primary-gradient`
- [ ] Workout type modal "Start Workout" submit button uses `btn-primary-gradient`
- [ ] "Accept" button on burn buddy requests uses `btn-primary-gradient`
- [ ] "Join Workout" inline button uses `btn-primary-gradient`
- [ ] "Add Burn Buddy" and "Add Burn Squad" icon buttons use `btn-primary-gradient`
- [ ] All buttons in `apps/web/src/app/(main)/page.tsx`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Apply gradient to friends page buttons
**Description:** As a user, I want the Add Friend and Send Burn Buddy Request buttons on the friends page to match the new gradient style.

**Acceptance Criteria:**
- [ ] "+ Add Friend" button uses `btn-primary-gradient`
- [ ] "Send Request" (burn buddy) button uses `btn-primary-gradient`
- [ ] All buttons in `apps/web/src/app/(main)/friends/page.tsx`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Apply gradient to burn buddy detail and creation pages
**Description:** As a user, I want the Save and Send buttons on burn buddy pages to use the gradient.

**Acceptance Criteria:**
- [ ] "Save Schedule" button on `apps/web/src/app/(main)/burn-buddies/[id]/page.tsx` uses `btn-primary-gradient`
- [ ] "Send Request" button on `apps/web/src/app/(main)/burn-buddies/new/page.tsx` uses `btn-primary-gradient`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Apply gradient to profile page buttons
**Description:** As a user, I want the Accept and Request Burn Buddy buttons on profile pages to use the gradient.

**Acceptance Criteria:**
- [ ] "Accept" button on `apps/web/src/app/(main)/profile/[uid]/page.tsx` uses `btn-primary-gradient`
- [ ] "Request Burn Buddy" button on the same page uses `btn-primary-gradient`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Apply gradient to account page buttons
**Description:** As a user, I want the Save and toggle buttons on the account page to use the gradient.

**Acceptance Criteria:**
- [ ] "Save" (username) button on `apps/web/src/app/(main)/account/page.tsx` uses `btn-primary-gradient`
- [ ] "Hide/Re-enable Getting Started" button uses `btn-primary-gradient` in its orange state (keep `bg-success` for the green state)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Apply gradient to Firebase Auth widget buttons
**Description:** As a user, I want the Sign In and Continue buttons on the login page to match the gradient style.

**Acceptance Criteria:**
- [ ] `.firebaseui-form-actions .mdl-button--raised.mdl-button--colored` uses the gradient instead of flat `background-color`
- [ ] Hover state uses the darkened gradient
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Define `.btn-primary-gradient` CSS class in `globals.css` with a 135° diagonal gradient from `#FF6B35` to `#FF9500`
- FR-2: Define `.btn-primary-gradient:hover` with darkened gradient from `#E55A2B` to `#E08600`
- FR-3: Replace `bg-primary` and `hover:bg-orange-600` Tailwind classes with `btn-primary-gradient` on all primary action buttons (15 instances across 6 component files)
- FR-4: Update Firebase Auth widget button CSS to use the same gradient with `!important` overrides
- FR-5: No changes to non-orange buttons (secondary/blue, success/green, danger/red)

## Non-Goals

- No changes to the `--color-primary` theme variable — it stays `#FF9500` for non-button uses (borders, text, focus rings)
- No gradient on secondary (blue) or other colored buttons
- No animation or transition effects beyond the existing hover behavior
- No changes to mobile app (Expo/React Native) styling
- No new Tailwind config entries — this is a plain CSS class

## Dependencies

None

## Design Considerations

- The gradient direction is 135° (top-left to bottom-right diagonal) for a natural light-source feel
- Colors stay within the orange family: `#FF6B35` (red-orange) → `#FF9500` (primary orange) — moderate intensity, clearly visible but not jarring
- Hover darkens both stops proportionally to maintain the gradient feel
- The `.btn-primary-gradient` class uses the `background` shorthand (not `background-color`) so it overrides any Tailwind `bg-*` utilities if both are present

## Technical Considerations

- The class is defined as plain CSS in `globals.css`, not as a `@utility`, so it has higher specificity than Tailwind utilities and will reliably override `bg-primary` if accidentally left in
- Firebase Auth widget buttons require `!important` to override the widget's inline styles
- Disabled buttons retain `disabled:opacity-50` which correctly dims the gradient

## Success Metrics

- All 15+ primary buttons across the web app display the gradient consistently
- No visual regressions on non-primary buttons or other orange-colored elements
- Gradient visible on both desktop and mobile viewports

## Open Questions

None — scope and design are fully defined.
