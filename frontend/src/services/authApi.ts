import { API_BASE_URL } from '../config';
import type { User, LoginCredentials, RegisterData, TokenResponse } from '../types/auth';

const AUTH_BASE = `${API_BASE_URL}/api/auth`;

// Token storage keys
const ACCESS_TOKEN_KEY = 'language_app_access_token';
const REFRESH_TOKEN_KEY = 'language_app_refresh_token';

export function getStoredAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
    throw new Error(error.detail || 'Request failed');
  }
  return response.json();
}

export async function register(data: RegisterData): Promise<User> {
  const response = await fetch(`${AUTH_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<User>(response);
}

export async function login(credentials: LoginCredentials): Promise<TokenResponse> {
  const response = await fetch(`${AUTH_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  return handleResponse<TokenResponse>(response);
}

export async function refreshAccessToken(): Promise<TokenResponse> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(`${AUTH_BASE}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return handleResponse<TokenResponse>(response);
}

export async function logout(): Promise<void> {
  const refreshToken = getStoredRefreshToken();
  if (refreshToken) {
    await fetch(`${AUTH_BASE}/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {
      // Ignore logout errors - token might already be invalid
    });
  }
  clearTokens();
}

export async function getCurrentUser(): Promise<User> {
  const accessToken = getStoredAccessToken();
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(`${AUTH_BASE}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return handleResponse<User>(response);
}

// Authenticated fetch wrapper with automatic token refresh
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let accessToken = getStoredAccessToken();

  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  // First attempt with current token
  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // If unauthorized, try to refresh token
  if (response.status === 401) {
    try {
      const tokens = await refreshAccessToken();
      storeTokens(tokens.access_token, tokens.refresh_token);
      accessToken = tokens.access_token;

      // Retry with new token
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      // Refresh failed, clear tokens
      clearTokens();
      throw new Error('Session expired');
    }
  }

  return response;
}
