import {
  mockUser,
  mockAuth,
  mockGetIdToken,
  resetFirebaseMocks,
} from '../../__mocks__/firebase';

// Mock firebase/auth and ../lib/firebase using shared mocks.
jest.mock('firebase/auth', () => require('../../__mocks__/firebase').firebaseAuthModule);
jest.mock('../firebase', () => require('../../__mocks__/firebase').firebaseModule);

import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '../api';

// Helper to build a minimal Response-like object for fetch mocking
function mockResponse(body: unknown, init: { status?: number; ok?: boolean } = {}): Response {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic' as ResponseType,
    url: '',
    clone: jest.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: jest.fn(),
    blob: jest.fn(),
    formData: jest.fn(),
    text: jest.fn(),
    bytes: jest.fn(),
  } as unknown as Response;
}

describe('API client', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    resetFirebaseMocks();
    fetchMock = jest.fn().mockResolvedValue(mockResponse({}));
    global.fetch = fetchMock;
    // Ensure env is reset
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  // --- apiGet ---

  it('apiGet sends GET request with Authorization: Bearer <token> header', async () => {
    const data = { items: [1, 2, 3] };
    fetchMock.mockResolvedValueOnce(mockResponse(data));

    const result = await apiGet('/test-path');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/test-path');
    expect(options.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer mock-id-token' }),
    );
    expect(result).toEqual(data);
    expect(mockGetIdToken).toHaveBeenCalledWith(mockUser);
  });

  // --- apiPost ---

  it('apiPost sends POST with JSON body and auth header', async () => {
    const body = { name: 'test' };
    const responseData = { id: '123' };
    fetchMock.mockResolvedValueOnce(mockResponse(responseData));

    const result = await apiPost('/items', body);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/items');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-id-token',
      }),
    );
    expect(options.body).toBe(JSON.stringify(body));
    expect(result).toEqual(responseData);
  });

  // --- EXPO_PUBLIC_API_URL ---

  it('uses EXPO_PUBLIC_API_URL env var for base URL', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://custom-api.example.com';

    // Re-import to pick up env change — api.ts reads env at module scope.
    // Since the module is already cached, we need to clear and reimport.
    jest.resetModules();
    // Re-apply mocks after resetModules
    jest.mock('firebase/auth', () => require('../../__mocks__/firebase').firebaseAuthModule);
    jest.mock('../firebase', () => require('../../__mocks__/firebase').firebaseModule);
    const { apiGet: freshApiGet } = require('../api') as typeof import('../api');

    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
    await freshApiGet('/endpoint');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://custom-api.example.com/endpoint');
  });

  it('falls back to http://localhost:3001 when EXPO_PUBLIC_API_URL is not set', async () => {
    delete process.env.EXPO_PUBLIC_API_URL;

    jest.resetModules();
    jest.mock('firebase/auth', () => require('../../__mocks__/firebase').firebaseAuthModule);
    jest.mock('../firebase', () => require('../../__mocks__/firebase').firebaseModule);
    const { apiGet: freshApiGet } = require('../api') as typeof import('../api');

    fetchMock.mockResolvedValueOnce(mockResponse({}));
    await freshApiGet('/fallback');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/fallback');
  });

  // --- Network errors ---

  it('network error throws/rejects with meaningful error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiGet('/failing')).rejects.toThrow('Network request failed');
  });

  // --- 401 handling ---

  it('401 response is handled (throws, not silently swallowed)', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ error: 'Unauthorized' }, { status: 401 }));

    await expect(apiGet('/protected')).rejects.toThrow('API error: 401');
  });

  // --- Additional coverage for other methods ---

  it('apiPut sends PUT with JSON body and auth header', async () => {
    const body = { updated: true };
    fetchMock.mockResolvedValueOnce(mockResponse({ success: true }));

    await apiPut('/resource/1', body);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/resource/1');
    expect(options.method).toBe('PUT');
    expect(options.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-id-token',
      }),
    );
    expect(options.body).toBe(JSON.stringify(body));
  });

  it('apiPatch sends PATCH with JSON body and auth header', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ patched: true }));

    await apiPatch('/resource/1', { field: 'value' });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('PATCH');
    expect(options.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-id-token',
      }),
    );
  });

  it('apiDelete sends DELETE with auth header', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(undefined, { status: 204 }),
    );

    await apiDelete('/resource/1');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/resource/1');
    expect(options.method).toBe('DELETE');
    expect(options.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer mock-id-token' }),
    );
  });

  it('sends no auth header when user is not logged in', async () => {
    (mockAuth as { currentUser: typeof mockUser | null }).currentUser = null;
    fetchMock.mockResolvedValueOnce(mockResponse({}));

    await apiGet('/public');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers).toEqual({});
    expect(mockGetIdToken).not.toHaveBeenCalled();
  });
});
