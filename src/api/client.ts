const TOKEN_KEY = 'engineersapp_token';
const USER_KEY = 'engineersapp_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function getStoredUser<T = unknown>(): T | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setStoredUser(user: unknown): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function getBaseUrl(): string {
  const env = import.meta.env;
  const raw = env.VITE_API_BASE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, '');
  if (env.DEV) {
    console.warn(
      '[api] VITE_API_BASE_URL is empty in dev mode — defaulting to http://localhost:8000. ' +
        'Set it in engineersapp/.env.development and restart `npm run dev` to silence this.'
    );
    return 'http://localhost:8000';
  }
  return '';
}

export const BASE_URL = getBaseUrl();

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message?: string) {
    super(message || `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

export type ApiFetchOptions = RequestInit & {
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number;
};

// Lazy require to avoid an import cycle (notify.ts imports ApiError from this file).
function emitToast(level: 'info' | 'error', message: string): void {
  import('../lib/notify').then(({ notify }) => notify[level](message)).catch(() => {});
}

export async function apiFetch<T = unknown>(path: string, init: ApiFetchOptions = {}): Promise<T> {
  const { timeoutMs, ...fetchInit } = init;
  const token = getToken();
  const headers = new Headers(fetchInit.headers);
  if (fetchInit.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  const controller = timeoutMs != null ? new AbortController() : null;
  const timeoutId =
    controller != null
      ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  let res: Response;
  try {
    res = await fetch(url, {
      ...fetchInit,
      headers,
      signal: controller?.signal ?? fetchInit.signal,
    });
  } catch (err) {
    if (controller?.signal.aborted) {
      const seconds = Math.round((timeoutMs ?? 0) / 1000);
      throw new ApiError(408, null, `Request timed out after ${seconds}s`);
    }
    throw err;
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      emitToast('info', 'Please log in to continue');
      window.location.assign('/login');
    }
  } else if (res.status === 403) {
    emitToast('error', 'You do not have permission for this action');
  }

  const text = await res.text();
  const body = text ? safeParseJSON(text) : null;
  if (!res.ok) {
    const msg =
      (body as { error?: string; detail?: string } | null)?.error ??
      (body as { error?: string; detail?: string } | null)?.detail ??
      `HTTP ${res.status}`;
    throw new ApiError(res.status, body, msg);
  }
  return body as T;
}

function safeParseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
