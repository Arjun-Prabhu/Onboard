/**
 * @file One volunteer's requirements checklist (Phase 3): every item the org asks for, where the
 * person stands on it (complete, expiring soon, expired, missing), and — for Admins — buttons to
 * record a completion, renew it, or undo a mistake. Expiry dates are worked out by the server
 * from each requirement's validity.
 */
import { CalendarCheck, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { RequirementState } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { formatDate, todayIso } from '@shared/time';
import type { RequirementCheck, Volunteer } from '@shared/types';
import { Button, ButtonLink } from '@/components/Button';
import { FormField, TextInput } from '@/components/Form';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/Status';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';

/** Props for {@link RequirementsChecklist}. */
export interface RequirementsChecklistProps {
  orgId: string;
  volunteer: Volunteer;
  /** Whether the viewer may record and undo completions (Admins and Owners). */
  canEdit: boolean;
  /** Whether the viewer may edit the org's list of requirements. */
  canEditList: boolean;
  /** Called with the refreshed volunteer after a change. */
  onChanged: (v: Volunteer) => void;
}

/**
 * Plain-language status line for one checklist row.
 * @param c - The row.
 * @returns e.g. "Completed Mar 3, 2026 · expires Mar 3, 2027".
 */
function detailOf(c: RequirementCheck): string {
  if (c.state === RequirementState.MISSING)
    return c.requirement.validMonths
      ? `Not recorded · valid ${c.requirement.validMonths} months once done`
      : 'Not recorded';
  const done = `Completed ${formatDate(c.completedAt ?? '')}`;
  if (!c.expiresAt) return `${done} · never expires`;
  const verb = c.state === RequirementState.EXPIRED ? 'expired' : 'expires';
  return `${done} · ${verb} ${formatDate(c.expiresAt)}`;
}

/**
 * The checklist panel body.
 * @param props - See {@link RequirementsChecklistProps}.
 * @returns The list.
 */
export function RequirementsChecklist({
  orgId,
  volunteer: v,
  canEdit,
  canEditList,
  onChanged,
}: RequirementsChecklistProps) {
  const toast = useToast();
  const [busy, setBusy] = useState<string>();
  const [recording, setRecording] = useState<RequirementCheck>();
  const [date, setDate] = useState(todayIso());
  const [dateError, setDateError] = useState<string>();

  /**
   * Runs one change and reports the result.
   * @param key - Busy key.
   * @param fn - API call returning the refreshed volunteer.
   * @param msg - Success message.
   * @returns Whether it worked.
   */
  const run = async (key: string, fn: () => Promise<Volunteer>, msg: string) => {
    setBusy(key);
    try {
      onChanged(await fn());
      toast.show(msg);
      return true;
    } catch (err) {
      toast.show(messageOf(err), 'error');
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  if (v.requirements.length === 0)
    return (
      <div className="rounded-control border border-dashed border-line px-3 py-4 text-sm text-ink-muted">
        <p>This organization doesn’t ask volunteers to complete anything before serving.</p>
        {canEditList && (
          <ButtonLink
            to="/org/settings#requirements"
            size="sm"
            variant="secondary"
            className="mt-3"
          >
            Add requirements
          </ButtonLink>
        )}
      </div>
    );

  return (
    <>
      <ul className="space-y-2" aria-label="Requirements checklist">
        {v.requirements.map((c) => {
          const id = c.requirement.id;
          const done = c.state !== RequirementState.MISSING;
          const renew =
            c.state === RequirementState.EXPIRING || c.state === RequirementState.EXPIRED;
          return (
            <li
              key={id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3 py-2"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {c.requirement.name}
                  <StatusBadge status={c.state} />
                </p>
                <p className="text-sm text-ink-muted">
                  {detailOf(c)}
                  {c.recordedBy ? ` · recorded by ${c.recordedBy}` : ''}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-1.5">
                  {(!done || renew) && (
                    <Button
                      size="sm"
                      variant={done ? 'secondary' : 'primary'}
                      icon={<CalendarCheck className="size-4" aria-hidden />}
                      onClick={() => {
                        setDate(todayIso());
                        setDateError(undefined);
                        setRecording(c);
                      }}
                    >
                      {done ? 'Renew' : 'Record'}
                    </Button>
                  )}
                  {done && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy === id}
                      icon={<RotateCcw className="size-4" aria-hidden />}
                      aria-label={`Undo ${c.requirement.name}`}
                      onClick={() =>
                        void run(
                          id,
                          () => api.volunteers.clearCompletion(orgId, v.id, id),
                          `${c.requirement.name} cleared for ${v.firstName}.`,
                        )
                      }
                    >
                      Undo
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Modal
        open={!!recording}
        onClose={() => setRecording(undefined)}
        size="sm"
        title={recording ? `Record ${recording.requirement.name}` : ''}
        description={
          recording?.requirement.validMonths
            ? `Stays valid for ${recording.requirement.validMonths} months from the date it was completed.`
            : 'This requirement never expires.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecording(undefined)}>
              Cancel
            </Button>
            <Button
              loading={busy === 'record'}
              onClick={() => {
                if (!recording) return;
                if (!date) return setDateError('Enter the date it was completed.');
                if (date > todayIso()) return setDateError('The date can’t be in the future.');
                void run(
                  'record',
                  () =>
                    api.volunteers.recordCompletion(orgId, v.id, recording.requirement.id, {
                      completedAt: date,
                    }),
                  `${recording.requirement.name} recorded for ${v.firstName}.`,
                ).then((ok) => ok && setRecording(undefined));
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <FormField label="Date completed" error={dateError} required>
          {(p) => (
            <TextInput
              {...p}
              type="date"
              max={todayIso()}
              value={date}
              invalid={!!dateError}
              onChange={(e) => {
                setDate(e.target.value);
                setDateError(undefined);
              }}
            />
          )}
        </FormField>
      </Modal>
    </>
  );
}
