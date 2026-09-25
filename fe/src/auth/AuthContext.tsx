import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, clearAuth, getStoredUser, setAuth } from '../api';
import type { EmailVerificationRequiredResponse, LoginRequest, RegisterRequest, User } from '../types';

type AuthMode = 'login' | 'register';

type AuthContextValue = {
  user: User | null;
  authMode: AuthMode | null;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  login: (body: LoginRequest) => Promise<void>;
  loginAsAdmin: (body: LoginRequest) => Promise<void>;
  register: (body: RegisterRequest) => Promise<EmailVerificationRequiredResponse>;
  logout: () => Promise<void>;
};

const AUTH_EVENT = 'ticket-booking-auth';
const AuthContext = createContext<AuthContextValue | null>(null);

function notifyAuthChange() {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  useEffect(() => {
    const syncUser = () => setUser(getStoredUser());
    window.addEventListener(AUTH_EVENT, syncUser);
    return () => window.removeEventListener(AUTH_EVENT, syncUser);
  }, []);

  const login = useCallback(async (body: LoginRequest) => {
    const response = await api.login(body);
    setAuth(response);
    setUser(response.user);
    notifyAuthChange();
  }, []);

  const loginAsAdmin = useCallback(async (body: LoginRequest) => {
    const response = await api.login(body);
    if (response.user.role !== 'ADMIN') {
      clearAuth();
      setUser(null);
      queryClient.clear();
      notifyAuthChange();
      throw new Error('Tài khoản này chưa được cấp quyền quản trị.');
    }
    setAuth(response);
    setUser(response.user);
    notifyAuthChange();
  }, [queryClient]);

  const register = useCallback(async (body: RegisterRequest) => api.register(body), []);

  const logout = useCallback(async () => {
    await api.logout();
    clearAuth();
    setUser(null);
    queryClient.clear();
    notifyAuthChange();
  }, [queryClient]);

  const openAuth = useCallback((mode: AuthMode = 'login') => setAuthMode(mode), []);
  const closeAuth = useCallback(() => setAuthMode(null), []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    authMode,
    openAuth,
    closeAuth,
    login,
    loginAsAdmin,
    register,
    logout,
  }), [authMode, closeAuth, login, loginAsAdmin, logout, openAuth, register, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
