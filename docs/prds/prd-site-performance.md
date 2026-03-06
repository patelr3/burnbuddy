# PRD: Site Performance Optimization

## Introduction

The burnbuddy web app currently takes over 1 second to load and refresh, making the experience feel sluggish. Investigation reveals multiple compounding bottlenecks:

- **Frontend**: The home page fires 9+ API calls on mount, then cascades into N+M additional requests for profile enrichment — all without any client-side caching layer.
- **API**: Several endpoints have N+1 Firestore query patterns (sequential DB reads in loops), responses are uncompressed, and there are no cache-control headers.

This PRD addresses the full optimization path: backend quick wins (compression, caching headers, N+1 fixes), a new batch dashboard endpoint, and adding React Query on the frontend for caching and deduplication. The focus is the home/dashboard page, which is the heaviest and most-visited page.

## Goals

- Reduce perceived load time to sub-second for cached data and under 2 seconds for fresh loads
- Eliminate N+1 Firestore query patterns in critical API endpoints
- Reduce the number of HTTP requests the dashboard makes from 9+ (plus N+M enrichment) to 1-2
- Add a client-side caching layer so navigating back to pages is instant
- Add response compression and caching headers to the API

## User Stories

### US-001: Add response compression to API
**Description:** As a user, I want API responses to be compressed so that data transfers are faster, especially on slower connections.

**Acceptance Criteria:**
- [ ] Install and configure `compression` middleware in Express API
- [ ] Verify responses include `Content-Encoding: gzip` header when client sends `Accept-Encoding: gzip`
- [ ] Measure response size reduction on `/users/me` and `/burn-buddies` endpoints (expect ~60-80% reduction for JSON)
- [ ] Existing API tests still pass
- [ ] Typecheck passes

### US-002: Add cache-control headers to read endpoints
**Description:** As a developer, I want appropriate cache-control headers on API responses so that clients and intermediaries can cache responses and reduce redundant requests.

**Acceptance Criteria:**
- [ ] Add `Cache-Control: private, max-age=30` to stable read endpoints (`/burn-buddies`, `/burn-squads`, `/friends`)
- [ ] Add `Cache-Control: private, max-age=5` to frequently-changing endpoints (`/workouts/partner-active`, `/group-workouts`)
- [ ] Add `Cache-Control: no-store` to sensitive endpoints (`/users/me`)
- [ ] Implement as reusable Express middleware (e.g., `cacheControl(seconds)`)
- [ ] Typecheck passes

### US-003: Fix N+1 queries in partner-active endpoint
**Description:** As a user, I want the partner activity check to load fast so I can see who's working out without waiting.

**Acceptance Criteria:**
- [ ] Refactor `GET /workouts/partner-active` to batch Firestore queries instead of querying per-buddy in a loop
- [ ] Use Firestore `in` operator to query up to 30 UIDs at once (Firestore limit), with chunking for larger sets
- [ ] Same response shape and data as before (no breaking changes)
- [ ] Existing tests pass; add test for batched query path
- [ ] Typecheck passes

### US-004: Fix N+1 queries in user profile endpoint
**Description:** As a user, I want profile pages to load quickly instead of waiting for sequential database lookups.

**Acceptance Criteria:**
- [ ] Refactor `GET /users/:uid/profile` to batch group workout queries using Firestore `in` operator instead of per-referenceId loop
- [ ] Batch friend/buddy profile lookups into a single multi-get instead of individual doc reads
- [ ] Same response shape and data as before (no breaking changes)
- [ ] Existing tests pass; add test covering the batched query path
- [ ] Typecheck passes

### US-005: Create batch dashboard endpoint
**Description:** As a frontend developer, I want a single API endpoint that returns all the data the dashboard needs so the home page can load with 1 request instead of 9+.

**Acceptance Criteria:**
- [ ] Create `GET /dashboard` endpoint that returns a combined payload:
  ```json
  {
    "user": { ... },
    "burnBuddies": [ ... ],
    "burnSquads": [ ... ],
    "groupWorkouts": [ ... ],
    "buddyRequests": { "incoming": [...], "outgoing": [...] },
    "squadJoinRequests": [ ... ],
    "activeWorkout": { ... } | null,
    "partnerActivity": [ ... ]
  }
  ```
- [ ] Use `Promise.all` to fetch all data in parallel within the endpoint (not sequential)
- [ ] Enrich buddy/squad profiles server-side (include display names, streak data) to eliminate N+M client-side enrichment calls
- [ ] Response time under 500ms for a user with 5 buddies and 2 squads (measure with logging)
- [ ] Add comprehensive tests using the existing vi.mock pattern
- [ ] Typecheck passes

### US-006: Add React Query to the web app
**Description:** As a developer, I want a data-fetching/caching library so that API responses are cached, deduplicated, and background-refreshed automatically.

**Acceptance Criteria:**
- [ ] Install `@tanstack/react-query` and add `QueryClientProvider` to the app layout
- [ ] Configure sensible defaults: `staleTime: 30_000` (30s), `gcTime: 300_000` (5min), `refetchOnWindowFocus: true`
- [ ] Create a `src/lib/queries.ts` module with typed query hooks (e.g., `useDashboard()`, `useProfile()`)
- [ ] Typecheck passes

