'use client';

import { useState } from 'react';

const AVATAR_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-pink-500',
];

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
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
  const sizeClass = SIZE_CLASSES[size];
  const showImage = profilePictureUrl && !imgError;

  if (showImage) {
    return (
      <img
        src={profilePictureUrl}
        alt={displayName}
        className={`${sizeClass} rounded-full object-cover`}
        onError={() => setImgError(true)}
      />
    );
  }

  const colorClass = AVATAR_COLORS[hashName(displayName) % AVATAR_COLORS.length];
  const initials = getInitials(displayName);

  return (
    <div
      className={`${sizeClass} ${colorClass} flex items-center justify-center rounded-full font-semibold text-white`}
      aria-label={displayName}
    >
      {initials}
    </div>
  );
}
