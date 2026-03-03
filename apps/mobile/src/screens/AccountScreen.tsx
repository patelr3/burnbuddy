import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { apiGet, apiPut } from '../lib/api';
import type { UserProfile } from '@burnbuddy/shared';

export default function AccountScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    try {
      const p = await apiGet<UserProfile>('/users/me');
      setProfile(p);
    } catch {
      // Profile may not exist yet
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleToggleGettingStarted = async () => {
    const newValue = !profile?.gettingStartedDismissed;
    setSaving(true);
    setSaveMessage(null);
    try {
      await apiPut('/users/me', { gettingStartedDismissed: newValue });
      setProfile((prev) =>
        prev ? { ...prev, gettingStartedDismissed: newValue } : prev,
      );
      setSaveMessage(
        newValue ? 'Getting Started card hidden.' : 'Getting Started card re-enabled.',
      );
    } catch {
      setSaveMessage('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    // AuthProvider's onAuthStateChanged listener will set user to null,
    // causing AppNavigator to render the login screen automatically
  };

  if (dataLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#E05A00" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Account</Text>

      {/* Profile info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Display Name</Text>
          <Text style={styles.fieldValue}>
            {user?.displayName ?? profile?.displayName ?? '—'}
          </Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Email</Text>
          <Text style={styles.fieldValue}>{user?.email ?? profile?.email ?? '—'}</Text>
        </View>
      </View>

      {/* Getting Started card toggle */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Onboarding</Text>
        <Text style={styles.sectionBody}>
          {profile?.gettingStartedDismissed
            ? 'The Getting Started card is currently hidden on the home screen.'
            : 'The Getting Started card is currently visible on the home screen.'}
        </Text>
        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: profile?.gettingStartedDismissed ? '#22c55e' : '#f97316' },
            saving && styles.buttonDisabled,
          ]}
          onPress={handleToggleGettingStarted}
          disabled={saving}
        >
          <Text style={styles.buttonText}>
            {profile?.gettingStartedDismissed
              ? 'Re-enable Getting Started card'
              : 'Hide Getting Started card'}
          </Text>
        </TouchableOpacity>
        {saveMessage && <Text style={styles.saveMessage}>{saveMessage}</Text>}
      </View>

      {/* Sign out */}
      <View style={[styles.section, styles.dangerSection]}>
        <Text style={styles.sectionTitle}>Sign Out</Text>
        <Text style={styles.sectionBody}>You will be returned to the login screen.</Text>
        <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleSignOut}>
          <Text style={styles.buttonText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingTop: 52,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#111827',
  },
  section: {
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  dangerSection: {
    borderColor: '#fee2e2',
    backgroundColor: '#fff5f5',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  sectionBody: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  dangerButton: {
    backgroundColor: '#dc2626',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  saveMessage: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 10,
  },
});
