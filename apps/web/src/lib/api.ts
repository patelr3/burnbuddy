import { getIdToken } from 'firebase/auth';
import { auth } from './firebase-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body?: unknown,
  ) {
    super(`API error: ${status}`);
    this.name = 'ApiError';
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
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
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new ApiError(res.status, body);
  }
}

export async function apiUploadFile<T>(
  path: string,
  fieldName: string,
  file: File,
  options?: { signal?: AbortSignal },
): Promise<T> {
  const headers = await getAuthHeaders();
  const form = new FormData();
  form.append(fieldName, file);

  const controller = new AbortController();
  const timeoutMs = 60_000;
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
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Upload timed out. Please try again with a smaller image.');
    }
    throw new Error('Network error. Please check your connection and try again.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 413) throw new Error('File is too large. Maximum size is 5 MB.');
  if (res.status === 400) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? 'Invalid file. Please use JPEG, PNG, WebP, or HEIC.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (data?.error) throw new Error(data.error);
    if (res.status >= 500) throw new Error('Upload service error. Please try again.');
    throw new Error('Upload failed. Please try again.');
  }
  return res.json() as Promise<T>;
}

export async function apiDownloadBlob(path: string, filename: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
