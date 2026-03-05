import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import {
  apiGet,
  apiPost,
  apiDelete,
  resetApiMocks,
} from '../../__mocks__/api';
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

// Spy on Alert.alert to verify confirmation/error dialogs
jest.spyOn(Alert, 'alert');

import FriendsScreen from '../FriendsScreen';

// --- Test data factories ---

function makeFriend(overrides: Partial<{ uid: string; displayName: string; email: string }> = {}) {
  return {
    uid: overrides.uid ?? 'friend-uid-1',
    displayName: overrides.displayName ?? 'Alice',
    email: overrides.email ?? 'alice@example.com',
    createdAt: '2025-01-01T00:00:00Z',
  };
}

function makeIncomingRequest(overrides: Partial<{ id: string; fromUid: string }> = {}) {
  return {
    id: overrides.id ?? 'req-in-1',
    fromUid: overrides.fromUid ?? 'bob-uid',
    toUid: mockUser.uid,
    status: 'pending' as const,
    createdAt: '2025-06-01T00:00:00Z',
  };
}

function makeOutgoingRequest(overrides: Partial<{ id: string; toUid: string }> = {}) {
  return {
    id: overrides.id ?? 'req-out-1',
    fromUid: mockUser.uid,
    toUid: overrides.toUid ?? 'carol-uid',
    status: 'pending' as const,
    createdAt: '2025-06-01T00:00:00Z',
  };
}

/**
 * Sets up apiGet to route responses by path, matching FriendsScreen's API calls.
 */
function setupDefaultApiMocks(overrides: {
  friends?: ReturnType<typeof makeFriend>[];
  incoming?: ReturnType<typeof makeIncomingRequest>[];
  outgoing?: ReturnType<typeof makeOutgoingRequest>[];
  userProfiles?: Record<string, { uid: string; displayName: string; email: string }>;
} = {}) {
  const friends = overrides.friends ?? [];
  const incoming = overrides.incoming ?? [];
  const outgoing = overrides.outgoing ?? [];
  const userProfiles = overrides.userProfiles ?? {};

  apiGet.mockImplementation((path: string) => {
    if (path === '/friends') return Promise.resolve(friends);
    if (path === '/friends/requests') return Promise.resolve({ incoming, outgoing });

    // User profile lookups for request enrichment: /users/{uid}
    const userMatch = path.match(/^\/users\/([^?]+)$/);
    if (userMatch) {
      const uid = userMatch[1];
      if (userProfiles[uid]) return Promise.resolve(userProfiles[uid]);
      return Promise.resolve({ uid, displayName: uid, email: `${uid}@example.com` });
    }

    // User search: /users/search?email=...
    const searchMatch = path.match(/^\/users\/search\?email=(.+)$/);
    if (searchMatch) {
      const email = decodeURIComponent(searchMatch[1]);
      const found = Object.values(userProfiles).find((p) => p.email === email);
      if (found) return Promise.resolve(found);
      return Promise.reject(new Error('Not found'));
    }

    return Promise.resolve({});
  });
}

describe('FriendsScreen', () => {
  beforeEach(() => {
    resetFirebaseMocks();
    resetApiMocks();
    (Alert.alert as jest.Mock).mockClear();
  });

  it('renders list of current friends from API', async () => {
    const friends = [
      makeFriend({ uid: 'f1', displayName: 'Alice', email: 'alice@example.com' }),
      makeFriend({ uid: 'f2', displayName: 'Bob', email: 'bob@example.com' }),
    ];

    setupDefaultApiMocks({ friends });

    const { getByText } = render(<FriendsScreen />);

    await waitFor(() => {
      expect(getByText('Alice')).toBeTruthy();
    });

    expect(getByText('alice@example.com')).toBeTruthy();
    expect(getByText('Bob')).toBeTruthy();
    expect(getByText('bob@example.com')).toBeTruthy();
    // Section label shows count
    expect(getByText('Friends (2)')).toBeTruthy();
  });

  it('renders incoming and outgoing friend request sections', async () => {
    const incoming = [makeIncomingRequest({ id: 'in-1', fromUid: 'bob-uid' })];
    const outgoing = [makeOutgoingRequest({ id: 'out-1', toUid: 'carol-uid' })];

    setupDefaultApiMocks({
      incoming,
      outgoing,
      userProfiles: {
        'bob-uid': { uid: 'bob-uid', displayName: 'Bob', email: 'bob@example.com' },
        'carol-uid': { uid: 'carol-uid', displayName: 'Carol', email: 'carol@example.com' },
      },
    });

    const { getByText } = render(<FriendsScreen />);

    await waitFor(() => {
      expect(getByText('Pending Requests')).toBeTruthy();
    });

    // Incoming request shows sender name with "incoming" badge
    expect(getByText('Bob')).toBeTruthy();
    expect(getByText('incoming')).toBeTruthy();

    // Outgoing request shows recipient name with "pending" badge
    expect(getByText('Carol')).toBeTruthy();
    expect(getByText('pending')).toBeTruthy();

    // Accept and Ignore buttons visible for incoming request
    expect(getByText('Accept')).toBeTruthy();
    expect(getByText('Ignore')).toBeTruthy();
  });

  it('tapping Accept on a friend request calls apiPost with correct endpoint', async () => {
    const incoming = [makeIncomingRequest({ id: 'req-abc', fromUid: 'bob-uid' })];

    setupDefaultApiMocks({
      incoming,
      userProfiles: {
        'bob-uid': { uid: 'bob-uid', displayName: 'Bob', email: 'bob@example.com' },
      },
    });

    const { getByText } = render(<FriendsScreen />);

    await waitFor(() => {
      expect(getByText('Accept')).toBeTruthy();
    });

    fireEvent.press(getByText('Accept'));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/friends/requests/req-abc/accept');
    });
  });

  it('tapping Decline (Ignore) on a friend request renders the button', async () => {
    const incoming = [makeIncomingRequest({ id: 'req-ign', fromUid: 'dave-uid' })];

    setupDefaultApiMocks({
      incoming,
      userProfiles: {
        'dave-uid': { uid: 'dave-uid', displayName: 'Dave', email: 'dave@example.com' },
      },
    });

    const { getByText } = render(<FriendsScreen />);

    await waitFor(() => {
      expect(getByText('Ignore')).toBeTruthy();
    });

    // The Ignore button is present and pressable (no-op handler in current implementation)
    fireEvent.press(getByText('Ignore'));

    // No API call should have been made for ignore
    expect(apiPost).not.toHaveBeenCalled();
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it('displays empty state when user has no friends', async () => {
    setupDefaultApiMocks({ friends: [] });

    const { getByText } = render(<FriendsScreen />);

    await waitFor(() => {
      expect(getByText('No friends yet. Add your first friend above!')).toBeTruthy();
    });
  });

  it('shows loading indicator while API calls are in flight', () => {
    // Make apiGet hang so loading persists
    apiGet.mockImplementation(() => new Promise(() => {}));

    const { UNSAFE_queryByType, queryByText } = render(<FriendsScreen />);

    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();

    // Content sections should not be visible while loading
    expect(queryByText('No friends yet. Add your first friend above!')).toBeNull();
    expect(queryByText('Pending Requests')).toBeNull();
  });
});
