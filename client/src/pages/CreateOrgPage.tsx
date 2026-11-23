/**
 * @file Create an organization (FR-3c, FR-33–35) as a short three-step wizard:
 *  1. **About** — name, one-line description, kind of organization, time zone.
 *  2. **Features** — what the org will use (equipment, priority places, guest volunteers) and,
 *     tucked behind "Change the words", what it calls its places, people and equipment.
 *  3. **Skills & roles** — the skill list volunteers pick from and the roles events are split
 *     into, pre-filled from the kind of organization.
 * Nothing is saved until "Create organization"; then the org and its settings are created in one
 * request (all or nothing), the creator becomes its first Owner and lands on its Home page, where
 * a "Get started" checklist points to the next step.
 *
 * Until then the wizard keeps a draft in this browser tab (sessionStorage), so signing in again
 * or reloading the page brings back what was typed, on the same step.
 */
import { ArrowLeft, ArrowRight, Building2, Check, ChevronDown, History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { labelOf, OrgSector, RangeKind } from '@shared/enums';
import { messageOf } from '@shared/errors';
import {
  organizationSchema,
  orgSettingsSchema,
  toFieldErrors,
  type OrganizationInput,
  type OrgSettingsInput,
} from '@shared/schemas';
import { defaultSettings, SECTOR_DEFAULTS, termsFor } from '@shared/terms';
import { Button } from '@/components/Button';
import { Checkbox, FormError, FormField, Select, TextArea, TextInput } from '@/components/Form';
import { PageHeader, Panel } from '@/components/Layout';
import { useUser } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { NameListEditor } from '@/features/org/NameListEditor';
import { useForm } from '@/hooks/useForm';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/** US time zones offered on the form; Charlotte's is the default. */
const TIME_ZONES = [
  ['America/New_York', 'Eastern'],
  ['America/Chicago', 'Central'],
  ['America/Denver', 'Mountain'],
  ['America/Los_Angeles', 'Pacific'],
] as const;

/** What the wizard keeps between reloads and sign-ins. */
interface Draft {
  step: number;
  about: OrganizationInput;
  settings: OrgSettingsInput;
}

/** A fresh, empty wizard. */
const EMPTY_ABOUT: OrganizationInput = {
  name: '',
  description: '',
  timezone: 'America/New_York',
  sector: OrgSector.STEM,
};

/**
 * The draft's storage key, per person, so someone else signing in on this tab starts fresh.
 * @param userId - Signed-in person.
 * @returns The key.
 */
const draftKey = (userId: string) => `onboard.newOrgDraft.${userId}`;

/**
 * Reads a saved draft, if there is a usable one.
 * @param userId - Signed-in person.
 * @returns The draft or undefined.
 */
function readDraft(userId: string): Draft | undefined {
  try {
    const raw = sessionStorage.getItem(draftKey(userId));
    if (!raw) return undefined;
    const d = JSON.parse(raw) as Draft;
    return typeof d.step === 'number' && d.about && d.settings ? d : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Forgets the saved draft.
 * @param userId - Signed-in person.
 */
function clearDraft(userId: string) {
  try {
    sessionStorage.removeItem(draftKey(userId));
  } catch {
    // Storage unavailable: nothing was saved either.
  }
}

/** The wizard's steps, in order. */
const STEPS = ['About', 'Features', 'Skills & roles'] as const;

/**
 * Step indicator: "1 About · 2 Features · 3 Skills & roles".
 * @param props - Current step index.
 * @returns The list.
 */
function StepList({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2" aria-label="Steps">
      {STEPS.map((label, i) => (
        <li
          key={label}
          aria-current={i === step ? 'step' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold',
            i === step
              ? 'bg-primary text-on-primary'
              : i < step
                ? 'bg-good-soft text-good'
                : 'bg-surface-2 text-ink-muted',
          )}
        >
          <span aria-hidden>{i < step ? <Check className="size-4" /> : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

/**
 * The create-organization wizard.
 * @returns The page.
 */
export default function CreateOrgPage() {
  const { reload, setActiveOrg } = useOrg();
  const toast = useToast();
  const navigate = useNavigate();
  const me = useUser();
  const [saved] = useState(() => readDraft(me.id));
  const [restored, setRestored] = useState(!!saved);
  const [step, setStep] = useState(saved?.step ?? 0);
  const form = useForm(organizationSchema, saved?.about ?? EMPTY_ABOUT);
  const { values: v, errors: e, set, touch } = form;
  // Settings start from the chosen kind and are rebuilt if the kind changes before step 2.
  const [settings, setSettings] = useState<OrgSettingsInput>(
    () => saved?.settings ?? defaultSettings(OrgSector.STEM),
  );

  // Keep the draft as the person types.
  useEffect(() => {
    try {
      const draft: Draft = { step, about: v, settings };
      sessionStorage.setItem(draftKey(me.id), JSON.stringify(draft));
    } catch {
      // Storage full or blocked: the wizard still works, it just won't survive a reload.
    }
  }, [me.id, step, v, settings]);

  /** Throws the draft away and starts the wizard over. */
  const startOver = () => {
    clearDraft(me.id);
    (Object.keys(EMPTY_ABOUT) as (keyof OrganizationInput)[]).forEach((k) =>
      set(k, EMPTY_ABOUT[k]),
    );
    setSettings(defaultSettings(OrgSector.STEM));
    setSettingsErrors({});
    setStep(0);
    setRestored(false);
  };
  const [settingsErrors, setSettingsErrors] = useState<Record<string, string>>({});
  const [showWords, setShowWords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const t = termsFor(settings);

  /**
   * Updates one setting.
   * @param key - Setting.
   * @param value - New value.
   */
  const put = <K extends keyof OrgSettingsInput>(key: K, value: OrgSettingsInput[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setSettingsErrors((errs) => ({ ...errs, [key]: '' }));
  };

  /** Validates step 1 and moves on, picking up the kind's defaults if it changed. */
  const nextFromAbout = () => {
    const parsed = organizationSchema.safeParse(v);
    if (!parsed.success) {
      (['name', 'description', 'timezone'] as const).forEach((k) => touch(k));
      return;
    }
    if (settings.sector !== v.sector) setSettings(defaultSettings(v.sector));
    setStep(1);
  };

  /** Creates the org with its settings in one request, then opens its Home page. */
  const create = async () => {
    const parsed = orgSettingsSchema.safeParse(settings);
    if (!parsed.success) {
      const errs = toFieldErrors(parsed.error);
      setSettingsErrors(errs);
      setStep(Object.keys(errs).some((k) => k === 'skills' || k === 'eventRoles') ? 2 : 1);
      if (Object.keys(errs).some((k) => k.endsWith('Term') || k === 'priorityLabel'))
        setShowWords(true);
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    try {
      const org = await api.orgs.create({ ...v, settings: parsed.data });
      clearDraft(me.id);
      await reload();
      setActiveOrg(org.id);
      toast.show(`${org.name} is ready. You’re its Owner.`);
      navigate('/');
    } catch (err) {
      setSaveError(messageOf(err));
      setStep(0);
    } finally {
      setSaving(false);
    }
  };

  const word = (
    key: 'siteTerm' | 'participantTerm' | 'equipmentTerm' | 'priorityLabel',
    label: string,
    hint: string,
  ) => (
    <FormField label={label} hint={hint} error={settingsErrors[key] || undefined} required>
      {(p) => (
        <TextInput
          {...p}
          maxLength={30}
          value={settings[key]}
          invalid={!!settingsErrors[key]}
          onChange={(x) => put(key, x.target.value)}
        />
      )}
    </FormField>
  );

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'My organizations', to: '/me/orgs' }, { label: 'Create' }]}
        title="Create an organization"
      />
      <div className="max-w-3xl">
        <StepList step={step} />
        {restored && (
          <div
            role="status"
            className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-panel border border-line bg-surface-2 px-4 py-3 text-sm"
          >
            <History className="size-4 text-ink-muted" aria-hidden />
            <span>We brought back what you entered earlier.</span>
            <button
              type="button"
              className="font-semibold text-primary underline-offset-2 hover:underline"
              onClick={startOver}
            >
              Start over
            </button>
          </div>
        )}
        <FormError message={saveError ?? form.formError} />

        {step === 0 && (
          <Panel title="About your organization">
            <form
              noValidate
              className="space-y-4"
              onSubmit={(ev) => {
                ev.preventDefault();
                nextFromAbout();
              }}
            >
              <FormField label="Organization name" error={e.name} required>
                {(p) => (
                  <TextInput
                    {...p}
                    maxLength={80}
                    placeholder="e.g. Eastside Free Clinic"
                    value={v.name}
                    invalid={!!e.name}
                    onChange={(x) => set('name', x.target.value)}
                    onBlur={() => touch('name')}
                  />
                )}
              </FormField>
              <FormField
                label="What does it do?"
                hint="One sentence for the organization directory, up to 160 characters."
                error={e.description}
                required
              >
                {(p) => (
                  <TextArea
                    {...p}
                    maxLength={160}
                    className="min-h-20"
                    value={v.description}
                    invalid={!!e.description}
                    onChange={(x) => set('description', x.target.value)}
                    onBlur={() => touch('description')}
                  />
                )}
              </FormField>
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold">Kind of organization</legend>
                <p className="mb-2 text-sm text-ink-muted">
                  This fills in sensible starting choices on the next steps. You can change all of
                  them.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Object.values(OrgSector).map((sector) => {
                    const d = SECTOR_DEFAULTS[sector];
                    const checked = v.sector === sector;
                    return (
                      <label
                        key={sector}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-control border p-3',
                          checked
                            ? 'border-primary bg-primary-soft'
                            : 'border-line bg-surface hover:border-line-strong',
                        )}
                      >
                        <input
                          type="radio"
                          name="sector"
                          value={sector}
                          checked={checked}
                          onChange={() => set('sector', sector)}
                          className="mt-1 size-4 accent-[var(--rh-primary)]"
                        />
                        <span>
                          <span className="block font-semibold text-ink">{labelOf(sector)}</span>
                          <span className="block text-sm text-ink-muted">
                            {d.siteTerm} · {d.participantTerm}
                            {d.features.equipment ? ` · ${d.equipmentTerm}` : ''}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <FormField label="Time zone" error={e.timezone} className="max-w-xs">
                {(p) => (
                  <Select
                    {...p}
                    value={v.timezone}
                    onChange={(x) => set('timezone', x.target.value)}
                  >
                    {TIME_ZONES.map(([tz, label]) => (
                      <option key={tz} value={tz}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <div className="flex justify-end">
                <Button type="submit" icon={<ArrowRight className="size-4" aria-hidden />}>
                  Next: features
                </Button>
              </div>
            </form>
          </Panel>
        )}

        {step === 1 && (
          <Panel title="What will you use?">
            <div className="space-y-4">
              <Checkbox
                label={`Lend out ${t.equipmentPlural}`}
                description={`Keep a list of ${t.equipmentPlural} and which program has each one.`}
                checked={settings.features.equipment}
                onChange={(c) => put('features', { ...settings.features, equipment: c })}
              />
              <Checkbox
                label={`Mark some ${t.sites} as ${t.priority}`}
                description={`Single out ${t.sites} that need extra help in filters and sponsor reports.`}
                checked={settings.features.prioritySites}
                onChange={(c) => put('features', { ...settings.features, prioritySites: c })}
              />
              <Checkbox
                label="Let people help once without joining"
                description="Good for public events: anyone with a login can sign up for a single session."
                checked={settings.features.guests}
                onChange={(c) => put('features', { ...settings.features, guests: c })}
              />

              <div className="border-t border-line pt-4">
                <button
                  type="button"
                  aria-expanded={showWords}
                  onClick={() => setShowWords((s) => !s)}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
                >
                  <ChevronDown
                    className={cn('size-4 transition-transform', showWords && 'rotate-180')}
                    aria-hidden
                  />
                  Change the words (now: {t.Site} · {t.Participants} · {t.Equipment} · {t.priority})
                </button>
                {showWords && (
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {word('siteTerm', 'A place you serve', 'Singular, e.g. School, Clinic, Field')}
                    {word(
                      'participantTerm',
                      'People you serve',
                      'Plural, e.g. Students, Patients, Players',
                    )}
                    {word('equipmentTerm', 'An equipment item', 'Singular, e.g. Kit, Gear bag')}
                    {word('priorityLabel', 'Priority flag', 'e.g. Title I, Underserved area')}
                    <FormField label="Who each place serves">
                      {(p) => (
                        <Select
                          {...p}
                          value={settings.rangeKind}
                          onChange={(x) =>
                            put('rangeKind', x.target.value as OrgSettingsInput['rangeKind'])
                          }
                        >
                          {Object.values(RangeKind).map((k) => (
                            <option key={k} value={k}>
                              {labelOf(k)}
                            </option>
                          ))}
                        </Select>
                      )}
                    </FormField>
                  </div>
                )}
              </div>

              <div className="flex justify-between gap-2">
                <Button
                  variant="secondary"
                  icon={<ArrowLeft className="size-4" aria-hidden />}
                  onClick={() => setStep(0)}
                >
                  Back
                </Button>
                <Button
                  icon={<ArrowRight className="size-4" aria-hidden />}
                  onClick={() => setStep(2)}
                >
                  Next: skills & roles
                </Button>
              </div>
            </div>
          </Panel>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <Panel
              title="Skills"
              description="Volunteers pick from these when they apply, and you choose them for sessions so the right people are suggested. Describe any that might not be clear."
            >
              <NameListEditor
                label="Skills"
                noun="skill"
                items={settings.skills}
                onChange={(s) => put('skills', s)}
                placeholder="e.g. First aid"
                error={settingsErrors.skills || undefined}
                notes={settings.skillNotes}
                onNotesChange={(n) => put('skillNotes', n)}
              />
            </Panel>
            <Panel
              title="Event roles"
              description="Big events can be split into named jobs, like Judge or Greeter. Each new event gets one slot list from these."
            >
              <NameListEditor
                label="Event roles"
                noun="role"
                items={settings.eventRoles}
                onChange={(r) => put('eventRoles', r)}
                placeholder="e.g. Check-in"
                error={settingsErrors.eventRoles || undefined}
              />
            </Panel>
            <div className="flex justify-between gap-2">
              <Button
                variant="secondary"
                icon={<ArrowLeft className="size-4" aria-hidden />}
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                size="lg"
                loading={saving}
                icon={<Building2 className="size-4" aria-hidden />}
                onClick={() => void create()}
              >
                Create organization
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
