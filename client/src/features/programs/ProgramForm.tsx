/**
 * @file Create / edit a program (FR-10).
 *
 * A **program** is the ongoing activity an organization runs at one of its places — e.g.
 * "Briarwood Robotics Club, Sept–May" or "Saturday Clinic, all year". Its **sessions** are the
 * individual dates on the calendar. The form says so in plain words so the two are never confused.
 */
import { useEffect } from 'react';
import { labelOf, ProgramType } from '@shared/enums';
import { programDatesValid } from '@shared/rules';
import { programSchema, type ProgramInput } from '@shared/schemas';
import { addDays, todayIso } from '@shared/time';
import type { Program, Site } from '@shared/types';
import { Button } from '@/components/Button';
import { FormError, FormField, Select, TextInput } from '@/components/Form';
import { Modal } from '@/components/Modal';
import { useManagedOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { useForm } from '@/hooks/useForm';
import { api } from '@/lib/api';

/**
 * Parses a numeric input, keeping NaN for empty so Zod reports "must be a number".
 * @param raw - Input value.
 * @returns Number or NaN.
 */
const num = (raw: string) => (raw === '' ? Number.NaN : Number(raw));

/**
 * Parses an optional numeric input: empty means "not set".
 * @param raw - Input value.
 * @returns Number or undefined.
 */
const optNum = (raw: string) => (raw === '' ? undefined : Number(raw));

/**
 * Modal form for a program.
 * @param props - Open state, program to edit, sites, callbacks.
 * @returns The modal.
 */
export function ProgramForm({
  open,
  program,
  sites,
  onClose,
  onSaved,
}: {
  open: boolean;
  program?: Program;
  sites: Site[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { terms: t } = useManagedOrg();
  const toast = useToast();
  const blank: ProgramInput = {
    siteId: sites[0]?.id ?? '',
    name: '',
    type: ProgramType.ONGOING,
    startDate: todayIso(),
    endDate: addDays(todayIso(), 120),
    participantCount: 18,
    targetRatio: undefined,
    description: '',
  };
  const form = useForm(programSchema, blank);
  const { values: v, errors: e, set, touch, reset } = form;
  useEffect(() => {
    if (open)
      reset(
        program
          ? {
              siteId: program.siteId,
              name: program.name,
              type: program.type,
              startDate: program.startDate,
              endDate: program.endDate,
              participantCount: program.participantCount,
              targetRatio: program.targetRatio,
              description: program.description,
            }
          : blank,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, program]);
  const dates =
    v.startDate && v.endDate ? programDatesValid(v.startDate, v.endDate) : { ok: true as const };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={program ? 'Edit program' : 'Add a program'}
      description="A program is something you run again and again, like a weekly club or a season. You'll add its individual dates (sessions) next."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={form.submitting}
            onClick={() =>
              void form.submit(async (d) => {
                if (program) await api.programs.update(program.id, d);
                else await api.programs.create(d);
                toast.show(program ? 'Program updated.' : 'Program added.');
                onSaved();
              })
            }
          >
            {program ? 'Save changes' : 'Add program'}
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(ev) => ev.preventDefault()}
      >
        <div className="sm:col-span-2">
          <FormError message={form.formError} />
        </div>
        <FormField label={t.Site} error={e.siteId} required>
          {(p) => (
            <Select {...p} value={v.siteId} onChange={(x) => set('siteId', x.target.value)}>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Program type" required>
          {(p) => (
            <Select
              {...p}
              value={v.type}
              onChange={(x) => set('type', x.target.value as ProgramInput['type'])}
            >
              {Object.values(ProgramType).map((t) => (
                <option key={t} value={t}>
                  {labelOf(t)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Program name" error={e.name} required className="sm:col-span-2">
          {(p) => (
            <TextInput
              {...p}
              maxLength={80}
              value={v.name}
              invalid={!!e.name}
              onChange={(x) => set('name', x.target.value)}
              onBlur={() => touch('name')}
            />
          )}
        </FormField>
        <FormField label="Start date" error={e.startDate} required>
          {(p) => (
            <TextInput
              {...p}
              type="date"
              value={v.startDate}
              invalid={!!e.startDate}
              onChange={(x) => set('startDate', x.target.value)}
              onBlur={() => touch('startDate')}
            />
          )}
        </FormField>
        <FormField
          label="End date"
          error={e.endDate ?? (!dates.ok ? dates.message : undefined)}
          required
        >
          {(p) => (
            <TextInput
              {...p}
              type="date"
              value={v.endDate}
              invalid={!!e.endDate || !dates.ok}
              onChange={(x) => set('endDate', x.target.value)}
              onBlur={() => touch('endDate')}
            />
          )}
        </FormField>
        <FormField label={`${t.Participants} per session`} error={e.participantCount} required>
          {(p) => (
            <TextInput
              {...p}
              type="number"
              min={1}
              max={500}
              value={Number.isNaN(v.participantCount) ? '' : v.participantCount}
              invalid={!!e.participantCount}
              onChange={(x) => set('participantCount', num(x.target.value))}
              onBlur={() => touch('participantCount')}
            />
          )}
        </FormField>
        <FormField
          label={`${t.Participants} per volunteer`}
          hint={`Optional. 6 means one volunteer for every six ${t.participants}`}
          error={e.targetRatio}
        >
          {(p) => (
            <TextInput
              {...p}
              type="number"
              min={1}
              max={30}
              value={v.targetRatio ?? ''}
              invalid={!!e.targetRatio}
              onChange={(x) => set('targetRatio', optNum(x.target.value))}
              onBlur={() => touch('targetRatio')}
            />
          )}
        </FormField>
        <FormField
          label="Description"
          hint="What the program covers"
          error={e.description}
          required
          className="sm:col-span-2"
        >
          {(p) => (
            <TextInput
              {...p}
              maxLength={120}
              value={v.description}
              invalid={!!e.description}
              onChange={(x) => set('description', x.target.value)}
              onBlur={() => touch('description')}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}
