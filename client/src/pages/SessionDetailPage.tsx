/**
 * @file Session detail: staffing, roster, waitlist, check-in/out and volunteer matching
 * (FR-14, FR-15, FR-16, FR-22).
 *
 * What a person can do here depends on their role IN THE SESSION'S ORG — not on a global role.
 * An Owner of one org viewing another org's event sees the volunteer view there.
 */
import { CalendarDays, Clock, MapPin, Pencil, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DEFAULT_ROLE, labelOf, SessionStatus, SessionType, SignUpStatus } from '@shared/enums';
import { termsOf } from '@shared/terms';
import { messageOf } from '@shared/errors';
import { can } from '@shared/permissions';
import { occupiesSeat } from '@shared/rules';
import { formatDate, formatTimeRange, todayIso } from '@shared/time';
import type { Program, RosterEntry, Site } from '@shared/types';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { FormField, Select } from '@/components/Form';
import { EmptyState, ErrorBlock, Loading, PageHeader, Panel } from '@/components/Layout';
import { ConfirmDialog } from '@/components/Modal';
import { Badge, PegMeter, StatusBadge } from '@/components/Status';
import { useUser } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { RecommendationList } from '@/features/matching/RecommendationList';
import { SessionFormModal } from '@/features/sessions/SessionFormModal';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';

/**
 * The session detail page.
 * @returns The page.
 */
