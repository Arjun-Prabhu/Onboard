/**
 * @file Organization context (FR-2, FR-3b, FR-3c).
 *
 * Holds the signed-in person's affiliations (the org switcher list) and which org they are
 * currently MANAGING. Permissions are always derived from the role in that active org — there
 * is no global "admin" — and the choice is remembered per person on this computer.
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
import type { OrgRole } from '@shared/enums';
import { can as roleCan, type Permission } from '@shared/permissions';
import { termsOf, type Terms } from '@shared/terms';
import type { OrgAffiliation, OrgFeatures, Organization } from '@shared/types';
import { useRefreshOnReturn } from '@/hooks/useRefreshOnReturn';
import { api } from '@/lib/api';
import { useUser } from './AuthContext';

/** Values exposed by {@link useOrg}. */
export interface OrgApi {
  /** Every org the person is part of (Membership or ongoing volunteer standing). */
  affiliations: OrgAffiliation[];
  loading: boolean;
  /** Orgs where the person holds a management role. */
  managed: OrgAffiliation[];
  /** The org currently being managed, or null if the person manages none. */
  activeOrg: Organization | null;
  /** The person's role in {@link activeOrg}. */
  role: OrgRole | null;
  /** The active org's words for sites, participants and equipment (generic with no org). */
  terms: Terms;
  /** Whether the person's role in the active org grants a permission. */
  can: (permission: Permission) => boolean;
  /** Chooses which managed org the Manage area works on. */
  setActiveOrg: (orgId: string) => void;
  /** Re-fetches affiliations (after creating or joining an org, or a role change). */
  reload: () => Promise<void>;
}

const OrgContext = createContext<OrgApi | null>(null);

/**
 * Storage key for the remembered active org, per person.
 * @param userId - Person id.
 * @returns localStorage key.
 */
const storageKey = (userId: string) => `onboard.activeOrg.${userId}`;

/**
 * Provides org affiliations and the active org. Must sit inside an authenticated area.
 * @param props - Children.
 * @returns The provider.
 */
export function OrgProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const [affiliations, setAffiliations] = useState<OrgAffiliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey(user.id));
    } catch {
      return null;
    }
  });

  const reload = useCallback(async () => {
    try {
      setAffiliations(await api.orgs.mine());
    } catch {
      // Keep what's on screen (e.g. the sign-in just ended and "Sign in again" is showing).
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, user.id]);
  // Someone else may have changed this person's roles (made them an Owner, removed them).
  useRefreshOnReturn(() => void reload());

  const managed = useMemo(() => affiliations.filter((a) => a.role), [affiliations]);
  // Fall back to the first managed org if the remembered one is gone (e.g. after stepping down).
  const active = managed.find((a) => a.org.id === activeId) ?? managed[0] ?? null;

  const setActiveOrg = useCallback(
    (orgId: string) => {
      setActiveId(orgId);
      try {
        localStorage.setItem(storageKey(user.id), orgId);
      } catch {
        // Non-fatal: the choice just isn't remembered next launch.
      }
    },
    [user.id],
  );

  const value = useMemo<OrgApi>(
    () => ({
      affiliations,
      loading,
      managed,
      activeOrg: active?.org ?? null,
      role: active?.role ?? null,
      terms: termsOf(active?.org),
      can: (p) => roleCan(active?.role, p),
      setActiveOrg,
      reload,
    }),
    [affiliations, loading, managed, active, setActiveOrg, reload],
  );
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

/**
 * Access org state.
 * @returns The org API.
 * @throws Error when used outside {@link OrgProvider}.
 */
export function useOrg(): OrgApi {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside OrgProvider');
  return ctx;
}

/**
 * Org state when it exists, or null outside the signed-in area (sign-in and apply pages).
 * @returns The org API or null.
 */
export function useOrgIfAny(): OrgApi | null {
  return useContext(OrgContext);
}

/**
 * The active managed org for pages rendered behind a manage guard.
 * @returns The org and the person's role in it.
 * @throws Error if no org is being managed.
 */
export function useManagedOrg(): {
  org: Organization;
  role: OrgRole;
  can: (p: Permission) => boolean;
  /** The org's own words, e.g. `terms.Sites` → "Schools", "Clinics", "Fields". */
  terms: Terms;
  /** Which optional features the org uses. */
  features: OrgFeatures;
} {
  const { activeOrg, role, can, terms } = useOrg();
  if (!activeOrg || !role) throw new Error('useManagedOrg requires an active managed org');
  return { org: activeOrg, role, can, terms, features: activeOrg.settings.features };
}
