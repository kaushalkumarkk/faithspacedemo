import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getApiUrl, initStorage, setStoredApiUrl, setStoredToken, type User } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  apiUrl: string;
  login: (email: string, password: string) => Promise<User>;
  register: (body: { email: string; password: string; display_name: string; role: "viewer" | "creator" }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateApiUrl: (url: string) => Promise<string>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiUrl, setApiUrl] = useState(getApiUrl());

  const refresh = useCallback(async () => {
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
      await setStoredToken(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { token, apiUrl: url } = await initStorage();
      setApiUrl(url);
      if (token) {
        await refresh();
      }
      setLoading(false);
    })();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      json: { email, password },
    });
    await setStoredToken(res.access_token);
    setUser(res.user);
    return res.user;
  };

  const register = async (body: { email: string; password: string; display_name: string; role: "viewer" | "creator" }) => {
    const res = await api<{ access_token: string; user: User }>("/auth/register", {
      method: "POST",
      json: body,
    });
    await setStoredToken(res.access_token);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    await setStoredToken(null);
    setUser(null);
  };

  const updateApiUrl = async (url: string) => {
    const clean = await setStoredApiUrl(url);
    setApiUrl(clean);
    return clean;
  };

  return (
    <AuthContext.Provider value={{ user, loading, apiUrl, login, register, logout, refresh, updateApiUrl }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
