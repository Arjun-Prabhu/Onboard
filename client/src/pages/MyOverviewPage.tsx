/**
 * @file Volunteer → Home — journey A (§2.10), across EVERY org the person serves. Three things
 * only: your next shift (with "check in" on the day), three suggested shifts, and your hours.
 * Applications still in progress show their steps; everything else lives one click away.
 */
import { MyOwnershipOffers } from '@/features/org/OwnershipOffers';
import { Award, CalendarDays, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HourStatus, labelOf, PIPELINE_ORDER, SignUpStatus, VolunteerStatus } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { formatDate, formatTimeRange, todayIso } from '@shared/time';
import { Button, ButtonLink } from '@/components/Button';
import { EmptyState, ErrorBlock, Loading, PageHeader, Panel } from '@/components/Layout';
import { useUser } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { SessionCard } from '@/features/sessions/SessionCard';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Where a person is in one org's pipeline, as ordered steps.
 * @param props - Current status.
 * @returns The progress list.
 */
function PipelineProgress({ status }: { status: VolunteerStatus }) {
  const steps: VolunteerStatus[] = PIPELINE_ORDER.filter((s) => s !== VolunteerStatus.INACTIVE);
  const current = steps.indexOf(status);
  return (
    <ol className="mt-2 grid grid-cols-4 gap-1" aria-label="Application progress">
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? 'step' : undefined}
          className={cn(
            'rounded px-2 py-1 text-xs',
            i < current
              ? 'bg-good-soft text-good'
              : i === current
                ? 'bg-primary-soft font-semibold text-primary'
                : 'bg-surface-2 text-ink-muted',
          )}
        >
          {labelOf(s)}
        </li>
      ))}
    </ol>
  );
}

/**
 * The volunteer home page.
 * @returns The page.
 */
export default function MyOverviewPage() {
  const user = useUser();
  const { affiliations } = useOrg();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string>();
  const data = useAsync(
    () => Promise.all([api.matching.forMe(3), api.signups.mine(), api.hours.mine()]),
    [user.id],
  );

  if (data.loading && !data.data) return <Loading />;
  if (data.error || !data.data)
    return <ErrorBlock message={data.error ?? 'Could not load.'} onRetry={data.reload} />;
  const [recommended, signups, hours] = data.data;
  const today = todayIso();
  const upcoming = signups
    .filter(
      (s) =>
        s.session.date >= today &&
        (s.status === SignUpStatus.SIGNED_UP ||
          s.status === SignUpStatus.WAITLISTED ||
          s.status === SignUpStatus.CHECKED_IN),
    )
    .sort((a, b) =>
      (a.session.date + a.session.startTime).localeCompare(b.session.date + b.session.startTime),
    );
  const next = upcoming[0];
  const approved = hours
    .filter((h) => h.status === HourStatus.APPROVED)
    .reduce((s, h) => s + h.hours, 0);
  const activeSomewhere = affiliations.some((a) => a.volunteerStatus === VolunteerStatus.ACTIVE);
  // Applications still on their way through an org's steps.
  const applying = affiliations.filter(
    (a) =>
      a.volunteerStatus &&
      a.volunteerStatus !== VolunteerStatus.ACTIVE &&
      a.volunteerStatus !== VolunteerStatus.INACTIVE,
  );

  /**
   * Runs one action, then refreshes.
   * @param id - Busy key.
   * @param fn - API call returning a message.
   */
  const run = async (id: string, fn: () => Promise<string>) => {
    setBusyId(id);
    try {
      toast.show(await fn());
      data.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <>
      <PageHeader title={`Hi, ${user.firstName}`} />

      <div className="max-w-5xl space-y-6">
        <MyOwnershipOffers />
        <Panel title="Your next shift">
          {!next ? (
            <EmptyState
              title="Nothing scheduled yet"
              message="Pick one of the suggestions below, or find a shift that fits you."
              action={
                <ButtonLink to="/me/find" variant="primary">
                  Find a shift
                </ButtonLink>
              }
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <Link
                  to={`/sessions/${next.session.id}`}
                  className="text-xl font-semibold text-ink hover:text-primary hover:underline"
                >
                  {next.session.title}
                </Link>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-4" aria-hidden />
                    {next.session.date === today
                      ? 'Today'
                      : formatDate(next.session.date, { year: undefined })}
                    , {formatTimeRange(next.session.startTime, next.session.endTime)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" aria-hidden />
                    {next.session.site.name} · {next.session.org.name}
                  </span>
                </p>
                {next.status === SignUpStatus.WAITLISTED && (
                  <p className="mt-1 text-sm text-warn">
                    You’re on the waiting list; we’ll move you in if a spot opens.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {next.session.date === today && next.status === SignUpStatus.SIGNED_UP ? (
                  <Button
                    size="lg"
                    loading={busyId === next.id}
                    onClick={() =>
                      void run(next.id, async () => {
                        await api.signups.checkIn(next.id);
                        return 'You’re checked in. Thanks for coming!';
                      })
                    }
                  >
                    I’m here — check in
                  </Button>
                ) : (
                  <ButtonLink to={`/sessions/${next.session.id}`}>Details</ButtonLink>
                )}
                {upcoming.length > 1 && (
                  <ButtonLink to="/me/schedule" variant="ghost">
                    {upcoming.length - 1} more coming up
                  </ButtonLink>
                )}
              </div>
            </div>
          )}
        </Panel>

        {applying.map((a) => (
          <Panel key={a.org.id} title={`Your application to ${a.org.name}`}>
            <PipelineProgress status={a.volunteerStatus as VolunteerStatus} />
            <p className="mt-2 text-sm text-ink-muted">
              Someone at {a.org.name} will move you to the next step. Until then you can still help
              at events that are open to everyone.
            </p>
          </Panel>
        ))}

        <Panel
          id="recommended"
          title="Suggested for you"
          actions={
            <ButtonLink to="/me/find" size="sm">
              See all shifts
            </ButtonLink>
          }
        >
          <div data-tour="recommended">
            {recommended.length === 0 ? (
              <EmptyState
                title={activeSomewhere ? 'No matches right now' : 'Almost there'}
                message={
                  activeSomewhere
                    ? 'Every shift that fits your free times is full. Adding more free times helps.'
                    : 'Suggestions appear once an organization approves you. Events open to everyone show up here any time.'
                }
                action={<ButtonLink to="/me/profile">Update my free times</ButtonLink>}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {recommended.map((r) => (
                  <SessionCard
                    key={r.session.id}
                    session={r.session}
                    showOrg
                    note={r.asGuest ? 'You’d help once, as a guest.' : undefined}
                    actions={
                      <Button
                        size="sm"
                        loading={busyId === r.session.id}
                        onClick={() =>
                          void run(r.session.id, async () => {
                            const out = await api.signups.signUp(r.session.id);
                            return out.message;
                          })
                        }
                      >
                        {r.asGuest ? 'Help once' : 'Sign up'}
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>

        <section
          aria-label="Your hours"
          className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-5 py-4"
        >
          <p className="flex items-center gap-2 text-ink">
            <Award className="size-5 text-primary" aria-hidden />
            <span>
              You’ve given <span className="font-semibold">{approved} approved hours</span>. Thank
              you!
            </span>
          </p>
          <ButtonLink to="/me/hours" size="sm">
            My hours & certificate
          </ButtonLink>
        </section>
      </div>
    </>
  );
}
