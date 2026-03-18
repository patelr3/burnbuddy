import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../lib/auth-context';
import LogMealScreen from './LogMealScreen';
import RecipesScreen from './RecipesScreen';
import NutritionGoalsScreen from './NutritionGoalsScreen';
import { apiGet } from '../lib/api';
import type {
  NutrientId,
  MealEntry,
  DailyNutritionSummary,
  NutritionGoals,
} from '@burnbuddy/shared';
import { SUPPORTED_NUTRIENTS } from '@burnbuddy/shared';

export type NutritionView =
  | { type: 'dashboard' }
  | { type: 'log-meal' }
  | { type: 'recipes' }
  | { type: 'goals' };

interface NutritionScreenProps {
  view: NutritionView;
  onChangeView: (view: NutritionView) => void;
}

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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function progressColor(pct: number): string {
  if (pct >= 100) return '#22c55e';
  if (pct >= 50) return '#eab308';
  return '#ef4444';
}

function progressBgColor(pct: number): string {
  if (pct >= 100) return '#dcfce7';
  if (pct >= 50) return '#fef9c3';
  return '#fee2e2';
}

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: '🌅 Breakfast',
  lunch: '☀️ Lunch',
  dinner: '🌙 Dinner',
  snack: '🍎 Snack',
};

export default function NutritionScreen({ view, onChangeView }: NutritionScreenProps) {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [summary, setSummary] = useState<DailyNutritionSummary | null>(null);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [goals, setGoals] = useState<NutritionGoals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateStr = formatDate(selectedDate);
  const isToday = dateStr === formatDate(new Date());

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [summaryRes, mealsRes, goalsRes] = await Promise.all([
        apiGet<DailyNutritionSummary>(`/nutrition/summary?date=${dateStr}`),
        apiGet<MealEntry[]>(`/nutrition/meals?date=${dateStr}`),
        apiGet<NutritionGoals>('/nutrition/goals').catch(() => null),
      ]);
      setSummary(summaryRes);
      setMeals(mealsRes);
      setGoals(goalsRes);
    } catch {
      setError('Failed to load nutrition data');
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => {
    if (!user) return;
    void loadData();
  }, [user, loadData]);

  const goBack = () => {
    setSelectedDate((d) => {
      const prev = new Date(d);
      prev.setDate(prev.getDate() - 1);
      return prev;
    });
  };

  const goForward = () => {
    setSelectedDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (next > tomorrow) return d;
      return next;
    });
  };

  const targetNutrientIds = useMemo(
    () => new Set<NutrientId>(goals?.targetNutrients ?? []),
    [goals],
  );

  const { targetNutrients, otherNutrients } = useMemo(() => {
    if (!summary) return { targetNutrients: [], otherNutrients: [] };
    const target = summary.nutrients.filter((n) => targetNutrientIds.has(n.nutrientId));
    const other = summary.nutrients.filter((n) => !targetNutrientIds.has(n.nutrientId));
    return { targetNutrients: target, otherNutrients: other };
  }, [summary, targetNutrientIds]);

  const earnedNutrients = useMemo(() => {
    const set = new Set<NutrientId>();
    if (!summary) return set;
    for (const n of summary.nutrients) {
      if (targetNutrientIds.has(n.nutrientId) && n.percentComplete >= 100) {
        set.add(n.nutrientId);
      }
    }
    return set;
  }, [summary, targetNutrientIds]);

  // Route to sub-screens
  if (view.type === 'log-meal') {
    return <LogMealScreen onBack={() => onChangeView({ type: 'dashboard' })} />;
  }

  if (view.type === 'recipes') {
    return <RecipesScreen onBack={() => onChangeView({ type: 'dashboard' })} />;
  }

  if (view.type === 'goals') {
    return <NutritionGoalsScreen onBack={() => onChangeView({ type: 'dashboard' })} />;
  }

  if (view.type !== 'dashboard') return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nutrition</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Date Selector */}
        <View style={styles.datePicker}>
          <TouchableOpacity onPress={goBack} style={styles.dateArrow} testID="nutrition-date-back">
            <Text style={styles.dateArrowText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.dateText}>{displayDate(selectedDate)}</Text>
          <TouchableOpacity
            onPress={goForward}
            disabled={isToday}
            style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
            testID="nutrition-date-forward"
          >
            <Text style={[styles.dateArrowText, isToday && styles.dateArrowTextDisabled]}>›</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#E05A00" style={styles.loader} />
        ) : (
          <>
            {/* No Goals Prompt */}
            {!goals || goals.targetNutrients.length === 0 ? (
              <TouchableOpacity
                style={styles.goalsPrompt}
                onPress={() => onChangeView({ type: 'goals' })}
                testID="nutrition-goals-prompt"
              >
                <Text style={styles.goalsPromptEmoji}>🎯</Text>
                <Text style={styles.goalsPromptTitle}>
                  Choose up to 3 nutrients to track for points!
                </Text>
                <Text style={styles.goalsPromptSub}>
                  Set your nutrition goals to start earning points
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Points Banner */}
            {summary && summary.pointsEarned > 0 && (
              <View style={styles.pointsBanner}>
                <Text style={styles.pointsText}>
                  🔥 {summary.pointsEarned} point{summary.pointsEarned !== 1 ? 's' : ''} earned
                  today!
                </Text>
              </View>
            )}

            {/* Target Nutrients */}
            {targetNutrients.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🎯 Target Nutrients</Text>
                {targetNutrients.map((n) => {
                  const info = NUTRIENT_MAP.get(n.nutrientId);
                  if (!info) return null;
                  const pct = Math.min(n.percentComplete, 100);
                  const earned = earnedNutrients.has(n.nutrientId);
                  return (
                    <View key={n.nutrientId} style={styles.targetCard}>
                      <View style={styles.targetCardHeader}>
                        <Text style={styles.targetCardName}>
                          {earned ? '🔥 ' : ''}
                          {info.name}
                        </Text>
                        <Text style={styles.targetCardAmount}>
                          {n.consumed.toFixed(1)} / {n.recommended} {info.unit}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.progressBarBg,
                          { backgroundColor: progressBgColor(n.percentComplete) },
                        ]}
                      >
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              width: `${pct}%`,
                              backgroundColor: progressColor(n.percentComplete),
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.targetCardPct}>{n.percentComplete}%</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Other Nutrients */}
            {otherNutrients.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Daily Summary</Text>
                <View style={styles.summaryCard}>
                  {otherNutrients.map((n) => {
                    const info = NUTRIENT_MAP.get(n.nutrientId);
                    if (!info) return null;
                    const pct = Math.min(n.percentComplete, 100);
                    return (
                      <View key={n.nutrientId} style={styles.nutrientRow}>
                        <Text style={styles.nutrientRowName}>{info.name}</Text>
                        <View style={styles.nutrientRowBarContainer}>
                          <View
                            style={[
                              styles.nutrientRowBarBg,
                              { backgroundColor: progressBgColor(n.percentComplete) },
                            ]}
                          >
                            <View
                              style={[
                                styles.nutrientRowBarFill,
                                {
                                  width: `${pct}%`,
                                  backgroundColor: progressColor(n.percentComplete),
                                },
                              ]}
                            />
                          </View>
                        </View>
                        <Text style={styles.nutrientRowAmount}>
                          {n.consumed.toFixed(1)} / {n.recommended} {info.unit}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Empty state */}
            {summary && summary.nutrients.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🥗</Text>
                <Text style={styles.emptyText}>No nutrition data for this day yet</Text>
                <Text style={styles.emptySub}>Log a meal to start tracking</Text>
              </View>
            )}

            {/* Quick Actions */}
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => onChangeView({ type: 'log-meal' })}
                testID="nutrition-log-meal-button"
              >
                <Text style={styles.quickActionEmoji}>🍽️</Text>
                <Text style={styles.quickActionLabel}>Log a Meal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => onChangeView({ type: 'recipes' })}
                testID="nutrition-recipes-button"
              >
                <Text style={styles.quickActionEmoji}>📖</Text>
                <Text style={styles.quickActionLabel}>My Recipes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => onChangeView({ type: 'goals' })}
                testID="nutrition-goals-button"
              >
                <Text style={styles.quickActionEmoji}>🎯</Text>
                <Text style={styles.quickActionLabel}>Goals</Text>
              </TouchableOpacity>
            </View>

            {/* Meals List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {isToday ? "Today's Meals" : 'Meals'}
              </Text>
              {meals.length === 0 ? (
                <View style={styles.mealsEmpty}>
                  <Text style={styles.mealsEmptyText}>No meals logged</Text>
                  <TouchableOpacity
                    onPress={() => onChangeView({ type: 'log-meal' })}
                    testID="nutrition-log-first-meal"
                  >
                    <Text style={styles.mealsEmptyLink}>Log your first meal →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                meals.map((meal) => {
                  const topNutrients = meal.nutrients.slice(0, 3);
                  return (
                    <View key={meal.id} style={styles.mealCard}>
                      <View style={styles.mealCardHeader}>
                        <View style={styles.mealCardInfo}>
                          <Text style={styles.mealCardName}>{meal.recipeName}</Text>
                          <Text style={styles.mealCardMeta}>
                            {MEAL_TYPE_LABELS[meal.mealType] ?? meal.mealType} ·{' '}
                            {formatTime(meal.createdAt)}
                          </Text>
                        </View>
                        {meal.servingsConsumed > 1 && (
                          <View style={styles.servingsBadge}>
                            <Text style={styles.servingsBadgeText}>
                              {meal.servingsConsumed} servings
                            </Text>
                          </View>
                        )}
                      </View>
                      {topNutrients.length > 0 && (
                        <View style={styles.mealNutrients}>
                          {topNutrients.map((n) => {
                            const info = NUTRIENT_MAP.get(n.nutrientId);
                            if (!info) return null;
                            return (
                              <View key={n.nutrientId} style={styles.mealNutrientChip}>
                                <Text style={styles.mealNutrientText}>
                                  {info.name}: {n.amount.toFixed(1)} {info.unit}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

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
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 32 },
  errorText: { color: '#ef4444', marginBottom: 12 },
  loader: { marginTop: 40 },

  // Date Selector
  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  dateArrow: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  dateArrowDisabled: { opacity: 0.3 },
  dateArrowText: { fontSize: 24, color: '#333', fontWeight: '600' },
  dateArrowTextDisabled: { color: '#9ca3af' },
  dateText: { fontSize: 15, fontWeight: '600', color: '#333' },

  // Goals prompt
  goalsPrompt: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fda4af',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  goalsPromptEmoji: { fontSize: 24 },
  goalsPromptTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e11d48',
    marginTop: 6,
    textAlign: 'center',
  },
  goalsPromptSub: { fontSize: 12, color: '#9ca3af', marginTop: 4, textAlign: 'center' },

  // Points banner
  pointsBanner: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  pointsText: { fontSize: 15, fontWeight: '700', color: '#E05A00' },

  // Sections
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
  },

  // Target nutrient cards
  targetCard: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  targetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  targetCardName: { fontSize: 14, fontWeight: '600', color: '#333' },
  targetCardAmount: { fontSize: 12, color: '#6b7280' },
  progressBarBg: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  targetCardPct: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 4,
  },

  // Summary card
  summaryCard: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  nutrientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  nutrientRowName: {
    width: 90,
    fontSize: 13,
    color: '#555',
  },
  nutrientRowBarContainer: { flex: 1, marginHorizontal: 8 },
  nutrientRowBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  nutrientRowBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  nutrientRowAmount: {
    width: 100,
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'right',
  },

  // Empty state
  emptyState: {
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyEmoji: { fontSize: 28 },
  emptyText: { fontSize: 14, color: '#6b7280', marginTop: 8 },
  emptySub: { fontSize: 12, color: '#9ca3af', marginTop: 4 },

  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  quickActionEmoji: { fontSize: 20, marginBottom: 4 },
  quickActionLabel: { fontSize: 12, fontWeight: '600', color: '#555' },

  // Meals
  mealsEmpty: {
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  mealsEmptyText: { fontSize: 14, color: '#6b7280' },
  mealsEmptyLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E05A00',
    marginTop: 6,
  },
  mealCard: {
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  mealCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mealCardInfo: { flex: 1 },
  mealCardName: { fontSize: 14, fontWeight: '600', color: '#333' },
  mealCardMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  servingsBadge: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  servingsBadgeText: { fontSize: 11, color: '#E05A00', fontWeight: '500' },
  mealNutrients: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  mealNutrientChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mealNutrientText: { fontSize: 11, color: '#6b7280' },
});
