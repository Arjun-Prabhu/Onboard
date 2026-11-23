/**
 * @file "Add volunteer" (Volunteers → People). An organizer types a name and email; someone who
 * already has an Onboard account is added to the org, and anyone new gets an account with a
 * temporary password shown once, to pass on. The other way in is the public application, whose
 * link (with this org preselected) is one click away.
 */
import { Copy, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { VolunteerStatus } from '@shared/enums';
import { addVolunteerSchema, type AddVolunteerInput } from '@shared/schemas';
import type { Organization, Volunteer } from '@shared/types';
import { Button } from '@/components/Button';
import { ChipGroup, FormError, FormField, TextInput } from '@/components/Form';
import { Modal } from '@/components/Modal';
import { useToast, type ToastKind } from '@/context/ToastContext';
import { useForm } from '@/hooks/useForm';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const BLANK: AddVolunteerInput = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  skills: [],
  status: VolunteerStatus.APPLIED,
};

/**
 * The public application link for an org, with the org preselected.
 * @param orgId - Org.
 * @returns Absolute URL.
 */
export const applyLink = (orgId: string) =>
  `${window.location.origin}/signup?org=${encodeURIComponent(orgId)}`;

/**
 * Copies the application link and says so.
 * @param orgId - Org.
 * @param show - Toast function.
 */
export async function copyApplyLink(
  orgId: string,
  show: (msg: string, kind?: ToastKind) => void,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(applyLink(orgId));
    show('Application link copied. Paste it in an email, flyer or social post.');
  } catch {
    show(`Copy this link: ${applyLink(orgId)}`, 'info');
  }
}

/** Props for {@link AddVolunteerModal}. */
export interface AddVolunteerModalProps {
  open: boolean;
  org: Organization;
  onClose: () => void;
  onAdded: (v: Volunteer) => void;
}

/**
 * The add-volunteer dialog.
 * @param props - See {@link AddVolunteerModalProps}.
 * @returns The modal.
 */
export function AddVolunteerModal({ open, org, onClose, onAdded }: AddVolunteerModalProps) {
  const toast = useToast();
  const form = useForm(addVolunteerSchema, BLANK);
  const { values: v, errors: e, set, touch, reset } = form;
  // After a brand-new account is made, the dialog shows the temporary password once.
  const [created, setCreated] = useState<{ name: string; email: string; password: string }>();

  useEffect(() => {
    if (open) {
      reset(BLANK);
      setCreated(undefined);
    }
  }, [open, reset]);

  if (created)
    return (
      <Modal
        open={open}
        onClose={onClose}
        size="sm"
        title={`${created.name} is added`}
        description="They didn’t have an Onboard account, so one was made. Pass these on; they can change the password after signing in."
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <dl className="space-y-2 rounded-control bg-surface-2 p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="font-semibold">Email</dt>
            <dd>{created.email}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="font-semibold">Temporary password</dt>
            <dd className="flex items-center gap-2 font-mono">
              {created.password}
              <Button
                variant="ghost"
                size="sm"
                aria-label="Copy password"
                icon={<Copy className="size-4" aria-hidden />}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(created.password)
                    .then(() => toast.show('Password copied.'))
                    .catch(() => undefined)
                }
              />
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-muted">
          This password is shown only now, so copy it before you close this window.
        </p>
      </Modal>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a volunteer"
      description="Add someone you’ve already talked to. If they have an Onboard account, they’re simply added here."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={form.submitting}
            icon={<UserPlus className="size-4" aria-hidden />}
            onClick={() =>
              void form.submit(async (data) => {
                const out = await api.volunteers.add(org.id, data);
                toast.show(out.message);
                onAdded(out.volunteer);
                if (out.tempPassword)
                  setCreated({
                    name: `${data.firstName} ${data.lastName}`,
                    email: data.email,
                    password: out.tempPassword,
                  });
                else onClose();
              })
            }
          >
            Add volunteer
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
        <FormField label="First name" error={e.firstName} required>
          {(p) => (
            <TextInput
              {...p}
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
              value={v.email}
              invalid={!!e.email}
              onChange={(x) => set('email', x.target.value)}
              onBlur={() => touch('email')}
            />
          )}
        </FormField>
        <FormField label="Phone" hint="Optional" error={e.phone}>
          {(p) => (
            <TextInput
              {...p}
              type="tel"
              value={v.phone ?? ''}
              invalid={!!e.phone}
              onChange={(x) => set('phone', x.target.value)}
              onBlur={() => touch('phone')}
            />
          )}
        </FormField>
        {org.settings.skills.length > 0 && (
          <div className="sm:col-span-2">
            <FormField label="Skills" hint="Optional — they can add more on their profile">
              {(p) => (
                <ChipGroup
                  label="Skills"
                  options={org.settings.skills}
                  notes={org.settings.skillNotes}
                  selected={v.skills}
                  onChange={(s) => set('skills', s)}
                  describedBy={p['aria-describedby']}
                />
              )}
            </FormField>
          </div>
        )}
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-semibold">Where do they start?</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                [
                  VolunteerStatus.APPLIED,
                  'New application',
                  'You still need to meet or train them',
                ],
                [
                  VolunteerStatus.ACTIVE,
                  'Ready to serve',
                  'Can sign up right away (once their checklist is recorded, if you keep one)',
                ],
              ] as const
            ).map(([status, label, hint]) => (
              <label
                key={status}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-control border p-3',
                  v.status === status
                    ? 'border-primary bg-primary-soft'
                    : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name="start-status"
                  checked={v.status === status}
                  onChange={() => set('status', status)}
                  className="mt-1 size-4 accent-[var(--rh-primary)]"
                />
                <span>
                  <span className="block font-semibold text-ink">{label}</span>
                  <span className="block text-sm text-ink-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
