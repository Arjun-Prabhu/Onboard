/**
 * @file "Sign in again" — shown over the current screen when the sign-in has ended (8 hours
 * without activity, 30 days old, or signed out in another tab).
 *
 * The screen underneath stays exactly as it was, so a half-filled form isn't lost: the person
 * types their password and carries on. Someone else can sign in instead; that reloads the app
 * so nothing of the first person's screen stays. The dialog can't be dismissed any other way,
 * because nothing behind it works until someone is signed in.
 */
import { LogIn } from 'lucide-react';
import { useEffect } from 'react';
import { loginSchema } from '@shared/schemas';
import { Button } from '@/components/Button';
import { FormError, FormField, TextInput } from '@/components/Form';
import { Modal } from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { useForm } from '@/hooks/useForm';

/**
 * The dialog; renders nothing while the sign-in is active.
 * @returns The dialog.
 */
export function SignInAgainDialog() {
  const { user, sessionExpired, signInAgain, logout } = useAuth();
  const form = useForm(loginSchema, { email: user?.email ?? '', password: '' });
  const { set } = form;

  // Clear the password each time the dialog opens.
  useEffect(() => {
    if (sessionExpired) set('password', '');
  }, [sessionExpired, set]);

  if (!user) return null;
  return (
    <Modal
      open={sessionExpired}
      // Esc does nothing: the screen behind needs someone signed in.
      onClose={() => undefined}
      size="sm"
      closable={false}
      title="Please sign in again"
      description={
        <>
          You were signed out after a while without activity. Your work on this screen is still
          here. Enter your password to carry on.
        </>
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void form.submit(signInAgain);
        }}
      >
        <FormError message={form.formError} />
        <p className="text-sm">
          Signed in as <strong className="font-semibold">{user.email}</strong>
        </p>
        <FormField label="Password" error={form.errors.password} required>
          {(p) => (
            <TextInput
              {...p}
              type="password"
              autoComplete="current-password"
              autoFocus
              value={form.values.password}
              invalid={!!form.errors.password}
              onChange={(e) => form.set('password', e.target.value)}
              onBlur={() => form.touch('password')}
            />
          )}
        </FormField>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
            onClick={() => void logout()}
          >
            Sign in as someone else
          </button>
          <Button
            type="submit"
            loading={form.submitting}
            icon={<LogIn className="size-4" aria-hidden />}
          >
            Sign in
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Shown when someone else signed in on this browser in another tab. A browser holds one sign-in
 * at a time, so this tab can only carry on as that person: it reloads as them. (To use two
 * accounts side by side, use two browsers, or a normal and a private window.)
 * @returns The dialog, or nothing.
 */
export function SwitchedAccountDialog() {
  const { user, switchedTo } = useAuth();
  if (!user || !switchedTo) return null;
  return (
    <Modal
      open
      onClose={() => undefined}
      size="sm"
      closable={false}
      title={`Now signed in as ${switchedTo.firstName} ${switchedTo.lastName}`}
      description={
        <>
          Someone signed in as {switchedTo.email} in another tab. This browser can only be signed in
          as one person at a time, so this tab will switch to them. To use two accounts side by
          side, open the second one in a different browser or a private window.
        </>
      }
    >
      <div className="flex justify-end">
        <Button autoFocus onClick={() => window.location.assign('/')}>
          Continue as {switchedTo.firstName}
        </Button>
      </div>
    </Modal>
  );
}
