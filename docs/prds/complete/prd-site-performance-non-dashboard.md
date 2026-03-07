# PRD: Site Performance — Non-Dashboard Pages

## Introduction

The initial site performance work (see `docs/prds/complete/prd-site-performance.md`) focused on the home/dashboard page: a batch API endpoint, React Query caching, skeleton loaders, and web-vitals monitoring. The remaining pages — Friends, Account, Burn Buddy details, Burn Squad details, Profile, and the creation forms — still use raw `useState` + `useEffect` patterns with no caching, basic "Loading…" text instead of skeleton UIs, and several N+1 request waterfalls. This PRD extends performance optimizations to every non-dashboard page.

## Goals

- Eliminate N+1 and over-fetching API patterns on Friends, Burn Buddy detail, and Burn Squad detail pages
- Migrate all non-dashboard pages from raw `useState`/`useEffect` to React Query for caching, deduplication, and background refetching
- Replace "Loading…" text with skeleton loaders on all data-fetching pages
- Add `useMemo` for expensive derived state (weekly/monthly workout counts, admin checks, buddy status lookups)
- Add `loading="lazy"` to avatar images across the app
- Achieve perceived load time under 1 second for cached data and under 2 seconds for fresh loads on all pages (matching dashboard targets)

## User Stories

### US-001: Enriched friend requests endpoint
**Description:** As a user viewing my Friends page, I want friend requests to load quickly instead of triggering a separate API call per request so that the page doesn't waterfall on load.

**Acceptance Criteria:**
- [ ] New `GET /friends/requests` response includes `displayName` and `photoURL` for each request sender/receiver (enriched in a single Firestore batch read)
- [ ] Frontend no longer makes individual `GET /users/{uid}` calls to enrich requests
- [ ] Existing API tests updated; new test covers enriched response shape
- [ ] Typecheck passes

### US-002: Scoped group workouts endpoints for buddies and squads
**Description:** As a developer, I want the Burn Buddy and Burn Squad detail pages to fetch only the relevant group workouts instead of all workouts so that we avoid transferring and filtering unnecessary data on the client.

**Acceptance Criteria:**
- [ ] New `GET /burn-buddies/:id/group-workouts` returns only workouts between the two buddies
- [ ] New `GET /burn-squads/:id/group-workouts` returns only workouts for that squad
- [ ] Frontend detail pages use scoped endpoints instead of `GET /group-workouts` + client-side filter
- [ ] API tests cover both new endpoints
- [ ] Typecheck passes

### US-003: Batch member profiles for Burn Squad detail
**Description:** As a user viewing a Burn Squad, I want all member profiles to load in one request instead of one per member so that large squads don't cause a loading waterfall.

**Acceptance Criteria:**
- [ ] `GET /burn-squads/:id` response includes enriched `members` array with `displayName` and `photoURL` per member (batch Firestore read)
- [ ] Frontend no longer makes individual `GET /users/{uid}` calls per squad member
- [ ] API test covers enriched members in response
- [ ] Typecheck passes

### US-004: React Query hooks for all non-dashboard pages
**Description:** As a developer, I want every data-fetching page to use React Query hooks so that data is cached, deduplicated, and automatically refetched in the background.

**Acceptance Criteria:**
- [ ] New React Query hooks in `lib/queries.ts`: `useFriends()`, `useBurnBuddy(id)`, `useBurnSquad(id)`, `useAccount()`
- [ ] Existing unused `useProfile(uid)` hook is adopted by `/profile/[uid]/page.tsx`
- [ ] Each hook configures appropriate `staleTime` (30s default, 5min for account)
- [ ] Pages use hook return values (`data`, `isLoading`, `error`) instead of raw state
- [ ] All raw `useState`/`useEffect` data-fetching patterns removed from migrated pages
- [ ] Typecheck passes

### US-005: Skeleton loaders for all data-fetching pages
**Description:** As a user, I want to see placeholder skeleton UI instead of "Loading…" text while pages load so that the experience feels faster and less jarring.

**Acceptance Criteria:**
- [ ] Skeleton component for Friends page (friend list items as pulse bars)
- [ ] Skeleton component for Account page (profile card placeholder)
- [ ] Skeleton component for Burn Buddy detail page (header + stats + workout list placeholders)
- [ ] Skeleton component for Burn Squad detail page (header + member grid + workout list placeholders)
- [ ] Skeleton component for Profile page (profile card + stats placeholder)
- [ ] All skeletons use `animate-pulse` pattern consistent with existing `DashboardSkeleton`
- [ ] No "Loading…" text remains on any page
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Memoize derived state on detail pages
**Description:** As a developer, I want expensive inline calculations to be memoized so that they don't re-run on every render.

