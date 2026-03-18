# PRD: Nutrition Tracking

## Introduction

Add a nutrition tracking system to BurnBuddy that lets users monitor their daily micronutrient intake (Iron, Vitamin D, Calcium, B12, etc.). Users can save recipes and meals — either by tracking individual ingredients (with USDA food database lookup) or by directly entering nutrient metadata. Users choose up to 3 target nutrients to track, and earn 1 point per target nutrient that reaches ≥100% of the daily recommended intake. Points feed into the existing monthly points pool. Nutrition data is private to each user.

## Goals

- Enable users to track daily intake of configurable micronutrients (Iron, Vitamin D, Calcium, B12, Zinc, etc.)
- Provide a recipe/meal system that supports both ingredient-based nutrient auto-calculation and direct nutrient entry
- Integrate with the USDA FoodData Central API for food search with a shared Firestore cache to minimize API calls
- Award monthly points (same pool as group workouts) for hitting daily recommended intake targets
- Support browsing historical nutrition data with a date picker
- Ship on both web and mobile platforms

## User Stories

### US-001: Add nutrition domain types to shared package

**Description:** As a developer, I need shared TypeScript types for nutrition data so that the API, web, and mobile apps all use consistent interfaces.

**Acceptance Criteria:**
- [ ] Add `NutrientId` type — string literal union of supported nutrient identifiers (e.g., `'iron'`, `'vitaminD'`, `'calcium'`, `'vitaminB12'`, `'vitaminC'`, `'zinc'`, `'magnesium'`, `'folate'`, `'potassium'`, `'omega3'`)
- [ ] Add `NutrientInfo` interface: `{ id: NutrientId, name: string, unit: string, dailyRecommended: number }`
- [ ] Add `NutrientAmount` interface: `{ nutrientId: NutrientId, amount: number }`
- [ ] Add `Ingredient` interface: `{ id: string, name: string, quantity: number, unit: string, nutrients: NutrientAmount[], fdcId?: string }`
- [ ] Add `Recipe` interface: `{ id: string, uid: string, name: string, description?: string, ingredients: Ingredient[], directNutrients?: NutrientAmount[], servings: number, createdAt: string, updatedAt: string }`
- [ ] Add `MealEntry` interface: `{ id: string, uid: string, date: string, mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack', recipeId?: string, recipeName: string, servingsConsumed: number, nutrients: NutrientAmount[], createdAt: string }`
- [ ] Add `NutritionGoals` interface: `{ uid: string, targetNutrients: NutrientId[], updatedAt: string }` (max 3 target nutrients)
- [ ] Add `DailyNutritionSummary` interface: `{ date: string, nutrients: { nutrientId: NutrientId, consumed: number, recommended: number, percentComplete: number }[], pointsEarned: number }`
- [ ] Add `FoodSearchResult` interface: `{ fdcId: string, description: string, brandOwner?: string, nutrients: NutrientAmount[] }`
- [ ] Export a `SUPPORTED_NUTRIENTS` constant: an array of `NutrientInfo` objects with NIH RDA values for adults (e.g., Iron 18mg, Vitamin D 20mcg, Calcium 1000mg, etc.)
- [ ] Build shared package successfully (`cd packages/shared && yarn build`)
- [ ] Typecheck passes for shared, API, and web packages

### US-002: Create USDA FoodData Central integration service

**Description:** As a user, I want to search for foods and see their nutrient data so I don't have to manually look up every value.

**Acceptance Criteria:**
- [ ] Create `services/api/src/services/usda-food-search.ts`
- [ ] Implement `searchFoods(query: string): Promise<FoodSearchResult[]>` — calls USDA FoodData Central `/v1/foods/search` endpoint with query and API key
- [ ] Implement `getFoodDetails(fdcId: string): Promise<FoodSearchResult>` — calls `/v1/food/{fdcId}` for detailed nutrient breakdown
- [ ] API key read from `USDA_API_KEY` environment variable (already in Key Vault as `usda-foodcentral-api-key`)
- [ ] Create a mapping from USDA numeric nutrient IDs to our `NutrientId` strings (e.g., USDA 1089 → `'iron'`, USDA 1114 → `'vitaminD'`)
- [ ] Only extract nutrients that are in our `SUPPORTED_NUTRIENTS` list — ignore the rest
- [ ] Handle USDA API errors gracefully (return empty results, log error)
- [ ] Write unit tests: mock fetch calls, test nutrient mapping from USDA format to our format, test error handling when USDA API is down
- [ ] Typecheck passes

