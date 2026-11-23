/**
 * @file Schedule → Programs (FR-10).
 *
 * Makes the difference between a program and a session obvious:
 *  - a **program** is the ongoing activity (a weekly club, a season, a Saturday clinic), shown as
 *    one card;
 *  - its **sessions** are the individual dates, listed inside that card with an
 *    "Add a session" button that starts the session form on that program.
 */
import { Archive, CalendarPlus, Info, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { labelOf } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { formatDate, formatTimeRange, todayIso } from '@shared/time';
import type { Program } from '@shared/types';
import { Button, ButtonLink } from '@/components/Button';
import { Checkbox } from '@/components/Form';
import { EmptyState, ErrorBlock, Loading, PageHeader } from '@/components/Layout';
import { ConfirmDialog } from '@/components/Modal';
import { Badge, PegMeter } from '@/components/Status';
import { useManagedOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { ProgramForm } from '@/features/programs/ProgramForm';
import { SessionFormModal } from '@/features/sessions/SessionFormModal';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';

/**
 * The programs page.
 * @returns The page.
 */
export default function ProgramsPage() {
  const { org, can, terms: t } = useManagedOrg();
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const data = useAsync(
    () =>
      Promise.all([
        api.programs.list(org.id, showArchived),
        api.sites.list(org.id),
        api.sessions.list(org.id, {}),
      ]),
    [org.id, showArchived],
  );
  const [programForm, setProgramForm] = useState<{ open: boolean; program?: Program }>({
    open: false,
  });
  /** Program to add a session to, or "one-off" for a one-time event. */
  const [sessionFor, setSessionFor] = useState<string>();
  const [toDelete, setToDelete] = useState<Program>();
  const [busy, setBusy] = useState(false);

  if (data.loading && !data.data) return <Loading />;
  if (data.error || !data.data)
    return <ErrorBlock message={data.error ?? 'Could not load.'} onRetry={data.reload} />;
  const [allPrograms, sites, sessions] = data.data;
  // The hidden "One-time events" programs are not programs to the user; their sessions are
  // listed on their own below.
  const programs = allPrograms.filter((p) => !p.oneOff);
  const oneOffIds = new Set(allPrograms.filter((p) => p.oneOff).map((p) => p.id));
  const oneOffSessions = sessions
    .filter((s) => oneOffIds.has(s.programId) && s.date >= todayIso() && s.status === 'SCHEDULED')
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const today = todayIso();
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? '—';
  const upcomingOf = (programId: string) =>
    sessions
      .filter((s) => s.programId === programId && s.date >= today && s.status === 'SCHEDULED')
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const canEditPrograms = can('sites.edit');

  /**
   * Archives or restores a program.
   * @param p - Program.
   */
  const toggleArchive = async (p: Program) => {
    try {
      const r = await api.programs.archive(p.id);
      toast.show(r.archived ? `${p.name} archived.` : `${p.name} restored.`);
      data.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Programs"
        actions={
          <>
            <Checkbox label="Show archived" checked={showArchived} onChange={setShowArchived} />
            {canEditPrograms && (
              <Button
                icon={<Plus className="size-4" aria-hidden />}
                disabled={!sites.length}
                onClick={() => setProgramForm({ open: true })}
              >
                Add program
              </Button>
            )}
          </>
        }
      />

      <p className="mb-5 flex max-w-3xl items-start gap-2 rounded-panel bg-surface-2 px-4 py-3 text-sm text-ink">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          A <strong>program</strong> is something you run again and again, like a weekly club or a
          season. Each <strong>session</strong> is one date of it, and that is what volunteers sign
          up for.
        </span>
      </p>

      {programs.length === 0 ? (
        <EmptyState
          title="No programs yet"
          message={
            sites.length
              ? `Add a program at one of your ${t.sites}, then add its sessions.`
              : `Add a ${t.site} first (Settings → ${t.Sites}), then a program there.`
          }
          action={
            sites.length ? (
              canEditPrograms && (
                <Button onClick={() => setProgramForm({ open: true })}>Add program</Button>
              )
            ) : (
              <ButtonLink to="/sites" variant="primary">
                Add a {t.site}
              </ButtonLink>
            )
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {programs.map((p) => {
            const upcoming = upcomingOf(p.id);
            return (
              <li key={p.id} className="flex flex-col rounded-panel border border-line bg-surface">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-ink">
                      {p.name}
                      {p.archived && <Badge className="ml-2 align-middle">Archived</Badge>}
                    </h2>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {siteName(p.siteId)} · {labelOf(p.type)},{' '}
                      {formatDate(p.startDate, { weekday: undefined })} –{' '}
                      {formatDate(p.endDate, { weekday: undefined })} · {p.participantCount}{' '}
                      {t.participants}
                    </p>
                  </div>
                  {canEditPrograms && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${p.name}`}
                        icon={<Pencil className="size-4" aria-hidden />}
                        onClick={() => setProgramForm({ open: true, program: p })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`${p.archived ? 'Restore' : 'Archive'} ${p.name}`}
                        icon={<Archive className="size-4" aria-hidden />}
                        onClick={() => void toggleArchive(p)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${p.name}`}
                        icon={<Trash2 className="size-4 text-bad" aria-hidden />}
                        onClick={() => setToDelete(p)}
                      />
                    </div>
                  )}
                </div>
                <div className="flex-1 px-5 py-3">
                  <h3 className="text-sm font-semibold text-ink-muted">
                    {upcoming.length
                      ? `Next sessions (${upcoming.length} coming up)`
                      : 'No sessions coming up'}
                  </h3>
                  {upcoming.length > 0 && (
                    <ul className="mt-1 divide-y divide-line">
                      {upcoming.slice(0, 3).map((s) => (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2"
                        >
                          <Link
                            to={`/sessions/${s.id}`}
                            className="min-w-0 hover:text-primary hover:underline"
                          >
                            <span className="font-medium">
                              {formatDate(s.date, { year: undefined })}
                            </span>
                            <span className="text-ink-muted">
                              {' '}
                              · {formatTimeRange(s.startTime, s.endTime)} · {s.title}
                            </span>
                          </Link>
                          <PegMeter filled={s.signedUpCount} total={s.volunteersNeeded} size="sm" />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {can('sessions.edit') && !p.archived && (
                  <div className="border-t border-line px-5 py-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<CalendarPlus className="size-4" aria-hidden />}
                      onClick={() => setSessionFor(p.id)}
                    >
                      Add a session
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section aria-labelledby="one-off-title" className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="one-off-title" className="text-xl font-semibold text-ink">
            One-time events
          </h2>
          {can('sessions.edit') && sites.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={<CalendarPlus className="size-4" aria-hidden />}
              onClick={() => setSessionFor('one-off')}
            >
              Add a one-time event
            </Button>
          )}
        </div>
        {oneOffSessions.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing coming up. Use this for things that happen once, like a fundraiser — no program
            needed.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
            {oneOffSessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
              >
                <Link
                  to={`/sessions/${s.id}`}
                  className="min-w-0 hover:text-primary hover:underline"
                >
                  <span className="font-medium">{s.title}</span>
                  <span className="text-ink-muted">
                    {' '}
                    · {formatDate(s.date, { year: undefined })},{' '}
                    {formatTimeRange(s.startTime, s.endTime)} · {s.site.name}
                  </span>
                </Link>
                <PegMeter filled={s.signedUpCount} total={s.volunteersNeeded} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ProgramForm
        open={programForm.open}
        program={programForm.program}
        sites={sites}
        onClose={() => setProgramForm({ open: false })}
        onSaved={() => {
          setProgramForm({ open: false });
          data.reload();
        }}
      />
      {can('sessions.edit') && (
        <SessionFormModal
          open={!!sessionFor}
          onClose={() => setSessionFor(undefined)}
          programs={allPrograms.filter((p) => !p.archived)}
          sites={sites}
          org={org}
          programId={sessionFor === 'one-off' ? undefined : sessionFor}
          oneOff={sessionFor === 'one-off'}
          onSaved={() => {
            setSessionFor(undefined);
            data.reload();
          }}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        danger
        title={`Delete ${toDelete?.name ?? ''}?`}
        message="This also deletes its sessions and sign-ups. If any hours were logged, Onboard will ask you to archive it instead so records stay intact."
        confirmLabel="Delete"
        loading={busy}
        onCancel={() => setToDelete(undefined)}
        onConfirm={() => {
          if (!toDelete) return;
          setBusy(true);
          void api.programs
            .remove(toDelete.id)
            .then(() => {
              toast.show(`${toDelete.name} deleted.`);
              data.reload();
            })
            .catch((err: unknown) => toast.show(messageOf(err), 'error'))
            .finally(() => {
              setBusy(false);
              setToDelete(undefined);
            });
        }}
      />
    </>
  );
}
