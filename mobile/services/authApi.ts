import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../config';
import type { User, LoginCredentials, RegisterData, TokenResponse } from '../types/auth';

const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

// SecureStore wrapper that falls back to memory storage on web
let memoryStorage: { [key: string]: string } = {};

async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    memoryStorage[key] = value;
    // Also use localStorage on web for persistence
    try {
      localStorage.setItem(key, value);
    } catch {}
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    // Try localStorage first, then memory
    try {
      return localStorage.getItem(key) || memoryStorage[key] || null;
    } catch {
      return memoryStorage[key] || null;
    }
  } else {
    return await SecureStore.getItemAsync(key);
  }
}

async function deleteSecureItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    delete memoryStorage[key];
    try {
      localStorage.removeItem(key);
    } catch {}
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

// Token management
export async function getStoredAccessToken(): Promise<string | null> {
  return getSecureItem(ACCESS_TOKEN_KEY);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  return getSecureItem(REFRESH_TOKEN_KEY);
}

export async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  await setSecureItem(ACCESS_TOKEN_KEY, accessToken);
  await setSecureItem(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  await deleteSecureItem(ACCESS_TOKEN_KEY);
  await deleteSecureItem(REFRESH_TOKEN_KEY);
}

// API calls
export async function register(data: RegisterData): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Registration failed' }));
    throw new Error(error.detail || 'Registration failed');
  }

  return response.json();
}

export async function login(credentials: LoginCredentials): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error(error.detail || 'Invalid email or password');
  }

  return response.json();
}

export async function refreshAccessToken(): Promise<TokenResponse> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    await clearTokens();
    throw new Error('Session expired. Please login again.');
  }

  return response.json();
}

export async function logout(): Promise<void> {
  const accessToken = await getStoredAccessToken();
  if (accessToken) {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
    } catch {
      // Ignore logout errors, we'll clear tokens anyway
    }
  }
  await clearTokens();
}

export async function getCurrentUser(): Promise<User> {
  const accessToken = await getStoredAccessToken();
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Token expired');
    }
    throw new Error('Failed to get user');
  }

  return response.json();
}

// Authenticated fetch with automatic token refresh
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let accessToken = await getStoredAccessToken();

  const makeRequest = async (token: string | null) => {
    const headers = new Headers(options.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(url, { ...options, headers });
  };

  let response = await makeRequest(accessToken);

  // If unauthorized, try to refresh the token
  if (response.status === 401 && accessToken) {
    try {
      const tokens = await refreshAccessToken();
      await storeTokens(tokens.access_token, tokens.refresh_token);
      response = await makeRequest(tokens.access_token);
    } catch {
      await clearTokens();
      throw new Error('Session expired. Please login again.');
    }
  }

  return response;
}
