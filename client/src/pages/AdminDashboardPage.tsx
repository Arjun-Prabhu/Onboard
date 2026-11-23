/**
 * @file Organize → Home: one list called "Needs your attention" (§1.2a, journey B in §2.10).
 *
 * A first-time organizer should know what to do within seconds, so the page answers a single
 * question: what needs me today? Every row is one plain sentence with one button:
 *  - a session short on volunteers → Find volunteers (2 clicks to assign, FR-22/FR-24);
 *  - an hour entry waiting → Approve right here (1 click, FR-19);
 *  - checklists expiring, people waiting in New volunteers, volunteers to re-engage → Open.
 * The numbers that used to fill this page live in Reports. A brand-new org sees a short
 * "Get started" checklist instead of an empty list.
 */
import { MyOwnershipOffers } from '@/features/org/OwnershipOffers';
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  ListChecks,
  type LucideIcon,
  UserPlus,
  UserRoundSearch,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { HourStatus, RiskLevel } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { formatDate, formatTimeRange } from '@shared/time';
import { Button, ButtonLink } from '@/components/Button';
import { ErrorBlock, Loading, PageHeader, Panel } from '@/components/Layout';
import { useUser } from '@/context/AuthContext';
import { useManagedOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Greeting by time of day.
 * @returns "morning", "afternoon" or "evening".
 */
function partOfDay(): string {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

/**
 * "1 volunteer" / "3 volunteers".
 * @param n - Count.
 * @param word - Singular noun.
 * @param plural - Plural form when it isn't just "+s".
 * @returns Counted phrase.
 */
const count = (n: number, word: string, plural = `${word}s`) => `${n} ${n === 1 ? word : plural}`;

/** One row of the attention list. */
function AttentionRow({
  icon: Icon,
  tone,
  children,
  action,
}: {
  icon: LucideIcon;
  tone: 'bad' | 'warn' | 'info';
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5">
      <div className="flex min-w-[16rem] flex-1 items-start gap-3">
        <Icon
          className={cn(
            'mt-0.5 size-5 shrink-0',
            tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-primary',
          )}
          aria-hidden
        />
        <div className="min-w-0">{children}</div>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

/** One step of the "Get started" checklist. */
interface Step {
  done: boolean;
  label: string;
  to: string;
  action: string;
}

/**
 * The Organize home page.
 * @returns The page.
 */
export default function AdminDashboardPage() {
  const user = useUser();
  const { org, can, terms } = useManagedOrg();
  const toast = useToast();
  const [busy, setBusy] = useState<string>();
  const data = useAsync(
    () =>
      Promise.all([
        api.dashboard.admin(org.id),
        api.risk.sessions(org.id),
        api.risk.inactivity(org.id),
        can('hours.review')
          ? api.hours.list(org.id, { status: HourStatus.PENDING })
          : Promise.resolve([]),
        api.sites.list(org.id),
        api.programs.list(org.id),
      ]),
    [org.id],
  );

  if (data.loading && !data.data) return <Loading />;
  if (data.error || !data.data)
    return <ErrorBlock message={data.error ?? 'Could not load.'} onRetry={data.reload} />;
  const [stats, risks, inactive, pending, sites, programs] = data.data;
  const shortStaffed = risks.filter((r) => r.level !== RiskLevel.LOW);
  // You can't approve your own hours, so they never show up here.
  const reviewable = pending.filter((h) => h.userId !== user.id);

  /**
   * Approves one hour entry in place (1 click).
   * @param id - Hour log id.
   * @param name - Volunteer first name for the message.
   */
  const approve = async (id: string, name: string) => {
    setBusy(id);
    try {
      await api.hours.review(id, HourStatus.APPROVED);
      toast.show(`Approved ${name}'s hours.`);
      data.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  const steps: Step[] = [
    {
      done: sites.length > 0,
      label: `Add a ${terms.site} where you serve`,
      to: '/sites',
      action: `Add ${terms.site}`,
    },
    {
      done: programs.length > 0,
      label: `Add a program (a club, season or shift that repeats) at that ${terms.site}`,
      to: '/programs',
      action: 'Add program',
    },
    {
      done: stats.upcomingSessions > 0,
      label: 'Schedule your first session',
      to: '/sessions?new=1',
      action: 'Schedule',
    },
    {
      done: stats.activeVolunteers > 0,
      label: 'Add your volunteers, or share your application link',
      to: '/volunteers',
      action: 'Add volunteers',
    },
  ];
  const gettingStarted = steps.some((s) => !s.done) && can('sites.edit');

  const rows: ReactNode[] = [];
  for (const r of shortStaffed.slice(0, 3)) {
    const open = Math.max(0, r.session.volunteersNeeded - r.session.signedUpCount);
    rows.push(
      <AttentionRow
        key={r.session.id}
        icon={AlertTriangle}
        tone={r.level === RiskLevel.HIGH ? 'bad' : 'warn'}
        action={
          <ButtonLink to={`/sessions/${r.session.id}`} size="sm" variant="primary">
            Find volunteers
          </ButtonLink>
        }
      >
        <p className="font-semibold text-ink">
          {r.session.site.name} needs {open ? count(open, 'more volunteer') : 'backup volunteers'}
        </p>
        <p className="text-sm text-ink-muted">
          {r.session.title} · {formatDate(r.session.date, { year: undefined })},{' '}
          {formatTimeRange(r.session.startTime, r.session.endTime)}
        </p>
      </AttentionRow>,
    );
  }
  for (const h of reviewable.slice(0, 3)) {
    rows.push(
      <AttentionRow
        key={h.id}
        icon={Clock}
        tone="info"
        action={
          <Button
            size="sm"
            icon={<Check className="size-4" aria-hidden />}
            loading={busy === h.id}
            onClick={() => void approve(h.id, h.volunteer.firstName)}
            aria-label={`Approve ${h.hours} hours for ${h.volunteer.firstName} ${h.volunteer.lastName}`}
          >
            Approve
          </Button>
        }
      >
        <p className="font-semibold text-ink">
          {h.volunteer.firstName} {h.volunteer.lastName} logged {h.hours} h
        </p>
        <p className="text-sm text-ink-muted">
          {formatDate(h.date, { year: undefined })} · {h.description}
        </p>
      </AttentionRow>,
    );
  }
  if (reviewable.length > 3)
    rows.push(
      <AttentionRow
        key="more-hours"
        icon={Clock}
        tone="info"
        action={
          <ButtonLink to="/hours" size="sm">
            Review all
          </ButtonLink>
        }
      >
        <p className="font-semibold text-ink">
          {count(reviewable.length - 3, 'more hour entry is', 'more hour entries are')} waiting for
          approval
        </p>
      </AttentionRow>,
    );
  if (stats.requirementsDue > 0)
    rows.push(
      <AttentionRow
        key="checklists"
        icon={ListChecks}
        tone="warn"
        action={
          <ButtonLink to="/volunteers" size="sm">
            Open volunteers
          </ButtonLink>
        }
      >
        <p className="font-semibold text-ink">
          {count(stats.requirementsDue, 'volunteer needs', 'volunteers need')} a requirement renewed
        </p>
        <p className="text-sm text-ink-muted">
          Something on their checklist expires soon or has expired.
        </p>
      </AttentionRow>,
    );
  if (stats.applicantsInPipeline > 0 && can('volunteers.pipeline'))
    rows.push(
      <AttentionRow
        key="applicants"
        icon={UserPlus}
        tone="info"
        action={
          <ButtonLink to="/recruitment" size="sm">
            Review
          </ButtonLink>
        }
      >
        <p className="font-semibold text-ink">
          {count(stats.applicantsInPipeline, 'new volunteer is', 'new volunteers are')} on the way
          in
        </p>
        <p className="text-sm text-ink-muted">
          Applied, interviewed or trained, but not ready yet.
        </p>
      </AttentionRow>,
    );
  if (inactive.length > 0)
    rows.push(
      <AttentionRow
        key="inactive"
        icon={UserRoundSearch}
        tone="info"
        action={
          <ButtonLink to="/volunteers" size="sm">
            See who
          </ButtonLink>
        }
      >
        <p className="font-semibold text-ink">
          {count(inactive.length, 'volunteer hasn’t', 'volunteers haven’t')} helped in a month
        </p>
        <p className="text-sm text-ink-muted">
          {inactive
            .slice(0, 3)
            .map((a) => `${a.volunteer.firstName} ${a.volunteer.lastName}`)
            .join(', ')}
          {inactive.length > 3 ? '…' : ''} — a quick note might bring them back.
        </p>
      </AttentionRow>,
    );

  return (
    <>
      <PageHeader
        title={`Good ${partOfDay()}, ${user.firstName}`}
        actions={
          can('sessions.edit') && (
            <ButtonLink
              to="/sessions?new=1"
              variant="primary"
              icon={<CalendarPlus className="size-4" aria-hidden />}
            >
              Schedule a session
            </ButtonLink>
          )
        }
      />
      <MyOwnershipOffers />

      <div className="max-w-4xl space-y-6">
        {gettingStarted && (
          <Panel title="Get started" description={`Four steps to get ${org.name} running.`}>
            <ol className="space-y-2">
              {steps.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      'flex items-center gap-2',
                      s.done && 'text-ink-muted line-through',
                    )}
                  >
                    {s.done ? (
                      <CheckCircle2 className="size-5 text-good" aria-hidden />
                    ) : (
                      <Circle className="size-5 text-ink-muted" aria-hidden />
                    )}
                    <span className="sr-only">{s.done ? 'Done: ' : 'To do: '}</span>
                    {s.label}
                  </span>
                  {!s.done && (
                    <ButtonLink to={s.to} size="sm">
                      {s.action}
                    </ButtonLink>
                  )}
                </li>
              ))}
            </ol>
          </Panel>
        )}

        <Panel title="Needs your attention" bodyClassName="p-0" id="attention">
          <div data-tour="attention">
            {rows.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-8">
                <CheckCircle2 className="size-6 text-good" aria-hidden />
                <div>
                  <p className="font-semibold text-ink">You’re all caught up.</p>
                  <p className="text-sm text-ink-muted">
                    Every upcoming session has enough volunteers and nothing is waiting for you.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">{rows}</ul>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
