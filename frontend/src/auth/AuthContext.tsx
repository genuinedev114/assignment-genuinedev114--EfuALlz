import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getToken, me, setToken } from "../api";
import { useNotifications } from "../notifications/NotificationsContext";
import type { AuthUser } from "../types";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  signIn: (token: string, user: AuthUser, mode?: "login" | "register") => void;
  signOut: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { push } = useNotifications();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    me()
      .then((u) => setUser(u))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      signIn(token, u, mode = "login") {
        setToken(token);
        setUser(u);
        if (mode === "register") {
          push({
            kind: "success",
            title: `Welcome, @${u.username}!`,
            body: "Your account is ready.",
          });
        } else {
          push({
            kind: "success",
            title: `Welcome back, @${u.username}`,
            body: "You're signed in.",
          });
        }
      },
      signOut() {
        const handle = user?.username;
        setToken(null);
        setUser(null);
        push({
          kind: "info",
          title: "Signed out",
          body: handle ? `Goodbye, @${handle}.` : undefined,
        });
      },
    }),
    [user, loading, push],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
