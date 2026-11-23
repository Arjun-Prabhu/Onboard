/**
 * @file Page-level layout primitives: PageHeader, Panel, Breadcrumbs, StatTile, EmptyState,
 * loading and error blocks. Consistent pieces reduce what users must learn (§2.10).
 */
import { SectionTabs, useTabGroup } from '@/app/SectionTabs';
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/** One breadcrumb. */
export interface Crumb {
  label: string;
  to?: string;
}

/**
 * Breadcrumb trail for detail pages.
 * @param props - The crumbs, last one is the current page.
 * @returns The nav element.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
        {items.map((c, i) => (
          <li key={c.label} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
            {c.to ? (
              <Link to={c.to} className="underline-offset-2 hover:text-ink hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-ink">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Props for {@link PageHeader}. */
export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
}

/**
 * Page title row with optional description, breadcrumbs and actions.
 * @param props - Header props.
 * @returns The header.
 */
export function PageHeader({ title, description, actions, breadcrumbs }: PageHeaderProps) {
  // Screens that belong to a group (Volunteers → People · New volunteers) show the group's
  // title with tabs, so related screens read as one place.
  const group = useTabGroup();
  return (
    <header className="mb-6">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 tabIndex={-1} className="text-3xl font-bold text-ink outline-none sm:text-4xl">
            {group ? group.title : title}
          </h1>
          {description && <p className="mt-1 max-w-2xl text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {group && <SectionTabs group={group} />}
    </header>
  );
}

/** Props for {@link Panel}. */
export interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  /** Optional id for `aria-labelledby` and tour targeting. */
  id?: string;
}

/**
 * A titled section container. Uses `<section>` with a heading for landmark navigation.
 * @param props - Panel props.
 * @returns The section.
 */
export function Panel({
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
  id,
}: PanelProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn('min-w-0 rounded-panel border border-line bg-surface', className)}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            {title && (
              <h2 id={headingId} className="text-xl font-semibold text-ink">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Props for {@link StatTile}. */
export interface StatTileProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  to?: string;
}

/**
 * A single headline number with label — used instead of a chart when the job is "one number".
 * @param props - Tile props.
 * @returns The tile.
 */
export function StatTile({ label, value, detail, icon, to }: StatTileProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-sm font-medium text-ink-muted">
        {label}
        {icon && (
          <span aria-hidden className="text-ink-muted">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 font-display text-4xl font-bold tabular-nums text-ink">{value}</div>
      {detail && <div className="mt-1 text-sm text-ink-muted">{detail}</div>}
    </>
  );
  const cls = 'block rounded-panel border border-line bg-surface p-4';
  return to ? (
    <Link to={to} className={cn(cls, 'hover:border-line-strong')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Props for {@link EmptyState}. */
export interface EmptyStateProps {
  title: string;
  message: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

/**
 * Empty state that tells the user what to do next (§2.10).
 * @param props - Empty-state props.
 * @returns The empty state.
 */
export function EmptyState({ title, message, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {icon && (
        <div aria-hidden className="text-ink-muted">
          {icon}
        </div>
      )}
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-muted">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Loading placeholder announced politely to screen readers.
 * @param props - Optional label.
 * @returns The loading block.
 */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-ink-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/**
 * Error block with a retry action.
 * @param props - Message and retry callback.
 * @returns The error block.
 */
export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
      <AlertTriangle className="size-6 text-bad" aria-hidden />
      <p className="text-ink">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
