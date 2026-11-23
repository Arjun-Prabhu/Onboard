/**
 * @file Authentication context — the signed-in user and login/logout (FR-1, FR-2).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LoginInput } from '@shared/schemas';
import type { User } from '@shared/types';
import { useRefreshOnReturn } from '@/hooks/useRefreshOnReturn';
import { api } from '@/lib/api';
import { SIGNED_BACK_IN_EVENT, UNAUTHORIZED_EVENT } from '@/lib/api/httpApi';

/** Values exposed by {@link useAuth}. */
export interface AuthApi {
  user: User | null;
  /** `true` until the stored session has been checked. */
  initializing: boolean;
  login: (input: LoginInput) => Promise<User>;
  logout: () => Promise<void>;
  /** Re-fetches the current user (e.g. after finishing the tour). */
  refresh: () => Promise<void>;
  /** Locally replaces the user object. */
  setUser: (user: User) => void;
  /**
   * `true` when the server ended the sign-in while the person was still on a screen. The screen
   * stays as it is (nothing typed is lost) and a "Sign in again" dialog asks for the password.
   */
  sessionExpired: boolean;
  /**
   * Set when someone else signed in on this browser in another tab. A browser holds one sign-in,
   * so this tab would otherwise act as them; it asks to reload as that person instead.
   */
  switchedTo: User | null;
  /**
   * Signs back in after {@link sessionExpired}. The same person carries on where they were;
   * a different account reloads the app so nothing of the first person's screen stays.
   */
  signInAgain: (input: LoginInput) => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

/**
 * Provides the current user. Restores a session on startup.
 * @param props - Children.
 * @returns The provider.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [switchedTo, setSwitchedTo] = useState<User | null>(null);

  // Coming back to this tab: check the browser is still signed in as the same person.
  useRefreshOnReturn(() => {
    if (!user) return;
    void api.auth
      .me()
      .then((now) => {
        if (!now) setSessionExpired(true);
        else if (now.id !== user.id) setSwitchedTo(now);
      })
      .catch(() => undefined);
  });

  useEffect(() => {
    api.auth
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setInitializing(false));
  }, []);

  // If the server reports the sign-in is gone (8 hours idle, 30 days old, or signed out in
  // another tab), keep the screen and ask for the password again instead of throwing the person
  // out. Only "Sign out" leaves the signed-in screens.
  useEffect(() => {
    const expired = () => setSessionExpired(true);
    window.addEventListener(UNAUTHORIZED_EVENT, expired);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, expired);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { user: u } = await api.auth.login(input);
    setUser(u);
    return u;
  }, []);
  const logout = useCallback(async () => {
    // Ending a sign-in that already ended is fine: the result is the same.
    await api.auth.logout().catch(() => undefined);
    setSessionExpired(false);
    setUser(null);
  }, []);
  const signInAgain = useCallback(
    async (input: LoginInput) => {
      const { user: u } = await api.auth.login(input);
      if (u.id !== user?.id) {
        window.location.assign('/');
        return;
      }
      setUser(u);
      setSessionExpired(false);
      window.dispatchEvent(new Event(SIGNED_BACK_IN_EVENT));
    },
    [user?.id],
  );
  const refresh = useCallback(async () => setUser(await api.auth.me()), []);

  const value = useMemo(
    () => ({
      user,
      initializing,
      login,
      logout,
      refresh,
      setUser,
      sessionExpired,
      signInAgain,
      switchedTo,
    }),
    [user, initializing, login, logout, refresh, sessionExpired, signInAgain, switchedTo],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Access auth state.
 * @returns The auth API.
 * @throws Error when used outside {@link AuthProvider}.
 */
export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/**
 * Returns the signed-in user, for components rendered only behind a role guard.
 * @returns The user.
 * @throws Error if nobody is signed in.
 */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser requires a signed-in user');
  return user;
}
