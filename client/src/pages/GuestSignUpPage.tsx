/**
 * @file Volunteer at one event, no account needed (FR-4c).
 *
 * The person picks one upcoming event that its organization opened to guests, then gives a name,
 * email and phone, with no password. Each sign-up is for that one event; they can come back for
 * another. The confirmation says what, when and where, and whom to contact to cancel.
 *
 * For everything else (regular shifts, hours, a certificate) people create an account instead,
 * which takes over these one-time sign-ups when it uses the same email.
 */
import { CalendarDays, CheckCircle2, Clock, Hand, MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { guestSignUpSchema, type GuestSignUpInput } from '@shared/schemas';
import { formatDate, formatTimeRange } from '@shared/time';
import type { GuestConfirmation, GuestSession } from '@shared/types';
import { Wordmark } from '@/app/AppShell';
import { Button, ButtonLink } from '@/components/Button';
import { FormError, FormField, Select, TextInput } from '@/components/Form';
import { EmptyState, ErrorBlock, Loading, Panel } from '@/components/Layout';
import { useAsync } from '@/hooks/useAsync';
import { useForm } from '@/hooks/useForm';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const INITIAL: GuestSignUpInput = {
  sessionId: '',
  role: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
};

/**
 * "3 spots left" / "1 spot left".
 * @param n - Spots.
 * @returns The phrase.
 */
const spots = (n: number) => `${n} ${n === 1 ? 'spot' : 'spots'} left`;

/**
 * One event as a choosable card (a radio button underneath).
 * @param props - The event, whether it's chosen, and the change handler.
 * @returns The card.
 */
function EventChoice({
  event,
  checked,
  onChoose,
}: {
  event: GuestSession;
  checked: boolean;
  onChoose: () => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-panel border bg-surface p-4 transition-colors',
        checked ? 'border-primary ring-2 ring-primary/30' : 'border-line hover:border-ink-muted',
      )}
    >
      <input
        type="radio"
        name="sessionId"
        className="mt-1.5 size-4 accent-[var(--rh-primary)]"
        checked={checked}
        onChange={onChoose}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold leading-snug">{event.title}</span>
        <span className="block text-sm text-ink-muted">{event.orgName}</span>
        <span className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-4 text-ink-muted" aria-hidden />
            {formatDate(event.date, { year: undefined, weekday: 'long' })}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-4 text-ink-muted" aria-hidden />
            {formatTimeRange(event.startTime, event.endTime)}
          </span>
          <span className="flex items-center gap-1.5 sm:col-span-2">
            <MapPin className="size-4 shrink-0 text-ink-muted" aria-hidden />
            <span>
              {event.siteName} · {event.address}
            </span>
          </span>
          <span className="flex items-center gap-1.5 font-semibold">
            <Users className="size-4 text-ink-muted" aria-hidden />
            {spots(event.spotsOpen)}
          </span>
        </span>
      </span>
    </label>
  );
}

/**
 * After signing up: what, when, where, and whom to ask.
 * @param props - The confirmation and a way to sign up for another event.
 * @returns The screen.
 */
