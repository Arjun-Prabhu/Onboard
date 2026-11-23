/**
 * @file Authenticated app chrome: skip link, sidebar (drawer on small screens, collapsible to an
 * icon rail on desktop), top bar, main landmark, assistant panel and tour.
 */
import {
  Building2,
  ChevronsUpDown,
  HeartHandshake,
  LifeBuoy,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { useAuth, useUser } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { AssistantPanel } from '@/features/assistant/AssistantPanel';
import { SignInAgainDialog, SwitchedAccountDialog } from '@/features/auth/SignInAgainDialog';
import { useHelp } from '@/features/help/HelpContext';
import { Tour } from '@/features/tour/Tour';
import { cn } from '@/lib/cn';
import { GlobalSearch } from './GlobalSearch';
import {
  ACCOUNT_ITEMS,
  modeForPath,
  NO_ORG_ITEMS,
  saveMode,
  savedMode,
  VOLUNTEER_ITEMS,
  visibleOrganizeItems,
  type Mode,
  type NavItem,
} from './navigation';
import { OrgSwitcher } from './OrgSwitcher';

/** Where the collapsed/expanded choice is remembered (per browser). */
const COLLAPSE_KEY = 'onboard.sidebarCollapsed';

/**
 * Reads the saved sidebar state. Storage can be unavailable (private mode), so failures mean
 * "expanded".
 * @returns Whether the sidebar starts collapsed.
 */
function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Saves the sidebar state, ignoring storage failures.
 * @param collapsed - New state.
 */
function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, String(collapsed));
  } catch {
    /* not saved; the toggle still works for this visit */
  }
}

/**
 * Whether a key press happened while typing, where `[` is text, not a shortcut.
 * @param target - Event target.
 * @returns True inside inputs, text areas, selects and editable content.
 */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
}

/**
 * The Onboard wordmark: three seats on a board, two taken and one open — the same seat meter
 * that shows staffing on every session.
 * @param props - `onDark` for the rail colors; `compact` shows only the mark (collapsed rail).
 * @returns The logo element.
 */
export function Wordmark({
  onDark = true,
  compact = false,
}: {
  onDark?: boolean;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 44 16" className="h-4 w-11" aria-hidden>
        <rect x="0.5" y="0.5" width="43" height="15" rx="7.5" fill="var(--rh-accent)" />
        {[8, 22, 36].map((cx, i) => (
          <circle
            key={cx}
            cx={cx}
            cy="8"
            r={i < 2 ? 3.4 : 2.6}
            fill={i < 2 ? (onDark ? 'var(--rh-rail)' : 'var(--rh-surface)') : 'none'}
            stroke={i < 2 ? 'none' : onDark ? 'var(--rh-rail)' : 'var(--rh-surface)'}
            strokeWidth="1.6"
          />
        ))}
      </svg>
      <span
        className={cn(
          'font-display text-2xl font-bold tracking-tight',
          compact && 'sr-only',
          onDark ? 'text-rail-ink' : 'text-ink',
        )}
      >
        Onboard
      </span>
    </span>
  );
}

/**
 * One labeled group of sidebar links.
 * @param props - Group label, items and the drawer-close callback.
 * @returns The group, or null when empty.
 */
