export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  username?: string;
  usernameLower?: string;
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

export interface GroupStats {
  highestStreakEver: { value: number; date: string };
  firstGroupWorkoutDate: string | null;
  groupWorkoutsAllTime: number;
  groupWorkoutsThisMonth: number;
}
