import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import type { WorkoutType } from '@burnbuddy/shared';

const WORKOUT_TYPES: WorkoutType[] = ['Running', 'Cycling', 'Yoga', 'HIIT'];

export default function App() {
  return (
    <View style={styles.container}>
      <Text>buddyburn — {WORKOUT_TYPES.length} workout types available!</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
