/**
 * @file Create an account (FR-4): the permanent sign-up. Every field validates on blur with the
 * shared Zod schema; duplicate emails are caught by rule V-S12 on submit.
 *
 * Choosing an organization is optional. A link an organizer shares (`/signup?org=…`) preselects
 * theirs, and the new account is filed there as a new volunteer. The person is signed in right
 * away and lands on their Volunteer Home. (Helping at one event without an account is a
 * different page: `GuestSignUpPage`.)
 */
import { UserPlus } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExperienceLevel, labelOf } from '@shared/enums';
import { volunteerApplicationSchema, type VolunteerApplicationInput } from '@shared/schemas';
import { Button, ButtonLink } from '@/components/Button';
import {
  Checkbox,
  ChipGroup,
  FormError,
  FormField,
  Select,
  TextArea,
  TextInput,
} from '@/components/Form';
import { Panel } from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { AvailabilityEditor } from '@/features/volunteers/AvailabilityEditor';
import { useForm } from '@/hooks/useForm';
import { api } from '@/lib/api';
import { Wordmark } from '@/app/AppShell';

const INITIAL: VolunteerApplicationInput = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  affiliation: '',
  zip: '',
  skills: [],
  availability: [{ dayOfWeek: 2, startTime: '15:00', endTime: '17:00' }],
  experienceLevel: ExperienceLevel.NEW,
  hasTransportation: true,
  bio: '',
  orgId: '',
  password: '',
};

/**
 * The sign-up page.
 * @returns The page.
 */
export default function SignUpPage() {
  const form = useForm(volunteerApplicationSchema, INITIAL);
  const toast = useToast();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const { values: v, errors: e, set, touch } = form;
  const linkedOrg = new URLSearchParams(useLocation().search).get('org');
  const orgs = useAsync(() => api.auth.publicOrgs(), []);
  const chosen = orgs.data?.find((o) => o.id === v.orgId);
  // The chosen org's skill catalog, plus anything already picked for another org.
  const catalog = chosen?.settings.skills ?? [];
  const skillOptions = [...catalog, ...v.skills.filter((x) => !catalog.includes(x))];

  // A shared link (/signup?org=…) picks its org.
  useEffect(() => {
    if (linkedOrg && orgs.data?.some((o) => o.id === linkedOrg)) set('orgId', linkedOrg);
  }, [orgs.data, set, linkedOrg]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Wordmark onDark={false} />
        <ButtonLink to="/login" variant="ghost" size="sm">
          Back to sign in
        </ButtonLink>
      </div>
      <h1 className="text-4xl font-bold sm:text-5xl">Create your account</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">
        One account for every organization you help. It keeps your shifts, your hours and your
        certificate in one place.
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Only helping at one event?{' '}
        <ButtonLink to="/help-once" variant="ghost" size="sm" className="px-1">
          Sign up for it without an account
        </ButtonLink>
      </p>

      <form
        noValidate
        className="mt-8 space-y-6"
        onSubmit={(ev) => {
          ev.preventDefault();
          void form.submit(async (data) => {
            const user = await api.auth.apply(data);
            setUser(user);
            toast.show(
              chosen
                ? `Welcome, ${user.firstName}. ${chosen.name} will review your application.`
                : `Welcome to Onboard, ${user.firstName}.`,
            );
            navigate('/me', { replace: true });
          });
        }}
      >
        <FormError message={form.formError} />
        <Panel
          title="Organization"
          description="Optional. You can join organizations, or start your own, after signing up."
        >
          <FormField
            label="Volunteer with an organization now?"
            error={e.orgId}
            className="max-w-md"
          >
            {(p) => (
              <Select
                {...p}
                value={v.orgId ?? ''}
                invalid={!!e.orgId}
                onChange={(x) => set('orgId', x.target.value)}
              >
                <option value="">I’ll choose later</option>
                {orgs.data?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          {chosen && <p className="mt-2 text-sm text-ink-muted">{chosen.description}</p>}
        </Panel>
        <Panel title="About you">
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
            <FormField label="Email" error={e.email} required>
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
            <FormField label="Site, college, or employer" error={e.affiliation} required>
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
            <FormField
              label="Home ZIP code"
              hint="Used to suggest nearby sites"
              error={e.zip}
              required
            >
              {(p) => (
                <TextInput
                  {...p}
                  inputMode="numeric"
                  maxLength={5}
                  autoComplete="postal-code"
                  value={v.zip}
                  invalid={!!e.zip}
                  onChange={(x) => set('zip', x.target.value)}
                  onBlur={() => touch('zip')}
                />
              )}
            </FormField>
          </div>
        </Panel>

        <Panel title="Skills & experience">
          <div className="space-y-5">
            {skillOptions.length > 0 ? (
              <FormField
                label="What can you help with?"
                hint="Choose all that apply"
                error={e.skills}
              >
                {(p) => (
                  <ChipGroup
                    label="Skills"
                    options={skillOptions}
                    notes={chosen?.settings.skillNotes}
                    selected={v.skills}
                    onChange={(s) => set('skills', s)}
                    invalid={!!e.skills}
                    describedBy={p['aria-describedby']}
                  />
                )}
              </FormField>
            ) : (
              <p className="text-sm text-ink-muted">
                Choose an organization above to pick from its skills, or add skills later in your
                profile.
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Volunteer experience" error={e.experienceLevel}>
                {(p) => (
                  <Select
                    {...p}
                    value={v.experienceLevel}
                    onChange={(x) =>
                      set(
                        'experienceLevel',
                        x.target.value as VolunteerApplicationInput['experienceLevel'],
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
              <div className="sm:pt-7">
                <Checkbox
                  label="I have reliable transportation"
                  checked={v.hasTransportation}
                  onChange={(c) => set('hasTransportation', c)}
                />
              </div>
            </div>
            <FormField
              label="Anything else we should know?"
              hint="Optional, up to 500 characters"
              error={e.bio}
            >
              {(p) => (
                <TextArea
                  {...p}
                  maxLength={500}
                  value={v.bio}
                  invalid={!!e.bio}
                  onChange={(x) => set('bio', x.target.value)}
                  onBlur={() => touch('bio')}
                />
              )}
            </FormField>
          </div>
        </Panel>

        <Panel
          title="When are you free?"
          description="Organizations use this to suggest shifts that fit your week. You can change it any time."
        >
          <FormField label="Weekly availability" error={e.availability} required>
            {(p) => (
              <AvailabilityEditor
                value={v.availability}
                onChange={(a) => set('availability', a)}
                errors={e}
                describedBy={p['aria-describedby']}
              />
            )}
          </FormField>
        </Panel>

        <Panel title="Create your sign-in">
          <FormField
            label="Password"
            hint="At least 8 characters, with a letter and a number"
            error={e.password}
            required
            className="max-w-sm"
          >
            {(p) => (
              <TextInput
                {...p}
                type="password"
                autoComplete="new-password"
                value={v.password}
                invalid={!!e.password}
                onChange={(x) => set('password', x.target.value)}
                onBlur={() => touch('password')}
              />
            )}
          </FormField>
        </Panel>

        <div className="flex justify-end">
          <Button
            type="submit"
            size="lg"
            loading={form.submitting}
            icon={<UserPlus className="size-4" aria-hidden />}
          >
            Create account
          </Button>
        </div>
      </form>
    </div>
  );
}
