// AKS Elite Dental Clinic - Production API Client

const BASE_URL = import.meta.env.VITE_API_URL 
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '') 
  : '';

export class ApiError extends Error {
  constructor(public statusCode: number, message: string, public details?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

let sessionToken: string | null = null;

const AUTH_TOKEN_KEY = 'auth_access_token';

// Initialize token from storage if present
if (typeof window !== 'undefined') {
  sessionToken = localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem('aks_auth_token');
}

export function setSessionToken(token: string | null) {
  sessionToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem('aks_auth_token', token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem('aks_auth_token');
    }
  }
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (!sessionToken && typeof window !== 'undefined') {
    sessionToken = localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem('aks_auth_token');
  }

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