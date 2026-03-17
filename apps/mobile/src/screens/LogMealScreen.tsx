import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { apiGet, apiPost } from '../lib/api';
import type {
  NutrientAmount,
  FoodSearchResult,
  Recipe,
  MealEntry,
} from '@burnbuddy/shared';
import { SUPPORTED_NUTRIENTS } from '@burnbuddy/shared';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type SourceMode = 'recipe' | 'food';

interface RecipeWithNutrients extends Recipe {
  nutrientsPerServing: NutrientAmount[];
}

interface LogMealScreenProps {
  onBack: () => void;
}

const MEAL_TYPES: { value: MealType; label: string; emoji: string }[] = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { value: 'lunch', label: 'Lunch', emoji: '☀️' },
  { value: 'dinner', label: 'Dinner', emoji: '🌙' },
  { value: 'snack', label: 'Snack', emoji: '🍎' },
];

const NUTRIENT_MAP = new Map(SUPPORTED_NUTRIENTS.map((n) => [n.id, n]));

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function displayDate(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (formatDate(d) === formatDate(today)) return 'Today';
  if (formatDate(d) === formatDate(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function scaleNutrients(nutrients: NutrientAmount[], factor: number): NutrientAmount[] {
  return nutrients.map((n) => ({
    nutrientId: n.nutrientId,
    amount: Math.round(n.amount * factor * 100) / 100,
  }));
}

export default function LogMealScreen({ onBack }: LogMealScreenProps) {
  // Form state
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [sourceMode, setSourceMode] = useState<SourceMode>('recipe');
  const [servings, setServings] = useState(1);

  // Recipe state
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [recipeDetail, setRecipeDetail] = useState<RecipeWithNutrients | null>(null);

  // Food search state
  const [foodQuery, setFoodQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [foodResults, setFoodResults] = useState<FoodSearchResult[]>([]);
  const [foodSearching, setFoodSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const dateStr = formatDate(selectedDate);
  const isToday = formatDate(selectedDate) === formatDate(new Date());

  // Load recipes on mount
  useEffect(() => {
    let cancelled = false;
    setRecipesLoading(true);
    apiGet<Recipe[]>('/nutrition/recipes')
      .then((data) => {
        if (!cancelled) setRecipes(data);
      })
      .catch(() => {
        if (!cancelled) setRecipes([]);
      })
      .finally(() => {
        if (!cancelled) setRecipesLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch recipe detail when selected
  useEffect(() => {
    if (!selectedRecipeId) {
      setRecipeDetail(null);
      return;
    }
    let cancelled = false;
    apiGet<RecipeWithNutrients>(`/nutrition/recipes/${selectedRecipeId}`)
      .then((data) => {
        if (!cancelled) setRecipeDetail(data);
      })
      .catch(() => {
        if (!cancelled) setRecipeDetail(null);
      });
    return () => { cancelled = true; };
  }, [selectedRecipeId]);

  // Debounce food search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(foodQuery), 300);
    return () => clearTimeout(timer);
  }, [foodQuery]);

  // Execute food search
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setFoodResults([]);
      setFoodSearching(false);
      return;
    }
    let cancelled = false;
    setFoodSearching(true);
    apiGet<FoodSearchResult[]>(`/nutrition/foods/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((data) => {
        if (!cancelled) setFoodResults(data);
      })
      .catch(() => {
        if (!cancelled) setFoodResults([]);
      })
      .finally(() => {
        if (!cancelled) setFoodSearching(false);
      });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  // Computed values
  const mealName = sourceMode === 'recipe'
    ? (recipes.find((r) => r.id === selectedRecipeId)?.name ?? '')
    : (selectedFood?.description ?? '');

  const baseNutrients: NutrientAmount[] = useMemo(() => {
    if (sourceMode === 'recipe' && recipeDetail?.nutrientsPerServing) {
      return recipeDetail.nutrientsPerServing;
    }
    if (sourceMode === 'food' && selectedFood) {
      return selectedFood.nutrients;
    }
    return [];
  }, [sourceMode, recipeDetail, selectedFood]);

  const previewNutrients = useMemo(
    () => scaleNutrients(baseNutrients, servings),
    [baseNutrients, servings],
  );

  const canSubmit = mealName.trim() !== '' && servings > 0 && !submitting;

  // Date navigation
  const goBack = useCallback(() => {
    setSelectedDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() - 1);
      return next;
    });
  }, []);

  const goForward = useCallback(() => {
    if (!isToday) {
      setSelectedDate((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        return next;
      });
    }
  }, [isToday]);

  // Handlers
  const handleSelectRecipe = useCallback((recipe: Recipe) => {
    setSelectedRecipeId(recipe.id);
  }, []);

  const handleSelectFood = useCallback((food: FoodSearchResult) => {
    setSelectedFood(food);
    setFoodQuery('');
    setDebouncedQuery('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost<MealEntry>('/nutrition/meals', {
        date: dateStr,
        mealType,
        recipeId: sourceMode === 'recipe' ? selectedRecipeId : undefined,
        recipeName: mealName,
        servingsConsumed: servings,
        nutrients: sourceMode === 'food' ? previewNutrients : undefined,
      });
      setShowSuccess(true);
      setTimeout(() => onBack(), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log meal');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, dateStr, mealType, sourceMode, selectedRecipeId, mealName, servings, previewNutrients, onBack]);

  // Success screen
  if (showSuccess) {
    return (
      <View style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>Meal Logged!</Text>
          <Text style={styles.successSubtitle}>Returning to dashboard…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} testID="log-meal-back">
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log a Meal</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Error */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Date Picker */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Date</Text>
          <View style={styles.datePicker}>
            <TouchableOpacity onPress={goBack} style={styles.dateArrow} testID="log-meal-date-back">
              <Text style={styles.dateArrowText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.dateText}>{displayDate(selectedDate)}</Text>
            <TouchableOpacity
              onPress={goForward}
              disabled={isToday}
              style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
              testID="log-meal-date-forward"
            >
              <Text style={[styles.dateArrowText, isToday && styles.dateArrowTextDisabled]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Meal Type Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Meal Type</Text>
          <View style={styles.mealTypeRow}>
            {MEAL_TYPES.map((mt) => (
              <TouchableOpacity
                key={mt.value}
                onPress={() => setMealType(mt.value)}
                style={[styles.mealTypeButton, mealType === mt.value && styles.mealTypeButtonActive]}
                testID={`meal-type-${mt.value}`}
              >
                <Text style={styles.mealTypeEmoji}>{mt.emoji}</Text>
                <Text style={[styles.mealTypeLabel, mealType === mt.value && styles.mealTypeLabelActive]}>
                  {mt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Source Mode Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Source</Text>
          <View style={styles.sourceModeRow}>
            <TouchableOpacity
              onPress={() => {
                setSourceMode('recipe');
                setSelectedFood(null);
                setFoodQuery('');
              }}
              style={[styles.sourceModeButton, sourceMode === 'recipe' && styles.sourceModeButtonActive]}
              testID="source-mode-recipe"
            >
              <Text style={[styles.sourceModeText, sourceMode === 'recipe' && styles.sourceModeTextActive]}>
                📖 Saved Recipes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setSourceMode('food');
                setSelectedRecipeId('');
                setRecipeDetail(null);
              }}
              style={[styles.sourceModeButton, sourceMode === 'food' && styles.sourceModeButtonActive]}
              testID="source-mode-food"
            >
              <Text style={[styles.sourceModeText, sourceMode === 'food' && styles.sourceModeTextActive]}>
                🔍 Search Foods
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recipe Selection */}
        {sourceMode === 'recipe' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Select Recipe</Text>
            {recipesLoading ? (
              <ActivityIndicator color="#E05A00" style={styles.loader} />
            ) : recipes.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No saved recipes yet</Text>
                <Text style={styles.emptySubtext}>Create recipes first to log meals from them</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.recipeList}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {recipes.map((recipe) => (
                  <TouchableOpacity
                    key={recipe.id}
                    onPress={() => handleSelectRecipe(recipe)}
                    style={[
                      styles.recipeItem,
                      recipe.id === selectedRecipeId && styles.recipeItemSelected,
                    ]}
                    testID={`recipe-item-${recipe.id}`}
                  >
                    <Text
                      style={[
                        styles.recipeItemName,
                        recipe.id === selectedRecipeId && styles.recipeItemNameSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {recipe.name}
                    </Text>
                    <Text style={styles.recipeItemServings}>
                      {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}
                    </Text>
                    {recipe.id === selectedRecipeId && (
                      <Text style={styles.recipeItemCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Food Search */}
        {sourceMode === 'food' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Search Foods</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search USDA foods (e.g. spinach, salmon)…"
              placeholderTextColor="#9ca3af"
              value={foodQuery}
              onChangeText={(text) => {
                setFoodQuery(text);
                setSelectedFood(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              testID="food-search-input"
            />

            {/* Selected food badge */}
            {selectedFood && !foodQuery && (
              <View style={styles.selectedFoodBadge}>
                <Text style={styles.selectedFoodText} numberOfLines={1}>
                  {selectedFood.description}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelectedFood(null)}
                  testID="clear-selected-food"
                >
                  <Text style={styles.selectedFoodClear}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Search results */}
            {foodQuery.trim() !== '' && (
              <ScrollView
                style={styles.foodResultsList}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {foodSearching ? (
                  <View style={styles.loaderRow}>
                    <ActivityIndicator size="small" color="#9ca3af" />
                    <Text style={styles.loaderText}>Searching…</Text>
                  </View>
                ) : foodResults.length === 0 ? (
                  <Text style={styles.noResultsText}>No results found</Text>
                ) : (
                  foodResults.map((food) => (
                    <TouchableOpacity
                      key={food.fdcId}
                      onPress={() => handleSelectFood(food)}
                      style={styles.foodResultItem}
                      testID={`food-result-${food.fdcId}`}
                    >
                      <Text style={styles.foodResultName} numberOfLines={1}>
                        {food.description}
                      </Text>
                      {food.brandOwner && (
                        <Text style={styles.foodResultBrand} numberOfLines={1}>
                          {food.brandOwner}
                        </Text>
                      )}
                      <Text style={styles.foodResultNutrients} numberOfLines={1}>
                        {food.nutrients
                          .slice(0, 3)
                          .map((n) => {
                            const info = NUTRIENT_MAP.get(n.nutrientId);
                            return info ? `${info.name}: ${n.amount}${info.unit}` : '';
                          })
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        )}

        {/* Servings Adjuster */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Servings</Text>
          <View style={styles.servingsRow}>
            <TouchableOpacity
              onPress={() => setServings((s) => Math.max(0.5, s - 0.5))}
              disabled={servings <= 0.5}
              style={[styles.servingsButton, servings <= 0.5 && styles.servingsButtonDisabled]}
              testID="servings-decrease"
            >
              <Text style={styles.servingsButtonText}>−</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.servingsInput}
              value={String(servings)}
              onChangeText={(text) => {
                const v = parseFloat(text);
                if (!isNaN(v) && v > 0) setServings(v);
              }}
              keyboardType="decimal-pad"
              testID="servings-input"
            />
            <TouchableOpacity
              onPress={() => setServings((s) => s + 0.5)}
              style={styles.servingsButton}
              testID="servings-increase"
            >
              <Text style={styles.servingsButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Nutrient Preview */}
        {previewNutrients.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Nutrient Preview{servings !== 1 ? ` (${servings} serving${servings !== 1 ? 's' : ''})` : ''}
            </Text>
            <View style={styles.nutrientPreviewCard}>
              {previewNutrients.map((n) => {
                const info = NUTRIENT_MAP.get(n.nutrientId);
                if (!info) return null;
                return (
                  <View key={n.nutrientId} style={styles.nutrientPreviewRow}>
                    <Text style={styles.nutrientPreviewName}>{info.name}</Text>
                    <Text style={styles.nutrientPreviewValue}>
                      {n.amount < 10 ? n.amount.toFixed(1) : Math.round(n.amount)}
                      <Text style={styles.nutrientPreviewUnit}> {info.unit}</Text>
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          testID="log-meal-submit"
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Log Meal</Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: { fontSize: 22, color: '#6b7280', marginTop: -2 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#333', textAlign: 'center' },
  headerSpacer: { width: 36 },
  // Content
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  // Section
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  // Error
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { fontSize: 13, color: '#dc2626' },
  // Date picker
  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  dateArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateArrowDisabled: { opacity: 0.4 },
  dateArrowText: { fontSize: 20, color: '#333', fontWeight: '600' },
  dateArrowTextDisabled: { color: '#9ca3af' },
  dateText: { fontSize: 15, fontWeight: '600', color: '#333', minWidth: 120, textAlign: 'center' },
  // Meal type
  mealTypeRow: { flexDirection: 'row', gap: 8 },
  mealTypeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fafafa',
  },
  mealTypeButtonActive: {
    borderColor: '#E05A00',
    backgroundColor: '#fff7ed',
  },
  mealTypeEmoji: { fontSize: 18, marginBottom: 2 },
  mealTypeLabel: { fontSize: 11, fontWeight: '500', color: '#6b7280' },
  mealTypeLabelActive: { color: '#E05A00', fontWeight: '600' },
  // Source mode
  sourceModeRow: { flexDirection: 'row', gap: 8 },
  sourceModeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fafafa',
    alignItems: 'center',
  },
  sourceModeButtonActive: {
    borderColor: '#E05A00',
    backgroundColor: '#fff7ed',
  },
  sourceModeText: { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  sourceModeTextActive: { color: '#E05A00', fontWeight: '600' },
  // Recipe list
  recipeList: { maxHeight: 200, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  recipeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  recipeItemSelected: { backgroundColor: '#fff7ed' },
  recipeItemName: { flex: 1, fontSize: 14, color: '#333' },
  recipeItemNameSelected: { color: '#E05A00', fontWeight: '600' },
  recipeItemServings: { fontSize: 12, color: '#9ca3af', marginRight: 8 },
  recipeItemCheck: { fontSize: 14, color: '#E05A00', fontWeight: '700' },
  // Empty card
  emptyCard: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
    alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  emptySubtext: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  // Food search
  searchInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  selectedFoodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  selectedFoodText: { flex: 1, fontSize: 13, color: '#333' },
  selectedFoodClear: { fontSize: 14, color: '#9ca3af', paddingLeft: 8 },
  foodResultsList: {
    maxHeight: 220,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
    backgroundColor: '#fafafa',
  },
  foodResultItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  foodResultName: { fontSize: 14, color: '#333' },
  foodResultBrand: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  foodResultNutrients: { fontSize: 11, color: '#6b7280', marginTop: 3 },
  noResultsText: { padding: 16, textAlign: 'center', fontSize: 13, color: '#9ca3af' },
  loaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  loaderText: { fontSize: 13, color: '#9ca3af' },
  loader: { padding: 20 },
  // Servings
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  servingsButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fafafa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  servingsButtonDisabled: { opacity: 0.4 },
  servingsButtonText: { fontSize: 18, color: '#333', fontWeight: '600' },
  servingsInput: {
    width: 70,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 8,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    backgroundColor: '#fafafa',
  },
  // Nutrient preview
  nutrientPreviewCard: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  nutrientPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  nutrientPreviewName: { fontSize: 13, color: '#6b7280' },
  nutrientPreviewValue: { fontSize: 13, fontWeight: '600', color: '#333' },
  nutrientPreviewUnit: { fontSize: 11, fontWeight: '400', color: '#9ca3af' },
  // Submit
  submitButton: {
    backgroundColor: '#E05A00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  // Success
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  successIcon: { fontSize: 48 },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#333' },
  successSubtitle: { fontSize: 14, color: '#9ca3af' },
  bottomSpacer: { height: 40 },
});
