/**
 * Shared API client mock for mobile tests.
 *
 * Usage:
 *   import { resetApiMocks } from '../__mocks__/api';
 *
 *   jest.mock('../lib/api', () => require('../__mocks__/api'));
 *   // — or import individual mocks and wire them manually.
 *
 * Call resetApiMocks() in beforeEach to clear all recorded calls and return values.
 *
 * Each function is a jest.fn() that resolves with an empty object/undefined by default.
 * Override per-test with e.g.:
 *   apiGet.mockResolvedValueOnce({ users: [...] });
 */

/** GET request — resolves with empty object by default */
export const apiGet = jest.fn().mockResolvedValue({});

/** POST request — resolves with empty object by default */
export const apiPost = jest.fn().mockResolvedValue({});

/** PUT request — resolves with empty object by default */
export const apiPut = jest.fn().mockResolvedValue({});

/** PATCH request — resolves with empty object by default */
export const apiPatch = jest.fn().mockResolvedValue({});

/** DELETE request — resolves with undefined by default */
export const apiDelete = jest.fn().mockResolvedValue(undefined);

/**
 * Resets all API mock functions and restores default implementations.
 * Call in beforeEach() to get clean state per test.
 */
export function resetApiMocks(): void {
  apiGet.mockReset().mockResolvedValue({});
  apiPost.mockReset().mockResolvedValue({});
  apiPut.mockReset().mockResolvedValue({});
  apiPatch.mockReset().mockResolvedValue({});
  apiDelete.mockReset().mockResolvedValue(undefined);
}
