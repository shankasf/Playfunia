// API URL must be set via environment variable
export const API_BASE_URL = process.env.REACT_APP_API_URL || '';

if (!API_BASE_URL) {
  console.warn('REACT_APP_API_URL is not set. API calls will fail.');
}

let authToken: string | null = null;
let waiverAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setWaiverAuthToken(token: string | null) {
  waiverAuthToken = token;
}

type RequestOptions = {
  /**
   * For waiver-scoped endpoints. When a waiver auth token is present it
   * represents the person currently being processed (e.g. a customer being
   * checked in at a staff-operated kiosk), so it must take precedence over the
   * operator's main-account token. Otherwise the operator's own waiver would be
   * returned/overwritten instead of the customer's.
   */
  preferWaiverToken?: boolean;
};

function buildHeaders(init?: RequestInit, opts?: RequestOptions) {
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Waiver endpoints prefer the waiver token (the current waiver subject);
  // everything else prefers the main-account token.
  const tokenToUse = opts?.preferWaiverToken
    ? (waiverAuthToken ?? authToken)
    : (authToken ?? waiverAuthToken);
  if (tokenToUse && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${tokenToUse}`);
  }

  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let message = text || 'Request failed';
    // Try to parse JSON error response to extract message
    try {
      const json = JSON.parse(text);
      if (json.message) {
        message = json.message;
      }
    } catch {
      // Not JSON, use raw text
    }
    throw new Error(message);
  }
  // Handle 204 No Content (no body to parse)
  if (response.status === 204) {
    return {} as T;
  }
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string, init?: RequestInit, opts?: RequestOptions): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildHeaders(init, opts),
  });

  return handleResponse<T>(response);
}

export async function apiPost<TResponse, TBody>(
  path: string,
  body: TBody,
  init?: RequestInit,
  opts?: RequestOptions
): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    ...init,
    headers: buildHeaders(init, opts),
  });

  return handleResponse<TResponse>(response);
}

// Public POST request (no auth required)
export async function apiPostPublic<TResponse, TBody>(
  path: string,
  body: TBody,
  init?: RequestInit
): Promise<TResponse> {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    ...init,
    headers,
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
