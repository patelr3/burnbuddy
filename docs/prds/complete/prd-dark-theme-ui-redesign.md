# PRD: Dark Theme UI Redesign with Mobile Bottom Navigation

## Introduction

Redesign the BurnBuddy web app with an Apple Fitness-inspired dark theme and responsive navigation. The current light theme will be replaced with a modern dark interface featuring a black background, dark gray cards, green primary accent (matching Apple Fitness), and a mobile-optimized bottom navigation bar. This improves visual appeal, reduces eye strain, and provides a more modern, fitness-focused aesthetic while enhancing mobile usability.

**Design Reference:** `docs/prds/ui-insp-2.png`

## Goals

- Replace light theme with Apple Fitness-inspired dark theme across all pages
- Implement responsive navigation: top bar on desktop, bottom tab bar on mobile
- Update color palette: green primary (#30D158), dark surfaces (#1C1C1E, #2C2C2E), accent pink (#FF2D55)
- Override Firebase Auth widget styling to match dark theme
- Improve mobile UX where appropriate (bottom nav, touch targets, spacing)
- Maintain all existing functionality - visual redesign only, no feature changes

## User Stories

### US-001: Update global theme colors and typography
**Description:** As a developer, I need to define the dark theme colors and typography globally so all components inherit the new design system.

**Acceptance Criteria:**
- [ ] Update `apps/web/src/app/globals.css` @theme block with new color palette:
  - `--color-primary`: #30D158 (Apple Fitness green)
  - `--color-surface`: #1C1C1E (dark card background)
  - `--color-surface-elevated`: #2C2C2E (elevated dark elements)
  - `--color-secondary`: #0A84FF (bright blue)
  - `--color-accent-pink`: #FF2D55 (active workout indicators)
  - Keep `--color-danger`: #ef4444 (existing red)
- [ ] Update `apps/web/tailwind.config.ts` with matching color definitions
- [ ] Set body background to black (#000), default text to white in globals.css
- [ ] Typecheck passes

### US-002: Update root layout for dark theme and bottom nav spacing
**Description:** As a developer, I need to update the root layout to apply dark theme globally and add padding for the mobile bottom navigation.

**Acceptance Criteria:**
- [ ] Update `apps/web/src/app/layout.tsx` body classes: `min-h-screen bg-black text-white antialiased`
- [ ] Add `pb-20 md:pb-0` to body or main wrapper to accommodate mobile bottom nav (20 = 5rem spacing)
- [ ] Move `<NavBar />` into layout.tsx (above children) to render once globally
- [ ] Create separate route group for login/signup pages without NavBar (e.g., `(auth)` group)
- [ ] Typecheck passes
- [ ] Verify layout renders correctly using dev-browser skill

### US-003: Redesign NavBar as responsive top/bottom navigation
**Description:** As a user, I want a modern navigation bar that's optimized for my device - top bar on desktop, bottom tabs on mobile - so navigation feels native to each platform.

**Acceptance Criteria:**
- [ ] Update `apps/web/src/components/NavBar.tsx` with responsive design:
  - **Desktop** (`hidden md:flex`): Horizontal top bar, dark background (`bg-surface` or `bg-black`), logo left, Home/Friends/Account links right, Sign Out button
  - **Mobile** (`md:hidden`): Fixed bottom bar (`fixed bottom-0 left-0 right-0 z-50`), dark background with subtle top border
  - Mobile: Three icon tabs for Home (/), Friends (/friends), Account (/account)
  - Mobile: Use simple inline SVG icons (home icon, people icon, user icon)
  - Active tab highlighted with green color (#30D158) and pill-shaped background
  - Sign Out button only on desktop; mobile users access it via Account page
- [ ] Remove `<NavBar />` imports from all page components (layout now handles it)
- [ ] Typecheck passes
- [ ] Verify navigation on mobile and desktop using dev-browser skill

### US-004: Dark theme home page
**Description:** As a user, I want the home page styled with the dark theme so it matches the Apple Fitness aesthetic and is easy on my eyes.

**Acceptance Criteria:**
- [ ] Update `apps/web/src/app/page.tsx` with dark theme styling:
  - DashboardSkeleton: `bg-gray-800` placeholders instead of `bg-gray-200`
  - Start Workout button: green (`bg-primary hover:bg-green-600`) instead of orange
  - Active Workout banner: dark card (`bg-surface`) with accent-pink border and text
  - Workout type selector modal: dark background (`bg-surface`), dark buttons with green active state
  - Buddy/squad list items: `bg-surface` cards, white text, remove `border-slate-100`, use `border-gray-700`
  - Burn streak emoji 🔥 color: green text instead of orange
  - Pending request sections: dark cards (`bg-surface`) with subtle colored borders
  - Section headers: `text-white` instead of `text-gray-500`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Dark theme StatCard component
**Description:** As a developer, I need the StatCard component styled for dark theme so all stats displays look consistent.

**Acceptance Criteria:**
- [ ] Update `apps/web/src/components/StatCard.tsx`:
  - Background: `bg-surface` instead of `bg-white`
  - Border: `border-gray-700` instead of `border-gray-200`
  - Labels: `text-gray-400` (keep existing)
  - Values: keep colorClass logic (white or colored values)
- [ ] Typecheck passes
- [ ] Verify StatCard appearance using dev-browser skill (check burn-buddies/[id] or burn-squads/[id] pages)

### US-006: Dark theme GettingStartedCard component
**Description:** As a user, I want the Getting Started card styled with dark theme so it blends with the home page design.

**Acceptance Criteria:**
- [ ] Update `apps/web/src/components/GettingStartedCard.tsx`:
  - Replace `bg-green-50` with `bg-surface`
  - Replace `border-slate-200` with `border-gray-700`
  - Ensure text is white/light gray for readability
  - Strong tags: `text-primary` (green accent)
  - Close button: `text-gray-400 hover:text-gray-200`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Dark theme Account page
**Description:** As a user, I want the Account page styled with dark theme so I can manage my profile in a consistent, modern interface.

**Acceptance Criteria:**
- [ ] Update `apps/web/src/app/account/page.tsx`:
  - All section cards: `bg-surface border-gray-700`
  - Section headings: `text-white` instead of `text-gray-700`
  - Section descriptions: `text-gray-400` instead of `text-gray-500`
  - Input fields: `bg-surface-elevated border-gray-600 text-white placeholder-gray-500`
  - Buttons: green primary, red danger (keep existing logic), gray secondary with dark styling
  - AccountSkeleton: `bg-gray-800` placeholders
  - Sign-out section: dark card with red accent border
- [ ] Remove `import { NavBar } from '@/components/NavBar'` and `<NavBar />` (layout handles it)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Dark theme Friends page
**Description:** As a user, I want the Friends page styled with dark theme so I can manage my friend list in a modern, easy-to-read interface.

**Acceptance Criteria:**
- [ ] Update `apps/web/src/app/friends/page.tsx`:
  - Search input: `bg-surface-elevated border-gray-600 text-white placeholder-gray-500`
  - Friend list items: `bg-surface border-gray-700` cards
  - Section headings: `text-white`
  - Buttons: green/blue on dark backgrounds
  - FriendsSkeleton: `bg-gray-800` placeholders
  - Empty states: `text-gray-400`
- [ ] Remove `import { NavBar } from '@/components/NavBar'` and `<NavBar />` (layout handles it)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Dark theme for Burn Buddy and Squad detail/create pages
**Description:** As a user, I want all Burn Buddy and Burn Squad pages styled with dark theme for visual consistency throughout the app.

**Acceptance Criteria:**
- [ ] Update all detail and create pages with dark theme:
  - `apps/web/src/app/burn-buddies/[id]/page.tsx`
  - `apps/web/src/app/burn-buddies/new/page.tsx`
  - `apps/web/src/app/burn-squads/[id]/page.tsx`
  - `apps/web/src/app/burn-squads/new/page.tsx`
  - `apps/web/src/app/profile/[uid]/page.tsx`
- [ ] Apply consistent dark styling:
  - Cards: `bg-surface border-gray-700`
  - Headings: `text-white`
  - Body text: `text-gray-300`
  - Secondary text: `text-gray-400`
  - Inputs/selects: `bg-surface-elevated border-gray-600 text-white`
  - Buttons: green primary, colored secondaries, gray tertiary
  - Skeletons: `bg-gray-800` placeholders
- [ ] Remove NavBar imports from all pages (layout handles it)
- [ ] Typecheck passes
- [ ] Verify all 5 pages in browser using dev-browser skill

### US-010: Dark theme for Login and Signup pages with Firebase widget override
**Description:** As a user, I want the login and signup pages styled with dark theme, including the Firebase authentication widget, so the auth flow feels consistent with the app.

**Acceptance Criteria:**
- [ ] Create route group `apps/web/src/app/(auth)` with its own `layout.tsx` (no NavBar)
- [ ] Move `login/page.tsx` and `signup/page.tsx` into `(auth)` group
- [ ] Update login/signup pages: dark background (inherits from body), white heading text, gray body text
- [ ] Add Firebase Auth widget CSS overrides in `globals.css` to match dark theme:
  - Override `.firebaseui-container` background to dark
  - Override `.firebaseui-card-content` to `bg-surface`
  - Override text colors to white/gray
  - Override input fields to dark (`bg-surface-elevated`, white text)
  - Override buttons to match BurnBuddy button styles
- [ ] Typecheck passes
- [ ] Verify login and signup flows in browser using dev-browser skill

## Functional Requirements

- FR-1: Replace all light theme colors with dark theme palette: black (#000) background, dark gray cards (#1C1C1E), elevated surfaces (#2C2C2E), green primary (#30D158), blue secondary (#0A84FF), pink accent (#FF2D55)
- FR-2: Update Tailwind config and globals.css with new color definitions accessible via CSS variables and Tailwind classes
- FR-3: Display top navigation bar on desktop (>=768px) with horizontal layout: logo left, links right, sign out button
- FR-4: Display bottom tab bar on mobile (<768px) with three icon tabs (Home, Friends, Account), green active indicator, fixed positioning at bottom of viewport
- FR-5: Move NavBar to root layout.tsx to render once; create separate (auth) route group for login/signup without nav
- FR-6: Update all page components (home, account, friends, detail pages, create pages) with dark theme styling
- FR-7: Update all shared components (StatCard, GettingStartedCard, Avatar) with dark theme styling
- FR-8: Override Firebase Auth widget CSS to match dark theme (inputs, buttons, cards, text)
- FR-9: Replace orange accent colors with green (#30D158) throughout the app
- FR-10: Use accent pink (#FF2D55) for urgent/active states like active workout banner

## Non-Goals (Out of Scope)

- No theme toggle - dark theme only, light theme removed entirely
- No changes to app functionality or features
- No new components or pages
- No performance optimizations beyond what's needed for styling
- No changes to API or backend
- No changes to mobile app (Expo) - web only
- No custom Firebase Auth UI - just CSS overrides
- No animations or transitions beyond hover states

## Dependencies

None

## Design Considerations

**Reference Design:** `docs/prds/ui-insp-2.png` (Apple Fitness app inspiration)

**Color Palette:**
- Primary: #30D158 (Apple Fitness green)
- Surface: #1C1C1E (card background)
- Surface Elevated: #2C2C2E (input fields, elevated elements)
- Secondary: #0A84FF (bright blue for data/info)
- Accent Pink: #FF2D55 (active workout, urgent states)
- Danger: #ef4444 (keep existing red)
- Background: #000 (black)
- Text Primary: #fff (white)
- Text Secondary: #a1a1aa (gray-400)

**Typography:**
- Large bold white headings
- Gray secondary text for labels/descriptions
- Maintain existing font stack (system fonts)

**Mobile Bottom Nav Design:**
- Fixed bottom position with backdrop blur
- Three tabs: Home (🏠), Friends (👥), Account (👤)
- Pill-shaped active indicator with green background
- Icon + label for each tab
- Minimum 44px touch targets

**Component Reuse:**
- Existing Avatar component works with dark theme (colored backgrounds)
- Existing buttons - update hover/active states for dark backgrounds
- Maintain existing spacing/sizing, adjust colors only

## Technical Considerations

- **Tailwind v4**: Using CSS variables via `@theme` directive in globals.css
- **Route groups**: Next.js 14 App Router supports (folder) groups for layouts without path segments
- **Mobile-first**: Apply dark theme to base classes, no need for separate mobile/desktop colors
- **Firebase CSS overrides**: May need `!important` to override Firebase widget's inline/scoped styles
- **Responsive breakpoint**: `md` breakpoint (768px) for desktop/mobile nav switch
- **Z-index**: Bottom nav needs `z-50` to stay above page content
- **Padding for bottom nav**: Add `pb-20` (5rem) on mobile to prevent content being hidden behind fixed bottom nav

## Success Metrics

- All pages render correctly with dark theme on desktop and mobile
- Bottom navigation works on mobile (<768px), top navigation works on desktop (>=768px)
- No accessibility regressions (maintain WCAG contrast ratios with new colors)
- Typecheck passes without errors
- No visual bugs or layout issues introduced
- Firebase Auth widget styled consistently with dark theme

## Open Questions

- Should we add any subtle animations to the bottom nav tab transitions?
- Should the desktop top nav have a backdrop blur effect for depth?
- Do we need to adjust any font weights for better readability on dark backgrounds?
- Should hover states on dark cards be lighter or darker?
