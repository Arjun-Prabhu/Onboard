/**
 * @file Month calendar (FR-17), for an org (Manage) or for the person's own sign-ups. Each session chip shows staffing status with an icon + text
 * label + color, so it never relies on color alone. On phones it becomes an agenda list.
 */
import {
  AlertOctagon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clock3,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SessionStatus, SignUpStatus } from '@shared/enums';
import { formatDate, formatTime, parseDate, toIsoDate, todayIso } from '@shared/time';
import type { SessionView } from '@shared/types';
import { Button } from '@/components/Button';
import { ErrorBlock, Loading, PageHeader } from '@/components/Layout';
import { useOrg } from '@/context/OrgContext';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Staffing state for a calendar chip. */
type Staffing = 'full' | 'partial' | 'low' | 'cancelled';

/**
 * Classifies a session's staffing.
 * @param s - Session.
 * @returns Staffing state.
 */
function staffingOf(s: SessionView): Staffing {
  if (s.status === SessionStatus.CANCELLED) return 'cancelled';
  if (s.signedUpCount >= s.volunteersNeeded) return 'full';
  return s.signedUpCount / s.volunteersNeeded >= 0.5 ? 'partial' : 'low';
}

const STAFFING = {
  full: { label: 'Staffed', icon: CheckCircle2, cls: 'border-good/40 bg-good-soft text-good' },
  partial: {
    label: 'Needs volunteers',
    icon: Clock3,
    cls: 'border-warn/40 bg-warn-soft text-warn',
  },
  low: { label: 'Understaffed', icon: AlertOctagon, cls: 'border-bad/40 bg-bad-soft text-bad' },
  cancelled: {
    label: 'Cancelled',
    icon: CircleSlash,
    cls: 'border-line bg-surface-2 text-ink-muted line-through',
  },
} as const;

/**
 * Loads the sessions for a calendar scope.
 * @param scope - `org` = every session of the active org; `mine` = the person's own sign-ups.
 * @param orgId - Active managed org (org scope only).
 * @returns Sessions to plot.
 */
async function loadSessions(
  scope: 'org' | 'mine',
  orgId: string | undefined,
): Promise<SessionView[]> {
  if (scope === 'org' && orgId) return api.sessions.list(orgId, { includePast: true });
  const mine = await api.signups.mine();
  return mine.filter((s) => s.status !== SignUpStatus.CANCELLED).map((s) => s.session);
}

/**
 * The calendar page (FR-17). Used for Manage → Calendar and My volunteering → Calendar.
 * @param props - Which sessions to show.
 * @returns The page.
 */
