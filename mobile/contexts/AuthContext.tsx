import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User, LoginCredentials, RegisterData, AuthContextValue } from '../types/auth';
import * as authApi from '../services/authApi';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = user !== null;

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = await authApi.getStoredAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const userData = await authApi.getCurrentUser();
        setUser(userData);
      } catch {
        // Token is invalid or expired, try to refresh
        try {
          const tokens = await authApi.refreshAccessToken();
          await authApi.storeTokens(tokens.access_token, tokens.refresh_token);
          const userData = await authApi.getCurrentUser();
          setUser(userData);
        } catch {
          // Refresh failed, clear tokens
          await authApi.clearTokens();
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setError(null);
    setIsLoading(true);

    try {
      const tokens = await authApi.login(credentials);
      await authApi.storeTokens(tokens.access_token, tokens.refresh_token);
      const userData = await authApi.getCurrentUser();
      setUser(userData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    setError(null);
    setIsLoading(true);

    try {
      // Register the user
      await authApi.register(data);
      // Auto-login after registration
      const tokens = await authApi.login({ email: data.email, password: data.password });
      await authApi.storeTokens(tokens.access_token, tokens.refresh_token);
      const userData = await authApi.getCurrentUser();
      setUser(userData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
