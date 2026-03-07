import { getIdToken } from 'firebase/auth';
import { auth } from './firebase';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await getIdToken(user);
  return { Authorization: `Bearer ${token}` };
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok && res.status !== 204) throw new Error(`API error: ${res.status}`);
}

export async function apiUploadFile<T>(
  path: string,
  fieldName: string,
  fileUri: string,
  mimeType: string,
  options?: { signal?: AbortSignal },
): Promise<T> {
  const headers = await getAuthHeaders();
  const form = new FormData();
  form.append(fieldName, {
    uri: fileUri,
    type: mimeType,
    name: `upload.${mimeType.split('/')[1] ?? 'jpg'}`,
  } as unknown as Blob);

  const controller = new AbortController();
  const timeoutMs = 20_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If the caller provides an external signal, forward its abort
  if (options?.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Upload timed out. Please try again with a smaller image.');
    }
    throw new Error('Network error. Please check your connection and try again.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 413) throw new Error('File is too large. Maximum size is 5 MB.');
  if (res.status === 400) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? 'Invalid file. Please use JPEG, PNG, or WebP.');
  }
  if (!res.ok) throw new Error('Upload failed. Please try again.');
  return res.json() as Promise<T>;
}