### US-003: Implement Firestore food search cache

**Description:** As a developer, I want to cache USDA food search results in Firestore so that repeated lookups (e.g., "chicken breast" searched by multiple users) don't hit the USDA API unnecessarily.

**Acceptance Criteria:**
- [ ] Create Firestore collection `foodCache` with documents keyed by normalized search query (lowercase, trimmed) or `fdc_{fdcId}` for individual food lookups
- [ ] Document structure: `{ query: string, fdcId?: string, results: FoodSearchResult[], cachedAt: string }`
- [ ] Before calling USDA API, check cache first. If cache hit and entry is less than 30 days old, return cached results
- [ ] On cache miss, call USDA API, store results in cache, then return
- [ ] Cache is shared across all users (not per-user)
- [ ] Write unit tests: cache hit returns cached data without USDA call, cache miss calls USDA and stores result, expired cache (>30 days) triggers fresh USDA call
- [ ] Typecheck passes

### US-004: Create nutrition API routes — recipe CRUD

**Description:** As a user, I want to create, view, edit, and delete recipes so I can save meals I regularly eat with their nutritional information.

**Acceptance Criteria:**
- [ ] Create `services/api/src/routes/nutrition.ts` with Express router
- [ ] `POST /nutrition/recipes` — Create a recipe. Request body: `{ name, description?, ingredients?, directNutrients?, servings }`. Returns created recipe with ID
- [ ] `GET /nutrition/recipes` — List all recipes for the authenticated user, sorted by most recently updated
- [ ] `GET /nutrition/recipes/:id` — Get a single recipe by ID. Return 404 if not found or not owned by user
- [ ] `PUT /nutrition/recipes/:id` — Update a recipe. Validates ownership. Returns updated recipe
- [ ] `DELETE /nutrition/recipes/:id` — Delete a recipe. Validates ownership. Returns 204
- [ ] All endpoints require `requireAuth` middleware
- [ ] Recipes stored in Firestore collection `recipes` with auto-generated document IDs
- [ ] Validate that `directNutrients` takes precedence over ingredient-calculated nutrients when resolving total recipe nutrition
- [ ] When a recipe has ingredients, the total nutrients per serving = sum of all ingredient nutrients / servings count
- [ ] Write unit tests following existing pattern (`vi.hoisted`, `vi.mock`, `buildApp`, `supertest`): CRUD operations, 401 without auth, 404 for missing/unowned recipe
- [ ] Typecheck passes

### US-005: Create nutrition API routes — meal logging

**Description:** As a user, I want to log meals I've eaten so I can track my daily nutrient intake.