### US-007: Migrate dashboard page to use batch endpoint + React Query
**Description:** As a user, I want the home page to load in under 1 second (cached) so the app feels instant.

**Acceptance Criteria:**
- [ ] Replace the 9+ individual `useEffect` fetch calls in `page.tsx` with a single `useDashboard()` query hook
- [ ] Show a loading skeleton/spinner while data loads (no blank screen)
- [ ] Navigating away and back shows cached data immediately (stale-while-revalidate)
- [ ] Pull-to-refresh / manual refresh still works and shows fresh data
- [ ] Remove the old `loadData` function and individual state variables that are replaced
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Optimize polling strategy
**Description:** As a user, I want real-time partner activity updates without the app burning unnecessary resources.

**Acceptance Criteria:**
- [ ] Replace the manual 30-second `setInterval` polling with React Query's built-in `refetchInterval: 30_000` on the partner-active query
- [ ] Only poll when the browser tab is focused (React Query's `refetchIntervalInBackground: false`)
- [ ] Countdown tickers use `useMemo` to avoid re-rendering entire lists when only one timer updates
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Add web-vitals performance monitoring
**Description:** As a developer, I want to measure Core Web Vitals so I can track the real-world impact of performance improvements over time.

**Acceptance Criteria:**
- [ ] Install the `web-vitals` library
- [ ] Create a `src/lib/vitals.ts` module that captures LCP, FCP, TTFB, CLS, and INP metrics
- [ ] In production: send metrics to the API via `POST /metrics/vitals` (fire-and-forget, non-blocking)
- [ ] In development: log metrics to the browser console in a readable format
- [ ] Create `POST /metrics/vitals` API endpoint that logs received metrics via pino (structured JSON)
- [ ] Wire up the vitals reporter in `app/layout.tsx` (or a client wrapper) using Next.js `reportWebVitals` or manual `web-vitals` calls
- [ ] Typecheck passes

## Functional Requirements

- FR-1: API must compress responses with gzip when client supports it
- FR-2: API read endpoints must return appropriate `Cache-Control` headers
- FR-3: `GET /workouts/partner-active` must not query Firestore in a per-buddy loop; must use batched queries
- FR-4: `GET /users/:uid/profile` must not query Firestore in a per-reference loop; must use batched queries
- FR-5: `GET /dashboard` endpoint must return all dashboard data in a single response with server-side profile enrichment
- FR-6: Web app must use React Query for data fetching with caching and deduplication
- FR-7: Dashboard page must load from a single API call via the `useDashboard()` hook
- FR-8: Polling must only occur when the browser tab is in focus
- FR-9: Web app must report Core Web Vitals (LCP, FCP, TTFB) via the `web-vitals` library and log them to the API

## Non-Goals

- No SSR/SSG migration for pages (future optimization)
- No Firebase SDK bundle size optimization (tree-shaking, dynamic imports)
- No CDN or edge caching layer
- No service worker or offline support
- No optimization of pages other than the dashboard (future work)
- No changes to the mobile app
- No database schema changes or new Firestore composite indexes
- No batch endpoints for pages other than the dashboard — individual endpoints + React Query caching is sufficient for lighter pages
- No server-sent events or WebSockets for real-time updates — React Query smart polling is sufficient

## Dependencies

None

## Technical Considerations

- **Firestore `in` operator limit**: The `in` operator supports a maximum of 30 values. For users with more than 30 buddies/squad members, queries must be chunked into batches of 30 and results merged.
- **React Query provider placement**: Must wrap the app at the layout level (`app/layout.tsx`), but since the layout is a server component, the provider needs to be a separate client component wrapper.
- **Backward compatibility**: The new `/dashboard` endpoint is additive. Existing individual endpoints must continue to work for the mobile app and other pages.
- **Auth context interaction**: React Query hooks will need access to the Firebase auth token. Create a shared `queryFn` wrapper that handles auth headers consistently.
- **Bundle size**: `@tanstack/react-query` is ~13KB gzipped — well worth the tradeoff for caching and deduplication.

## Success Metrics

- Dashboard loads in under 1 second when data is cached (stale-while-revalidate)
- Dashboard loads in under 2 seconds on a fresh/cold load
- API request count for dashboard drops from 9+ (plus N+M enrichment) to 1-2
- `GET /dashboard` endpoint responds in under 500ms (p95)
- Response sizes reduced by 60%+ with compression enabled
- No regressions in existing API test suite or E2E tests

## Open Questions

All questions have been resolved:

- **Performance monitoring:** Yes — adding `web-vitals` library with metrics logged to console (dev) and sent to API (production). See US-009.
- **Batch endpoint pattern for other pages:** No — the `/dashboard` batch endpoint is specific to the dashboard page. Other pages are lighter (1-3 API calls) and will use individual endpoints with React Query caching.
- **SSE/WebSockets for partner activity:** No — React Query's smart polling (only when tab is focused, 30-second interval) is sufficient. SSE/WebSockets would add complexity for marginal improvement.
