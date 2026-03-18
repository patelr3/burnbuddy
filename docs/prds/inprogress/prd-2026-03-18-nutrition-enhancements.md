# PRD: Nutrition Section Enhancements

## Introduction

Improve the nutrition tracking experience with three targeted enhancements: (1) replace the free-text ingredient unit field with a dropdown of standard units, (2) add supplement tracking alongside food-based nutrition logging, and (3) allow users to manually mark a nutrition goal as complete for today. These changes reduce input errors, broaden what users can track, and give users more control over their goal progress.

## Goals

- Eliminate inconsistent unit entries by constraining ingredient units to a predefined dropdown
- Enable users to log supplements (vitamin pills, multivitamins, etc.) that contribute to daily nutrient totals
- Provide a catalog of common supplements with known nutrient values, plus custom supplement entry
- Allow users to manually mark a nutrition goal as complete for the current day, awarding the point immediately

## User Stories

### US-001: Replace ingredient unit text field with dropdown
**Description:** As a user creating a recipe, I want to select an ingredient unit from a dropdown so that I don't accidentally enter typos or inconsistent unit names.

**Acceptance Criteria:**
- [ ] Define a `SUPPORTED_UNITS` constant in `packages/shared/src/nutrition.ts` with the following units: `g`, `mg`, `oz`, `cup`, `tbsp`, `tsp`, `serving`, `ml`, `L`, `lb`
- [ ] Update the `Ingredient` type's `unit` field to use a union type of supported unit strings
- [ ] On the recipe creation page (`apps/web/src/app/(main)/nutrition/recipes/new/page.tsx`), replace the text input for unit with a `<select>` dropdown populated from `SUPPORTED_UNITS`
- [ ] Default the dropdown selection to `serving`
- [ ] On the recipe edit page (`apps/web/src/app/(main)/nutrition/recipes/[id]/page.tsx`), also replace the unit text input with the same dropdown
- [ ] The API recipe creation and update endpoints (`POST /nutrition/recipes`, `PUT /nutrition/recipes/:id`) validate that the unit value is one of the supported units; return 400 if not
- [ ] Existing recipes with non-standard units still display correctly (show the stored value even if it's not in the dropdown)
- [ ] Shared package builds successfully (`cd packages/shared && yarn build`)
- [ ] API typecheck passes
- [ ] Web typecheck passes
- [ ] Existing API tests still pass
- [ ] Verify in browser using dev-browser skill

### US-002: Add supplement type definitions and catalog
**Description:** As a developer, I need shared types for supplements and a catalog of common supplements so the feature has a solid data foundation.

**Acceptance Criteria:**
- [ ] Define a `Supplement` type in `packages/shared/src/nutrition.ts` with fields: `id: string`, `name: string`, `brand?: string`, `nutrients: NutrientAmount[]`, `isCustom: boolean`
- [ ] Define a `SupplementEntry` type for logging supplement intake: `id: string`, `uid: string`, `date: string` (YYYY-MM-DD), `supplementName: string`, `nutrients: NutrientAmount[]`, `createdAt: string`
- [ ] Create a `COMMON_SUPPLEMENTS` constant array in `packages/shared/src/nutrition.ts` containing at least 8 common supplements (e.g., Vitamin D3 1000 IU, Vitamin C 500mg, Calcium 600mg, Iron 65mg, Vitamin B12 1000mcg, Zinc 50mg, Magnesium 400mg, Fish Oil / Omega-3 1000mg) with accurate nutrient amounts mapped to existing `NutrientId` values
- [ ] Export all new types and the constant from the shared package
- [ ] Shared package builds successfully
- [ ] Typecheck passes

### US-003: Supplement logging API endpoints
**Description:** As a user, I want API endpoints to log, retrieve, and delete supplement entries so that my supplement intake is tracked.

**Acceptance Criteria:**
- [ ] `POST /nutrition/supplements` — logs a supplement entry for the authenticated user. Accepts `{ date, supplementName, nutrients }`. Stores in Firestore collection `supplementEntries`. After saving, fires `evaluateNutritionPoints(uid, date)` asynchronously (same pattern as meal logging)
- [ ] `GET /nutrition/supplements?date=YYYY-MM-DD` — returns all supplement entries for the user on the given date (defaults to today)
- [ ] `DELETE /nutrition/supplements/:id` — deletes a supplement entry (must belong to authenticated user). After deletion, fires `evaluateNutritionPoints(uid, date)` asynchronously
- [ ] The daily nutrition summary endpoint (`GET /nutrition/summary`) includes nutrients from supplement entries in its totals, alongside meal entries
- [ ] Write unit tests for all three supplement endpoints following the existing test pattern (`vi.mock` + `vi.hoisted` + `supertest`)
- [ ] API typecheck passes
- [ ] All API tests pass (existing + new)

### US-004: Supplement logging UI
**Description:** As a user, I want to log a supplement from the nutrition dashboard so I can track my vitamin and supplement intake alongside food.

**Acceptance Criteria:**
- [ ] Add a "Log Supplement" quick action button on the nutrition dashboard (`/nutrition/page.tsx`), next to existing "Log Meal" button
- [ ] Create a new page at `/nutrition/supplements/log` with:
  - A "Common Supplements" section showing the catalog from `COMMON_SUPPLEMENTS` as selectable cards
  - A "Custom Supplement" section where the user can enter a name and specify nutrient amounts for any of the 10 supported nutrients
  - A date field defaulting to today
  - A "Log Supplement" submit button
- [ ] When a catalog supplement is selected, its nutrient amounts are pre-filled and shown to the user before submission
- [ ] For custom supplements, the user enters a name and fills in nutrient amounts (only non-zero nutrients need to be entered)
- [ ] After successful submission, redirect back to the nutrition dashboard
- [ ] Supplement entries appear in the "Today's Meals" section on the dashboard (or a new "Today's Supplements" section) with a pill icon or similar visual distinction from meals
- [ ] Web typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Manual goal completion
**Description:** As a user, I want to manually mark a nutrition goal as complete for today so that I earn the point even if my logged meals/supplements don't fully reflect my actual intake.

**Acceptance Criteria:**
- [ ] `POST /nutrition/goals/complete` — accepts `{ nutrientId }` and marks that nutrient goal as manually completed for today's date. Stores a document in Firestore (e.g., in `nutritionPointsAwarded` with a flag `manuallyCompleted: true`). Awards the point if not already awarded for that nutrient today. Fires point evaluation for the day.
- [ ] `DELETE /nutrition/goals/complete/:nutrientId` — removes the manual completion for today, revoking the point if it was manually awarded. Fires point evaluation for the day.
- [ ] The daily summary endpoint reflects manually completed goals: the nutrient should show as 100% complete when manually marked
- [ ] On the nutrition dashboard, each target nutrient card that is below 100% shows a "Mark Complete" button (e.g., a checkmark icon)
- [ ] Clicking "Mark Complete" calls the API and immediately updates the UI to show that nutrient at 100% with a visual indicator (e.g., ✅ badge or different color) that it was manually completed
- [ ] If a nutrient is already manually completed, show an "Undo" option instead of "Mark Complete"
- [ ] Manual completion is only available for today's date (not past dates)
- [ ] Write unit tests for the manual completion API endpoints
- [ ] API typecheck passes
- [ ] Web typecheck passes
- [ ] All API tests pass
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: The `Ingredient.unit` field must be constrained to the values: `g`, `mg`, `oz`, `cup`, `tbsp`, `tsp`, `serving`, `ml`, `L`, `lb`
- FR-2: All UI forms that accept an ingredient unit must use a `<select>` dropdown, not a text input
- FR-3: The API must validate ingredient units on recipe create/update and reject invalid values with HTTP 400
- FR-4: A `COMMON_SUPPLEMENTS` catalog must include at least 8 supplements with accurate nutrient mappings
- FR-5: Supplement entries are stored in a `supplementEntries` Firestore collection, scoped by `uid`
- FR-6: Supplement nutrients contribute to daily nutrition totals in the summary endpoint
- FR-7: Logging or deleting a supplement triggers asynchronous point evaluation (same as meals)
- FR-8: Manual goal completion stores a flag in Firestore and awards the point immediately
- FR-9: Manual completion is restricted to today's date only
- FR-10: The daily summary endpoint must include both meal and supplement nutrients, and reflect manual goal completions
- FR-11: The nutrition dashboard must visually distinguish supplements from meals and indicate manually completed goals

## Non-Goals

- No unit conversion logic (e.g., converting cups to mL) — units remain descriptive labels
- No migration of existing recipes with non-standard units — they display as-is, edits will require selecting a valid unit
- No supplement reminders or scheduling
- No supplement interaction warnings (e.g., "don't take iron with calcium")
- No barcode scanning for supplements
- No per-supplement toggle for goal contribution — all supplements always count toward goals
- No manual goal completion for past dates

## Dependencies

- `prd-2026-03-17-nutrition-tracking.md` (the base nutrition feature must be complete — it is)

## Design Considerations

- The unit dropdown should be a simple `<select>` element styled consistently with existing form controls
- Supplement cards in the catalog should match the visual style of the nutrient goal cards on the goals page
- Manual completion button should be unobtrusive (small icon/button) to avoid cluttering the dashboard
- Manually completed goals should have a distinct visual treatment (e.g., checkmark badge, different progress bar color) so users can tell the difference from naturally completed goals
- Supplement entries on the dashboard should use a pill/capsule emoji (💊) or icon to distinguish from meal entries (🍽️)

## Technical Considerations

- The `Ingredient.unit` type change is a breaking change for the shared package — all consumers (API, web) must be updated in the same pass. Run `cd packages/shared && yarn build` before typechecking dependents.
- Supplement entries follow the same Firestore document pattern as meal entries. The summary endpoint must query both `mealEntries` and `supplementEntries` collections for a given date.
- Manual goal completion needs careful interaction with the automatic point evaluation in `nutrition-points.ts`. When `evaluateNutritionPoints` runs, it should not revoke a manually awarded point unless the user explicitly undoes the manual completion. Add a `manuallyCompleted` flag to the awarded points document to distinguish manual from automatic awards.
- The `evaluateNutritionPoints` function must be updated to sum nutrients from both meals and supplements.

## Success Metrics

- Zero free-text unit entries in new recipes (all go through dropdown)
- Users can log a supplement in under 4 taps/clicks (select from catalog → confirm → done)
- Manual goal completion is reflected instantly on the dashboard without page reload
- No regression in existing nutrition tests

## Open Questions

- Should we allow users to save custom supplements for reuse, or is it one-time entry each time? (Current scope: one-time entry; saved custom supplements could be a future enhancement)
- Should the unit dropdown support an "Other" option for edge cases, or strictly limit to the 10 defined units? (Current scope: strict limit)
