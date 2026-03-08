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

function isDangerState(last7Days: StreakDayInfo[]): boolean {
  return last7Days.slice(1, 7).every((day) => !day.hasWorkout);
}

export function StreakDots({ streakCount, last7Days, color, label }: StreakDotsProps) {
  const danger = isDangerState(last7Days);
  const accentColor = danger ? COLORS.red : COLORS[color];

  return (
    <View style={styles.container}>
      {/* Streak count + label */}
      <View style={styles.labelContainer}>
        <Text style={[styles.fireEmoji]}>🔥</Text>
        <Text style={[styles.countText, { color: accentColor }]}>{streakCount}</Text>
        <Text style={styles.labelText}>{label}</Text>
      </View>

      {/* 7-dot streak indicator */}
      <View
        style={styles.dotsContainer}
        accessibilityRole="image"
        accessibilityLabel={`${label}: ${streakCount} day streak. ${last7Days.filter((d) => d.hasWorkout).length} of last 7 days with workouts.`}
      >
        {last7Days.map((day) => (
          <View key={day.date} style={styles.dotColumn}>
            <Text
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
            <Text
              style={[
                styles.dayLabel,
                { color: danger ? COLORS.red : COLORS.gray },
              ]}
            >
              {day.dayLabel}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fireEmoji: {
    fontSize: 14,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
  },
  labelText: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  dotColumn: {
    alignItems: 'center',
    gap: 2,
  },
  dotText: {
    fontSize: 16,
    lineHeight: 18,
  },
  dayLabel: {
    fontSize: 10,
    lineHeight: 12,
  },
});
