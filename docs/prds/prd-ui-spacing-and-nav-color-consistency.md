# PRD: UI Spacing & Nav Color Consistency

## Introduction

The Home page header ("Burn Buddies") uses smaller font sizing and tighter spacing compared to the Friends and Account pages. Additionally, the navigation bar's active text color (orange `#FF9500` on web, `#E05A00` on mobile) doesn't match the pink-red accent color (`#FF2D55`) used for nav icons on web. This PRD standardizes page header styling across all tabs and aligns nav bar text color with the icon accent color, on both the web and mobile apps.

## Goals

- Make the Home page header visually consistent with the Friends and Account page headers
- Unify the active nav bar text color to match the pink-red icon color (`#FF2D55`)
- Apply these changes to both the Next.js web app and the Expo mobile app
- Ensure no regressions in layout, spacing, or readability

## User Stories

### US-001: Standardize Home page header on web
**Description:** As a user, I want the Home page header to look the same as the Friends and Account page headers so the app feels polished and consistent.

**Acceptance Criteria:**
- [ ] Home page "Burn Buddies" header uses `text-2xl font-bold` (matching Friends/Account)
- [ ] Home page header uses an `<h1>` tag (matching Friends/Account, currently `<h2>`)
- [ ] Home page header has `mb-6` bottom margin (matching Friends/Account)
- [ ] Home page container padding (`pt-6 px-4`) remains consistent with other pages
- [ ] Typecheck passes (`cd apps/web && yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-002: Update active nav bar text color on web
**Description:** As a user, I want the active tab label in the navigation bar to use the same pink-red color as the tab icons so the nav feels cohesive.

**Acceptance Criteria:**
- [ ] Active tab text on the mobile bottom nav uses `text-accent-pink` (`#FF2D55`) instead of `text-primary` (`#FF9500`)
- [ ] Active tab text on the desktop top nav uses `text-accent-pink` (`#FF2D55`) instead of `text-primary` (`#FF9500`)
- [ ] Inactive tab text colors remain unchanged (gray)
- [ ] Desktop nav active indicator/styling still works visually with the new color
- [ ] Typecheck passes (`cd apps/web && yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-003: Standardize Home screen header on mobile
**Description:** As a user, I want the Home screen header on the mobile app to have consistent styling and text with the Friends and Account screens.

**Acceptance Criteria:**
- [ ] Home screen header text changes from "buddyburn 🔥" to "Burn Buddies"
- [ ] Home screen `headerTitle` color matches Friends/Account screens (currently `#E05A00` orange; should use a neutral dark color like `#333` to match Friends screen)
- [ ] All three screen headers use the same `fontSize`, `fontWeight`, and padding values
- [ ] No layout shifts or visual regressions on any screen
- [ ] Typecheck passes (`cd apps/mobile && npx tsc --noEmit` or equivalent)

### US-004: Update active tab bar text color on mobile
**Description:** As a user, I want the active tab label in the mobile app's tab bar to use the pink-red accent color, matching the web app's nav bar.

**Acceptance Criteria:**
- [ ] Active tab text color changes from `#E05A00` to `#FF2D55` in `tabStyles.activeTabText`
- [ ] Inactive tab text color remains `#9ca3af` (gray)
- [ ] Tab bar is still readable and visually clear
- [ ] Typecheck passes

## Functional Requirements

- FR-1: On the web Home page (`apps/web/src/app/(main)/page.tsx`), change the "Burn Buddies" header from `<h2 className="m-0 text-lg font-semibold text-white">` to `<h1 className="mb-6 text-2xl font-bold text-white">` to match Friends and Account headers.
- FR-2: On the web NavBar (`apps/web/src/components/NavBar.tsx`), change the active link text class from `text-primary` to `text-accent-pink` in both the desktop (`desktopLinkClass`) and mobile nav label styles.
- FR-3: On the mobile Home screen (`apps/mobile/src/screens/HomeScreen.tsx`), change `headerTitle.color` from `#E05A00` to match Friends/Account screens (dark neutral tone like `#333`).
- FR-4: On the mobile Home screen (`apps/mobile/src/screens/HomeScreen.tsx`), change the header text from "buddyburn 🔥" to "Burn Buddies".
- FR-5: On the mobile tab bar (`apps/mobile/App.tsx`), change `activeTabText.color` from `#E05A00` to `#FF2D55`.

## Non-Goals

- No changes to page content, card layouts, or workout UI
- No changes to inactive/disabled state colors
- No introduction of a centralized mobile theme/constants system (separate effort)
- No changes to the desktop nav logo color or layout
- No redesign of the tab bar shape, size, or background

## Dependencies

None

## Design Considerations

- The pink-red color `#FF2D55` is already defined in the web app's Tailwind theme as `accent-pink` (in `globals.css` and `tailwind.config.ts`), so no new color definitions are needed for web.
- For the mobile app, `#FF2D55` is hardcoded directly (mobile doesn't use a centralized theme system).
- The Home page header on web currently sits inside a flex row with a "Log Workout" button — changing from `<h2>` to `<h1>` should be verified to not break that layout.
- On mobile, the Home screen header currently says "buddyburn 🔥" — this will be updated to "Burn Buddies" to match the web app.

## Technical Considerations

- Web changes are limited to two files: `page.tsx` (Home) and `NavBar.tsx`
- Mobile changes are limited to two files: `HomeScreen.tsx` and `App.tsx`
- All changes are CSS/style-only — no logic, API, or data changes
- The `text-accent-pink` Tailwind class maps to `#FF2D55` via the existing theme config; verify this class works in both desktop and mobile nav contexts

## Success Metrics

- All three tab pages (Home, Friends, Account) have visually identical header sizing and spacing
- Active nav tab text color matches the nav icon color on both web and mobile
- No visual regressions on any page or screen
- Changes verified in browser (web) and confirmed via typecheck (both)

## Open Questions

None — all questions resolved.
