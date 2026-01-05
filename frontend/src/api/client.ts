// Use environment variable or default to production server
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://72.62.162.219:5001/api';

let authToken: string | null = null;
let waiverAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setWaiverAuthToken(token: string | null) {
  waiverAuthToken = token;
}

function buildHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Use main auth token if available, otherwise use waiver auth token
  const tokenToUse = authToken ?? waiverAuthToken;
  if (tokenToUse && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${tokenToUse}`);
  }

  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Request failed');
  }
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildHeaders(init),
  });

  return handleResponse<T>(response);
}

export async function apiPost<TResponse, TBody>(
  path: string,
  body: TBody,
  init?: RequestInit
): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    ...init,
    headers: buildHeaders(init),
  });

  return handleResponse<TResponse>(response);
}

export async function apiPatch<TResponse, TBody>(
  path: string,
  body: TBody,
  init?: RequestInit
): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    ...init,
    headers: buildHeaders(init),
  });

  return handleResponse<TResponse>(response);
}

export async function apiDelete<TResponse = Record<string, never>>(
  path: string,
  init?: RequestInit
): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    ...init,
    headers: buildHeaders(init),
  });

  return handleResponse<TResponse>(response);
}
