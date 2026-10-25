"use client";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStore, type User } from "./api";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (b: { email: string; password: string; display_name: string; role: "viewer" | "creator" }) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); return; }
    try { setUser(await api<User>("/auth/me")); } catch { tokenStore.clear(); setUser(null); }
  }, []);

  useEffect(() => { refresh().finally(() => setLoading(false)); }, [refresh]);

  const finish = async (path: string, json: unknown) => {
    const res = await api<{ access_token: string; user: User }>(path, { method: "POST", json });
    tokenStore.set(res.access_token);
    qc.clear(); // never leak cached data between sessions
    setUser(res.user);
    return res.user;
  };

  return (
    <Ctx.Provider
      value={{
        user, loading, refresh,
        login: (email, password) => finish("/auth/login", { email, password }),
        register: (b) => finish("/auth/register", b),
        logout: () => { tokenStore.clear(); qc.clear(); setUser(null); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
