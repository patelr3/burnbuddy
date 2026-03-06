import { useQuery } from '@tanstack/react-query';
import { apiGet } from './api';
import type {
  UserProfile,
  BurnBuddy,
  BurnSquad,
  BurnSquadJoinRequest,
  BurnBuddyRequest,
  GroupWorkout,
  Workout,
  ActivePartnerWorkout,
  ProfileStats,
} from '@burnbuddy/shared';

// ── Dashboard types (mirrors API DashboardResponse) ──────────────────────────

interface EnrichedBurnBuddy extends BurnBuddy {
  partnerUid: string;
  partnerDisplayName: string;
  streaks: { burnStreak: number; supernovaStreak: number };
}

interface EnrichedBurnSquad extends BurnSquad {
  streaks: { burnStreak: number; supernovaStreak: number };
}

export interface DashboardData {
  user: UserProfile;
  burnBuddies: EnrichedBurnBuddy[];
  burnSquads: EnrichedBurnSquad[];
  groupWorkouts: GroupWorkout[];
  buddyRequests: {
    incoming: (BurnBuddyRequest & { fromDisplayName?: string })[];
    outgoing: BurnBuddyRequest[];
  };
  squadJoinRequests: {
    incoming: (BurnSquadJoinRequest & { squadName?: string })[];
    outgoing: (BurnSquadJoinRequest & { squadName?: string })[];
  };
  activeWorkout: Workout | null;
  partnerActivity: {
    groupWorkoutWindowMs: number;
    activePartnerWorkouts: ActivePartnerWorkout[];
  };
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  profile: (uid: string) => ['profile', uid] as const,
};

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useDashboard(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiGet<DashboardData>('/dashboard'),
    enabled: options?.enabled,
  });
}

export function useProfile(uid: string) {
  return useQuery({
    queryKey: queryKeys.profile(uid),
    queryFn: () => apiGet<ProfileStats>(`/users/${uid}/profile`),
    enabled: !!uid,
  });
}
