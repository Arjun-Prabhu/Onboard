/**
 * @file My volunteering → My profile (FR-7). Contact info, skills and weekly availability belong
 * to the PERSON and are reused by every org they volunteer with — no re-entering per org.
 */
import { useEffect } from 'react';
import { ExperienceLevel, labelOf } from '@shared/enums';
import { volunteerProfileSchema, type VolunteerProfileInput } from '@shared/schemas';
import { Button } from '@/components/Button';
import {
  Checkbox,
  ChipGroup,
  FormError,
  FormField,
  Select,
  TextArea,
  TextInput,
} from '@/components/Form';
import { ErrorBlock, Loading, PageHeader, Panel } from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { AvailabilityEditor } from '@/features/volunteers/AvailabilityEditor';
import { useAsync } from '@/hooks/useAsync';
import { useForm } from '@/hooks/useForm';
import { api } from '@/lib/api';

const EMPTY: VolunteerProfileInput = {
  firstName: '',
  lastName: '',
  phone: '',
  affiliation: '',
  zip: '',
  skills: [],
  availability: [],
  experienceLevel: ExperienceLevel.NEW,
  hasTransportation: false,
  bio: '',
};

/**
 * The profile page.
 * @returns The page.
 */
export default function ProfilePage() {
  const { refresh } = useAuth();
  const { affiliations } = useOrg();
  const toast = useToast();
  const me = useAsync(() => api.profile.get(), []);
  const form = useForm(volunteerProfileSchema, EMPTY);
  const { values: v, errors: e, set, touch, reset } = form;
  // One group of skills per org the person is part of, in that org's own order and words.
  const orgs = [...new Map(affiliations.map((a) => [a.org.id, a.org])).values()].sort((x, y) =>
    x.name.localeCompare(y.name),
  );
  const listed = new Set(orgs.flatMap((o) => o.settings.skills));
  // Saved skills that no org lists (any more), so they can still be removed — taken from the saved
  // profile, so a chip unticked by mistake stays on screen to tick again.
  const others = (me.data?.profile.skills ?? []).filter((s) => !listed.has(s));
  /**
   * Replaces the person's choices among one group's options, keeping all their other skills.
   * @param options - The group's skills.
   * @param next - What's ticked in that group now.
   */
  const setGroup = (options: readonly string[], next: string[]) =>
    set('skills', [...v.skills.filter((s) => !options.includes(s)), ...next]);

  useEffect(() => {
    if (!me.data) return;
    const { profile: p, ...u } = me.data;
    reset({
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone ?? '',
      zip: u.zip ?? '',
      affiliation: p.affiliation,
      skills: p.skills,
      availability: p.availability.map(({ dayOfWeek, startTime, endTime }) => ({
        dayOfWeek,
        startTime,
        endTime,
      })),
      experienceLevel: p.experienceLevel,
      hasTransportation: p.hasTransportation,
      bio: p.bio ?? '',
    });
  }, [me.data, reset]);

  if (me.loading && !me.data) return <Loading />;
  if (me.error || !me.data)
    return <ErrorBlock message={me.error ?? 'Could not load.'} onRetry={me.reload} />;

  return (
    <>
      <PageHeader title="My profile" />
      <form
        noValidate
        className="space-y-6"
        onSubmit={(ev) => {
          ev.preventDefault();
          void form.submit(async (d) => {
            me.setData(await api.profile.update(d));
            await refresh();
            toast.show('Profile saved.');
          });
        }}
      >
        <FormError message={form.formError} />
        <Panel title="Contact">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <FormField label="Phone" error={e.phone} required>
              {(p) => (
                <TextInput
                  {...p}
                  type="tel"
                  autoComplete="tel"
                  value={v.phone}
                  invalid={!!e.phone}
                  onChange={(x) => set('phone', x.target.value)}
                  onBlur={() => touch('phone')}
                />
              )}
            </FormField>
            <FormField label="ZIP code" error={e.zip} required>
              {(p) => (
                <TextInput
                  {...p}
                  inputMode="numeric"
                  maxLength={5}
                  value={v.zip}
                  invalid={!!e.zip}
                  onChange={(x) => set('zip', x.target.value)}
                  onBlur={() => touch('zip')}
                />
              )}
            </FormField>
            <FormField
              label="Site, college, or employer"
              error={e.affiliation}
              required
              className="sm:col-span-2"
            >
              {(p) => (
                <TextInput
                  {...p}
                  value={v.affiliation}
                  invalid={!!e.affiliation}
                  onChange={(x) => set('affiliation', x.target.value)}
                  onBlur={() => touch('affiliation')}
                />
              )}
            </FormField>
            <Checkbox
              label="I have reliable transportation"
              checked={v.hasTransportation}
              onChange={(c) => set('hasTransportation', c)}
            />
          </div>
        </Panel>
        <Panel
          title="Skills & experience"
          description="Pick your skills from each organization’s list. They shape which sessions are recommended to you."
        >
          <div className="space-y-4">
            {orgs.length === 0 && others.length === 0 && (
              <p className="text-sm text-ink-muted">
                Join an organization to choose from its skills.
              </p>
            )}
            {orgs.map((org, i) =>
              org.settings.skills.length ? (
                <FormField key={org.id} label={org.name} error={i === 0 ? e.skills : undefined}>
                  {(p) => (
                    <ChipGroup
                      label={`Skills at ${org.name}`}
                      options={org.settings.skills}
                      notes={org.settings.skillNotes}
                      selected={v.skills.filter((s) => org.settings.skills.includes(s))}
                      onChange={(next) => setGroup(org.settings.skills, next)}
                      invalid={!!e.skills}
                      describedBy={p['aria-describedby']}
                    />
                  )}
                </FormField>
              ) : (
                <div key={org.id}>
                  <p className="text-sm font-semibold">{org.name}</p>
                  <p className="text-sm text-ink-muted">
                    This organization hasn’t listed skills yet.
                  </p>
                </div>
              ),
            )}
            {others.length > 0 && (
              <FormField
                label="Other skills"
                hint="No organization you’re part of lists these. Untick to remove them."
              >
                {(p) => (
                  <ChipGroup
                    label="Other skills"
                    options={others}
                    selected={v.skills.filter((s) => others.includes(s))}
                    onChange={(next) => setGroup(others, next)}
                    describedBy={p['aria-describedby']}
                  />
                )}
              </FormField>
            )}
            <FormField label="Experience level" className="max-w-xs">
              {(p) => (
                <Select
                  {...p}
                  value={v.experienceLevel}
                  onChange={(x) =>
                    set(
                      'experienceLevel',
                      x.target.value as VolunteerProfileInput['experienceLevel'],
                    )
                  }
                >
                  {Object.values(ExperienceLevel).map((l) => (
                    <option key={l} value={l}>
                      {labelOf(l)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="About you" hint="Optional, up to 500 characters" error={e.bio}>
              {(p) => (
                <TextArea
                  {...p}
                  maxLength={500}
                  value={v.bio}
                  onChange={(x) => set('bio', x.target.value)}
                />
              )}
            </FormField>
          </div>
        </Panel>
        <Panel
          title="Weekly availability"
          description="You can only sign up for sessions inside these times."
        >
          <AvailabilityEditor
            value={v.availability}
            onChange={(a) => set('availability', a)}
            errors={e}
          />
        </Panel>
        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={form.submitting}>
            Save profile
          </Button>
        </div>
      </form>
    </>
  );
}
