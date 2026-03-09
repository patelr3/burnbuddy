import { View, Text, StyleSheet } from 'react-native';
import type { StreakDayInfo } from '@burnbuddy/shared';

interface StreakDotsProps {
  streakCount: number;
  last7Days: StreakDayInfo[];
  color: 'orange' | 'violet';
  label: string;
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

export function StreakDots({ streakCount, last7Days, color, label }: StreakDotsProps) {
  const days = last7Days.length > 0 ? last7Days : EMPTY_DAYS;
  const count = last7Days.length > 0 ? streakCount : 0;
  const danger = isDangerState(last7Days);
  const accentColor = danger ? COLORS.red : COLORS[color];

  return (
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
});
