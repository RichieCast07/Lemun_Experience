import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, tokenStore } from "./api";
import type { Rol, User } from "./types";

interface AuthState {
  user: User | null;
  /** true mientras se valida el token guardado al abrir la app */
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => tokenStore.get() !== null);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Restaurar sesión al abrir la app
  useEffect(() => {
    if (!tokenStore.get()) return;
    let cancelled = false;
    api<{ user: User }>("/auth/me")
      .then((res) => !cancelled && setUser(res.user))
      .catch(() => !cancelled && tokenStore.clear())
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    });
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

export const HOME_BY_ROLE: Record<Rol, string> = {
  ADMIN: "/admin/metricas",
  RP: "/rp/eventos",
  MANAGER: "/manager/acceso",
};

export const ROLE_LABEL: Record<Rol, string> = {
  ADMIN: "Administrador",
  RP: "Relaciones públicas",
  MANAGER: "Manager",
};