**Acceptance Criteria:**
- [ ] `POST /nutrition/meals` — Log a meal. Request body: `{ date (YYYY-MM-DD), mealType, recipeId?, recipeName, servingsConsumed, nutrients? }`. If `recipeId` is provided, resolve nutrients from the recipe and multiply by `servingsConsumed / recipe.servings`. Store denormalized nutrients on the `MealEntry` document for fast daily summaries
- [ ] `GET /nutrition/meals?date=YYYY-MM-DD` — Get all meals for the authenticated user on a given date. If no date provided, default to today (based on client's date in query param)
- [ ] `DELETE /nutrition/meals/:id` — Delete a meal entry. Validates ownership. Returns 204
- [ ] Meals stored in Firestore collection `mealEntries` with auto-generated document IDs
- [ ] After logging a meal, trigger nutrition points evaluation as a fire-and-forget background task (see US-007)
- [ ] After deleting a meal, trigger nutrition points re-evaluation as a fire-and-forget background task (see US-007)
- [ ] Write unit tests: log meal with recipe, log meal without recipe (direct nutrients), get meals by date, delete meal, 401 without auth
- [ ] Typecheck passes

### US-006: Create nutrition API routes — goals and summary

**Description:** As a user, I want to set my target nutrients and view a daily summary of my progress toward recommended intake.

**Acceptance Criteria:**
- [ ] `GET /nutrition/goals` — Get the user's nutrition goals. Returns `NutritionGoals` or default (empty targets) if not set
- [ ] `PUT /nutrition/goals` — Set/update target nutrients. Request body: `{ targetNutrients: NutrientId[] }`. Server-side validation: max 3 nutrients, each must be a valid `NutrientId` from `SUPPORTED_NUTRIENTS`. Stored in Firestore collection `nutritionGoals` with document ID = uid
- [ ] `GET /nutrition/summary?date=YYYY-MM-DD` — Return daily nutrition summary: for each nutrient in `SUPPORTED_NUTRIENTS`, calculate total consumed (sum of all meals that day), recommended amount, and percent complete. Also return `pointsEarned` count for that date (number of target nutrients at ≥100%)
- [ ] `GET /nutrition/foods/search?q=chicken+breast` — Proxy to USDA food search service (US-002/003). Returns `FoodSearchResult[]`. Requires non-empty query string
- [ ] Write unit tests: set goals, validate max 3, get summary with/without meals, food search proxy
- [ ] Typecheck passes

### US-007: Implement nutrition points awarding

**Description:** As a user, I want to earn points when I hit 100% of the daily recommended intake for my target nutrients so I'm motivated to eat well.

**Acceptance Criteria:**
- [ ] Create `services/api/src/services/nutrition-points.ts`
- [ ] When a meal is logged or deleted, evaluate the user's daily nutrition for that date:
  1. Fetch all meals for the user on that date
  2. Fetch user's target nutrients from `nutritionGoals`
  3. For each target nutrient, sum consumed amounts and compare against `dailyRecommended` from `SUPPORTED_NUTRIENTS`
  4. For each target nutrient at ≥100%: check if a point was already awarded for that nutrient+date — if not, award 1 point to `monthlyPoints` using existing `FieldValue.increment(1)` pattern and create an award tracking document
  5. For each target nutrient below 100%: check if a point was previously awarded — if so, decrement `monthlyPoints` by 1 and delete the award tracking document
- [ ] Create Firestore collection `nutritionPointsAwarded` with document ID `${uid}_${date}_${nutrientId}` to track which points were awarded for which nutrient on which date
- [ ] Points go into the existing `monthlyPoints` collection (same pool as group workout points), using the same `awardGroupWorkoutPoints` pattern with `FieldValue.increment(1)` and `set({ merge: true })`
- [ ] Points evaluation runs as fire-and-forget (errors logged, don't fail the meal request)
- [ ] Max 3 points per day from nutrition (enforced by max 3 target nutrients)
- [ ] Write unit tests: point awarded when nutrient hits 100%, no double-award for same nutrient+date, point removed when meal deletion drops below 100%, respects max 3 targets
- [ ] Typecheck passes

### US-008: Register nutrition routes in API entry point

**Description:** As a developer, I need the nutrition routes mounted in the Express app so they're accessible via HTTP.

**Acceptance Criteria:**
- [ ] Import nutrition router in `services/api/src/index.ts`
- [ ] Mount at: `app.use('/nutrition', nutritionRouter)` following the same pattern as other routes
- [ ] Update Bicep template (`infra/modules/api-container-app.bicep`) to add a new secret reference for `usda-foodcentral-api-key` from Key Vault and map it to `USDA_API_KEY` environment variable
- [ ] All existing API tests still pass (`cd services/api && yarn test`)
- [ ] Typecheck passes

### US-009: Add React Query hooks for nutrition data

**Description:** As a web developer, I need React Query hooks for fetching and mutating nutrition data so the web UI can interact with the API.

**Acceptance Criteria:**
- [ ] Add nutrition query keys to `apps/web/src/lib/queries.ts` (or create `apps/web/src/lib/nutrition-queries.ts`): `nutritionSummary(date)`, `nutritionMeals(date)`, `recipes`, `recipe(id)`, `nutritionGoals`, `foodSearch(query)`
- [ ] `useNutritionSummary(date: string)` — fetches `GET /nutrition/summary?date=...`
- [ ] `useNutritionMeals(date: string)` — fetches `GET /nutrition/meals?date=...`
- [ ] `useRecipes()` — fetches `GET /nutrition/recipes`
- [ ] `useRecipe(id: string)` — fetches `GET /nutrition/recipes/:id`
- [ ] `useNutritionGoals()` — fetches `GET /nutrition/goals`
- [ ] `useFoodSearch(query: string)` — fetches `GET /nutrition/foods/search?q=...` with debounced query (only fires after 300ms of no typing). Disabled when query is empty
- [ ] Mutation hooks: `useLogMeal()`, `useDeleteMeal()`, `useCreateRecipe()`, `useUpdateRecipe()`, `useDeleteRecipe()`, `useUpdateNutritionGoals()` — all invalidate relevant queries on success
- [ ] Typecheck passes

### US-010: Create nutrition dashboard page (web)

**Description:** As a user, I want a dedicated nutrition page showing my daily nutrient intake progress, today's meals, and points earned.

**Acceptance Criteria:**
- [ ] Create `apps/web/src/app/(main)/nutrition/page.tsx`
- [ ] Show a date picker at the top (defaults to today) that lets users browse past days
- [ ] Display a daily summary card showing each tracked nutrient with: name, consumed amount, recommended amount, and a progress bar (colored green at ≥100%, yellow at 50-99%, red at <50%)
- [ ] Show target nutrients (up to 3) prominently at the top with a 🔥 icon next to ones that earned a point
- [ ] Display a "Today's Meals" section listing each logged meal (name, meal type, time, key nutrients)
- [ ] Show quick action buttons: "Log a Meal", "My Recipes", "Nutrition Goals"
- [ ] If user has no goals set, show a prompt: "Choose up to 3 nutrients to track for points!"
- [ ] Style with existing Tailwind dark theme (surface, surface-elevated, border-gray-700, accent-pink for highlights)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-011: Create meal logging page (web)

**Description:** As a user, I want to log a meal by picking a saved recipe or searching for foods, adjusting servings, and saving.

**Acceptance Criteria:**
- [ ] Create `apps/web/src/app/(main)/nutrition/log/page.tsx`
- [ ] Meal type selector: breakfast, lunch, dinner, snack (radio buttons or tabs)
- [ ] Date picker (defaults to today)
- [ ] "From Saved Recipe" section: searchable dropdown of user's saved recipes. Selecting one populates the nutrient preview
- [ ] "Search Foods" section: text input that searches USDA FoodData Central via debounced API call. Shows results as a selectable list with food name and key nutrients
- [ ] Servings adjuster: numeric input (default 1) that scales displayed nutrients
- [ ] Nutrient summary preview showing what will be logged (list of nutrients with amounts)
- [ ] "Log Meal" submit button that calls `POST /nutrition/meals` and redirects to nutrition dashboard
- [ ] Show loading states during API calls and success feedback after logging
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-012: Create recipes management page (web)

**Description:** As a user, I want to view all my saved recipes and navigate to create or edit them.

**Acceptance Criteria:**
- [ ] Create `apps/web/src/app/(main)/nutrition/recipes/page.tsx`
- [ ] Show a list of the user's saved recipes as cards, each showing: name, serving count, and top 3 nutrient highlights (e.g., "Iron: 8mg, Vitamin D: 15mcg")
- [ ] "Create New Recipe" button that navigates to `/nutrition/recipes/new`
- [ ] Clicking a recipe card navigates to `/nutrition/recipes/[id]` for editing
- [ ] Empty state: "No recipes yet. Create your first recipe to get started!"
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-013: Create recipe form — create and edit (web)

**Description:** As a user, I want to create or edit a recipe by adding ingredients (with USDA search) or directly entering nutrient values.

**Acceptance Criteria:**
- [ ] Create `apps/web/src/app/(main)/nutrition/recipes/new/page.tsx` for creating
- [ ] Create `apps/web/src/app/(main)/nutrition/recipes/[id]/page.tsx` for editing (pre-populates form with existing recipe data)
- [ ] Form fields: recipe name (required), description (optional), number of servings (required, default 1)
- [ ] **Ingredients mode** (default): "Add Ingredient" button opens a USDA food search. User searches, selects a food, enters quantity and unit. Ingredient's nutrients auto-populate from USDA data. Multiple ingredients can be added. Each ingredient shows as a row with name, quantity, and a remove button
- [ ] **Direct entry mode**: Toggle switch "Enter nutrients manually". When active, shows a form with inputs for each nutrient in `SUPPORTED_NUTRIENTS` (amount per serving). Ingredients section is hidden
- [ ] Nutrient summary preview: shows calculated total nutrients per serving (sum of ingredient nutrients / servings OR direct values)
- [ ] `directNutrients` takes precedence: if user switches to direct mode after adding ingredients, direct values are what gets saved
- [ ] Save button calls `POST /nutrition/recipes` (create) or `PUT /nutrition/recipes/:id` (edit) and redirects to recipes list
- [ ] Edit page: show a "Delete Recipe" button that calls `DELETE /nutrition/recipes/:id` with confirmation dialog
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-014: Create nutrition goals page (web)

**Description:** As a user, I want to select up to 3 nutrients as my daily targets so I can earn points by hitting their recommended intake.

**Acceptance Criteria:**
- [ ] Create `apps/web/src/app/(main)/nutrition/goals/page.tsx`
- [ ] Display all nutrients from `SUPPORTED_NUTRIENTS` as a selectable list, each showing: name, daily recommended amount with unit
- [ ] Users can select up to 3 nutrients via checkboxes. When 3 are selected, remaining checkboxes are disabled
- [ ] Show currently selected targets prominently at the top
- [ ] "Save Goals" button that calls `PUT /nutrition/goals`. Show success feedback
- [ ] Explain the points system: "Earn 1 point for each target nutrient that reaches 100% of the daily recommended intake. Points add to your monthly total."
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-015: Add Nutrition tab to web NavBar

**Description:** As a user, I want a Nutrition tab in the navigation so I can easily access the nutrition tracking feature.

**Acceptance Criteria:**
- [ ] Add a "Nutrition" item to the `navItems` array in `apps/web/src/components/NavBar.tsx`, positioned between "Friends" and "Account"
- [ ] Desktop: shows as a text link in the top bar, same style as Home/Friends/Account
- [ ] Mobile: shows as an icon + label in the bottom tab bar. Use a nutrition-related SVG icon (leaf, apple, or plate icon) consistent with the existing icon style (24x24, stroke-based)
- [ ] Active state: `text-accent-pink` color, same as other tabs
- [ ] Route: `/nutrition`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-016: Create mobile nutrition dashboard screen

**Description:** As a mobile user, I want a nutrition screen showing my daily intake progress and logged meals.

**Acceptance Criteria:**
- [ ] Create `apps/mobile/screens/NutritionScreen.tsx`
- [ ] Show date selector (today by default) to browse daily nutrition
- [ ] Display daily nutrient progress: target nutrients with progress bars, non-target nutrients below
- [ ] Show 🔥 icon next to nutrients that hit 100% and earned a point
- [ ] List today's logged meals with name, meal type, and key nutrients
- [ ] "Log Meal" button navigates to LogMealScreen
- [ ] "Recipes" button navigates to RecipesScreen
- [ ] "Goals" button navigates to NutritionGoalsScreen
- [ ] Typecheck passes

### US-017: Create mobile meal logging screen

**Description:** As a mobile user, I want to log meals from my phone.

**Acceptance Criteria:**
- [ ] Create `apps/mobile/screens/LogMealScreen.tsx`
- [ ] Meal type selector (breakfast/lunch/dinner/snack)
- [ ] Date picker
- [ ] "From Recipe" section: scrollable list of saved recipes, tap to select
- [ ] "Search Foods" section: text input with USDA food search, results displayed as tappable list items
- [ ] Servings adjuster (numeric input with +/- buttons)
- [ ] Nutrient preview before saving
- [ ] "Log Meal" button saves and returns to NutritionScreen
- [ ] Typecheck passes

### US-018: Create mobile recipes screen

**Description:** As a mobile user, I want to manage my saved recipes.

**Acceptance Criteria:**
- [ ] Create `apps/mobile/screens/RecipesScreen.tsx`
- [ ] List of saved recipes showing name, servings, and top nutrient highlights
- [ ] "New Recipe" button to create a recipe
- [ ] Tap recipe to view/edit: name, description, servings, ingredients list (with USDA search to add), or toggle to direct nutrient entry
- [ ] Delete recipe option with confirmation
- [ ] Typecheck passes

### US-019: Create mobile nutrition goals screen

**Description:** As a mobile user, I want to set my target nutrients from my phone.

**Acceptance Criteria:**
- [ ] Create `apps/mobile/screens/NutritionGoalsScreen.tsx`
- [ ] Display all supported nutrients with checkboxes
- [ ] Max 3 selections — disable remaining when 3 are checked
- [ ] Show daily recommended amount for each nutrient
- [ ] "Save" button persists goals and returns to NutritionScreen
- [ ] Typecheck passes

### US-020: Add Nutrition tab to mobile navigation

**Description:** As a mobile user, I want a Nutrition tab so I can access the feature from the main navigation.

**Acceptance Criteria:**
- [ ] Add a 4th tab "🍎 Nutrition" to the `TabBar` component in `apps/mobile/App.tsx`
- [ ] Tab positioned between Friends and Account
- [ ] Add `'nutrition'` to the `AppTab` type
- [ ] Wire NutritionScreen as the default view for the nutrition tab
- [ ] Add sub-screen navigation for LogMealScreen, RecipesScreen, NutritionGoalsScreen via the existing `HomeView` state machine pattern
- [ ] Active state: same pink color (`#FF2D55`) as other tabs
- [ ] Typecheck passes

### US-021: Update Bicep infrastructure for USDA API key

**Description:** As a developer, I need the USDA API key injected into the API container app so the food search service can authenticate with USDA.

**Acceptance Criteria:**
- [ ] Add `usda-foodcentral-api-key` to the secrets array in `infra/modules/api-container-app.bicep`, referencing `${keyVaultUri}/secrets/usda-foodcentral-api-key`
- [ ] Add env var mapping: `{ name: 'USDA_API_KEY', secretRef: 'usda-foodcentral-api-key' }`
- [ ] Bicep template validates successfully (`az bicep build`)
- [ ] Note: API key already exists in both `buddyburn-beta-kv` and `buddyburn-prod-kv` Key Vaults

## Functional Requirements

- FR-1: Add nutrition domain types (`NutrientId`, `NutrientInfo`, `NutrientAmount`, `Ingredient`, `Recipe`, `MealEntry`, `NutritionGoals`, `DailyNutritionSummary`, `FoodSearchResult`) to `@burnbuddy/shared`
- FR-2: Export a `SUPPORTED_NUTRIENTS` constant with NIH RDA values for at least 10 micronutrients (Iron, Vitamin D, Calcium, Vitamin B12, Vitamin C, Zinc, Magnesium, Folate, Potassium, Omega-3)
- FR-3: Integrate with USDA FoodData Central API (`/v1/foods/search` and `/v1/food/{fdcId}`) for food nutrient lookup
- FR-4: Cache USDA API responses in a shared Firestore `foodCache` collection with 30-day TTL
- FR-5: Store recipes in Firestore `recipes` collection. Recipes support both ingredient-based nutrient auto-calculation AND direct nutrient metadata entry. `directNutrients` takes precedence over ingredient-calculated values
- FR-6: Store meal entries in Firestore `mealEntries` collection with denormalized nutrients for fast daily queries
- FR-7: Store nutrition goals in Firestore `nutritionGoals` collection (doc ID = uid). Max 3 target nutrients, validated server-side
- FR-8: When a meal is logged or deleted, evaluate daily nutrition against target nutrients and award/revoke points in the existing `monthlyPoints` collection
- FR-9: Track awarded nutrition points in `nutritionPointsAwarded` collection (doc ID = `${uid}_${date}_${nutrientId}`) to prevent double-counting
- FR-10: Award 1 point per target nutrient at ≥100% of daily recommended intake. Maximum 3 nutrition points per day
- FR-11: Points evaluation runs as fire-and-forget background tasks — errors must not fail the meal logging request
- FR-12: Daily nutrition summary endpoint calculates totals for all supported nutrients with consumed, recommended, and percent complete
- FR-13: All nutrition API endpoints require `requireAuth` middleware
- FR-14: Nutrition data is private — users can only access their own recipes, meals, goals, and summaries
- FR-15: Web UI adds a "Nutrition" tab to the navigation bar (desktop and mobile views)
- FR-16: Web nutrition pages use the existing dark theme (Tailwind v4, surface/surface-elevated/accent-pink colors)
- FR-17: Mobile app adds a "Nutrition" tab to the bottom navigation bar
- FR-18: Historical browsing via date picker — users can view past days' nutrition data
- FR-19: USDA API key injected via Azure Key Vault → Bicep → environment variable `USDA_API_KEY`

## Non-Goals

- No social/sharing features — nutrition data is private, not visible to friends or buddies
- No calorie counting or macro tracking (protein/carbs/fat) — focus is on micronutrients, though the type system is extensible
- No meal planning or scheduling — only tracking what was eaten
- No barcode scanning for food lookup
- No photo-based food recognition
- No integration with fitness trackers or wearables for nutrition data
- No AI-powered meal suggestions or recommendations
- No weekly/monthly trend charts (just day-by-day browsing via date picker)
- No recipe sharing between users
- No admin panel for nutrition management

## Dependencies

- `prd-2026-03-15-monthly-points-system.md` (completed) — Nutrition points use the existing `monthlyPoints` collection and `FieldValue.increment()` pattern

## Design Considerations

- **Reuse existing components:** Use `StatCard` for nutrient displays, follow `MonthlyPointsCard` pattern for the points summary, use existing dark theme color palette
- **Progress bars:** Color-coded nutrient progress bars — green (≥100%), yellow (50-99%), red (<50%)
- **NavBar integration:** New tab with nutrition icon (SVG, stroke-based, 24x24) matching existing Home/Friends/Account icon style
- **Mobile consistency:** Mirror the web UI layout adapted for React Native, following existing screen patterns (HomeScreen, FriendsScreen)
- **Empty states:** Friendly prompts when no goals set, no recipes created, or no meals logged for the day

## Technical Considerations

- **USDA nutrient ID mapping:** USDA uses numeric IDs (1089=Iron, 1114=Vitamin D, 1087=Calcium, etc.). Maintain a mapping constant in the USDA service
- **Denormalized meal nutrients:** Each `MealEntry` stores resolved nutrients (servingsConsumed × per-serving nutrients) to avoid re-calculating on every summary query
- **Recipe nutrient resolution:** When `directNutrients` is set, it takes precedence. Otherwise, total = sum of ingredient nutrients / servings. API should document and enforce this
- **Point un-awarding:** Deleting a meal can drop a nutrient below 100%, requiring point decrement. Implement as best-effort fire-and-forget using `FieldValue.increment(-1)`
- **Timezone handling:** "Date" is user-local. Client sends `YYYY-MM-DD` strings — the API does not interpret timezones
- **Cache key normalization:** USDA search cache keys should be lowercase and trimmed to maximize cache hits across users
- **Firestore indexes:** Compound indexes needed for `mealEntries` (uid + date) and `nutritionPointsAwarded` (uid + date)
- **Shared package build:** After type changes, `cd packages/shared && yarn build` must be run before API/web typecheck will pass (types resolve from compiled `dist/`)

## Success Metrics

- Users can log meals and see daily nutrient intake within 3 taps/clicks
- USDA food search returns results in under 2 seconds (cache hits under 500ms)
- Points correctly award/revoke as daily intake crosses the 100% threshold
- No performance regression on existing workout or points features
- All new API endpoints have unit test coverage

## Open Questions

- Should we include a small set of "common foods" as a local fallback if the USDA API is unreachable? (Proposed: defer to a future iteration — just show an error message)
- Should editing a recipe retroactively update past meal entries that used it? (Proposed: no — meal entries store denormalized nutrients at time of logging, so past logs reflect what was recorded at that time)
- What specific nutrients should be in the initial `SUPPORTED_NUTRIENTS` set? (Proposed: start with Iron, Vitamin D, Calcium, Vitamin B12, Vitamin C, Zinc, Magnesium, Folate, Potassium, Omega-3 — expand based on user feedback)
