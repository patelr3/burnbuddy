import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastAssetRef = useRef<{ uri: string; mimeType: string } | null>(null);
  const cancelledRef = useRef(false);

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



  const uploadAsset = async (uri: string, mimeType: string) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    cancelledRef.current = false;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await apiUploadFile<{ profilePictureUrl: string }>(
        '/users/me/profile-picture',
        'picture',
        uri,
        mimeType,
        { signal: controller.signal },
      );
      setProfile((prev) => prev ? { ...prev, profilePictureUrl: res.profilePictureUrl } : prev);
      lastAssetRef.current = null;
    } catch (err) {
      if (cancelledRef.current) return;
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      abortControllerRef.current = null;
      setUploading(false);
    }
  };

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
      setUploadError('Invalid file type. Please use a JPEG, PNG, or WebP image.');
      return;
    }

    lastAssetRef.current = { uri: asset.uri, mimeType };
    await uploadAsset(asset.uri, mimeType);
  };

  const handleCancelUpload = () => {
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
    setUploading(false);
    setUploadError(null);
  };

  const handleRetryUpload = async () => {
    if (!lastAssetRef.current) return;
    const { uri, mimeType } = lastAssetRef.current;
    await uploadAsset(uri, mimeType);
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
                <ActivityIndicator size="small" color="#E05A00" />
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
            <View style={styles.uploadFeedback}>
              <Text style={styles.uploadingText}>Uploading…</Text>
              <TouchableOpacity
                onPress={handleCancelUpload}
                style={styles.cancelButton}
                testID="account-cancel-upload"
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
          {uploadError && (
            <View style={styles.uploadFeedback}>
              <Text style={styles.errorText}>{uploadError}</Text>
              {lastAssetRef.current && (
                <TouchableOpacity
                  onPress={handleRetryUpload}
                  style={styles.retryButton}
                  testID="account-retry-upload"
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
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
  uploadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
  },
  uploadFeedback: {
    marginTop: 8,
    alignItems: 'center',
  },
  cancelButton: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#7c3aed',
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
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
