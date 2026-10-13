// Clinic Portal – shared API client (tenant-agnostic)
// Auth is carried exclusively via the aks_session httpOnly cookie set by the server.
// No tokens are written to localStorage; credentials:'include' on every fetch is sufficient.

const BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : '';

export class ApiError extends Error {
  constructor(public statusCode: number, message: string, public details?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * In-memory token kept only for the duration of the page session so that
 * existing callers sending an Authorization header remain compatible during
 * the cookie-only transition. The server validates the cookie first; this
 * header is a secondary fallback that will be removed in a follow-up.
 */
let sessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  // Only update the in-memory reference – no localStorage writes.
  sessionToken = token;
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // sessionToken is in-memory only; no localStorage fallback.

  if (sessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }

  // Normalize endpoint path: ensure starts with /api
  let path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!path.startsWith('/api')) {
    path = `/api${path}`;
  }

  const fullUrl = `${BASE_URL}${path}`;

  const response = await fetch(fullUrl, {
    ...options,
    headers,
    credentials: 'include', // Include HTTP-Only cookies
  });

  if (!response.ok) {
    let errorMsg = `Request failed (${response.status})`;
    let details: any = null;
    try {
      const errJson = await response.json();
      errorMsg = Array.isArray(errJson.message) ? errJson.message.join(', ') : (errJson.message || errorMsg);
      details = errJson;
    } catch {
      // Non-JSON response
    }
    throw new ApiError(response.status, errorMsg, details);
  }

  return response.json();
}

export const api = {
  get: async <T = any>(endpoint: string, options?: RequestInit) => {
    const data = await apiRequest<T>(endpoint, { ...options, method: 'GET' });
    return { data };
  },
  post: async <T = any>(endpoint: string, body?: any, options?: RequestInit) => {
    const data = await apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  },
  put: async <T = any>(endpoint: string, body?: any, options?: RequestInit) => {
    const data = await apiRequest<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  },
  patch: async <T = any>(endpoint: string, body?: any, options?: RequestInit) => {
    const data = await apiRequest<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  },
  delete: async <T = any>(endpoint: string, options?: RequestInit) => {
    const data = await apiRequest<T>(endpoint, { ...options, method: 'DELETE' });
    return { data };
  },
};