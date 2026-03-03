import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  onDismiss: () => void;
}

export default function GettingStartedCard({ onDismiss }: Props) {
  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.closeButton} onPress={onDismiss}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Getting Started</Text>
      <Text style={styles.body}>
        Welcome to buddyburn! 🔥{'\n\n'}
        Start by adding a friend — search for them by email on the Friends screen.
        Once you&apos;re connected, you can create a Burn Buddy or Burn Squad to
        track your workouts together.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF8F0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFCFA0',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
  },
  closeText: {
    fontSize: 16,
    color: '#888',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E05A00',
    marginBottom: 8,
    marginRight: 24,
  },
  body: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
  },
});
