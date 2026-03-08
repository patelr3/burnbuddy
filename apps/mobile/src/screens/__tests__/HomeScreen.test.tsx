import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

import { apiGet, resetApiMocks } from '../../__mocks__/api';
import { mockUser, resetFirebaseMocks } from '../../__mocks__/firebase';

// Mock Firebase modules
jest.mock('firebase/auth', () => require('../../__mocks__/firebase').firebaseAuthModule);
jest.mock('../../lib/firebase', () => require('../../__mocks__/firebase').firebaseModule);

// Mock useAuth to return authenticated user
jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ user: mockUser, loading: false, getToken: jest.fn() }),
}));

// Mock API module
jest.mock('../../lib/api', () => require('../../__mocks__/api'));

// Mock child screen components to keep tests focused on HomeListView
jest.mock('../BurnBuddyDetailScreen', () => {
  const { Text } = require('react-native');
  return function MockBurnBuddyDetail() {
    return <Text>BurnBuddyDetailScreen</Text>;
  };
});
jest.mock('../NewBurnBuddyScreen', () => {
  const { Text } = require('react-native');
  return function MockNewBurnBuddy() {
    return <Text>NewBurnBuddyScreen</Text>;
  };
});
jest.mock('../BurnSquadDetailScreen', () => {
  const { Text } = require('react-native');
  return function MockBurnSquadDetail() {
    return <Text>BurnSquadDetailScreen</Text>;
  };
});
jest.mock('../NewBurnSquadScreen', () => {
  const { Text } = require('react-native');
  return function MockNewBurnSquad() {
    return <Text>NewBurnSquadScreen</Text>;
  };
});
jest.mock('../../components/GettingStartedCard', () => {
  const { Text } = require('react-native');
  return function MockGettingStartedCard() {
    return <Text>GettingStartedCard</Text>;
  };
});

import HomeScreen from '../HomeScreen';

// --- Test data factories ---

function makeBuddy(overrides: Partial<{ id: string; uid1: string; uid2: string }> = {}) {
  return {
    id: overrides.id ?? 'buddy-1',
    uid1: overrides.uid1 ?? mockUser.uid,
    uid2: overrides.uid2 ?? 'partner-uid-1',
    createdAt: '2025-01-01T00:00:00Z',
  };
}

function makeSquad(overrides: Partial<{ id: string; name: string; memberUids: string[] }> = {}) {
  return {
    id: overrides.id ?? 'squad-1',
    name: overrides.name ?? 'Morning Runners',
    adminUid: mockUser.uid,
    memberUids: overrides.memberUids ?? [mockUser.uid, 'member-2'],
    settings: { onlyAdminsCanAddMembers: false },
    createdAt: '2025-01-01T00:00:00Z',
  };
}

/**
 * Sets up apiGet to return the appropriate responses for each endpoint.
 * Uses mockImplementation to route by path.
 */
function setupDefaultApiMocks(overrides: {
  buddies?: ReturnType<typeof makeBuddy>[];
  squads?: ReturnType<typeof makeSquad>[];
  groupWorkouts?: unknown[];
  profile?: unknown;
  buddyRequests?: { incoming: unknown[]; outgoing: unknown[] };
  squadJoinRequests?: { incoming: unknown[]; outgoing: unknown[] };
  workouts?: unknown[];
  partnerProfiles?: Record<string, { displayName: string }>;
  buddyStreaks?: Record<string, { burnStreak: number; supernovaStreak: number }>;
  squadStreaks?: Record<string, { burnStreak: number; supernovaStreak: number }>;
} = {}) {
  const buddies = overrides.buddies ?? [];
  const squads = overrides.squads ?? [];
  const groupWorkouts = overrides.groupWorkouts ?? [];
  const profile = overrides.profile ?? { gettingStartedDismissed: true };
  const buddyRequests = overrides.buddyRequests ?? { incoming: [], outgoing: [] };
  const squadJoinRequests = overrides.squadJoinRequests ?? { incoming: [], outgoing: [] };
  const workouts = overrides.workouts ?? [];
  const partnerProfiles = overrides.partnerProfiles ?? {};
  const buddyStreaks = overrides.buddyStreaks ?? {};
  const squadStreaks = overrides.squadStreaks ?? {};

  apiGet.mockImplementation((path: string) => {
    if (path === '/burn-buddies') return Promise.resolve(buddies);
    if (path === '/burn-squads') return Promise.resolve(squads);
    if (path === '/group-workouts') return Promise.resolve(groupWorkouts);
    if (path === '/users/me') return Promise.resolve(profile);
    if (path === '/burn-buddies/requests') return Promise.resolve(buddyRequests);
    if (path === '/burn-squads/join-requests') return Promise.resolve(squadJoinRequests);
    if (path === '/workouts') return Promise.resolve(workouts);

    // Partner profile lookups: /users/{uid}
    const userMatch = path.match(/^\/users\/(.+)$/);
    if (userMatch) {
      const uid = userMatch[1];
      return Promise.resolve(partnerProfiles[uid] ?? { displayName: uid });
    }

    // Buddy streak lookups: /burn-buddies/{id}/streaks
    const buddyStreakMatch = path.match(/^\/burn-buddies\/(.+)\/streaks$/);
    if (buddyStreakMatch) {
      const id = buddyStreakMatch[1];
      return Promise.resolve(buddyStreaks[id] ?? { burnStreak: 0, supernovaStreak: 0 });
    }

    // Squad streak lookups: /burn-squads/{id}/streaks
    const squadStreakMatch = path.match(/^\/burn-squads\/(.+)\/streaks$/);
    if (squadStreakMatch) {
      const id = squadStreakMatch[1];
      return Promise.resolve(squadStreaks[id] ?? { burnStreak: 0, supernovaStreak: 0 });
    }

    return Promise.resolve({});
  });
}

