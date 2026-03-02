import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { apiGet, apiPut } from '../lib/api';
import GettingStartedCard from '../components/GettingStartedCard';
import type { UserProfile } from '@burnbuddy/shared';

export default function HomeScreen() {
  const { user } = useAuth();
  const [showGettingStarted, setShowGettingStarted] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await apiGet<UserProfile>('/users/me');
        setShowGettingStarted(!profile.gettingStartedDismissed);
      } catch {
        // 404 for new users — show the card by default
        setShowGettingStarted(true);
      }
    };
    void fetchProfile();
  }, []);

  const handleDismissCard = () => {
    setShowGettingStarted(false);
    apiPut('/users/me', { gettingStartedDismissed: true }).catch(() => {});
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      Alert.alert('Error', message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>buddyburn 🔥</Text>
        <TouchableOpacity onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {showGettingStarted && (
          <GettingStartedCard onDismiss={handleDismissCard} />
        )}

        <Text style={styles.greeting}>
          Hi, {user?.displayName ?? user?.email ?? 'there'}!
        </Text>
        <Text style={styles.subtitle}>
          Your Burn Buddies and Burn Squads will appear here.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
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
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#E05A00',
  },
  signOutText: {
    color: '#E05A00',
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
});
