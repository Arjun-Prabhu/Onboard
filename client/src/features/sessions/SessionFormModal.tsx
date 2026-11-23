/**
 * @file Create / edit session form (FR-11, FR-12). Format rules come from the shared Zod
 * schema; meaning rules (V-S1 end after start, V-S2 inside program dates, V-S8 volunteer ratio)
 * are previewed live here and enforced again by the API.
 */
import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DAY_NAMES, labelOf, SessionType } from '@shared/enums';
import { endAfterStart, ratioMet, sessionWithinProgram } from '@shared/rules';
import { MAX_REPEAT_SESSIONS, sessionSchema, type SessionInput } from '@shared/schemas';
import { addDays, formatDate, parseDate, todayIso } from '@shared/time';
import { termsOf } from '@shared/terms';
import type { Organization, Program, Site, SessionView } from '@shared/types';
import { Button } from '@/components/Button';
import { Checkbox, ChipGroup, FormError, FormField, Select, TextInput } from '@/components/Form';
import { Modal } from '@/components/Modal';
import { useToast } from '@/context/ToastContext';
import { useForm } from '@/hooks/useForm';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Props for {@link SessionFormModal}. */
export interface SessionFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the saved session; `count` > 1 when "Repeat weekly" created several. */
  onSaved: (session: SessionView, count?: number) => void;
  programs: Program[];
  sites: Site[];
  /** The org that owns the sessions: supplies its skills, event roles and terms. */
  org: Organization;
  /** Existing session to edit; omit to create. */
  session?: SessionView;
  /** Program to start a new session in (from a program's "Add a session" button). */
  programId?: string;
  /** Start a new session as a one-time event (no program). */
  oneOff?: boolean;
}

/**
 * Builds blank form values.
 * @param programs - Available programs.
 * @returns Default values.
 */
function blank(programs: Program[], programId?: string): SessionInput {
  const regular = programs.filter((x) => !x.oneOff);
  const p =
    regular.find((x) => x.id === programId) ??
    regular.find((x) => x.endDate >= todayIso()) ??
    regular[0];
  return {
    programId: p?.id ?? '',
    type: SessionType.SHIFT,
    date: addDays(todayIso(), 7),
    startTime: '15:00',
    endTime: '16:30',
    title: '',
    requiredSkills: [],
    volunteersNeeded: p?.targetRatio ? Math.ceil(p.participantCount / p.targetRatio) : 3,
    openToGuests: false,
  };
}

/**
 * Modal form for sessions.
 * @param props - Modal props.
 * @returns The modal.
 */
