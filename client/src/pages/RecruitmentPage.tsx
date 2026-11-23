/**
 * @file Recruitment pipeline board (FR-5, FR-6): Applied → Interviewed → Trained → Active →
 * Inactive. Each move is timestamped by the API.
 */
import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { labelOf, PIPELINE_ORDER, VolunteerStatus } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { daysBetween, todayIso } from '@shared/time';
import type { Volunteer } from '@shared/types';
import { Button, ButtonLink } from '@/components/Button';
import { ErrorBlock, Loading, PageHeader } from '@/components/Layout';
import { StatusBadge } from '@/components/Status';
import { useManagedOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';

/**
 * What each column is for, in the user's words.
 * @param participants - The org's word for the people it serves, lowercase.
 * @returns One hint per stage.
 */
const stageHints = (participants: string): Record<VolunteerStatus, string> => ({
  APPLIED: 'New applications to review',
  INTERVIEWED: 'Interviewed, awaiting training',
  TRAINED: 'Trained — finish the checklist to activate',
  ACTIVE: `Can serve ${participants}`,
  INACTIVE: 'Paused or moved on',
});

/**
 * Next logical stage for a volunteer.
 * @param s - Current status.
 * @returns The next stage, or undefined at the end.
 */
function nextStage(s: VolunteerStatus): VolunteerStatus | undefined {
  if (s === VolunteerStatus.INACTIVE) return VolunteerStatus.ACTIVE;
  const i = PIPELINE_ORDER.indexOf(s);
  return i < 3 ? PIPELINE_ORDER[i + 1] : undefined;
}

/**
 * The recruitment board.
 * @returns The page.
 */
export default function RecruitmentPage() {
  const { org, terms } = useManagedOrg();
  const STAGE_HINT = stageHints(terms.participants);
  const toast = useToast();
  const list = useAsync(() => api.volunteers.list(org.id), [org.id]);
  const [busy, setBusy] = useState<string>();

  /**
   * Runs a pipeline action.
   * @param v - Volunteer.
   * @param action - API call.
   * @param msg - Success message.
   */
  const act = async (v: Volunteer, action: () => Promise<Volunteer>, msg: string) => {
    setBusy(v.id);
    try {
      await action();
      toast.show(msg);
      list.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  if (list.loading && !list.data) return <Loading />;
  if (list.error || !list.data)
    return <ErrorBlock message={list.error ?? 'Could not load.'} onRetry={list.reload} />;
  const today = todayIso();

  return (
    <>
      <PageHeader title="Recruitment" />
      <div
        className="-mx-4 overflow-x-auto px-4 pb-2"
        tabIndex={0}
        role="region"
        aria-label="Pipeline columns"
      >
        <div className="grid min-w-[72rem] grid-cols-5 gap-3">
          {PIPELINE_ORDER.map((stage) => {
            const people = list.data!.filter((v) => v.status === stage);
            return (
              <section
                key={stage}
                aria-labelledby={`col-${stage}`}
                className="flex flex-col rounded-panel border border-line bg-surface-2"
              >
                <header className="border-b border-line px-3 py-2.5">
                  <h2
                    id={`col-${stage}`}
                    className="flex items-center justify-between text-lg font-semibold"
                  >
                    {labelOf(stage)}
                    <span className="rounded-full bg-surface px-2 text-sm tabular-nums text-ink-muted">
                      {people.length}
                    </span>
                  </h2>
                  <p className="text-xs text-ink-muted">{STAGE_HINT[stage]}</p>
                </header>
                <ul className="flex flex-1 flex-col gap-2 p-2">
                  {people.map((v) => {
                    const next = v.status ? nextStage(v.status) : undefined;
                    const done = v.requirements.filter(
                      (c) => c.state === 'COMPLETE' || c.state === 'EXPIRING',
                    ).length;
                    const needsClearance = v.status === VolunteerStatus.TRAINED && !v.cleared;
                    const changed =
                      v.statusHistory[v.statusHistory.length - 1]?.changedAt.slice(0, 10) ??
                      v.createdAt;
                    return (
                      <li key={v.id} className="rounded-control border border-line bg-surface p-3">
                        <Link
                          to={`/volunteers/${v.id}`}
                          className="font-semibold hover:text-primary hover:underline"
                        >
                          {v.firstName} {v.lastName}
                        </Link>
                        <p className="truncate text-xs text-ink-muted">{v.affiliation}</p>
                        <p className="mt-1 text-xs text-ink-muted">
                          In stage {Math.max(0, daysBetween(changed, today))} days
                          {v.requirements.length > 0 &&
                            ` · checklist ${done} of ${v.requirements.length}`}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {needsClearance && (
                            <ButtonLink
                              to={`/volunteers/${v.id}#checklist`}
                              size="sm"
                              variant="secondary"
                              icon={<ListChecks className="size-4" aria-hidden />}
                            >
                              Open checklist
                            </ButtonLink>
                          )}
                          {next && !needsClearance && (
                            <Button
                              size="sm"
                              loading={busy === v.id}
                              onClick={() =>
                                void act(
                                  v,
                                  () => api.volunteers.setStatus(org.id, v.id, next),
                                  `${v.firstName} moved to ${labelOf(next)}.`,
                                )
                              }
                            >
                              Move to {labelOf(next)}
                            </Button>
                          )}
                          {v.status === VolunteerStatus.ACTIVE && (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={busy === v.id}
                              onClick={() =>
                                void act(
                                  v,
                                  () =>
                                    api.volunteers.setStatus(
                                      org.id,
                                      v.id,
                                      VolunteerStatus.INACTIVE,
                                    ),
                                  `${v.firstName} marked inactive.`,
                                )
                              }
                            >
                              Mark inactive
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {people.length === 0 && (
                    <li className="px-2 py-6 text-center text-sm text-ink-muted">
                      No one here yet.
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
        <StatusBadge status="ACTIVE" /> volunteers appear in volunteer recommendations.
      </p>
    </>
  );
}
