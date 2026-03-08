# PRD: Fix Mobile Test CI Failures

## Introduction

The mobile unit test GitHub Actions workflow (`test-mobile.yml`) has been failing on every run since PR #32 ("UI Theme & Icon Updates") merged on 2026-03-08. Three tests across two test suites are broken because the component UI was updated but the corresponding tests were not. This PRD covers fixing those 3 tests to match the current UI so the CI pipeline goes green again.

## Goals

- Fix all 3 failing mobile unit tests so they match the current component output
- Restore the `Test Mobile` GitHub Actions workflow to a passing state on `main`
- Ensure no other existing tests regress as a result of the fixes

## User Stories

### US-001: Fix HomeScreen burn buddy badge test

**Description:** As a developer, I want the "renders list of burn buddies returned by API" test to pass so that CI is green.

**Acceptance Criteria:**
- [ ] Update the assertion at `HomeScreen.test.tsx:173` to match the current rendered output (the text `'Burn Buddy'` no longer appears as a standalone badge — the only occurrence is `'+ Burn Buddy'` in the add button)
- [ ] Determine what the buddy list item actually renders now (e.g. no badge, or a different label) and assert on the correct text
- [ ] Test passes locally with `yarn workspace mobile test -- HomeScreen.test`
- [ ] No other HomeScreen tests regress

### US-002: Fix HomeScreen burn squad badge test

**Description:** As a developer, I want the "renders list of burn squads returned by API" test to pass so that CI is green.

**Acceptance Criteria:**
- [ ] Update the assertion at `HomeScreen.test.tsx:191` to match the current rendered output (the text `'Burn Squad'` no longer appears as a standalone badge — the only occurrence is `'+ Burn Squad'` in the add button)
- [ ] Determine what the squad list item actually renders now and assert on the correct text
- [ ] Test passes locally with `yarn workspace mobile test -- HomeScreen.test`
- [ ] No other HomeScreen tests regress

### US-003: Fix FriendsScreen friend list email test

**Description:** As a developer, I want the "renders list of current friends from API" test to pass so that CI is green.

**Acceptance Criteria:**
- [ ] Update the assertion at `FriendsScreen.test.tsx:121` — the friend list items no longer display `email` as visible text
- [ ] Determine what friend list items currently render (likely just `displayName` and avatar) and assert on the correct output
- [ ] Test passes locally with `yarn workspace mobile test -- FriendsScreen.test`
- [ ] No other FriendsScreen tests regress

### US-004: Verify full mobile test suite passes in CI

**Description:** As a developer, I want to confirm all 36 mobile tests pass in the GitHub Actions workflow after the fixes.

**Acceptance Criteria:**
- [ ] All changes are committed and pushed to a branch
- [ ] The `Test Mobile` workflow runs on the PR and reports 0 failures (36 passed)
- [ ] Merge to `main` and confirm the post-merge workflow also passes

## Functional Requirements

- FR-1: The 3 failing assertions must be updated to match the current component render output, not the pre-PR#32 output
- FR-2: No test logic should be deleted — assertions should be updated to verify equivalent behavior with the new UI
- FR-3: All 36 existing mobile tests must pass after the changes

## Non-Goals

- No new test coverage for features added after PR #32
- No refactoring of test utilities or mock infrastructure
- No changes to the GitHub Actions workflow file itself
- No changes to application code — only test files are modified
- No audit of test coverage gaps

## Dependencies

None

## Technical Considerations

- The root cause is UI drift: PR #32 changed how `HomeScreen` renders buddy/squad list items (badge labels removed or changed) and how `FriendsScreen` renders friend entries (email no longer displayed)
- To determine the correct assertions, inspect the current `HomeScreen.tsx` and `FriendsScreen.tsx` render output — specifically what text appears in buddy/squad list items and friend list rows
- The CI log shows the full rendered component tree for each failing test, which can be used as a reference for what the tests should assert
- Tests use `@testing-library/react-native` with `getByText` — consider using `getByTestId` for more stable assertions if `testID` props are available on the relevant elements

## Success Metrics

- `Test Mobile` GitHub Actions workflow passes on `main` (0 failures, 36 passed)
- No manual intervention needed — automated CI stays green for subsequent PRs touching mobile code

## Open Questions

None — all resolved.

**Resolved:** Should tests use `testID` instead of text assertions? → **No.** Keep text-based assertions (`getByText`) so tests verify user-visible content. Both components already have `testID` props available, but text assertions are preferred for validating actual UI output.
