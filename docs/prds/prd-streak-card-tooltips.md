# PRD: Streak Card Cleanup & Tooltips

## Introduction

The burn streak and supernova streak cards currently display a 🔥 emoji in the title row that wastes horizontal space. This PRD removes that emoji and adds a tap/click-to-learn interaction: tapping either streak card opens a small popover tooltip explaining what the streak means. The feature works identically on web (Next.js) and mobile (Expo/React Native).

## Goals

- Remove the fire emoji from the **title row** of both streak cards (burn streak and supernova streak) on web and mobile
- Add a clickable/tappable interaction to each streak card that opens a popover tooltip explaining the streak type
- Ensure the tooltip works consistently on both web and mobile platforms
- Keep the tooltip text static (hardcoded in the client) for simplicity

## User Stories

### US-001: Remove fire emoji from streak card titles (Web)

**Description:** As a user, I want the streak card titles to be clean and compact so they don't waste horizontal space.

**Acceptance Criteria:**
- [ ] The 🔥 emoji is removed from the title row of the `StreakDots` component in `apps/web/src/components/StreakDots.tsx`
- [ ] The title row still shows the streak count and label text (e.g., "3 Burn Streak")
- [ ] The 7-day dot indicators remain unchanged (still show 🔥 for workout days and ○ for rest days)
- [ ] Typecheck passes (`cd apps/web && yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-002: Remove fire emoji from streak card titles (Mobile)

**Description:** As a mobile user, I want the same clean card titles without the fire emoji.

**Acceptance Criteria:**
- [ ] The 🔥 emoji is removed from the title row of the `StreakDots` component in `apps/mobile/src/components/StreakDots.tsx`
- [ ] The `fireEmoji` style and corresponding `<Text>` element are removed
- [ ] The title row still shows the streak count and label text
- [ ] The 7-day dot indicators remain unchanged
- [ ] Typecheck passes

### US-003: Add tooltip popover to streak cards (Web)

**Description:** As a user, I want to tap/click a streak card to learn what the streak means so I understand how to maintain it.

**Acceptance Criteria:**
- [ ] Clicking anywhere on a streak card opens a small popover bubble near the card
- [ ] The Burn Streak tooltip reads: "Your burn streak counts workout days. It stays alive as long as you work out at least once a week (gap of 6 days max)."
- [ ] The Supernova Streak tooltip reads: "Your supernova streak rewards near-daily effort. It stays alive as long as you don't miss more than 1 day in a row."
- [ ] Clicking outside the popover or pressing Escape dismisses it
- [ ] Only one tooltip can be open at a time (opening one closes the other)
- [ ] The card has a visual affordance indicating it's clickable (e.g., `cursor-pointer`)
- [ ] The popover is accessible (proper ARIA attributes, keyboard-dismissible)
- [ ] Typecheck passes (`cd apps/web && yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-004: Add tooltip popover to streak cards (Mobile)

**Description:** As a mobile user, I want to tap a streak card to see a tooltip explaining the streak type.

**Acceptance Criteria:**
- [ ] Tapping anywhere on a streak card opens a small popover/bubble near the card
- [ ] The Burn Streak tooltip reads: "Your burn streak counts workout days. It stays alive as long as you work out at least once a week (gap of 6 days max)."
- [ ] The Supernova Streak tooltip reads: "Your supernova streak rewards near-daily effort. It stays alive as long as you don't miss more than 1 day in a row."
- [ ] Tapping outside the popover dismisses it
- [ ] Only one tooltip can be open at a time
- [ ] The component uses `Pressable` (or similar) so it has appropriate touch feedback
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Remove the `<span>🔥</span>` element from the title row of the web `StreakDots` component. Keep the streak count and label.
- FR-2: Remove the `<Text style={styles.fireEmoji}>🔥</Text>` element from the mobile `StreakDots` component. Remove the unused `fireEmoji` style.
- FR-3: Add a new `tooltip` prop (type `string`) to both web and mobile `StreakDots` components, containing the explanation text.
- FR-4: On web, wrap the streak card in a clickable container. On click, display a small popover positioned above or below the card with the tooltip text. Use pure Tailwind CSS + React state (no external tooltip library needed). Dismiss on outside click or Escape key.
- FR-5: On mobile, wrap the streak card in a `Pressable`. On press, display a popover using React Native's `Modal` with a transparent overlay positioned near the card. Dismiss on overlay press.
- FR-6: Pass the appropriate tooltip text from each parent page that renders `StreakDots`:
  - Burn Buddy detail page (`apps/web/src/app/(main)/burn-buddies/[id]/page.tsx`)
  - Burn Squad detail page (`apps/web/src/app/(main)/burn-squads/[id]/page.tsx`)
  - Profile page (`apps/web/src/app/(main)/profile/[uid]/page.tsx`)
  - Mobile Burn Buddy detail screen (`apps/mobile/src/screens/BurnBuddyDetailScreen.tsx`)
- FR-7: The tooltip text is hardcoded as constants (not fetched from API).

## Non-Goals

- No changes to the 7-day dot indicators (🔥 and ○ dots remain as-is)
- No changes to streak calculation logic in the API
- No animation or transition effects for the tooltip (keep it simple)
- No external tooltip/popover library — implement with built-in primitives
- No changes to the danger (red) state behavior

## Dependencies

None

## Design Considerations

- **Web tooltip:** A small rounded card with dark background (`bg-gray-800`) and light text, positioned below the streak card. Include a small caret/arrow pointing up toward the card. Max width ~280px.
- **Mobile tooltip:** Use a `Modal` with `transparent` background and an absolutely positioned bubble near the card. Similar dark styling.
- **Clickable affordance (web):** Add `cursor-pointer` and subtle hover effect (e.g., slightly lighter border) to signal interactivity.
- **Clickable affordance (mobile):** Use `Pressable` with `opacity` feedback on press.

## Technical Considerations

- The web `StreakDots` component is used in 3 pages (burn-buddy detail, burn-squad detail, profile). All 3 must pass the new `tooltip` prop.
- The mobile `StreakDots` component is used in 1 screen (BurnBuddyDetailScreen). It must also pass the `tooltip` prop.
- Keep tooltip state local to each `StreakDots` instance (no global state needed).
- For web outside-click detection, use a `useEffect` with `document.addEventListener('mousedown', ...)` cleanup pattern.
- For web Escape key detection, listen for `keydown` events on the document.

## Success Metrics

- Streak card titles are visually cleaner with no emoji clutter
- Users can discover what each streak means without leaving the page
- Tooltip works consistently on both platforms with no layout issues

## Open Questions

None — all decisions have been made.
