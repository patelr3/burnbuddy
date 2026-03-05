/**
 * Shared expo-notifications mock for mobile tests.
 *
 * Usage:
 *   import { resetNotificationMocks } from '../__mocks__/notifications';
 *
 *   jest.mock('expo-notifications', () => require('../__mocks__/notifications'));
 *
 * Call resetNotificationMocks() in beforeEach to clear all recorded calls.
 *
 * This mock provides all the expo-notifications APIs used by the app:
 *   - getPermissionsAsync / requestPermissionsAsync — resolve with { status: 'granted' }
 *   - getExpoPushTokenAsync — resolves with { data: 'mock-push-token' }
 *   - setNotificationHandler — no-op
 *   - addNotificationReceivedListener — returns { remove: jest.fn() }
 *   - addNotificationResponseReceivedListener — returns { remove: jest.fn() }
 *   - scheduleNotificationAsync — no-op, resolves void
 */

/** Returns { status: 'granted' } by default. Override to test denied flow. */
export const getPermissionsAsync = jest
  .fn()
  .mockResolvedValue({ status: 'granted' });

/** Returns { status: 'granted' } by default. Override to test denied flow. */
export const requestPermissionsAsync = jest
  .fn()
  .mockResolvedValue({ status: 'granted' });

/** Returns { data: 'mock-push-token' }. Override to test token retrieval failure. */
export const getExpoPushTokenAsync = jest
  .fn()
  .mockResolvedValue({ data: 'mock-push-token' });

/** No-op — captures the handler for inspection if needed. */
export const setNotificationHandler = jest.fn();

/** Returns a subscription object with a remove() method. */
export const addNotificationReceivedListener = jest
  .fn()
  .mockReturnValue({ remove: jest.fn() });

/** Returns a subscription object with a remove() method. */
export const addNotificationResponseReceivedListener = jest
  .fn()
  .mockReturnValue({ remove: jest.fn() });

/** No-op, resolves void. */
export const scheduleNotificationAsync = jest
  .fn()
  .mockResolvedValue(undefined);

/**
 * Resets all notification mock functions and restores default implementations.
 * Call in beforeEach() to get clean state per test.
 */
export function resetNotificationMocks(): void {
  getPermissionsAsync.mockReset().mockResolvedValue({ status: 'granted' });
  requestPermissionsAsync.mockReset().mockResolvedValue({ status: 'granted' });
  getExpoPushTokenAsync.mockReset().mockResolvedValue({ data: 'mock-push-token' });
  setNotificationHandler.mockReset();
  addNotificationReceivedListener.mockReset().mockReturnValue({ remove: jest.fn() });
  addNotificationResponseReceivedListener.mockReset().mockReturnValue({ remove: jest.fn() });
  scheduleNotificationAsync.mockReset().mockResolvedValue(undefined);
}
