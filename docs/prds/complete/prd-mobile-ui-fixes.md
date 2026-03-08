# PRD: Mobile UI Bug Fixes — Friends Page & Nav Bar

## Introduction

Fix three visual bugs visible on the mobile web app (Next.js viewed on phone). The Friends page has a too-small, misaligned avatar and overlapping text/badge elements, and the bottom nav bar uses a green active icon color that should be accent-pink red.

Reference screenshot: `docs/prds/mobile-ui-bug.png`

## Goals

- Fix the avatar size and alignment on friend cards so it looks proportional and centered
- Eliminate text overlap between username and the Burn Buddy badge on narrow screens
- Change the active nav bar icon color from green to the brand accent-pink (#FF2D55)

## User Stories

### US-001: Fix profile avatar size and alignment on friend cards
**Description:** As a mobile user, I want the profile avatar on friend cards to be properly sized and vertically centered so it looks polished.

**Acceptance Criteria:**
- [ ] Avatar on friend list cards uses `size="md"` (40px) instead of `size="sm"` (32px) in `apps/web/src/app/(main)/friends/page.tsx` (line 451)
- [ ] Avatar is vertically centered relative to the friend name and email text
- [ ] Also update avatars in the pending requests cards (lines 385, 418) to `size="md"` for consistency
- [ ] Typecheck passes (`cd apps/web && yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-002: Fix username/badge overlap on mobile friend cards
**Description:** As a mobile user, I want the friend card layout to stack vertically on narrow screens so the username doesn't overlap with the Burn Buddy badge and Remove button.

**Acceptance Criteria:**
- [ ] Friend card layout (lines 444–488 in `apps/web/src/app/(main)/friends/page.tsx`) stacks vertically on mobile — name/username/email on top row, badge and action buttons on bottom row
- [ ] On desktop (md+ breakpoint), keep the current side-by-side layout
- [ ] Username text is truncated with ellipsis if it's still too long on very narrow screens
- [ ] Badge ("🔥 Burn Buddy") and "Remove" button are left-aligned below the name on mobile
- [ ] No visual regression on desktop-width screens
- [ ] Typecheck passes (`cd apps/web && yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-003: Change active nav icon color from green to accent-pink
**Description:** As a user, I want the active tab icon in the bottom nav bar to use the brand accent-pink color (#FF2D55) instead of green so it matches the app's design language.

**Acceptance Criteria:**
- [ ] Active icon color in `HomeIcon`, `FriendsIcon`, and `AccountIcon` components (lines 11, 20, 31 in `apps/web/src/components/NavBar.tsx`) changed from `#30D158` to `#FF2D55`
- [ ] Active label text color remains `text-primary` (orange) — only the SVG icon stroke changes
- [ ] Active background pill color `bg-primary/15` may optionally be updated to `bg-accent-pink/15` if it looks better, but this is not required
- [ ] Typecheck passes (`cd apps/web && yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Avatar component on friend cards must use `size="md"` (h-10 w-10, 40px)
- FR-2: Friend card layout must be responsive — vertically stacked on mobile (`< md`), horizontal on desktop (`≥ md`)
- FR-3: Username text must truncate with ellipsis when it would overflow its container
- FR-4: Active nav bar SVG icon stroke color must be `#FF2D55` (accent-pink)
- FR-5: All changes are in the web app only (`apps/web/`); no API or mobile app changes

## Non-Goals

- No changes to the Avatar component itself (`apps/web/src/components/Avatar.tsx`) — only how it's invoked
- No changes to the desktop nav bar (top bar) — only the mobile bottom nav icons
- No changes to friend card data, API calls, or business logic
- No changes to the Expo/React Native mobile app

## Dependencies

None

## Design Considerations

- The accent-pink color `#FF2D55` is already defined in `globals.css` as `--color-accent-pink` and in `tailwind.config.ts`
- The Avatar component already supports `sm`, `md`, `lg` sizes — just need to change the prop
- Tailwind responsive prefix `md:` can be used to switch between stacked and horizontal layouts
- Existing card padding (`p-3`) and gaps (`gap-2.5`) should be preserved

## Technical Considerations

- All changes are CSS/layout — no state management or API changes
- Files to modify:
  - `apps/web/src/app/(main)/friends/page.tsx` — avatar size + card layout
  - `apps/web/src/components/NavBar.tsx` — icon active color
- Test with `cd apps/web && yarn typecheck` and visual verification via dev-browser

## Success Metrics

- Avatar is clearly visible and proportional on mobile friend cards
- No text overlap on any reasonable screen width (≥ 320px)
- Nav bar active icon is visually distinct with accent-pink color
- No regressions on desktop layout

## Open Questions

None — all design decisions confirmed by user.
