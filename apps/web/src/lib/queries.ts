import { useQuery } from '@tanstack/react-query';
import { apiGet } from './api';
import { auth } from './firebase-client';
import type {
  UserProfile,
  MonthlyPoints,
  BurnBuddy,
  BurnSquad,
  BurnSquadJoinRequest,
  BurnBuddyRequest,
  EnrichedFriendRequest,
  EnrichedBurnSquadMember,
  GroupWorkout,
  GroupStats,
  Workout,
  ActivePartnerWorkout,
  ProfileStats,
  StreakDayInfo,
} from '@burnbuddy/shared';

// ── Dashboard types (mirrors API DashboardResponse) ──────────────────────────

interface EnrichedBurnBuddy extends BurnBuddy {
  partnerUid: string;
  partnerDisplayName: string;
  partnerProfilePictureUrl?: string;
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

// ── Non-dashboard types ──────────────────────────────────────────────────────

export interface FriendWithProfile {
  uid: string;
  displayName: string;
  email: string;
  username?: string;
  profilePictureUrl?: string;
  createdAt: string;
}

interface Streaks {
  burnStreak: number;
  supernovaStreak: number;
  last7Days: StreakDayInfo[];
}

interface PartnerProfile {
  uid: string;
  displayName: string;
  email: string;
  profilePictureUrl?: string;
}

export interface FriendsData {
  friends: FriendWithProfile[];
  friendRequests: { incoming: EnrichedFriendRequest[]; outgoing: EnrichedFriendRequest[] };
  burnBuddies: BurnBuddy[];
  burnBuddyRequests: { incoming: BurnBuddyRequest[]; outgoing: BurnBuddyRequest[] };
}

export interface BurnBuddyData {
  burnBuddy: BurnBuddy;
  partner: PartnerProfile | null;
  streaks: Streaks;
  groupWorkouts: GroupWorkout[];
  stats: GroupStats;
}

export interface BurnSquadData {
  squad: BurnSquad & { members?: EnrichedBurnSquadMember[] };
  streaks: Streaks;
  groupWorkouts: GroupWorkout[];
  stats: GroupStats;
}

// ── Query keys ───────────────────────────────────────────────────────────────

export interface GroupWorkoutDetailParticipant {
  uid: string;
  displayName: string;
  workoutType: string;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'completed';
}

export interface GroupWorkoutDetail extends GroupWorkout {
  participants: GroupWorkoutDetailParticipant[];
}

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  profile: (uid: string) => ['profile', uid] as const,
  friends: ['friends'] as const,
  burnBuddy: (id: string) => ['burn-buddy', id] as const,
  burnSquad: (id: string) => ['burn-squad', id] as const,
  groupWorkoutDetail: (gwId: string) => ['group-workout-detail', gwId] as const,
  account: ['account'] as const,
  monthlyPoints: ['monthly-points'] as const,
};

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useDashboard(options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiGet<DashboardData>('/dashboard'),
    enabled: options?.enabled,
    refetchInterval: options?.refetchInterval,
    refetchIntervalInBackground: options?.refetchIntervalInBackground,
  });
}

export function useProfile(uid: string) {
  return useQuery({
    queryKey: queryKeys.profile(uid),
    queryFn: () => apiGet<ProfileStats>(`/users/${uid}/profile`),
    enabled: !!uid,
  });
}

export interface MonthlyPointsData {
  currentMonth: { month: string; points: number };
  history: MonthlyPoints[];
}

export function useMonthlyPoints() {
  return useQuery({
    queryKey: queryKeys.monthlyPoints,
    queryFn: () => apiGet<MonthlyPointsData>('/users/me/points'),
  });
}

export function useFriends() {
  return useQuery({
    queryKey: queryKeys.friends,
    queryFn: async (): Promise<FriendsData> => {
      const [friends, friendRequests, burnBuddies, burnBuddyRequests] = await Promise.all([
        apiGet<FriendWithProfile[]>('/friends'),
        apiGet<{ incoming: EnrichedFriendRequest[]; outgoing: EnrichedFriendRequest[] }>('/friends/requests'),
        apiGet<BurnBuddy[]>('/burn-buddies').catch(() => [] as BurnBuddy[]),
        apiGet<{ incoming: BurnBuddyRequest[]; outgoing: BurnBuddyRequest[] }>(
          '/burn-buddies/requests',
        ).catch(() => ({ incoming: [] as BurnBuddyRequest[], outgoing: [] as BurnBuddyRequest[] })),
      ]);
      return { friends, friendRequests, burnBuddies, burnBuddyRequests };
    },
  });
}

export function useBurnBuddy(id: string) {
  return useQuery({
    queryKey: queryKeys.burnBuddy(id),
    queryFn: async (): Promise<BurnBuddyData> => {
      const burnBuddy = await apiGet<BurnBuddy>(`/burn-buddies/${id}`);
      const currentUid = auth.currentUser?.uid;
      const partnerUid = burnBuddy.uid1 === currentUid ? burnBuddy.uid2 : burnBuddy.uid1;

      const [partner, streaks, groupWorkouts, stats] = await Promise.all([
        apiGet<PartnerProfile>(`/users/${partnerUid}`).catch(() => null),
        apiGet<Streaks>(`/burn-buddies/${id}/streaks`).catch(() => ({
          burnStreak: 0,
          supernovaStreak: 0,
          last7Days: [],
        })),
        apiGet<GroupWorkout[]>(`/burn-buddies/${id}/group-workouts`),
        apiGet<GroupStats>(`/burn-buddies/${id}/stats`).catch(() => ({
          highestStreakEver: { value: 0, date: '' },
          firstGroupWorkoutDate: null,
          groupWorkoutsAllTime: 0,
          groupWorkoutsThisMonth: 0,
          last7Days: [],
        })),
      ]);

      return { burnBuddy, partner, streaks, groupWorkouts, stats };
    },
    enabled: !!id,
  });
}

export function useBurnSquad(id: string) {
  return useQuery({
    queryKey: queryKeys.burnSquad(id),
    queryFn: async (): Promise<BurnSquadData> => {
      const [squad, streaks, groupWorkouts, stats] = await Promise.all([
        apiGet<BurnSquad & { members?: EnrichedBurnSquadMember[] }>(`/burn-squads/${id}`),
        apiGet<Streaks>(`/burn-squads/${id}/streaks`).catch(() => ({
          burnStreak: 0,
          supernovaStreak: 0,
          last7Days: [],
        })),
        apiGet<GroupWorkout[]>(`/burn-squads/${id}/group-workouts`),
        apiGet<GroupStats>(`/burn-squads/${id}/stats`).catch(() => ({
          highestStreakEver: { value: 0, date: '' },
          firstGroupWorkoutDate: null,
          groupWorkoutsAllTime: 0,
          groupWorkoutsThisMonth: 0,
          last7Days: [],
        })),
      ]);

      return { squad, streaks, groupWorkouts, stats };
    },
    enabled: !!id,
  });
}

export function useAccount(options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: queryKeys.account,
    queryFn: () => apiGet<UserProfile>('/users/me'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: options?.refetchInterval,
  });
}

export function useGroupWorkoutDetail(gwId: string) {
  return useQuery({
    queryKey: queryKeys.groupWorkoutDetail(gwId),
    queryFn: () => apiGet<GroupWorkoutDetail>(`/group-workouts/${gwId}`),
    enabled: !!gwId,
  });
}