describe('HomeScreen', () => {
  beforeEach(() => {
    resetFirebaseMocks();
    resetApiMocks();
  });

  it('shows loading indicator while API calls are in flight', () => {
    // Make apiGet hang (never resolve) so loading stays true
    apiGet.mockImplementation(() => new Promise(() => {}));

    const { queryByText, UNSAFE_queryByType } = render(<HomeScreen />);

    // While loading, the empty state and list content should NOT be visible
    expect(queryByText('No buddies or squads yet')).toBeNull();
    expect(queryByText('Buddies & Squads')).toBeNull();

    // ActivityIndicator should be rendered
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
  });

  it('renders list of burn buddies returned by API', async () => {
    const buddy = makeBuddy();

    setupDefaultApiMocks({
      buddies: [buddy],
      partnerProfiles: { 'partner-uid-1': { displayName: 'Alice' } },
      buddyStreaks: { 'buddy-1': { burnStreak: 5, supernovaStreak: 1 } },
    });

    const { getByText } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Alice')).toBeTruthy();
    });

    // Verify partner name and streak are rendered (no standalone badge)
    expect(getByText('Alice')).toBeTruthy();
    expect(getByText('🔥 5')).toBeTruthy();
  });

  it('renders list of burn squads returned by API', async () => {
    const squad = makeSquad({ name: 'Team Blaze' });

    setupDefaultApiMocks({
      squads: [squad],
      squadStreaks: { 'squad-1': { burnStreak: 3, supernovaStreak: 0 } },
    });

    const { getByText } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Team Blaze')).toBeTruthy();
    });

    // Verify squad name and streak are rendered (no standalone badge)
    expect(getByText('Team Blaze')).toBeTruthy();
    expect(getByText('🔥 3')).toBeTruthy();
  });

  it('displays empty state message when user has no buddies or squads', async () => {
    setupDefaultApiMocks({
      buddies: [],
      squads: [],
    });

    const { getByText } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('No buddies or squads yet')).toBeTruthy();
    });

    expect(
      getByText('Add friends and send Burn Buddy requests to get started!'),
    ).toBeTruthy();
  });

  it('displays incoming buddy request indicators when requests exist', async () => {
    setupDefaultApiMocks({
      buddyRequests: {
        incoming: [
          { id: 'req-1', fromUid: 'bob-uid', toUid: mockUser.uid, status: 'pending', createdAt: '2025-06-01T00:00:00Z' },
        ],
        outgoing: [],
      },
      partnerProfiles: { 'bob-uid': { displayName: 'Bob' } },
    });

    const { getByText } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Burn Buddy Requests')).toBeTruthy();
    });

    expect(getByText('Bob')).toBeTruthy();
    expect(getByText('wants to be your Burn Buddy')).toBeTruthy();
  });

  it('displays incoming squad invitation indicators when requests exist', async () => {
    setupDefaultApiMocks({
      squadJoinRequests: {
        incoming: [
          {
            id: 'sq-req-1',
            squadId: 'squad-99',
            fromUid: 'admin-uid',
            toUid: mockUser.uid,
            status: 'pending',
            createdAt: '2025-06-01T00:00:00Z',
            squadName: 'Power Squad',
          },
        ],
        outgoing: [],
      },
    });

    const { getByText } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Squad Invitations')).toBeTruthy();
    });

    expect(getByText('Power Squad')).toBeTruthy();
    expect(getByText('invited to join')).toBeTruthy();
  });
});