function Confirmation({ done, onAnother }: { done: GuestConfirmation; onAnother: () => void }) {
  const s = done.session;
  return (
    <div className="mx-auto max-w-lg text-center">
      <CheckCircle2 className="mx-auto size-12 text-good" aria-hidden />
      <h1 className="mt-4 text-4xl font-bold">You’re signed up, {done.firstName}!</h1>
      <p className="mt-2 text-ink-muted">{s.orgName} is expecting you.</p>
      <dl className="mt-6 space-y-2 rounded-panel border border-line bg-surface p-5 text-left">
        <div>
          <dt className="text-sm text-ink-muted">Event</dt>
          <dd className="font-semibold">
            {s.title}
            {done.role && ` — ${done.role}`}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">When</dt>
          <dd>
            {formatDate(s.date, { weekday: 'long' })}, {formatTimeRange(s.startTime, s.endTime)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Where</dt>
          <dd>
            {s.siteName}, {s.address}
          </dd>
        </div>
        {done.contactEmail && (
          <div>
            <dt className="text-sm text-ink-muted">Questions or can’t make it?</dt>
            <dd>
              Contact {done.contactName || s.orgName} at{' '}
              <a
                className="font-semibold text-primary underline"
                href={`mailto:${done.contactEmail}`}
              >
                {done.contactEmail}
              </a>
            </dd>
          </div>
        )}
      </dl>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={onAnother}>
          Volunteer at another event
        </Button>
        <ButtonLink to="/signup" variant="ghost">
          Create an account to track your hours
        </ButtonLink>
      </div>
    </div>
  );
}

/**
 * The page.
 * @returns The page.
 */
export default function GuestSignUpPage() {
  const events = useAsync(() => api.auth.guestSessions(), []);
  const form = useForm(guestSignUpSchema, INITIAL);
  const { values: v, errors: e, set, touch } = form;
  const [done, setDone] = useState<GuestConfirmation>();
  const chosen = events.data?.find((x) => x.id === v.sessionId);

  /** Back to the list for another event, keeping the person's details. */
  const another = () => {
    setDone(undefined);
    set('sessionId', '');
    set('role', '');
    events.reload();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Wordmark onDark={false} />
        <ButtonLink to="/login" variant="ghost" size="sm">
          Back to sign in
        </ButtonLink>
      </div>

      {done ? (
        <Confirmation done={done} onAnother={another} />
      ) : (
        <>
          <h1 className="text-4xl font-bold sm:text-5xl">Volunteer at one event</h1>
          <p className="mt-2 max-w-2xl text-lg text-ink-muted">
            No account needed. Pick an event, tell the organizers who you are, and you’re on the
            list. Each sign-up is for that one event.
          </p>

          <form
            noValidate
            className="mt-8 space-y-6"
            onSubmit={(ev) => {
              ev.preventDefault();
              void form.submit(async (data) => {
                setDone(await api.auth.guestSignUp({ ...data, role: data.role || undefined }));
              });
            }}
          >
            <FormError message={form.formError} />
            <Panel title="1. Choose an event">
              {events.loading && !events.data ? (
                <Loading label="Finding events…" />
              ) : events.error ? (
                <ErrorBlock message={events.error} onRetry={events.reload} />
              ) : !events.data?.length ? (
                <EmptyState
                  icon={<Hand className="size-8" />}
                  title="No events need guest helpers right now"
                  message="Check back soon, or create an account to see regular volunteer shifts."
                  action={<ButtonLink to="/signup">Create an account</ButtonLink>}
                />
              ) : (
                <fieldset aria-describedby={e.sessionId ? 'event-error' : undefined}>
                  <legend className="sr-only">Events open to guests</legend>
                  <div className="space-y-3">
                    {events.data.map((event) => (
                      <EventChoice
                        key={event.id}
                        event={event}
                        checked={v.sessionId === event.id}
                        onChoose={() => {
                          set('sessionId', event.id);
                          set('role', event.roles[0]?.role ?? '');
                        }}
                      />
                    ))}
                  </div>
                  {e.sessionId && (
                    <p
                      id="event-error"
                      role="alert"
                      className="mt-2 text-sm font-semibold text-bad"
                    >
                      {e.sessionId}
                    </p>
                  )}
                </fieldset>
              )}
            </Panel>

            {chosen && (
              <Panel title="2. Tell us who you are">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {chosen.roles.length > 0 && (
                    <FormField label="What would you like to do?" error={e.role} required>
                      {(p) => (
                        <Select
                          {...p}
                          value={v.role ?? ''}
                          invalid={!!e.role}
                          onChange={(x) => set('role', x.target.value)}
                        >
                          {chosen.roles.map((r) => (
                            <option key={r.role} value={r.role}>
                              {r.role} ({spots(r.spotsOpen)})
                            </option>
                          ))}
                        </Select>
                      )}
                    </FormField>
                  )}
                  {chosen.roles.length > 0 && <div className="hidden sm:block" aria-hidden />}
                  <FormField label="First name" error={e.firstName} required>
                    {(p) => (
                      <TextInput
                        {...p}
                        autoComplete="given-name"
                        value={v.firstName}
                        invalid={!!e.firstName}
                        onChange={(x) => set('firstName', x.target.value)}
                        onBlur={() => touch('firstName')}
                      />
                    )}
                  </FormField>
                  <FormField label="Last name" error={e.lastName} required>
                    {(p) => (
                      <TextInput
                        {...p}
                        autoComplete="family-name"
                        value={v.lastName}
                        invalid={!!e.lastName}
                        onChange={(x) => set('lastName', x.target.value)}
                        onBlur={() => touch('lastName')}
                      />
                    )}
                  </FormField>
                  <FormField
                    label="Email"
                    hint="For the organizers to reach you"
                    error={e.email}
                    required
                  >
                    {(p) => (
                      <TextInput
                        {...p}
                        type="email"
                        autoComplete="email"
                        value={v.email}
                        invalid={!!e.email}
                        onChange={(x) => set('email', x.target.value)}
                        onBlur={() => touch('email')}
                      />
                    )}
                  </FormField>
                  <FormField label="Phone" hint="10-digit US number" error={e.phone} required>
                    {(p) => (
                      <TextInput
                        {...p}
                        type="tel"
                        autoComplete="tel"
                        placeholder="(704) 555-0123"
                        value={v.phone}
                        invalid={!!e.phone}
                        onChange={(x) => set('phone', x.target.value)}
                        onBlur={() => touch('phone')}
                      />
                    )}
                  </FormField>
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                  <p className="text-sm text-ink-muted">
                    Already have an account?{' '}
                    <ButtonLink to="/login" variant="ghost" size="sm" className="px-1">
                      Sign in instead
                    </ButtonLink>
                  </p>
                  <Button type="submit" size="lg" loading={form.submitting}>
                    Sign me up
                  </Button>
                </div>
              </Panel>
            )}
          </form>
        </>
      )}
    </div>
  );
}
