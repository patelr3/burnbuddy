export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  username?: string;
  usernameLower?: string;
  profilePictureUrl?: string;
  fcmToken?: string;
  gettingStartedDismissed?: boolean;
  createdAt: string;
}

export type WorkoutType =
  | 'Weightlifting'
  | 'Running'
  | 'Cycling'
  | 'Yoga'
  | 'Barre'
  | 'Swimming'
  | 'HIIT'
  | 'Custom';

export interface Workout {
  id: string;
  uid: string;
  type: WorkoutType | string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed';
}

export interface Friend {
  uid1: string;
  uid2: string;
  createdAt: string;
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  toUid: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface EnrichedFriendRequest extends FriendRequest {
  displayName: string;
  photoURL?: string;
}

export interface BurnBuddy {
  id: string;
  uid1: string;
  uid2: string;
  workoutSchedule?: WorkoutSchedule;
  createdAt: string;
}

export interface BurnBuddyRequest {
  id: string;
  fromUid: string;
  toUid: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface WorkoutSchedule {
  days: Array<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'>;
  time?: string;
}

export interface BurnSquad {
  id: string;
  name: string;
  adminUid: string;
  memberUids: string[];
  settings: {
    onlyAdminsCanAddMembers: boolean;
    workoutSchedule?: WorkoutSchedule;
  };
  createdAt: string;
}

export interface EnrichedBurnSquadMember {
  uid: string;
  displayName: string;
  photoURL?: string;
}

export interface BurnSquadJoinRequest {
  id: string;
  squadId: string;
  fromUid: string;
  toUid: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface GroupWorkout {
  id: string;
  type: 'buddy' | 'squad';
  referenceId: string;
  memberUids: string[];
  startedAt: string;
  workoutIds: string[];
}

export interface StreakDayInfo {
  date: string; // YYYY-MM-DD
  hasWorkout: boolean;
  groupWorkoutId: string | null;
  dayLabel: string; // Single letter: 'M', 'T', 'W', etc.
}

export interface StreakDetail {
  burnStreak: number;
  supernovaStreak: number;
  last7Days: StreakDayInfo[]; // Length 7, index 0 = 6 days ago, index 6 = today
}

export interface GroupStats {
  highestStreakEver: { value: number; date: string };
  firstGroupWorkoutDate: string | null;
  groupWorkoutsAllTime: number;
  groupWorkoutsThisMonth: number;
  last7Days: StreakDayInfo[];
}

export const GROUP_WORKOUT_WINDOW_MS = 20 * 60 * 1000; // 20 minutes

export interface ActivePartnerWorkout {
  type: 'buddy' | 'squad';
  referenceId: string;
  earliestStartedAt: string; // ISO 8601
}

export interface ProfileStats {
  displayName: string;
  username?: string;
  profilePictureUrl?: string;
  highestActiveStreak: { value: number; name: string } | null;
  highestActiveStreakLast7Days: StreakDayInfo[] | null;
  highestStreakEver: { value: number; date: string; name: string } | null;
  firstWorkoutDate: string | null;
  workoutsAllTime: number;
  workoutsThisMonth: number;
  buddyRelationshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'buddies';
}
