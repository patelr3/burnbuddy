# PRD: UI Theme & Icon Updates

## Introduction

The BurnBuddy web app currently uses green (#30D158) as its primary accent color and relies on text labels for action buttons. This PRD covers visual updates across web and mobile: changing the primary color to orange globally, replacing the "+ Burn Buddy" and "+ Burn Squad" text buttons with icon buttons, fixing the "Add to Calendar" button to match the dark theme, and improving the mobile friends page layout.

## Goals

- Establish orange as the global primary brand color, replacing green
- Replace text-based action buttons with recognizable icon buttons for a cleaner UI
- Ensure all interactive elements are consistent with the dark theme
- Install Lucide React as the standard icon library for the project

## User Stories

### US-001: Rename "Burn Buddies & Squads" section header
**Description:** As a user, I want the home page section header to simply say "Burn Buddies" instead of "Burn Buddies & Squads" for a cleaner, simpler label.

**Acceptance Criteria:**
- [ ] Update the `<h2>` text in `apps/web/src/app/(main)/page.tsx` from "Burn Buddies & Squads" to "Burn Buddies"
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-002: Update home page card labels to use fire emoji
**Description:** As a user, I want the burn buddy and burn squad card labels on the home page to say "🔥 Burn Buddy" and "🔥 Burn Squad" (matching the friends page style) instead of the plain "Buddy" / "Squad" tags.

**Acceptance Criteria:**
- [ ] Update the badge text in `apps/web/src/app/(main)/page.tsx` from `"Buddy"` to `"🔥 Burn Buddy"` and from `"Squad"` to `"🔥 Burn Squad"`
- [ ] Styling remains consistent (amber for buddies, secondary/blue for squads) but may be adjusted to match friends page styling if appropriate
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Change global primary color to orange
**Description:** As a user, I want the app to use orange as its primary accent color so that the brand identity feels warm and energetic.

**Acceptance Criteria:**
- [ ] Update `tailwind.config.ts` primary color from `#30D158` (green) to an orange value (e.g. `#FF9500`)
- [ ] All buttons and UI elements referencing `bg-primary`, `text-primary`, `border-primary` reflect the new orange color
- [ ] Replace any hardcoded `bg-green-500`/`hover:bg-green-600` classes on action buttons with `bg-primary`/`hover:bg-primary-hover` (or equivalent orange shade)
- [ ] Success states (if any) remain green — only the primary accent changes
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Install Lucide React icon library
**Description:** As a developer, I need an icon library installed so that I can use consistent, high-quality icons throughout the app.

**Acceptance Criteria:**
- [ ] `lucide-react` is added as a dependency in `apps/web/package.json`
- [ ] `yarn install` completes successfully
- [ ] A Lucide icon can be imported and rendered without errors
- [ ] Typecheck passes

### US-005: Replace "+ Burn Buddy" and "+ Burn Squad" buttons with icon buttons
**Description:** As a user, I want compact icon buttons for adding Burn Buddies and Burn Squads so that the header area looks cleaner and more modern.

**Acceptance Criteria:**
- [ ] The "+ Burn Buddy" link in `apps/web/src/app/(main)/page.tsx` is replaced with a Lucide `UserPlus` icon (single person icon)
- [ ] The "+ Burn Squad" link is replaced with a Lucide `UsersRound` icon (group icon) or similar group-person icon
- [ ] Both icon buttons retain their links (`/burn-buddies/new` and `/burn-squads/new`)
- [ ] Icon buttons have a tooltip or `aria-label` for accessibility (e.g. "Add Burn Buddy", "Add Burn Squad")
- [ ] Icon buttons use the new orange primary color as background with white icon color
- [ ] Icons have appropriate hover state (darker shade on hover)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Fix "Add to Calendar" button dark theme
**Description:** As a user, I want the "Add to Calendar" button to match the app's dark theme instead of appearing as a jarring white button.

**Acceptance Criteria:**
- [ ] Update `AddToCalendarButton.tsx` to use dark surface-elevated styling (`bg-surface-elevated` or equivalent `bg-[#2C2C2E]`)
- [ ] Text color is white (`text-white`)
- [ ] Border matches dark theme (e.g. `border-[#3A3A3C]` or `border-surface-elevated`)
- [ ] Hover state uses a slightly lighter dark shade (not white/gray)
- [ ] The loading spinner is visible against the dark background
- [ ] The 📅 emoji or a Lucide `Calendar` icon is clearly visible
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Fix mobile friends page row spacing and remove email
**Description:** As a mobile user, I want the friends list rows on the friends page to have comfortable spacing (similar to the home page cards) and not display email addresses, since usernames are now supported.

**Acceptance Criteria:**
- [ ] Increase `paddingVertical` on `friendRow` style in `apps/mobile/src/screens/FriendsScreen.tsx` to match or approach the home page card spacing (e.g. `paddingVertical: 12`, `paddingHorizontal: 14`)
- [ ] Remove the `<Text style={styles.friendEmail}>{friend.email}</Text>` element from friend rows
- [ ] Remove the `friendEmail` style definition (cleanup)
- [ ] Friend rows no longer look smushed/squashed — visually closer to home page list cards
- [ ] Typecheck passes
- [ ] Verify on mobile or emulator

## Functional Requirements

- FR-1: Update the home page section header from "Burn Buddies & Squads" to "Burn Buddies"
- FR-2: Update home page card badge labels from "Buddy"/"Squad" to "🔥 Burn Buddy"/"🔥 Burn Squad" to match the friends page convention
- FR-3: Update `tailwind.config.ts` to set the primary color to orange (`#FF9500` or similar warm orange)
- FR-4: Audit all components using hardcoded `bg-green-500`/`bg-green-600` on action buttons and replace with `bg-primary` / orange equivalent
- FR-5: Install `lucide-react` as a dependency in the web app workspace
- FR-6: Replace the "+ Burn Buddy" text link with a `UserPlus` (or `UserRoundPlus`) icon button linking to `/burn-buddies/new`
- FR-7: Replace the "+ Burn Squad" text link with a `UsersRound` (or `Users`) icon button linking to `/burn-squads/new`
- FR-8: Both icon buttons must include `aria-label` attributes for screen reader accessibility
- FR-9: Update `AddToCalendarButton.tsx` styling to use `bg-surface-elevated` background, `text-white` text, and dark-appropriate border/hover states
- FR-10: Ensure the calendar button loading spinner SVG uses white or light-colored stroke for visibility on dark background
- FR-11: Increase padding and spacing on mobile friends page friend rows in `FriendsScreen.tsx` to reduce smushed appearance
- FR-12: Remove email display from mobile friends page friend rows (username is sufficient)

## Non-Goals

- No redesign of the overall layout or navigation
- No new button component library or design system abstraction
- No changes to success/error/danger color semantics (green for success, red for danger remain)
- No changes to the blue secondary color

## Dependencies

None

## Design Considerations

- **Orange shade:** `#FF9500` (iOS system orange) is recommended as the primary color. It provides good contrast on dark backgrounds and feels energetic.
- **Icon sizing:** Icons in the header buttons should be approximately 18–20px (`h-5 w-5`) to match the compact button style.
- **Icon button shape:** Use rounded or rounded-full background with padding to create a tappable icon button (e.g. `p-2 rounded-lg`).
- **Consistency:** After this change, the color hierarchy should be: Orange (primary/CTA) → Blue (secondary) → Green (success) → Red (danger).

## Technical Considerations

- **Tailwind config:** The primary color is defined in `tailwind.config.ts` under `theme.extend.colors.primary`. Changing it there propagates to all `bg-primary`, `text-primary`, `border-primary` usages.
- **Hardcoded greens:** Some components use `bg-green-500` directly instead of `bg-primary`. These need to be found and updated to use the semantic color token or the new orange.
- **Lucide React:** Tree-shakeable — only icons that are imported are bundled. No bundle size concern.
- **Calendar button:** The component is at `apps/web/src/components/AddToCalendarButton.tsx` and is used in both burn-buddy and burn-squad detail pages.

## Success Metrics

- All primary action buttons render in orange across the app
- Icon buttons for Burn Buddy/Squad are recognizable without text labels
- Calendar button is visually consistent with the dark theme
- No accessibility regressions (icon buttons have proper labels)
- No TypeScript or build errors introduced

## Open Questions

- Should we consider adding a tooltip on hover for the icon buttons, or is `aria-label` sufficient?
- Should the 📅 emoji in the calendar button be replaced with a Lucide `Calendar` icon for consistency with the new icon library?