export default function SessionDetailPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const { affiliations } = useOrg();
  const toast = useToast();
  const [busy, setBusy] = useState<string>();
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [role, setRole] = useState<string>('');

  const session = useAsync(() => api.sessions.get(id), [id]);
  const orgId = session.data?.org.id;
  const orgRole = affiliations.find((a) => a.org.id === orgId)?.role ?? null;
  const manages = can(orgRole, 'roster.manage');
  const canEdit = can(orgRole, 'sessions.edit');
  const matches = useAsync(
    () => (manages ? api.matching.recommend(id, 5) : Promise.resolve([])),
    [id, manages],
  );
  // Everyone who volunteers with this org, for "Add anyone" beside the ranked suggestions.
  const people = useAsync(
    () => (manages && orgId ? api.volunteers.list(orgId) : Promise.resolve([])),
    [manages, orgId],
  );
  const [pick, setPick] = useState('');
  const lookups = useAsync(
    () =>
      canEdit && orgId
        ? Promise.all([api.programs.list(orgId), api.sites.list(orgId)])
        : Promise.resolve<[Program[], Site[]]>([[], []]),
    [canEdit, orgId],
  );

  if (session.loading && !session.data) return <Loading />;
  if (session.error || !session.data)
    return <ErrorBlock message={session.error ?? 'Session not found.'} onRetry={session.reload} />;
  const s = session.data;
  const today = todayIso();
  const isOpen = s.status === SessionStatus.SCHEDULED && s.date >= today;
  const isEvent = s.type === SessionType.EVENT && s.roleSlots.length > 0;
  const mine = s.roster.find((r) => r.userId === user.id);
  const seated = s.roster.filter(occupiesSeat);
  const waitlist = s.roster.filter((r) => r.status === SignUpStatus.WAITLISTED);
  const myStanding = affiliations.find((a) => a.org.id === s.org.id)?.volunteerStatus;
  const joinAsGuest = myStanding !== 'ACTIVE';
  // People who help run this org never sign up as one-time guests of it.
  const leadsWithoutVolunteering = !!orgRole && joinAsGuest;
  const slotRole =
    isEvent && !s.roleSlots.some((r) => r.role === role) ? s.roleSlots[0].role : role;

  /**
   * Runs an action with a busy key, a toast, and a refresh.
   * @param key - Busy key.
   * @param action - The API call.
   * @param success - Success message (or function of result).
   */
  const run = async <T,>(
    key: string,
    action: () => Promise<T>,
    success: string | ((r: T) => string),
  ) => {
    setBusy(key);
    try {
      const r = await action();
      toast.show(typeof success === 'function' ? success(r) : success);
      session.reload();
      matches.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  /**
   * Inline actions for a roster row (1 click each).
   * @param r - Roster row.
   * @returns Buttons, or null if the viewer can't act on this row.
   */
  const rowActions = (r: RosterEntry) => {
    const self = r.userId === user.id;
    if (!manages && !self) return null;
    const canCheckIn =
      r.status === SignUpStatus.SIGNED_UP &&
      s.date <= today &&
      s.status !== SessionStatus.CANCELLED;
    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        {canCheckIn && (
          <Button
            size="sm"
            loading={busy === `in-${r.id}`}
            onClick={() =>
              void run(
                `in-${r.id}`,
                () => api.signups.checkIn(r.id),
                `${r.volunteer.firstName} checked in.`,
              )
            }
          >
            Check in
          </Button>
        )}
        {r.status === SignUpStatus.CHECKED_IN && (
          <Button
            size="sm"
            variant="accent"
            loading={busy === `out-${r.id}`}
            onClick={() =>
              void run(
                `out-${r.id}`,
                () => api.signups.checkOut(r.id),
                'Checked out. Hours were logged for approval.',
              )
            }
          >
            Check out
          </Button>
        )}
        {manages && canCheckIn && (
          <Button
            size="sm"
            variant="secondary"
            loading={busy === `ns-${r.id}`}
            onClick={() =>
              void run(
                `ns-${r.id}`,
                () => api.signups.markNoShow(r.id),
                `${r.volunteer.firstName} marked as a no-show.`,
              )
            }
          >
            No-show
          </Button>
        )}
        {(r.status === SignUpStatus.SIGNED_UP || r.status === SignUpStatus.WAITLISTED) &&
          isOpen && (
            <Button
              size="sm"
              variant="ghost"
              loading={busy === `c-${r.id}`}
              onClick={() =>
                void run(
                  `c-${r.id}`,
                  () => api.signups.cancel(r.id),
                  (out) =>
                    out.promoted
                      ? `Cancelled. ${out.promoted.firstName} moved in from the waitlist.`
                      : 'Sign-up cancelled.',
                )
              }
            >
              {self ? 'Cancel my spot' : 'Remove'}
            </Button>
          )}
      </div>
    );
  };

  const roleSelect = (label: string) =>
    isEvent && (
      <FormField label={label} className="w-52">
        {(p) => (
          <Select {...p} value={slotRole} onChange={(e) => setRole(e.target.value)}>
            {s.roleSlots.map((r) => (
              <option key={r.role}>{r.role}</option>
            ))}
          </Select>
        )}
      </FormField>
    );

  return (
    <>
      <PageHeader
        breadcrumbs={[
          // The title is the heading right below, so the trail stops at the list it came from.
          manages
            ? { label: 'Schedule', to: '/sessions' }
            : { label: 'Find a shift', to: '/me/find' },
        ]}
        title={s.title}
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {s.program.oneOff ? (
              <span>
                <span className="font-medium text-ink">One-time event</span>
                {!manages && ` · ${s.org.name}`}
              </span>
            ) : (
              <span>
                Session of{' '}
                {manages ? (
                  <Link
                    to="/programs"
                    className="font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {s.program.name}
                  </Link>
                ) : (
                  <span className="font-medium text-ink">{s.program.name}</span>
                )}
                {!manages && ` · ${s.org.name}`}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden />
              {s.site.name}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden />
              {formatDate(s.date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden />
              {formatTimeRange(s.startTime, s.endTime)}
            </span>
          </span>
        }
        actions={
          canEdit && s.status === SessionStatus.SCHEDULED ? (
            <>
              <Button
                variant="secondary"
                icon={<Pencil className="size-4" aria-hidden />}
                onClick={() => setEditOpen(true)}
              >
                Edit
              </Button>
              <Button
                variant="secondary"
                icon={<XCircle className="size-4" aria-hidden />}
                onClick={() => setCancelOpen(true)}
              >
                Cancel session
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel
            title="Staffing"
            actions={
              <div className="flex flex-wrap gap-2">
                {s.status !== SessionStatus.SCHEDULED && <StatusBadge status={s.status} />}
                <Badge tone="info">{labelOf(s.type)}</Badge>
                {s.openToGuests && <Badge tone="good">Open to everyone</Badge>}
                {s.site.priority && s.org.settings.features.prioritySites && (
                  <Badge>{termsOf(s.org).priority}</Badge>
                )}
              </div>
            }
          >
            <PegMeter
              filled={s.signedUpCount}
              total={s.volunteersNeeded}
              waitlist={s.waitlistCount}
            />
            {isEvent && (
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {s.roleSlots.map((slot) => (
                  <div
                    key={slot.role}
                    className="flex items-center justify-between gap-2 rounded-control border border-line px-3 py-2"
                  >
                    <dt className="text-sm font-medium">{slot.role}</dt>
                    <dd>
                      <PegMeter
                        filled={seated.filter((r) => r.role === slot.role).length}
                        total={slot.needed}
                        size="sm"
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {!mine && isOpen && leadsWithoutVolunteering && (
              <p className="mt-5 border-t border-line pt-4 text-sm text-ink-muted">
                You help run {s.org.name}, so you can add volunteers from the list below. To work
                shifts here yourself, join as a volunteer in{' '}
                <Link
                  to="/me/orgs"
                  className="font-medium text-primary underline underline-offset-2"
                >
                  My organizations
                </Link>
                .
              </p>
            )}
            {!mine && isOpen && !leadsWithoutVolunteering && (
              <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                {roleSelect('Your role')}
                <Button
                  size="lg"
                  loading={busy === 'signup'}
                  onClick={() =>
                    void run(
                      'signup',
                      () => api.signups.signUp(s.id, isEvent ? slotRole : undefined),
                      (o) => o.message,
                    )
                  }
                >
                  {s.signedUpCount >= s.volunteersNeeded
                    ? 'Join the waitlist'
                    : joinAsGuest && s.openToGuests
                      ? 'Help once as a guest'
                      : 'Sign up for this session'}
                </Button>
                {joinAsGuest && s.openToGuests && (
                  <p className="w-full text-sm text-ink-muted">
                    You don’t volunteer with {s.org.name}, so this is a one-time guest sign-up. It
                    won’t add {s.org.name} to your organizations.
                  </p>
                )}
              </div>
            )}
            {mine && (
              <p className="mt-4 text-sm font-medium text-ink">
                {mine.status === SignUpStatus.WAITLISTED
                  ? `You are #${mine.waitlistPosition} on the waitlist.`
                  : `You’re on this session${mine.role !== DEFAULT_ROLE ? ` as ${mine.role}` : ''}${mine.guest ? ' as a guest' : ''}.`}
              </p>
            )}
          </Panel>

          <Panel
            title="Roster"
            description={`${seated.length} signed up${waitlist.length ? ` · ${waitlist.length} waiting` : ''}`}
            bodyClassName="p-0 sm:p-5"
          >
            <DataTable<RosterEntry>
              caption="People on this session"
              rows={s.roster}
              rowKey={(r) => r.id}
              empty={
                <EmptyState
                  title="No one yet"
                  message={
                    manages
                      ? 'Assign a recommended volunteer to get started.'
                      : 'Be the first to sign up.'
                  }
                />
              }
              columns={[
                {
                  key: 'name',
                  header: 'Volunteer',
                  sortValue: (r) => r.volunteer.lastName,
                  render: (r) => (
                    <span className="font-medium">
                      {r.volunteer.firstName} {r.volunteer.lastName}
                      {r.guest && <Badge className="ml-2">Guest</Badge>}
                    </span>
                  ),
                },
                ...(isEvent
                  ? [{ key: 'role', header: 'Role', render: (r: RosterEntry) => r.role }]
                  : []),
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => (
                    <span className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      {r.waitlistPosition && (
                        <span className="text-xs text-ink-muted">#{r.waitlistPosition}</span>
                      )}
                    </span>
                  ),
                },
                { key: 'actions', header: 'Actions', render: rowActions, className: 'text-right' },
              ]}
            />
          </Panel>
        </div>

        <div className="space-y-6">
          {manages && (
            <Panel
              title="Add volunteers"
              description={`Best fits first: ${s.org.name} volunteers who are ready, free and not booked elsewhere.`}
            >
              {matches.loading && !matches.data ? (
                <Loading label="Finding the best fits…" />
              ) : (
                <>
                  {isOpen && <div className="mb-4">{roleSelect('Assign to role')}</div>}
                  <RecommendationList
                    matches={matches.data ?? []}
                    disabled={!isOpen}
                    busyId={busy?.startsWith('assign-') ? busy.slice(7) : undefined}
                    onAssign={(uid) =>
                      void run(
                        `assign-${uid}`,
                        () => api.signups.assign(s.id, uid, isEvent ? slotRole : undefined),
                        (o) => o.message,
                      )
                    }
                  />
                  {isOpen && (
                    <div className="mt-5 border-t border-line pt-4">
                      <FormField
                        label="Add anyone else"
                        hint="Every volunteer of this organization who isn’t on this session yet"
                      >
                        {(p) => (
                          <div className="flex gap-2">
                            <Select {...p} value={pick} onChange={(e) => setPick(e.target.value)}>
                              <option value="">Choose a volunteer…</option>
                              {(people.data ?? [])
                                .filter(
                                  (v) =>
                                    v.status !== 'INACTIVE' &&
                                    !s.roster.some((r) => r.userId === v.id),
                                )
                                .sort((a, b) => a.lastName.localeCompare(b.lastName))
                                .map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.firstName} {v.lastName}
                                    {v.status !== 'ACTIVE' ? ` (${labelOf(v.status ?? '')})` : ''}
                                  </option>
                                ))}
                            </Select>
                            <Button
                              disabled={!pick}
                              loading={busy === 'add-any'}
                              onClick={() =>
                                void run(
                                  'add-any',
                                  () =>
                                    api.signups.assign(s.id, pick, isEvent ? slotRole : undefined),
                                  (o) => {
                                    setPick('');
                                    return o.message;
                                  },
                                )
                              }
                            >
                              Add
                            </Button>
                          </div>
                        )}
                      </FormField>
                    </div>
                  )}
                </>
              )}
            </Panel>
          )}
          <Panel title="Details">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-semibold">Organization</dt>
                <dd className="text-ink-muted">{s.org.name}</dd>
              </div>
              {!s.program.oneOff && (
                <div>
                  <dt className="font-semibold">{termsOf(s.org).Participants}</dt>
                  <dd className="text-ink-muted">
                    {s.program.participantCount} {termsOf(s.org).participants}
                    {s.program.targetRatio
                      ? ` · target 1 volunteer per ${s.program.targetRatio}`
                      : ''}
                  </dd>
                </div>
              )}
              <div>
                <dt className="font-semibold">Skills needed</dt>
                <dd className="text-ink-muted">
                  {s.requiredSkills.length
                    ? s.requiredSkills.join(', ')
                    : 'None — everyone welcome'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Location</dt>
                <dd className="text-ink-muted">{s.site.address}</dd>
              </div>
              {manages && (
                <div>
                  <dt className="font-semibold">Site contact</dt>
                  <dd className="text-ink-muted">
                    {s.site.contactName} · {s.site.contactEmail}
                  </dd>
                </div>
              )}
            </dl>
          </Panel>
        </div>
      </div>

      {canEdit && lookups.data && (
        <SessionFormModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          programs={lookups.data[0]}
          sites={lookups.data[1]}
          org={s.org}
          session={s}
          onSaved={(saved) => {
            setEditOpen(false);
            session.setData(saved);
            matches.reload();
          }}
        />
      )}
      <ConfirmDialog
        open={cancelOpen}
        danger
        title="Cancel this session?"
        message={`${seated.length} signed-up volunteers will be released. This can’t be undone.`}
        confirmLabel="Cancel session"
        loading={busy === 'cancel'}
        onCancel={() => setCancelOpen(false)}
        onConfirm={() =>
          void run('cancel', () => api.sessions.cancel(s.id), 'Session cancelled.').then(() =>
            setCancelOpen(false),
          )
        }
      />
    </>
  );
}
