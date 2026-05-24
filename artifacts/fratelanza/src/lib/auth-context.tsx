import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

type AuthState =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "auth"; username: string };

type Ctx = {
  state: AuthState;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  apiBase: string;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    fetch(`${API_BASE}/auth/me`, { credentials: "include" })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setState({ status: "auth", username: data.username ?? "user" });
        } else {
          setState({ status: "anon" });
        }
      })
      .catch(() => setState({ status: "anon" }));
  }, []);

  const login = async (username: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      const data = await res.json();
      setState({ status: "auth", username: data.username ?? username });
      return { ok: true };
    }
    let err = "Invalid credentials";
    try {
      const data = await res.json();
      err = data.error ?? err;
    } catch {}
    return { ok: false, error: err };
  };

  const logout = async () => {
    await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    setState({ status: "anon" });
  };

  return <AuthContext.Provider value={{ state, login, logout, apiBase: API_BASE }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
