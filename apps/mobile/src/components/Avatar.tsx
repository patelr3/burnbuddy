import { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

const AVATAR_COLORS = [
  '#EF4444', // red-500
  '#F97316', // orange-500
  '#F59E0B', // amber-500
  '#10B981', // emerald-500
  '#14B8A6', // teal-500
  '#06B6D4', // cyan-500
  '#3B82F6', // blue-500
  '#6366F1', // indigo-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
];

const SIZES = {
  sm: { container: 32, fontSize: 12 },
  md: { container: 40, fontSize: 14 },
  lg: { container: 64, fontSize: 20 },
} as const;

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return displayName.trim().slice(0, 2).toUpperCase();
}

export function Avatar({
  displayName,
  profilePictureUrl,
  size = 'md',
}: {
  displayName: string;
  profilePictureUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [imgError, setImgError] = useState(false);
  const { container, fontSize } = SIZES[size];
  const showImage = profilePictureUrl && !imgError;

  if (showImage) {
    return (
      <Image
        source={{ uri: profilePictureUrl }}
        style={[styles.image, { width: container, height: container, borderRadius: container / 2 }]}
        onError={() => setImgError(true)}
        accessibilityLabel={displayName}
      />
    );
  }

  const bgColor = AVATAR_COLORS[hashName(displayName) % AVATAR_COLORS.length];
  const initials = getInitials(displayName);

  return (
    <View
      style={[
        styles.initialsContainer,
        { width: container, height: container, borderRadius: container / 2, backgroundColor: bgColor },
      ]}
      accessibilityLabel={displayName}
    >
      <Text style={[styles.initialsText, { fontSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  initialsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
