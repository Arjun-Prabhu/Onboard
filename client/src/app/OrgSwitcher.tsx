/**
 * @file Organization switcher (FR-2, FR-3c).
 *
 * Lists every org the person is PART OF, each labeled with their role there. Choosing an org
 * they manage makes it the active org for the Manage area; choosing one they only volunteer for
 * opens that org's sessions under My volunteering. One-time guest orgs are never listed (FR-3d).
 */
import { Building2, Check, ChevronsUpDown, Compass, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { labelOf } from '@shared/enums';
import type { OrgAffiliation } from '@shared/types';
import { useOrg } from '@/context/OrgContext';
import { cn } from '@/lib/cn';

/**
 * The person's relationship to an org, in words: "Owner · Volunteer".
 * @param a - Affiliation.
 * @returns Short label.
 */
export function relationshipLabel(a: Pick<OrgAffiliation, 'role' | 'volunteerStatus'>): string {
  return [
    a.role && labelOf(a.role),
    a.volunteerStatus &&
      (a.volunteerStatus === 'ACTIVE'
        ? 'Volunteer'
        : `Volunteer (${labelOf(a.volunteerStatus).toLowerCase()})`),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Two-letter monogram for an org.
 * @param name - Org name.
 * @returns Initials.
 */
function monogram(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Props for {@link OrgSwitcher}. */
interface OrgSwitcherProps {
  /** Called after a choice (closes the mobile drawer). */
  onNavigate?: () => void;
  /** Collapsed sidebar: show only the org monogram. */
  collapsed?: boolean;
  /** Expands the sidebar, so the menu has room to open. */
  onExpand?: () => void;
}

/**
 * The switcher button + menu, styled for the sidebar (which follows the theme). When the sidebar is collapsed it
 * shows only the monogram; clicking it expands the sidebar and opens the menu.
 * @param props - See {@link OrgSwitcherProps}.
 * @returns The switcher.
 */
export function OrgSwitcher({ onNavigate, collapsed = false, onExpand }: OrgSwitcherProps) {
  const { affiliations, activeOrg, role, setActiveOrg } = useOrg();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const managed = affiliations.filter((a) => a.role);
  const volunteering = affiliations.filter((a) => !a.role);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      !wrapRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    wrapRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /**
   * Navigates and closes the menu.
   * @param to - Route.
   */
  const go = (to: string) => {
    setOpen(false);
    onNavigate?.();
    navigate(to);
  };

  /**
   * One org row in the menu.
   * @param a - Affiliation.
   * @param onPick - Action when chosen.
   * @param selected - Whether it is the active managed org.
   * @returns The menu item.
   */
  const row = (a: OrgAffiliation, onPick: () => void, selected = false) => (
    <li key={a.org.id}>
      <button
        type="button"
        onClick={onPick}
        data-autofocus={selected || undefined}
        className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-2"
        aria-current={selected || undefined}
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-control bg-primary-soft font-display text-sm font-bold text-primary"
        >
          {monogram(a.org.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{a.org.name}</span>
          <span className="block truncate text-xs text-ink-muted">{relationshipLabel(a)}</span>
        </span>
        {selected && <Check className="size-4 text-primary" aria-label="Currently managing" />}
      </button>
    </li>
  );

  const currentName = activeOrg?.name ?? 'No organization yet';

  if (collapsed)
    return (
      <div className="flex justify-center" data-tour="switcher">
        <button
          type="button"
          onClick={() => {
            onExpand?.();
            setOpen(true);
          }}
          title={`${currentName}. Switch organization`}
          className="grid size-10 place-items-center rounded-control bg-accent font-display text-sm font-bold text-on-accent hover:brightness-110"
        >
          {activeOrg ? monogram(activeOrg.name) : <Building2 className="size-4" aria-hidden />}
          <span className="sr-only">{`${currentName}. Switch organization`}</span>
        </button>
      </div>
    );

  return (
    <div ref={wrapRef} className="relative" data-tour="switcher">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-control border border-rail-line bg-transparent px-2.5 py-2 text-left hover:bg-rail-hover"
      >
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-control bg-accent font-display text-sm font-bold text-on-accent"
        >
          {activeOrg ? monogram(activeOrg.name) : <Building2 className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-rail-ink">{currentName}</span>
          <span className="block truncate text-xs text-rail-muted">
            {role
              ? `Managing as ${labelOf(role)}`
              : volunteering.length
                ? `Volunteer at ${volunteering.length} organization${volunteering.length === 1 ? '' : 's'}`
                : 'Join or create one'}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-rail-muted" aria-hidden />
        <span className="sr-only">Switch organization</span>
      </button>

      {open && (
        <div
          id={menuId}
          className="animate-pop absolute left-0 right-0 top-full z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-panel border border-line bg-surface p-2 text-ink shadow-2xl"
        >
          {managed.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-1 text-xs font-semibold text-ink-muted">
                Organizations you manage
              </p>
              <ul>
                {managed.map((a) =>
                  row(
                    a,
                    () => {
                      setActiveOrg(a.org.id);
                      go('/');
                    },
                    a.org.id === activeOrg?.id,
                  ),
                )}
              </ul>
            </>
          )}
          {volunteering.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-2 text-xs font-semibold text-ink-muted">
                You volunteer with
              </p>
              <ul>{volunteering.map((a) => row(a, () => go(`/me/find?org=${a.org.id}`)))}</ul>
            </>
          )}
          <div className="mt-2 border-t border-line pt-2">
            <button
              type="button"
              onClick={() => go('/orgs/new')}
              className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-sm font-semibold text-primary hover:bg-surface-2"
            >
              <Plus className="size-4" aria-hidden /> Create organization
            </button>
            <button
              type="button"
              onClick={() => go('/me/orgs')}
              className={cn(
                'flex w-full items-center gap-3 rounded-control px-2 py-2 text-sm font-medium text-ink hover:bg-surface-2',
              )}
            >
              <Compass className="size-4" aria-hidden /> Browse organizations
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
