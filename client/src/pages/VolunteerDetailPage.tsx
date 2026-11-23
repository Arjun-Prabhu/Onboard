/**
 * @file Admin view of one volunteer: profile, requirements checklist, pipeline history,
 * sessions and hours.
 */
import { Mail, MapPin, Phone, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  DAY_NAMES,
  HourStatus,
  labelOf,
  PIPELINE_ORDER,
  SignUpStatus,
  VolunteerStatus,
} from '@shared/enums';
import { messageOf } from '@shared/errors';
import { formatDate, formatTimeRange } from '@shared/time';
import { Button } from '@/components/Button';
import { FormField, Select } from '@/components/Form';
import { ConfirmDialog } from '@/components/Modal';
import { ErrorBlock, Loading, PageHeader, Panel, StatTile } from '@/components/Layout';
import { Badge, StatusBadge } from '@/components/Status';
import { useToast } from '@/context/ToastContext';
import { useManagedOrg } from '@/context/OrgContext';
import { RequirementsChecklist } from '@/features/volunteers/RequirementsChecklist';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';

/**
 * The volunteer detail page.
 * @returns The page.
 */
export default function VolunteerDetailPage() {
  const { id = '' } = useParams();
  const { org, terms, can } = useManagedOrg();
  const toast = useToast();
  const [busy, setBusy] = useState<string>();
  const [removing, setRemoving] = useState(false);
  const navigate = useNavigate();
  const data = useAsync(
    () =>
      Promise.all([
        api.volunteers.get(org.id, id),
        api.signups.forVolunteer(org.id, id),
        api.hours.list(org.id, { userId: id }),
      ]),
    [org.id, id],
  );

  const { hash } = useLocation();
  const loaded = !!data.data;
  // Links like "Open checklist" land on #checklist once the page has loaded.
  useEffect(() => {
    if (loaded && hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [loaded, hash]);

  if (data.loading && !data.data) return <Loading />;
  if (data.error || !data.data)
    return <ErrorBlock message={data.error ?? 'Not found.'} onRetry={data.reload} />;
  const [v, signups, hours] = data.data;
  const completed = signups.filter((s) => s.status === SignUpStatus.COMPLETED).length;
  const noShows = signups.filter((s) => s.status === SignUpStatus.NO_SHOW).length;
  const approved = hours
    .filter((h) => h.status === HourStatus.APPROVED)
    .reduce((s, h) => s + h.hours, 0);

  /**
   * Runs an admin action and refreshes.
   * @param key - Busy key.
   * @param fn - API call.
   * @param msg - Success message.
   */
  /** Removes the volunteer from this org, then goes back to the list. */
  const remove = async () => {
    setBusy('remove');
    try {
      const { cancelledSignUps: n } = await api.volunteers.remove(org.id, v.id);
      toast.show(
        `${v.firstName} was removed from ${org.name}.` +
          (n ? ` ${n} upcoming ${n === 1 ? 'shift was' : 'shifts were'} cancelled.` : ''),
      );
      navigate('/volunteers');
    } catch (err) {
      toast.show(messageOf(err), 'error');
      setBusy(undefined);
    }
  };

  const act = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    try {
      await fn();
      toast.show(msg);
      data.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Volunteers', to: '/volunteers' },
          { label: `${v.firstName} ${v.lastName}` },
        ]}
        title={`${v.firstName} ${v.lastName}`}
        description={v.affiliation}
        actions={
          <>
            {v.status && <StatusBadge status={v.status} className="text-sm" />}
            {v.status && can('volunteers.pipeline') && (
              <Button
                variant="secondary"
                icon={<UserMinus className="size-4" aria-hidden />}
                onClick={() => setRemoving(true)}
              >
                Remove from {org.name}
              </Button>
            )}
          </>
        }
      />
      <ConfirmDialog
        open={removing}
        danger
        title={`Remove ${v.firstName} from ${org.name}?`}
        message={
          <ul className="list-disc space-y-1 pl-5">
            <li>Their upcoming shifts here are cancelled, and waitlisted volunteers move up.</li>
            <li>Their pipeline history and requirements checklist here are deleted.</li>
            <li>Their past shifts and hours stay, so reports and their certificate stay right.</li>
            <li>Their account and other organizations aren’t affected. They can apply again.</li>
          </ul>
        }
        confirmLabel="Remove volunteer"
        loading={busy === 'remove'}
        onCancel={() => setRemoving(false)}
        onConfirm={() => void remove()}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Approved hours" value={approved} />
        <StatTile label="Sessions completed" value={completed} />
        <StatTile
          label="Attendance"
          value={
            completed + noShows ? `${Math.round((completed / (completed + noShows)) * 100)}%` : '—'
          }
          detail={`${noShows} no-shows`}
        />
        <StatTile
          label="Experience"
          value={<span className="text-2xl">{labelOf(v.experienceLevel)}</span>}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Contact & skills">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="size-4 text-ink-muted" aria-hidden />
              <a className="text-primary underline" href={`mailto:${v.email}`}>
                {v.email}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="size-4 text-ink-muted" aria-hidden />
              {v.phone}
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="size-4 text-ink-muted" aria-hidden />
              ZIP {v.zip} · {v.hasTransportation ? 'Has transportation' : 'Needs transportation'}
            </li>
          </ul>
          <h3 className="mt-4 font-semibold">Skills</h3>
          <p className="text-sm text-ink-muted">{v.skills.join(', ')}</p>
          <h3 className="mt-4 font-semibold">Weekly availability</h3>
          <ul className="text-sm text-ink-muted">
            {v.availability.map((a) => (
              <li key={a.id}>
                {DAY_NAMES[a.dayOfWeek]}, {formatTimeRange(a.startTime, a.endTime)}
              </li>
            ))}
          </ul>
          {v.bio && (
            <>
              <h3 className="mt-4 font-semibold">Notes</h3>
              <p className="text-sm text-ink-muted">{v.bio}</p>
            </>
          )}
        </Panel>

        <Panel
          id="checklist"
          title="Requirements & pipeline"
          description={`Everything ${org.name} asks for before volunteers serve ${terms.participants}.`}
          actions={
            v.requirements.length > 0 && (
              <Badge tone={v.cleared ? 'good' : 'warn'}>
                {v.cleared ? 'All current' : 'Action needed'}
              </Badge>
            )
          }
        >
          <RequirementsChecklist
            orgId={org.id}
            volunteer={v}
            canEdit={can('volunteers.pipeline')}
            canEditList={can('org.settings')}
            onChanged={(next) => data.setData([next, signups, hours])}
          />
          <FormField
            label="Pipeline stage"
            className="mt-5 max-w-xs"
            hint="Changes are timestamped in the history below."
          >
            {(p) => (
              <Select
                {...p}
                value={v.status ?? ''}
                disabled={busy === 'status'}
                onChange={(e) =>
                  void act(
                    'status',
                    () => api.volunteers.setStatus(org.id, v.id, e.target.value as VolunteerStatus),
                    `Moved to ${labelOf(e.target.value)}.`,
                  )
                }
              >
                {PIPELINE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {labelOf(s)}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <h3 className="mt-5 font-semibold">History</h3>
          <ol className="mt-2 space-y-2 border-l-2 border-line pl-4 text-sm">
            {[...v.statusHistory].reverse().map((h) => (
              <li key={h.id}>
                <span className="font-medium">
                  {h.fromStatus ? `${labelOf(h.fromStatus)} → ` : ''}
                  {labelOf(h.toStatus)}
                </span>
                <span className="block text-ink-muted">
                  {formatDate(h.changedAt.slice(0, 10))} by {h.changedBy}
                  {h.note ? ` — ${h.note}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel className="mt-6" title="Sessions" bodyClassName="p-0">
        {signups.length === 0 ? (
          <p className="p-5 text-sm text-ink-muted">No sessions yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {[...signups]
              .reverse()
              .slice(0, 12)
              .map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5"
                >
                  <span className="min-w-0">
                    <Link
                      to={`/sessions/${s.session.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {s.session.title}
                    </Link>
                    <span className="block text-sm text-ink-muted">
                      {s.session.site.name} · {formatDate(s.session.date, { year: undefined })}
                    </span>
                  </span>
                  <StatusBadge status={s.status} />
                </li>
              ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
