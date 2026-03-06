import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { signOut } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { apiGet, apiPut, apiDelete, apiUploadFile } from '../lib/api';
import { Avatar } from '../components/Avatar';
import type { UserProfile } from '@burnbuddy/shared';

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function AccountScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const sparkleAnim = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (uploading) {
      const loop = Animated.loop(
        Animated.timing(sparkleAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loop.start();
      return () => loop.stop();
    }
    sparkleAnim.setValue(0);
  }, [uploading, sparkleAnim]);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library to upload a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? 'image/jpeg';
    if (!ACCEPTED_MIME_TYPES.includes(mimeType)) {
      Alert.alert('Invalid file type', 'Please use a JPEG, PNG, or WebP image.');
      return;
    }

    setUploading(true);
    try {
      const res = await apiUploadFile<{ profilePictureUrl: string }>(
        '/users/me/profile-picture',
        'picture',
        asset.uri,
        mimeType,
      );
      setProfile((prev) => prev ? { ...prev, profilePictureUrl: res.profilePictureUrl } : prev);
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePicture = () => {
    Alert.alert('Remove photo', 'Are you sure you want to remove your profile picture?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemoving(true);
          try {
            await apiDelete('/users/me/profile-picture');
            setProfile((prev) => prev ? { ...prev, profilePictureUrl: undefined } : prev);
          } catch {
            Alert.alert('Error', 'Failed to remove photo. Please try again.');
          } finally {
            setRemoving(false);
          }
        },
      },
    ]);
  };

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
  };

  if (dataLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#E05A00" />
      </View>
    );
  }

  const displayName = user?.displayName ?? profile?.displayName ?? 'User';
  const sparkleRotate = sparkleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Account</Text>

      {/* Profile info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>

        {/* Avatar with edit overlay */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            <Avatar
              displayName={displayName}
              profilePictureUrl={profile?.profilePictureUrl}
              size="lg"
            />
            {uploading ? (
              <View style={styles.avatarOverlay}>
                <Animated.Text style={[styles.sparkleText, { transform: [{ rotate: sparkleRotate }] }]}>
                  ✨
                </Animated.Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.avatarOverlay}
                onPress={handlePickImage}
                disabled={removing}
                testID="account-edit-avatar"
              >
                <Text style={styles.cameraIcon}>📷</Text>
              </TouchableOpacity>
            )}
          </View>
          {uploading && (
            <Text style={styles.uploadingText}>✨ Anime-fying...</Text>
          )}
          {profile?.profilePictureUrl && !uploading && (
            <TouchableOpacity
              onPress={handleRemovePicture}
              disabled={removing}
              testID="account-remove-photo"
            >
              <Text style={[styles.removeText, removing && styles.removingText]}>
                {removing ? 'Removing...' : 'Remove photo'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.field} testID="account-display-name">
          <Text style={styles.fieldLabel}>Display Name</Text>
          <Text style={styles.fieldValue}>
            {user?.displayName ?? profile?.displayName ?? '—'}
          </Text>
        </View>
        <View style={styles.field} testID="account-email">
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
          testID="account-toggle-getting-started"
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
        <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleSignOut} testID="account-sign-out-button">
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
  avatarSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarWrapper: {
    position: 'relative',
    width: 64,
    height: 64,
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cameraIcon: {
    fontSize: 14,
  },
  sparkleText: {
    fontSize: 14,
  },
  uploadingText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#7c3aed',
  },
  removeText: {
    marginTop: 8,
    fontSize: 13,
    color: '#dc2626',
  },
  removingText: {
    opacity: 0.5,
  },
});