**Acceptance Criteria:**
- [ ] `useMemo` wraps `workoutsThisWeek` and `workoutsThisMonth` calculations on Burn Buddy and Burn Squad detail pages
- [ ] `useMemo` wraps `isAdmin` derivation on Burn Squad detail page
- [ ] `useMemo` wraps `getBurnBuddyStatus()` lookups on Friends page
- [ ] No functional change to computed values — only render performance improvement
- [ ] Typecheck passes

### US-007: Optimistic updates after mutations
**Description:** As a user, I want the UI to update immediately after I accept a friend request, send a buddy request, or edit my account so that the app feels responsive without a full page refetch.

**Acceptance Criteria:**
- [ ] After accepting/rejecting a friend request on Friends page, the request disappears from the list immediately (React Query cache mutation)
- [ ] After sending a Burn Buddy request from Profile page, button state updates without refetching entire profile
- [ ] After saving username or uploading a profile picture on Account page, the displayed value updates immediately
- [ ] Stale data is still revalidated in the background (React Query `invalidateQueries`)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Lazy loading for avatar images
**Description:** As a user on a page with many avatars (Friends list, Squad members), I want off-screen images to load lazily so that the initial page render is faster.

**Acceptance Criteria:**
- [ ] `Avatar` component's `<img>` tag includes `loading="lazy"` attribute
- [ ] Optional: add `decoding="async"` for non-blocking image decode
- [ ] No visual change to above-the-fold avatars
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: `GET /friends/requests` must return enriched objects including `displayName` and `photoURL` for each user in the request, using a batched Firestore `getAll()` call
- FR-2: `GET /burn-buddies/:id/group-workouts` must return only group workouts where both buddy participants are involved, paginated if needed
- FR-3: `GET /burn-squads/:id/group-workouts` must return only group workouts associated with that squad
- FR-4: `GET /burn-squads/:id` response must include enriched member profiles (batch `getAll()`)
- FR-5: All React Query hooks must use the shared `QueryClient` from `query-provider.tsx` with default `staleTime: 30_000`
- FR-6: Skeleton loaders must match the visual layout of the loaded page to prevent content layout shift (CLS)
- FR-7: Optimistic cache updates must roll back on mutation error and show a toast/error message
- FR-8: Avatar `<img>` must include `loading="lazy"` on all instances

## Non-Goals

- No changes to the dashboard/home page (already optimized)
- No migration to Next.js `Image` component for avatars
- No server-side rendering (SSR) or static generation changes
- No new API pagination — existing endpoints stay as-is unless a scoped variant is added
- No bundle-splitting or dynamic imports (beyond what Next.js App Router already does)
- No changes to the mobile app

## Dependencies

- `docs/prds/complete/prd-site-performance.md` (completed — React Query, batch dashboard endpoint, skeleton pattern, web-vitals already in place)

## Design Considerations

- Skeleton loaders should mirror the `DashboardSkeleton` pattern in `apps/web/src/app/page.tsx` — use `animate-pulse` with `bg-gray-200 rounded` placeholder bars
- Keep skeleton components co-located with their page files (e.g., `FriendsSkeleton` inside `friends/page.tsx` or a sibling `friends/skeleton.tsx`)
- Optimistic updates should use React Query's `useMutation` + `onMutate` / `onSettled` pattern

## Technical Considerations

- Firestore `getAll()` supports up to 100 document references in a single batch read — squad member enrichment must handle squads with >100 members by chunking (unlikely but defensive)
- React Query hooks should use consistent query key conventions: `['friends']`, `['burn-buddy', id]`, `['burn-squad', id]`, `['account']`, `['profile', uid]`
- The existing `useProfile(uid)` hook in `queries.ts` is already defined but unused — adopt it rather than creating a duplicate
- Backend enrichment endpoints should gracefully handle missing user profiles (deleted accounts) by returning a fallback display name

## Success Metrics

- All non-dashboard pages load perceived content (skeleton → real data) in under 2 seconds on a cold cache
- Cached page navigations render in under 500ms (React Query cache hit)
- N+1 request waterfalls eliminated: Friends page goes from 1 + N requests to 1–2; Squad detail goes from 1 + N to 1–2
- Zero increase in Cumulative Layout Shift (CLS) — skeletons must match loaded layout dimensions
- No "Loading…" text visible on any page

## Open Questions

- Should the scoped group workouts endpoints (`/burn-buddies/:id/group-workouts`) support pagination or a date range filter, or just return the most recent N workouts?
- Should React Query hooks share a `refetchInterval` for polling (like the dashboard's 30s), or only refetch on window focus for non-dashboard pages?
- Is there a maximum squad size that would affect the batch member enrichment approach?
