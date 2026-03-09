import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import type { StreakDayInfo } from '@burnbuddy/shared';

export const BURN_STREAK_TOOLTIP =
  'Your burn streak counts workout days. It stays alive as long as you work out at least once a week (gap of 6 days max).';
export const SUPERNOVA_STREAK_TOOLTIP =
  'Your supernova streak rewards near-daily effort. It stays alive as long as you don\'t miss more than 1 day in a row.';

interface StreakDotsProps {
  streakCount: number;
  last7Days: StreakDayInfo[];
  color: 'orange' | 'violet';
  label: string;
  tooltip?: string;
}

const COLORS = {
  orange: '#FF9500',
  violet: '#8B5CF6',
  red: '#EF4444',
  gray: '#6B7280',
  lightGray: '#9CA3AF',
} as const;

const EMPTY_DAYS: StreakDayInfo[] = Array.from({ length: 7 }, (_, i) => ({
  date: `empty-${i}`,
  dayLabel: '',
  hasWorkout: false,
  groupWorkoutId: null,
}));

function isDangerState(last7Days: StreakDayInfo[]): boolean {
  if (last7Days.length === 0) return false;
  return last7Days.slice(1, 7).every((day) => !day.hasWorkout);
}

export function StreakDots({ streakCount, last7Days, color, label, tooltip }: StreakDotsProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const days = last7Days.length > 0 ? last7Days : EMPTY_DAYS;
  const count = last7Days.length > 0 ? streakCount : 0;
  const danger = isDangerState(last7Days);
  const accentColor = danger ? COLORS.red : COLORS[color];

  const card = (
    <View style={styles.tile}>
      {/* Streak label + count */}
      <View style={styles.labelRow}>
        <Text style={[styles.countText, { color: accentColor }]}>{count}</Text>
        <Text style={styles.labelText}>{label}</Text>
      </View>

      {/* 7-dot streak indicator */}
      <View
        style={styles.dotsRow}
        accessibilityRole="image"
        accessibilityLabel={`${label}: ${count} day streak. ${days.filter((d) => d.hasWorkout).length} of last 7 days with workouts.`}
      >
        {days.map((day) => (
          <Text
            key={day.date}
            style={[
              styles.dotText,
              {
                color: day.hasWorkout
                  ? danger
                    ? COLORS.red
                    : undefined
                  : danger
                    ? COLORS.red
                    : COLORS.gray,
              },
            ]}
          >
            {day.hasWorkout ? '🔥' : '○'}
          </Text>
        ))}
      </View>
    </View>
  );

  if (!tooltip) return card;

  return (
    <>
      <Pressable
        onPress={() => setShowTooltip(true)}
        style={({ pressed }) => pressed ? { opacity: 0.7 } : undefined}
      >
        {card}
      </Pressable>

      <Modal
        visible={showTooltip}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTooltip(false)}
      >
        <Pressable
          style={styles.tooltipOverlay}
          onPress={() => setShowTooltip(false)}
        >
          <View style={styles.tooltipBubble}>
            <View style={styles.tooltipCaret} />
            <Text style={styles.tooltipText}>{tooltip}</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '47%',
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
  },
  labelText: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotText: {
    fontSize: 16,
    lineHeight: 18,
  },
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipBubble: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 280,
    alignItems: 'center',
  },
  tooltipCaret: {
    position: 'absolute',
    top: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#1f2937',
  },
  tooltipText: {
    color: '#f3f4f6',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
