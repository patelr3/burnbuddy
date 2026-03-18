import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { apiGet, apiPut } from '../lib/api';
import type { NutrientId, NutritionGoals } from '@burnbuddy/shared';
import { SUPPORTED_NUTRIENTS } from '@burnbuddy/shared';

interface NutritionGoalsScreenProps {
  onBack: () => void;
}

export default function NutritionGoalsScreen({ onBack }: NutritionGoalsScreenProps) {
  const [selected, setSelected] = useState<NutrientId[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalSelection, setOriginalSelection] = useState<NutrientId[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiGet<NutritionGoals>('/nutrition/goals')
      .then((goals) => {
        if (!cancelled) {
          const targets = goals.targetNutrients ?? [];
          setSelected(targets);
          setOriginalSelection(targets);
          setInitialized(true);
        }
      })
      .catch(() => {
        if (!cancelled) setInitialized(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const toggleNutrient = useCallback((id: NutrientId) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((n) => n !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }, []);

  const hasChanges =
    initialized &&
    (selected.length !== originalSelection.length ||
      selected.some((id) => !originalSelection.includes(id)));

  const handleSave = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await apiPut('/nutrition/goals', { targetNutrients: selected });
      setOriginalSelection(selected);
      setShowSuccess(true);
      setTimeout(() => onBack(), 800);
    } catch {
      setError('Failed to save goals');
    } finally {
      setSubmitting(false);
    }
  }, [selected, onBack]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E05A00" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} testID="goals-back-button">
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nutrition Goals</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* How Points Work */}
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>🏆 How Points Work</Text>
          <Text style={styles.infoCardText}>
            Choose up to <Text style={styles.bold}>3 target nutrients</Text> to track daily.
            Earn <Text style={styles.bold}>1 point</Text> for each target nutrient that reaches{' '}
            <Text style={styles.bold}>100%</Text> of its daily recommended intake.
            Points add to your monthly total.
          </Text>
        </View>

        {/* Selected Targets */}
        {selected.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Targets ({selected.length}/3)</Text>
            <View style={styles.pillsRow}>
              {selected.map((id) => {
                const nutrient = SUPPORTED_NUTRIENTS.find((n) => n.id === id);
                if (!nutrient) return null;
                return (
                  <TouchableOpacity
                    key={id}
                    style={styles.pill}
                    onPress={() => toggleNutrient(id)}
                    testID={`goals-pill-${id}`}
                  >
                    <Text style={styles.pillText}>✓ {nutrient.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* All Nutrients */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Nutrients</Text>
          {SUPPORTED_NUTRIENTS.map((nutrient) => {
            const isSelected = selected.includes(nutrient.id);
            const isDisabled = !isSelected && selected.length >= 3;

            return (
              <TouchableOpacity
                key={nutrient.id}
                style={[
                  styles.nutrientRow,
                  isSelected && styles.nutrientRowSelected,
                  isDisabled && styles.nutrientRowDisabled,
                ]}
                onPress={() => toggleNutrient(nutrient.id)}
                disabled={isDisabled}
                testID={`goals-nutrient-${nutrient.id}`}
              >
                <View style={styles.nutrientLeft}>
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxSelected,
                      isDisabled && styles.checkboxDisabled,
                    ]}
                  >
                    {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
                  </View>
                  <Text
                    style={[
                      styles.nutrientName,
                      isSelected && styles.nutrientNameSelected,
                      isDisabled && styles.nutrientNameDisabled,
                    ]}
                  >
                    {nutrient.name}
                  </Text>
                </View>
                <Text style={[styles.nutrientDv, isDisabled && styles.nutrientDvDisabled]}>
                  {nutrient.dailyRecommended} {nutrient.unit}/day
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            ℹ️ Daily recommended values are general guidelines. Consult a healthcare provider for
            personalized nutrition advice.
          </Text>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            showSuccess && styles.saveButtonSuccess,
            !hasChanges && !showSuccess && styles.saveButtonMuted,
          ]}
          onPress={handleSave}
          disabled={submitting || showSuccess}
          testID="goals-save-button"
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : showSuccess ? (
            <Text style={styles.saveButtonText}>✓ Goals Saved!</Text>
          ) : (
            <Text style={styles.saveButtonText}>Save Goals</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: { marginRight: 12 },
  backButtonText: { fontSize: 16, color: '#E05A00', fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#333' },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 32 },
  errorText: { color: '#ef4444', fontSize: 14, marginBottom: 12, textAlign: 'center' },

  // Info card
  infoCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  infoCardTitle: { fontSize: 16, fontWeight: '700', color: '#E05A00', marginBottom: 8 },
  infoCardText: { fontSize: 14, color: '#78350F', lineHeight: 20 },
  bold: { fontWeight: '700' },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  // Pills
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    backgroundColor: '#FFF7ED',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E05A00',
  },
  pillText: { fontSize: 14, fontWeight: '600', color: '#E05A00' },

  // Nutrient rows
  nutrientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fafafa',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  nutrientRowSelected: {
    backgroundColor: '#FFF7ED',
    borderColor: '#E05A00',
  },
  nutrientRowDisabled: { opacity: 0.5 },
  nutrientLeft: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#9ca3af',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxSelected: { backgroundColor: '#E05A00', borderColor: '#E05A00' },
  checkboxDisabled: { borderColor: '#d1d5db' },
  checkboxCheck: { color: '#fff', fontSize: 14, fontWeight: '700' },
  nutrientName: { fontSize: 15, fontWeight: '500', color: '#333' },
  nutrientNameSelected: { fontWeight: '600', color: '#333' },
  nutrientNameDisabled: { color: '#9ca3af' },
  nutrientDv: { fontSize: 13, color: '#6b7280' },
  nutrientDvDisabled: { color: '#d1d5db' },

  // Disclaimer
  disclaimer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  disclaimerText: { fontSize: 12, color: '#9ca3af', lineHeight: 18 },

  // Save button
  saveButton: {
    backgroundColor: '#E05A00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveButtonSuccess: { backgroundColor: '#16a34a' },
  saveButtonMuted: { opacity: 0.7 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