function NavSection({
  label,
  items,
  onNavigate,
  collapsed = false,
  hideLabel = false,
}: {
  label: string;
  items: NavItem[];
  onNavigate?: () => void;
  /** Icon-rail mode: the heading becomes a divider and labels become tooltips. */
  collapsed?: boolean;
  /** Hide the heading visually (screen readers still announce it). */
  hideLabel?: boolean;
}) {
  const { pathname } = useLocation();
  if (!items.length) return null;
  return (
    <div className="mb-4">
      {collapsed ? (
        <>
          <hr className="mx-2 mb-2 border-rail-line" aria-hidden />
          <p className="sr-only">{label}</p>
        </>
      ) : (
        <p
          className={cn(
            'truncate px-2 pb-1 text-xs font-semibold text-rail-muted',
            hideLabel && 'sr-only',
          )}
        >
          {label}
        </p>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              data-tour={item.tour}
              title={collapsed ? item.label : undefined}
              className={({ isActive: exact }) =>
                cn(
                  'flex min-h-10 items-center gap-3 rounded-control text-sm font-medium transition-colors',
                  collapsed ? 'justify-center' : 'px-2.5',
                  exact || item.alsoActive?.test(pathname)
                    ? 'bg-accent text-on-accent'
                    : 'text-rail-ink hover:bg-rail-hover',
                )
              }
            >
              <item.icon className="size-[1.1rem] shrink-0" aria-hidden />
              <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Props for {@link SidebarNav}. */
interface SidebarNavProps {
  /** Closes the mobile drawer after a choice. */
  onNavigate?: () => void;
  /** Desktop icon-rail mode. */
  collapsed?: boolean;
  /** Collapses or expands the desktop sidebar; omitted in the mobile drawer. */
  onToggle?: () => void;
  /** Which half of the app is showing. */
  mode: Mode;
}

/**
 * The Volunteer / Organize switch, shown to everyone. Owners and Admins volunteer too, and
 * someone who runs no organization yet finds "Create an organization" in Organize. Switching
 * remembers the choice and goes to that mode's home page.
 * @param props - Current mode, rail mode and the drawer-close callback.
 * @returns The switch.
 */
function ModeSwitch({
  mode,
  collapsed,
  onNavigate,
}: {
  mode: Mode;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const go = (m: Mode) => {
    // Saved first, so Organize Home knows this was a choice (it matters when there's no org).
    saveMode(m);
    navigate(m === 'organize' ? '/' : '/me');
    onNavigate?.();
  };
  if (collapsed) {
    const next: Mode = mode === 'organize' ? 'volunteer' : 'organize';
    const Icon = next === 'organize' ? Building2 : HeartHandshake;
    return (
      <button
        type="button"
        onClick={() => go(next)}
        title={next === 'organize' ? 'Switch to Organize' : 'Switch to Volunteer'}
        aria-label={next === 'organize' ? 'Switch to Organize' : 'Switch to Volunteer'}
        className="mx-auto grid size-9 place-items-center rounded-control text-rail-ink hover:bg-rail-hover"
      >
        <Icon className="size-5" aria-hidden />
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-label="Mode"
      data-tour="mode"
      className="grid grid-cols-2 gap-1 rounded-control border border-rail-line p-1"
    >
      {(['volunteer', 'organize'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => go(m)}
          className={cn(
            'flex min-h-9 items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] text-sm font-semibold transition-colors',
            mode === m
              ? 'bg-accent text-on-accent'
              : 'text-rail-muted hover:bg-rail-hover hover:text-rail-ink',
          )}
        >
          {m === 'organize' ? (
            <Building2 className="size-4" aria-hidden />
          ) : (
            <HeartHandshake className="size-4" aria-hidden />
          )}
          {m === 'organize' ? 'Organize' : 'Volunteer'}
        </button>
      ))}
    </div>
  );
}

/**
 * The person's name with an account menu: app settings, help, the FBLA page, sign out.
 * @param props - Rail mode and the drawer-close callback.
 * @returns The footer block.
 */
function AccountMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const user = useUser();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !wrapRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div ref={wrapRef} className="relative border-t border-rail-line p-3">
      {open && (
        <ul
          id={menuId}
          className={cn(
            'animate-pop absolute bottom-full z-30 mb-1 rounded-panel border border-rail-line bg-rail p-1 shadow-lg',
            collapsed ? 'left-2 w-56' : 'inset-x-3',
          )}
        >
          {ACCOUNT_ITEMS.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                data-tour={item.to === '/help' ? 'help' : undefined}
                className="flex min-h-10 items-center gap-3 rounded-control px-2.5 text-sm font-medium text-rail-ink hover:bg-rail-hover"
              >
                <item.icon className="size-[1.1rem]" aria-hidden />
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex min-h-10 w-full items-center gap-3 rounded-control px-2.5 text-sm font-medium text-rail-ink hover:bg-rail-hover"
            >
              <LogOut className="size-[1.1rem]" aria-hidden />
              Sign out
            </button>
          </li>
        </ul>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${user.firstName} ${user.lastName}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-3 rounded-control py-1 text-left hover:bg-rail-hover',
          collapsed ? 'justify-center px-0' : 'px-2',
        )}
      >
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-rail-hover font-display text-sm font-bold"
        >
          {user.firstName[0]}
          {user.lastName[0]}
        </span>
        <span className={cn('min-w-0 flex-1', collapsed && 'sr-only')}>
          <span className="block truncate text-sm font-semibold">
            {user.firstName} {user.lastName}
          </span>
          <span className="block truncate text-xs text-rail-muted">Settings, help, sign out</span>
        </span>
        {!collapsed && <ChevronsUpDown className="size-4 text-rail-muted" aria-hidden />}
      </button>
    </div>
  );
}

/**
 * Sidebar: wordmark, the Volunteer / Organize switch, the org switcher (Organize only), one short
 * menu for the current mode, and the account menu. In collapsed mode the same content is an icon
 * rail with tooltips.
 * @param props - See {@link SidebarNavProps}.
 * @returns The sidebar contents.
 */
function SidebarNav({ onNavigate, collapsed = false, onToggle, mode }: SidebarNavProps) {
  const { activeOrg, can } = useOrg();
  const items =
    mode === 'volunteer' ? VOLUNTEER_ITEMS : activeOrg ? visibleOrganizeItems(can) : NO_ORG_ITEMS;
  const toggle = onToggle && (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls="sidebar"
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className="grid size-9 shrink-0 place-items-center rounded-control text-rail-muted hover:bg-rail-hover hover:text-rail-ink"
    >
      {collapsed ? (
        <PanelLeftOpen className="size-5" aria-hidden />
      ) : (
        <PanelLeftClose className="size-5" aria-hidden />
      )}
    </button>
  );
  return (
    <div className="peg-grid flex h-full flex-col overflow-hidden bg-rail text-rail-ink">
      <div className={cn('space-y-4 pb-4 pt-5', collapsed ? 'px-2' : 'px-4')}>
        <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between')}>
          <Link
            to={mode === 'organize' ? '/' : '/me'}
            onClick={onNavigate}
            aria-label="Onboard home"
            className={cn('inline-block', collapsed ? 'py-1' : 'px-1')}
          >
            <Wordmark compact={collapsed} />
          </Link>
          {toggle}
        </div>
        <ModeSwitch mode={mode} collapsed={collapsed} onNavigate={onNavigate} />
        {mode === 'organize' && (
          <OrgSwitcher onNavigate={onNavigate} collapsed={collapsed} onExpand={onToggle} />
        )}
      </div>
      <nav
        aria-label="Main"
        className={cn(
          // `relative` keeps the visually hidden labels (absolutely positioned) inside this scroller,
          // so in rail mode they can't stretch the page and add a scrollbar.
          'relative flex-1 overflow-y-auto pb-4',
          // In the narrow rail a scrollbar would push the icons off-center; wheel scrolling still works.
          collapsed ? 'px-2 [scrollbar-width:none]' : 'px-3',
        )}
        data-tour="nav"
      >
        <NavSection
          label={mode === 'organize' ? 'Organize' : 'Volunteer'}
          items={items}
          onNavigate={onNavigate}
          collapsed={collapsed}
          hideLabel
        />
      </nav>
      <AccountMenu collapsed={collapsed} onNavigate={onNavigate} />
    </div>
  );
}

/**
 * Layout for every signed-in page.
 * @returns The shell with the routed page in `<main>`.
 */
export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const { setAssistantOpen, assistantOpen } = useHelp();
  const { managed } = useOrg();
  const { pathname } = useLocation();
  const [lastMode, setLastMode] = useState<Mode | null>(savedMode);
  // The page decides the mode; shared pages (a session, help) keep the last one. With nothing
  // saved yet, people who run an org start in Organize and everyone else in Volunteer.
  const mode: Mode =
    modeForPath(pathname) ?? lastMode ?? (managed.length ? 'organize' : 'volunteer');
  useEffect(() => {
    const m = modeForPath(pathname);
    if (m && m !== lastMode) {
      setLastMode(m);
      // Home ("/") is where everyone lands after signing in, so visiting it isn't a choice of
      // Organize; only pressing the switch (or opening an Organize page) is remembered.
      if (pathname !== '/') saveMode(m);
    }
  }, [pathname, lastMode]);

  /** Collapses or expands the desktop sidebar and remembers the choice. */
  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      saveCollapsed(!c);
      return !c;
    });
  }, []);

  // `[` toggles the sidebar, like many editors, except while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      toggleSidebar();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  // Move focus to the page heading on navigation so screen readers announce the new page.
  useEffect(() => {
    setDrawerOpen(false);
    document.querySelector<HTMLElement>('main h1')?.focus?.();
  }, [pathname]);

  return (
    <div
      className={cn(
        'min-h-screen lg:grid lg:transition-[grid-template-columns] lg:duration-200 lg:ease-out',
        collapsed ? 'lg:grid-cols-[4.5rem_1fr]' : 'lg:grid-cols-[17rem_1fr]',
      )}
    >
      <a
        href="#main"
        className="sr-only z-[70] rounded-control bg-accent px-4 py-2 font-semibold text-on-accent focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      <aside id="sidebar" className="sticky top-0 hidden h-screen lg:block" aria-label="Sidebar">
        <SidebarNav collapsed={collapsed} onToggle={toggleSidebar} mode={mode} />
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="animate-pop relative h-full w-72 max-w-[85%]">
            <SidebarNav onNavigate={() => setDrawerOpen(false)} mode={mode} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-2 top-4 rounded-control p-2 text-rail-ink hover:bg-rail-hover"
              aria-label="Close menu"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* On a fill page this column is exactly the window's height, so the grid can stretch into
          whatever space is left below the page header (pure CSS, no measuring). */}
      <div className="flex min-w-0 flex-col has-[[data-layout=fill]]:h-dvh">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-2.5 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            icon={<Menu className="size-5" aria-hidden />}
          />
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant={assistantOpen ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setAssistantOpen(!assistantOpen)}
              aria-pressed={assistantOpen}
              data-tour="assistant"
              icon={<LifeBuoy className="size-5" aria-hidden />}
            >
              <span className="hidden sm:inline">Help</span>
            </Button>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          // Every page uses the full width beside the sidebar. Pages marked data-layout="fill"
          // (full-screen grids) also become a flex column, so the grid takes all remaining height.
          className="w-full flex-1 px-4 py-6 outline-none has-[[data-layout=fill]]:flex has-[[data-layout=fill]]:min-h-0 has-[[data-layout=fill]]:flex-col has-[[data-layout=fill]]:pb-4 sm:px-6 lg:px-8"
        >
          <Outlet />
        </main>
      </div>
      <AssistantPanel />
      <Tour />
      <SignInAgainDialog />
      <SwitchedAccountDialog />
    </div>
  );
}
