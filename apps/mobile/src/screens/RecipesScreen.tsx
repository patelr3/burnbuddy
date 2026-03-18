import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api';
import type {
  Recipe,
  Ingredient,
  NutrientAmount,
  NutrientId,
  FoodSearchResult,
} from '@burnbuddy/shared';
import { SUPPORTED_NUTRIENTS } from '@burnbuddy/shared';

/* ── Types ─────────────────────────────────────────────── */

interface RecipeWithNutrients extends Recipe {
  nutrientsPerServing: NutrientAmount[];
}

type RecipesView =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'edit'; recipeId: string };

interface RecipesScreenProps {
  onBack: () => void;
}

interface IngredientRow {
  localId: string;
  name: string;
  quantity: number;
  unit: string;
  nutrients: NutrientAmount[];
  fdcId?: string;
}

const NUTRIENT_MAP = new Map(SUPPORTED_NUTRIENTS.map((n) => [n.id, n]));

let nextLocalId = 1;
function genLocalId(): string {
  return `ing_${Date.now()}_${nextLocalId++}`;
}

function formatAmount(v: number): string {
  return v < 10 ? v.toFixed(1) : String(Math.round(v));
}

/** Top 3 nutrients by % of daily recommended */
function getTopNutrients(recipe: Recipe): { nutrientId: NutrientId; amount: number }[] {
  const totals = new Map<NutrientId, number>();
  const sources: NutrientAmount[] = recipe.directNutrients?.length
    ? recipe.directNutrients
    : recipe.ingredients.flatMap((ing) => ing.nutrients);

  for (const n of sources) {
    totals.set(n.nutrientId, (totals.get(n.nutrientId) ?? 0) + n.amount);
  }

  return Array.from(totals.entries())
    .map(([nutrientId, total]) => ({
      nutrientId,
      amount: recipe.servings > 0 ? total / recipe.servings : total,
    }))
    .filter((n) => n.amount > 0)
    .sort((a, b) => {
      const aInfo = NUTRIENT_MAP.get(a.nutrientId);
      const bInfo = NUTRIENT_MAP.get(b.nutrientId);
      if (!aInfo || !bInfo) return 0;
      return b.amount / bInfo.dailyRecommended - a.amount / aInfo.dailyRecommended;
    })
    .slice(0, 3);
}

/* ══════════════════════════════════════════════════════════
   Recipe List
   ══════════════════════════════════════════════════════════ */