export default function CalendarPage({ scope }: { scope: 'org' | 'mine' }) {
  const { activeOrg } = useOrg();
  const orgId = scope === 'org' ? activeOrg?.id : undefined;
  const [cursor, setCursor] = useState(() => todayIso().slice(0, 7));
  const sessions = useAsync(() => loadSessions(scope, orgId), [scope, orgId]);
  const today = todayIso();

  const { weeks, byDate, monthLabel } = useMemo(() => {
    const first = parseDate(`${cursor}-01`);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const days: string[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(toIsoDate(d));
    }
    const map = new Map<string, SessionView[]>();
    for (const s of sessions.data ?? []) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return {
      weeks: Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7)),
      byDate: map,
      monthLabel: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }, [cursor, sessions.data]);

  /**
   * Moves the calendar by whole months.
   * @param delta - Months to move.
   */
  const shift = (delta: number) => {
    const d = parseDate(`${cursor}-01`);
    d.setMonth(d.getMonth() + delta);
    setCursor(toIsoDate(d).slice(0, 7));
  };

  if (sessions.error) return <ErrorBlock message={sessions.error} onRetry={sessions.reload} />;
  const monthSessions = (sessions.data ?? []).filter((s) => s.date.startsWith(cursor));

  return (
    <>
      <PageHeader
        title={scope === 'org' ? 'Calendar' : 'My calendar'}
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => shift(-1)}
              aria-label="Previous month"
              icon={<ChevronLeft className="size-4" aria-hidden />}
            />
            <Button variant="secondary" size="sm" onClick={() => setCursor(today.slice(0, 7))}>
              Today
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => shift(1)}
              aria-label="Next month"
              icon={<ChevronRight className="size-4" aria-hidden />}
            />
          </div>
        }
      />
      <h2 className="mb-3 text-2xl font-semibold" aria-live="polite">
        {monthLabel}
      </h2>
      <ul className="mb-4 flex flex-wrap gap-3 text-sm" aria-label="Legend">
        {(Object.keys(STAFFING) as Staffing[]).map((k) => {
          const S = STAFFING[k];
          return (
            <li
              key={k}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
                S.cls,
                'no-underline',
              )}
            >
              <S.icon className="size-3.5" aria-hidden />
              {S.label}
            </li>
          );
        })}
      </ul>

      {sessions.loading && !sessions.data ? (
        <Loading />
      ) : (
        <>
          {/* Grid for tablet/desktop */}
          <div className="hidden overflow-hidden rounded-panel border border-line bg-surface md:block">
            <table
              className="w-full table-fixed border-collapse"
              aria-label={`Sessions in ${monthLabel}`}
            >
              <thead>
                <tr>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <th
                      key={d}
                      scope="col"
                      className="border-b border-line bg-surface-2 py-2 text-sm font-semibold"
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week[0]}>
                    {week.map((day) => {
                      const inMonth = day.startsWith(cursor);
                      const items = byDate.get(day) ?? [];
                      return (
                        <td
                          key={day}
                          className={cn(
                            'h-32 border-b border-r border-line p-1.5 align-top last:border-r-0',
                            !inMonth && 'bg-surface-2/60',
                          )}
                        >
                          <div
                            className={cn(
                              'mb-1 text-right text-sm',
                              day === today ? 'font-bold' : inMonth ? 'text-ink' : 'text-ink-muted',
                            )}
                          >
                            {day === today ? (
                              <span className="inline-grid size-7 place-items-center rounded-full bg-accent text-on-accent">
                                {parseDate(day).getDate()}
                                <span className="sr-only"> (today)</span>
                              </span>
                            ) : (
                              parseDate(day).getDate()
                            )}
                          </div>
                          <ul className="space-y-1">
                            {items.slice(0, 3).map((s) => {
                              const S = STAFFING[staffingOf(s)];
                              return (
                                <li key={s.id}>
                                  <Link
                                    to={`/sessions/${s.id}`}
                                    className={cn(
                                      'flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium',
                                      S.cls,
                                    )}
                                    title={`${s.site.name}: ${s.title}`}
                                  >
                                    <S.icon className="size-3 shrink-0" aria-hidden />
                                    <span className="truncate">
                                      {formatTime(s.startTime).replace(':00', '')}{' '}
                                      {s.site.name.split(' ')[0]}
                                    </span>
                                    <span className="sr-only">, {S.label}</span>
                                  </Link>
                                </li>
                              );
                            })}
                            {items.length > 3 && (
                              <li className="px-1 text-xs text-ink-muted">
                                +{items.length - 3} more
                              </li>
                            )}
                          </ul>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Agenda for phones */}
          <ul className="space-y-2 md:hidden">
            {monthSessions.length === 0 && (
              <li className="text-sm text-ink-muted">No sessions this month.</li>
            )}
            {monthSessions.map((s) => {
              const S = STAFFING[staffingOf(s)];
              return (
                <li key={s.id}>
                  <Link
                    to={`/sessions/${s.id}`}
                    className="flex items-center gap-3 rounded-panel border border-line bg-surface p-3"
                  >
                    <span className="w-14 shrink-0 text-center font-display text-lg font-bold leading-tight">
                      {formatDate(s.date, {
                        weekday: 'short',
                        month: undefined,
                        year: undefined,
                        day: 'numeric',
                      })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{s.site.name}</span>
                      <span className="block truncate text-sm text-ink-muted">
                        {formatTime(s.startTime)} · {s.title}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 text-xs',
                        S.cls,
                      )}
                    >
                      <S.icon className="size-3" aria-hidden />
                      {S.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