export function SessionFormModal({
  open,
  onClose,
  onSaved,
  programs,
  sites,
  org,
  session,
  programId,
  oneOff = false,
}: SessionFormModalProps) {
  const toast = useToast();
  const terms = termsOf(org);
  const { skills, eventRoles, features } = org.settings;
  const regularPrograms = programs.filter((p) => !p.oneOff);
  const editingOneOff = !!session?.program.oneOff;
  const initial = useMemo<SessionInput>(
    () =>
      session
        ? {
            programId: editingOneOff ? '' : session.programId,
            siteId: editingOneOff ? session.program.siteId : undefined,
            type: session.type,
            date: session.date,
            startTime: session.startTime,
            endTime: session.endTime,
            title: session.title,
            requiredSkills: session.requiredSkills,
            volunteersNeeded: session.volunteersNeeded,
            openToGuests: session.openToGuests,
          }
        : oneOff
          ? { ...blank(programs), programId: '', siteId: sites[0]?.id, type: SessionType.EVENT }
          : blank(programs, programId),
    [session, programs, programId, oneOff, editingOneOff, sites],
  );
  const form = useForm(sessionSchema, initial);
  const [more, setMore] = useState(false);
  const [repeat, setRepeat] = useState<{ on: boolean; weekdays: number[]; until: string }>({
    on: false,
    weekdays: [],
    until: '',
  });
  const { values: v, errors: e, set, touch, reset } = form;
  const isOneOff = !v.programId && v.siteId !== undefined;

  useEffect(() => {
    if (!open) return;
    reset(initial);
    // Editing a session that already uses the extra options opens them.
    setMore(initial.requiredSkills.length > 0 || initial.openToGuests);
    setRepeat({ on: false, weekdays: [], until: '' });
  }, [open, initial, reset]);

  /**
   * Switches between "part of a program" and "one-time event".
   * @param next - Chosen kind.
   */
  const chooseKind = (next: 'program' | 'oneOff') => {
    if (next === 'oneOff') {
      set('programId', '');
      set('siteId', v.siteId ?? sites[0]?.id ?? '');
      setRepeat((r) => ({ ...r, on: false }));
    } else {
      set('siteId', undefined);
      set('programId', blank(programs, programId).programId);
    }
  };

  const program = programs.find((p) => p.id === v.programId);
  // "Repeat weekly": every picked weekday from the first date up to the last date.
  const repeatDates = (() => {
    if (!repeat.on || !v.date || !repeat.until || repeat.until < v.date) return [];
    const out: string[] = [];
    for (let d = v.date; d <= repeat.until && out.length <= MAX_REPEAT_SESSIONS; d = addDays(d, 1))
      if (repeat.weekdays.includes(parseDate(d).getDay())) out.push(d);
    return out;
  })();
  const repeatError = !repeat.on
    ? undefined
    : !repeat.weekdays.length
      ? 'Pick at least one day.'
      : !repeat.until || repeat.until < v.date
        ? 'The last date must be on or after the first date.'
        : repeatDates.length > MAX_REPEAT_SESSIONS
          ? `That’s more than ${MAX_REPEAT_SESSIONS} sessions. Pick an earlier last date.`
          : repeatDates.length === 0
            ? 'None of those days fall in that range.'
            : undefined;
  const turnOnRepeat = (on: boolean) =>
    setRepeat({
      on,
      weekdays: v.date ? [parseDate(v.date).getDay()] : [],
      until: program?.endDate ?? (v.date ? addDays(v.date, 56) : ''),
    });
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? '';
  // Live semantic previews so mistakes are caught before Save.
  const timeRule =
    v.startTime && v.endTime ? endAfterStart(v.startTime, v.endTime) : { ok: true as const };
  const dateRule =
    program && v.date ? sessionWithinProgram(v.date, program) : { ok: true as const };
  const ratioRule =
    program && v.type !== SessionType.TRAINING
      ? ratioMet(v.volunteersNeeded, program, terms.Participants)
      : { ok: true as const };
  const minimum = program?.targetRatio
    ? Math.ceil(program.participantCount / program.targetRatio)
    : undefined;
  // Keep any skill already on the session even if the catalog no longer lists it.
  const skillOptions = [...skills, ...v.requiredSkills.filter((x) => !skills.includes(x))];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={session ? 'Edit session' : 'New session'}
      description={
        isOneOff
          ? 'A one-time event happens once, like a fundraiser. Volunteers can sign up as soon as you save it.'
          : 'A session is one date of a program, like one club meeting or one clinic shift. Volunteers can sign up as soon as you save it.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={form.submitting}
            disabled={!!repeatError}
            onClick={() =>
              void form.submit(async (data) => {
                if (!session && repeat.on) {
                  const made = await api.sessions.createRepeating(data, {
                    weekdays: repeat.weekdays,
                    until: repeat.until,
                  });
                  toast.show(`Created ${made.length} sessions.`);
                  onSaved(made[0], made.length);
                  return;
                }
                const saved = session
                  ? await api.sessions.update(session.id, data)
                  : await api.sessions.create(data);
                toast.show(session ? 'Session updated.' : 'Session created.');
                onSaved(saved, 1);
              })
            }
          >
            {session
              ? 'Save changes'
              : repeat.on && repeatDates.length
                ? `Create ${repeatDates.length} sessions`
                : 'Create session'}
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
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-semibold">What kind of session?</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                [
                  'program',
                  'Part of a program',
                  'One date of a club, season or shift that repeats',
                ],
                ['oneOff', 'One-time event', 'Happens once, like a fundraiser or cleanup day'],
              ] as const
            ).map(([k, label, hint]) => {
              const checked = (k === 'oneOff') === isOneOff;
              return (
                <label
                  key={k}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-control border p-3',
                    checked
                      ? 'border-primary bg-primary-soft'
                      : 'border-line bg-surface hover:border-line-strong',
                  )}
                >
                  <input
                    type="radio"
                    name="session-kind"
                    checked={checked}
                    onChange={() => chooseKind(k)}
                    className="mt-1 size-4 accent-[var(--rh-primary)]"
                  />
                  <span>
                    <span className="block font-semibold text-ink">{label}</span>
                    <span className="block text-sm text-ink-muted">{hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {isOneOff ? (
          <FormField
            label={`Where (${terms.site})`}
            hint={`Not listed? Add it under Settings → ${terms.Sites}.`}
            error={e.siteId ?? e.programId}
            required
            className="sm:col-span-2"
          >
            {(p) => (
              <Select
                {...p}
                value={v.siteId ?? ''}
                invalid={!!(e.siteId ?? e.programId)}
                onChange={(x) => set('siteId', x.target.value)}
              >
                {sites.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        ) : (
          <FormField
            label="Session of program"
            hint="The ongoing activity this date belongs to"
            error={e.programId}
            required
            className="sm:col-span-2"
          >
            {(p) => (
              <Select
                {...p}
                value={v.programId}
                invalid={!!e.programId}
                onChange={(x) => set('programId', x.target.value)}
              >
                {regularPrograms.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name} — {siteName(pr.siteId)}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}
        <FormField label="Session type" error={e.type} required>
          {(p) => (
            <Select
              {...p}
              value={v.type}
              onChange={(x) => set('type', x.target.value as SessionInput['type'])}
            >
              {Object.values(SessionType).map((t) => (
                <option key={t} value={t}>
                  {labelOf(t)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField
          label="Date"
          error={e.date ?? (!dateRule.ok ? dateRule.message : undefined)}
          required
          hint={program ? `Program runs ${program.startDate} to ${program.endDate}` : undefined}
        >
          {(p) => (
            <TextInput
              {...p}
              type="date"
              value={v.date}
              invalid={!!e.date || !dateRule.ok}
              onChange={(x) => set('date', x.target.value)}
              onBlur={() => touch('date')}
            />
          )}
        </FormField>
        <FormField label="Start time" error={e.startTime} required>
          {(p) => (
            <TextInput
              {...p}
              type="time"
              value={v.startTime}
              invalid={!!e.startTime}
              onChange={(x) => set('startTime', x.target.value)}
              onBlur={() => touch('startTime')}
            />
          )}
        </FormField>
        <FormField
          label="End time"
          error={e.endTime ?? (!timeRule.ok ? timeRule.message : undefined)}
          required
        >
          {(p) => (
            <TextInput
              {...p}
              type="time"
              value={v.endTime}
              invalid={!!e.endTime || !timeRule.ok}
              onChange={(x) => set('endTime', x.target.value)}
              onBlur={() => touch('endTime')}
            />
          )}
        </FormField>
        <FormField label="Title" error={e.title} required className="sm:col-span-2">
          {(p) => (
            <TextInput
              {...p}
              maxLength={100}
              placeholder="What happens in this session"
              value={v.title}
              invalid={!!e.title}
              onChange={(x) => set('title', x.target.value)}
              onBlur={() => touch('title')}
            />
          )}
        </FormField>
        <FormField
          label="Volunteers needed"
          error={e.volunteersNeeded ?? (!ratioRule.ok ? ratioRule.message : undefined)}
          required
          hint={
            minimum && v.type !== SessionType.TRAINING
              ? `At least ${minimum} for ${program?.participantCount} ${terms.participants} at 1:${program?.targetRatio}`
              : undefined
          }
        >
          {(p) => (
            <TextInput
              {...p}
              type="number"
              min={1}
              max={50}
              inputMode="numeric"
              value={Number.isNaN(v.volunteersNeeded) ? '' : v.volunteersNeeded}
              invalid={!!e.volunteersNeeded || !ratioRule.ok}
              onChange={(x) =>
                set('volunteersNeeded', x.target.value === '' ? Number.NaN : Number(x.target.value))
              }
              onBlur={() => touch('volunteersNeeded')}
            />
          )}
        </FormField>
        {!session && !isOneOff && (
          <div className="rounded-control border border-line p-3 sm:col-span-2">
            <Checkbox
              label="Repeat every week"
              description="Put this session on the calendar every week until a date you pick."
              checked={repeat.on}
              onChange={turnOnRepeat}
            />
            {repeat.on && (
              <div className="mt-3 space-y-3 pl-8">
                <fieldset>
                  <legend className="mb-1.5 text-sm font-semibold">On these days</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_NAMES.map((name, day) => {
                      const on = repeat.weekdays.includes(day);
                      return (
                        <label
                          key={name}
                          className={cn(
                            'inline-flex min-h-9 min-w-12 cursor-pointer items-center justify-center rounded-full border px-3 text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus',
                            on
                              ? 'border-primary bg-primary-soft text-primary'
                              : 'border-line-strong bg-surface text-ink',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={on}
                            onChange={() =>
                              setRepeat((r) => ({
                                ...r,
                                weekdays: on
                                  ? r.weekdays.filter((d) => d !== day)
                                  : [...r.weekdays, day],
                              }))
                            }
                          />
                          <span aria-hidden>{name.slice(0, 3)}</span>
                          <span className="sr-only">{name}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <FormField
                  label="Last date"
                  hint={program ? `The program ends ${formatDate(program.endDate)}` : undefined}
                  error={repeatError}
                  className="max-w-xs"
                >
                  {(p) => (
                    <TextInput
                      {...p}
                      type="date"
                      value={repeat.until}
                      invalid={!!repeatError}
                      onChange={(x) => setRepeat((r) => ({ ...r, until: x.target.value }))}
                    />
                  )}
                </FormField>
                {!repeatError && (
                  <p className="text-sm font-medium text-ink" aria-live="polite">
                    Creates {repeatDates.length} sessions, {formatDate(repeatDates[0])} to{' '}
                    {formatDate(repeatDates[repeatDates.length - 1])}.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {/* The essentials above are enough for most sessions; the rest waits behind one click. */}
        <div className="sm:col-span-2">
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((m) => !m)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
          >
            <ChevronDown
              className={cn('size-4 transition-transform', more && 'rotate-180')}
              aria-hidden
            />
            {more ? 'Fewer options' : 'More options (skills, open to everyone)'}
          </button>
        </div>
        {more && (
          <>
            <div className="sm:col-span-2">
              <FormField label="Skills needed" hint="Used to rank recommended volunteers">
                {(p) => (
                  <ChipGroup
                    label="Skills needed"
                    options={skillOptions}
                    notes={org.settings.skillNotes}
                    selected={v.requiredSkills}
                    onChange={(s) => set('requiredSkills', s)}
                    describedBy={p['aria-describedby']}
                  />
                )}
              </FormField>
            </div>
            {v.type === SessionType.EVENT && (
              <p className="text-sm text-ink-muted sm:col-span-2">
                {eventRoles.length
                  ? `Events get ${eventRoles.join(', ')} slots automatically (edit the list in Organization settings).`
                  : 'Add event roles in Organization settings to split an event into named slots.'}
              </p>
            )}
            {(features.guests || v.openToGuests) && (
              <div className="sm:col-span-2">
                <Checkbox
                  label="Open to everyone"
                  description="People who haven’t joined your organization can help once — good for public events."
                  checked={v.openToGuests}
                  onChange={(c) => set('openToGuests', c)}
                />
              </div>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