function RecipeList({
  onCreateNew,
  onEdit,
}: {
  onCreateNew: () => void;
  onEdit: (id: string) => void;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRecipes = useCallback(() => {
    setLoading(true);
    setError(null);
    apiGet<Recipe[]>('/nutrition/recipes')
      .then(setRecipes)
      .catch(() => setError('Failed to load recipes'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#E05A00" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity style={styles.createButton} onPress={onCreateNew} testID="create-recipe-button">
        <Text style={styles.createButtonIcon}>＋</Text>
        <Text style={styles.createButtonLabel}>New Recipe</Text>
      </TouchableOpacity>

      {recipes.length === 0 && !error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📖</Text>
          <Text style={styles.emptyText}>No recipes yet</Text>
          <Text style={styles.emptySub}>Create your first recipe to get started</Text>
        </View>
      ) : (
        recipes.map((recipe) => {
          const topNutrients = getTopNutrients(recipe);
          return (
            <TouchableOpacity
              key={recipe.id}
              style={styles.recipeCard}
              onPress={() => onEdit(recipe.id)}
              testID={`recipe-card-${recipe.id}`}
            >
              <Text style={styles.recipeCardName}>{recipe.name}</Text>
              <Text style={styles.recipeCardMeta}>
                {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}
                {recipe.ingredients.length > 0 && (
                  ` · ${recipe.ingredients.length} ingredient${recipe.ingredients.length !== 1 ? 's' : ''}`
                )}
              </Text>
              {topNutrients.length > 0 && (
                <View style={styles.nutrientChips}>
                  {topNutrients.map((n) => {
                    const info = NUTRIENT_MAP.get(n.nutrientId);
                    if (!info) return null;
                    return (
                      <View key={n.nutrientId} style={styles.nutrientChip}>
                        <Text style={styles.nutrientChipText}>
                          {info.name}: {formatAmount(n.amount)}{info.unit}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════════════
   Recipe Form (Create / Edit)
   ══════════════════════════════════════════════════════════ */

function RecipeForm({
  recipeId,
  onDone,
  onCancel,
}: {
  recipeId: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!recipeId;

  // Loading existing recipe for edit
  const [existingLoading, setExistingLoading] = useState(isEdit);
  const [initialized, setInitialized] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [servings, setServings] = useState(1);
  const [directMode, setDirectMode] = useState(false);

  // Ingredients
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [directNutrients, setDirectNutrients] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const n of SUPPORTED_NUTRIENTS) init[n.id] = '';
    return init;
  });

  // Ingredient add flow
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [foodQuery, setFoodQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [foodResults, setFoodResults] = useState<FoodSearchResult[]>([]);
  const [foodSearching, setFoodSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);
  const [ingredientQty, setIngredientQty] = useState(1);
  const [ingredientUnit, setIngredientUnit] = useState('serving');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load existing recipe for edit
  useEffect(() => {
    if (!recipeId || initialized) return;
    let cancelled = false;
    apiGet<RecipeWithNutrients>(`/nutrition/recipes/${recipeId}`)
      .then((data) => {
        if (cancelled) return;
        setName(data.name);
        setDescription(data.description ?? '');
        setServings(data.servings);

        if (data.directNutrients?.length) {
          setDirectMode(true);
          const dn: Record<string, string> = {};
          for (const n of SUPPORTED_NUTRIENTS) dn[n.id] = '';
          for (const n of data.directNutrients) dn[n.nutrientId] = String(n.amount);
          setDirectNutrients(dn);
        } else {
          setIngredients(
            data.ingredients.map((ing) => ({
              localId: genLocalId(),
              name: ing.name,
              quantity: ing.quantity,
              unit: ing.unit,
              nutrients: ing.nutrients,
              fdcId: ing.fdcId,
            })),
          );
        }
        setInitialized(true);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load recipe');
      })
      .finally(() => {
        if (!cancelled) setExistingLoading(false);
      });
    return () => { cancelled = true; };
  }, [recipeId, initialized]);

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

  // Nutrient summary per serving
  const nutrientSummary = useMemo(() => {
    if (directMode) {
      const entries: NutrientAmount[] = [];
      for (const n of SUPPORTED_NUTRIENTS) {
        const val = parseFloat(directNutrients[n.id]);
        if (val > 0) entries.push({ nutrientId: n.id as NutrientId, amount: val });
      }
      return entries;
    }
    const totals = new Map<NutrientId, number>();
    for (const ing of ingredients) {
      for (const n of ing.nutrients) {
        totals.set(n.nutrientId, (totals.get(n.nutrientId) ?? 0) + n.amount * ing.quantity);
      }
    }
    return Array.from(totals.entries())
      .filter(([, total]) => total > 0)
      .map(([nutrientId, total]) => ({
        nutrientId,
        amount: Math.round((total / Math.max(servings, 1)) * 100) / 100,
      }));
  }, [directMode, directNutrients, ingredients, servings]);

  const addSelectedFood = useCallback(() => {
    if (!selectedFood) return;
    const row: IngredientRow = {
      localId: genLocalId(),
      name: selectedFood.description,
      quantity: ingredientQty,
      unit: ingredientUnit,
      nutrients: selectedFood.nutrients,
      fdcId: String(selectedFood.fdcId),
    };
    setIngredients((prev) => [...prev, row]);
    setSelectedFood(null);
    setFoodQuery('');
    setDebouncedQuery('');
    setFoodResults([]);
    setIngredientQty(1);
    setIngredientUnit('serving');
    setAddingIngredient(false);
  }, [selectedFood, ingredientQty, ingredientUnit]);

  const removeIngredient = useCallback((localId: string) => {
    setIngredients((prev) => prev.filter((i) => i.localId !== localId));
  }, []);

  const canSubmit = name.trim().length > 0 && servings > 0;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const body = {
      name: name.trim(),
      description: description.trim() || undefined,
      servings,
      ingredients: directMode
        ? []
        : ingredients.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            nutrients: i.nutrients,
            fdcId: i.fdcId,
          })),
      directNutrients: directMode
        ? SUPPORTED_NUTRIENTS.filter((n) => parseFloat(directNutrients[n.id]) > 0).map((n) => ({
            nutrientId: n.id,
            amount: parseFloat(directNutrients[n.id]),
          }))
        : undefined,
    };

    try {
      if (isEdit && recipeId) {
        await apiPut(`/nutrition/recipes/${recipeId}`, body);
      } else {
        await apiPost('/nutrition/recipes', body);
      }
      setShowSuccess(true);
      setTimeout(() => onDone(), 800);
    } catch {
      setError(isEdit ? 'Failed to update recipe' : 'Failed to create recipe');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, name, description, servings, directMode, ingredients, directNutrients, isEdit, recipeId, onDone]);

  const handleDelete = useCallback(async () => {
    if (!recipeId) return;
    setDeleting(true);
    try {
      await apiDelete(`/nutrition/recipes/${recipeId}`);
      onDone();
    } catch {
      setError('Failed to delete recipe');
      setDeleting(false);
    }
  }, [recipeId, onDone]);

  if (existingLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#E05A00" />
      </View>
    );
  }

  if (showSuccess) {
    return (
      <View style={styles.centered}>
        <Text style={styles.successEmoji}>✅</Text>
        <Text style={styles.successText}>{isEdit ? 'Recipe updated!' : 'Recipe created!'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Name */}
      <Text style={styles.fieldLabel}>Recipe Name *</Text>
      <TextInput
        style={styles.textInput}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Chicken stir-fry"
        placeholderTextColor="#9ca3af"
        testID="recipe-name-input"
      />

      {/* Description */}
      <Text style={styles.fieldLabel}>Description</Text>
      <TextInput
        style={[styles.textInput, { height: 60 }]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional description"
        placeholderTextColor="#9ca3af"
        multiline
      />

      {/* Servings */}
      <Text style={styles.fieldLabel}>Servings *</Text>
      <View style={styles.servingsRow}>
        <TouchableOpacity
          style={styles.servingsButton}
          onPress={() => setServings(Math.max(1, servings - 1))}
        >
          <Text style={styles.servingsButtonText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.servingsValue}>{servings}</Text>
        <TouchableOpacity
          style={styles.servingsButton}
          onPress={() => setServings(servings + 1)}
        >
          <Text style={styles.servingsButtonText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* Direct Mode Toggle */}
      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => setDirectMode(!directMode)}
        testID="direct-mode-toggle"
      >
        <View style={[styles.toggleSwitch, directMode && styles.toggleSwitchActive]}>
          <View style={[styles.toggleKnob, directMode && styles.toggleKnobActive]} />
        </View>
        <Text style={styles.toggleLabel}>Enter nutrients directly</Text>
      </TouchableOpacity>

      {/* Ingredients Mode */}
      {!directMode && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ingredients</Text>

          {ingredients.map((ing) => (
            <View key={ing.localId} style={styles.ingredientRow}>
              <View style={styles.ingredientInfo}>
                <Text style={styles.ingredientName} numberOfLines={1}>{ing.name}</Text>
                <Text style={styles.ingredientMeta}>
                  {ing.quantity} {ing.unit}
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeIngredient(ing.localId)}>
                <Text style={styles.removeButton}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {!addingIngredient ? (
            <TouchableOpacity
              style={styles.addIngredientButton}
              onPress={() => setAddingIngredient(true)}
              testID="add-ingredient-button"
            >
              <Text style={styles.addIngredientText}>＋ Add Ingredient</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.addIngredientPanel}>
              <TextInput
                style={styles.textInput}
                value={foodQuery}
                onChangeText={setFoodQuery}
                placeholder="Search USDA foods..."
                placeholderTextColor="#9ca3af"
                autoFocus
                testID="ingredient-search-input"
              />

              {foodSearching && (
                <ActivityIndicator size="small" color="#E05A00" style={{ marginVertical: 8 }} />
              )}

              {foodResults.length > 0 && !selectedFood && (
                <ScrollView style={styles.foodResultsList} nestedScrollEnabled>
                  {foodResults.map((food) => (
                    <TouchableOpacity
                      key={food.fdcId}
                      style={styles.foodResultItem}
                      onPress={() => setSelectedFood(food)}
                    >
                      <Text style={styles.foodResultName} numberOfLines={2}>{food.description}</Text>
                      {food.brandOwner && (
                        <Text style={styles.foodResultBrand}>{food.brandOwner}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {selectedFood && (
                <View style={styles.selectedFoodPanel}>
                  <Text style={styles.selectedFoodName} numberOfLines={2}>
                    {selectedFood.description}
                  </Text>

                  <View style={styles.qtyRow}>
                    <Text style={styles.fieldLabel}>Qty</Text>
                    <TextInput
                      style={[styles.textInput, { flex: 1, marginLeft: 8 }]}
                      value={String(ingredientQty)}
                      onChangeText={(t) => {
                        const v = parseFloat(t);
                        if (!isNaN(v) && v > 0) setIngredientQty(v);
                      }}
                      keyboardType="numeric"
                    />
                    <Text style={[styles.fieldLabel, { marginLeft: 12 }]}>Unit</Text>
                    <TextInput
                      style={[styles.textInput, { flex: 1, marginLeft: 8 }]}
                      value={ingredientUnit}
                      onChangeText={setIngredientUnit}
                    />
                  </View>

                  <View style={styles.addFoodActions}>
                    <TouchableOpacity
                      style={styles.addFoodConfirm}
                      onPress={addSelectedFood}
                      testID="confirm-add-ingredient"
                    >
                      <Text style={styles.addFoodConfirmText}>Add</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.addFoodCancel}
                      onPress={() => {
                        setSelectedFood(null);
                        setFoodQuery('');
                        setDebouncedQuery('');
                        setFoodResults([]);
                        setAddingIngredient(false);
                      }}
                    >
                      <Text style={styles.addFoodCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {!selectedFood && (
                <TouchableOpacity
                  style={styles.addFoodCancel}
                  onPress={() => {
                    setFoodQuery('');
                    setDebouncedQuery('');
                    setFoodResults([]);
                    setAddingIngredient(false);
                  }}
                >
                  <Text style={styles.addFoodCancelText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* Direct Nutrients Mode */}
      {directMode && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nutrients (per serving)</Text>
          {SUPPORTED_NUTRIENTS.map((n) => (
            <View key={n.id} style={styles.directNutrientRow}>
              <Text style={styles.directNutrientLabel}>{n.name} ({n.unit})</Text>
              <TextInput
                style={styles.directNutrientInput}
                value={directNutrients[n.id]}
                onChangeText={(t) =>
                  setDirectNutrients((prev) => ({ ...prev, [n.id]: t }))
                }
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#9ca3af"
              />
            </View>
          ))}
        </View>
      )}

      {/* Nutrient Summary */}
      {nutrientSummary.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nutrients per Serving</Text>
          <View style={styles.summaryCard}>
            {nutrientSummary.map((n) => {
              const info = NUTRIENT_MAP.get(n.nutrientId);
              if (!info) return null;
              return (
                <View key={n.nutrientId} style={styles.summaryRow}>
                  <Text style={styles.summaryName}>{info.name}</Text>
                  <Text style={styles.summaryAmount}>
                    {formatAmount(n.amount)} {info.unit}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitButton, (!canSubmit || submitting) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit || submitting}
        testID="save-recipe-button"
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>
            {isEdit ? 'Update Recipe' : 'Create Recipe'}
          </Text>
        )}
      </TouchableOpacity>

      {/* Delete (edit only) */}
      {isEdit && (
        <View style={styles.deleteSection}>
          {!confirmDelete ? (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => setConfirmDelete(true)}
              testID="delete-recipe-button"
            >
              <Text style={styles.deleteButtonText}>Delete Recipe</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.deleteConfirm}>
              <Text style={styles.deleteConfirmText}>Are you sure?</Text>
              <View style={styles.deleteConfirmActions}>
                <TouchableOpacity
                  style={styles.deleteConfirmYes}
                  onPress={handleDelete}
                  disabled={deleting}
                  testID="confirm-delete-recipe"
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.deleteConfirmYesText}>Yes, delete</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteConfirmNo}
                  onPress={() => setConfirmDelete(false)}
                >
                  <Text style={styles.deleteConfirmNoText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Screen (routes between list / create / edit)
   ══════════════════════════════════════════════════════════ */

export default function RecipesScreen({ onBack }: RecipesScreenProps) {
  const [view, setView] = useState<RecipesView>({ type: 'list' });

  const headerTitle = useMemo(() => {
    switch (view.type) {
      case 'list': return 'My Recipes';
      case 'create': return 'New Recipe';
      case 'edit': return 'Edit Recipe';
    }
  }, [view.type]);

  const handleBack = useCallback(() => {
    if (view.type === 'list') {
      onBack();
    } else {
      setView({ type: 'list' });
    }
  }, [view.type, onBack]);

  const handleDone = useCallback(() => {
    setView({ type: 'list' });
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} testID="recipes-back-button">
          <Text style={styles.headerBack}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {view.type === 'list' && (
        <RecipeList
          onCreateNew={() => setView({ type: 'create' })}
          onEdit={(id) => setView({ type: 'edit', recipeId: id })}
        />
      )}

      {view.type === 'create' && (
        <RecipeForm
          recipeId={null}
          onDone={handleDone}
          onCancel={() => setView({ type: 'list' })}
        />
      )}

      {view.type === 'edit' && (
        <RecipeForm
          key={view.recipeId}
          recipeId={view.recipeId}
          onDone={handleDone}
          onCancel={() => setView({ type: 'list' })}
        />
      )}
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerBack: { fontSize: 17, color: '#E05A00', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  headerSpacer: { width: 50 },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#ef4444', fontSize: 13, marginBottom: 12, textAlign: 'center' },

  // Success
  successEmoji: { fontSize: 40 },
  successText: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 12 },

  // Create button
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E05A00',
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 16,
  },
  createButtonIcon: { fontSize: 18, color: '#fff', marginRight: 6 },
  createButtonLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Empty state
  emptyState: {
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 28 },
  emptyText: { fontSize: 14, color: '#6b7280', marginTop: 8 },
  emptySub: { fontSize: 12, color: '#9ca3af', marginTop: 4 },

  // Recipe cards
  recipeCard: {
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  recipeCardName: { fontSize: 15, fontWeight: '600', color: '#333' },
  recipeCardMeta: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  nutrientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  nutrientChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  nutrientChipText: { fontSize: 11, color: '#6b7280' },

  // Form fields
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4, marginTop: 12 },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },

  // Servings
  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  servingsButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  servingsButtonText: { fontSize: 18, color: '#333', fontWeight: '600' },
  servingsValue: { fontSize: 16, fontWeight: '700', color: '#333', marginHorizontal: 16 },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#d1d5db',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchActive: { backgroundColor: '#E05A00' },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  toggleKnobActive: { alignSelf: 'flex-end' },
  toggleLabel: { fontSize: 14, color: '#555', marginLeft: 10 },

  // Sections
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 10 },

  // Ingredients
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  ingredientInfo: { flex: 1, marginRight: 8 },
  ingredientName: { fontSize: 13, fontWeight: '600', color: '#333' },
  ingredientMeta: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  removeButton: { fontSize: 16, color: '#ef4444', fontWeight: '600', padding: 4 },

  addIngredientButton: {
    borderWidth: 1,
    borderColor: '#E05A00',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addIngredientText: { fontSize: 14, color: '#E05A00', fontWeight: '600' },

  addIngredientPanel: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  foodResultsList: { maxHeight: 160, marginTop: 6 },
  foodResultItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  foodResultName: { fontSize: 13, color: '#333' },
  foodResultBrand: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  selectedFoodPanel: { marginTop: 8 },
  selectedFoodName: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 8 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  addFoodActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  addFoodConfirm: {
    flex: 1,
    backgroundColor: '#E05A00',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addFoodConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  addFoodCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  addFoodCancelText: { fontSize: 14, color: '#6b7280' },

  // Direct nutrients
  directNutrientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  directNutrientLabel: { fontSize: 13, color: '#555', flex: 1 },
  directNutrientInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: 80,
    fontSize: 14,
    color: '#333',
    textAlign: 'right',
  },

  // Nutrient summary
  summaryCard: {
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  summaryName: { fontSize: 13, color: '#555' },
  summaryAmount: { fontSize: 13, color: '#333', fontWeight: '600' },

  // Submit
  submitButton: {
    backgroundColor: '#E05A00',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Delete
  deleteSection: { marginTop: 24, marginBottom: 16 },
  deleteButton: {
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteButtonText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
  deleteConfirm: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  deleteConfirmText: { fontSize: 14, fontWeight: '600', color: '#ef4444', marginBottom: 12 },
  deleteConfirmActions: { flexDirection: 'row', gap: 8 },
  deleteConfirmYes: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteConfirmYesText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  deleteConfirmNo: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteConfirmNoText: { fontSize: 14, color: '#6b7280' },
});
