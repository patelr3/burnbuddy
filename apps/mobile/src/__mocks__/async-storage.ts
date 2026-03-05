/**
 * Shared AsyncStorage mock for mobile tests.
 *
 * Provides an in-memory key-value store that behaves like
 * @react-native-async-storage/async-storage.
 *
 * Usage:
 *   import { resetAsyncStorageMock } from '../__mocks__/async-storage';
 *
 *   jest.mock('@react-native-async-storage/async-storage',
 *     () => require('../__mocks__/async-storage'),
 *   );
 *
 * Call resetAsyncStorageMock() in beforeEach to clear the in-memory store.
 *
 * The mock stores data in a plain Map so you can inspect state:
 *   import { _store } from '../__mocks__/async-storage';
 *   expect(_store.get('myKey')).toBe('myValue');
 */

/** Internal in-memory store — exposed for test assertions. */
export const _store = new Map<string, string>();

export const getItem = jest.fn(async (key: string): Promise<string | null> => {
  return _store.get(key) ?? null;
});

export const setItem = jest.fn(async (key: string, value: string): Promise<void> => {
  _store.set(key, value);
});

export const removeItem = jest.fn(async (key: string): Promise<void> => {
  _store.delete(key);
});

export const clear = jest.fn(async (): Promise<void> => {
  _store.clear();
});

export const getAllKeys = jest.fn(async (): Promise<string[]> => {
  return Array.from(_store.keys());
});

export const multiGet = jest.fn(
  async (keys: string[]): Promise<[string, string | null][]> => {
    return keys.map((key) => [key, _store.get(key) ?? null]);
  },
);

export const multiSet = jest.fn(
  async (pairs: [string, string][]): Promise<void> => {
    pairs.forEach(([key, value]) => _store.set(key, value));
  },
);

export const multiRemove = jest.fn(
  async (keys: string[]): Promise<void> => {
    keys.forEach((key) => _store.delete(key));
  },
);

/**
 * Resets the in-memory store and all mock function call history.
 * Call in beforeEach() to get clean state per test.
 */
export function resetAsyncStorageMock(): void {
  _store.clear();
  getItem.mockClear();
  setItem.mockClear();
  removeItem.mockClear();
  clear.mockClear();
  getAllKeys.mockClear();
  multiGet.mockClear();
  multiSet.mockClear();
  multiRemove.mockClear();
}

// Default export matches AsyncStorage's module shape
export default {
  getItem,
  setItem,
  removeItem,
  clear,
  getAllKeys,
  multiGet,
  multiSet,
  multiRemove,
};
