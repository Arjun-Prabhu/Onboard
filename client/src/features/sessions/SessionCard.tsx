/**
 * @file Session summary card used in lists and home pages: what, where, when, how many spots are
 * open, and one action. Skills, priority flags and other details live on the session page.
 */
import { CalendarDays, Clock, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { labelOf, SessionType } from '@shared/enums';
import { formatDate, formatTimeRange } from '@shared/time';
import type { SessionView } from '@shared/types';
import { Badge, PegMeter, StatusBadge } from '@/components/Status';

/** Props for {@link SessionCard}. */
export interface SessionCardProps {
  session: SessionView;
  /** Action area (e.g. Sign up button). */
  actions?: ReactNode;
  /** Extra line such as a match reason. */
  note?: ReactNode;
  /** Show the owning organization (cross-org lists). */
  showOrg?: boolean;
}

/**
 * A compact, scannable session card. The title links to the session detail page.
 * @param props - Card props.
 * @returns The card.
 */
export function SessionCard({ session: s, actions, note, showOrg }: SessionCardProps) {
  const badge =
    s.status !== 'SCHEDULED' ? (
      <StatusBadge status={s.status} />
    ) : s.type !== SessionType.SHIFT ? (
      <Badge tone="info">{labelOf(s.type)}</Badge>
    ) : s.openToGuests ? (
      <Badge tone="good">Open to everyone</Badge>
    ) : null;
  return (
    <article className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-tight">
            <Link to={`/sessions/${s.id}`} className="hover:text-primary hover:underline">
              {s.title}
            </Link>
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {showOrg && <span className="shrink-0 font-medium text-ink">{s.org.name} ·</span>}
            <span className="truncate">{s.site.name}</span>
          </p>
        </div>
        {/* One badge at most, so the card reads at a glance; details live on the session page. */}
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-4 text-ink-muted" aria-hidden />
          {formatDate(s.date, { year: undefined })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-4 text-ink-muted" aria-hidden />
          {formatTimeRange(s.startTime, s.endTime)}
        </span>
      </div>
      {note && <p className="text-sm text-ink-muted">{note}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <PegMeter
          filled={s.signedUpCount}
          total={s.volunteersNeeded}
          waitlist={s.waitlistCount}
          size="sm"
        />
        {actions}
      </div>
    </article>
  );
}
