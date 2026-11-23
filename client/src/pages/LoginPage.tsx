/**
 * @file Sign-in screen (FR-1) with one-click demo accounts for the competition presentation.
 */
import { Hand, LogIn, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { messageOf } from '@shared/errors';
import { useLocation, useNavigate } from 'react-router-dom';
import { loginSchema } from '@shared/schemas';
import { Button, ButtonLink } from '@/components/Button';
import { FormError, FormField, TextInput } from '@/components/Form';
import { useAuth } from '@/context/AuthContext';
import { useForm } from '@/hooks/useForm';
import { Wordmark } from '@/app/AppShell';
import { DEMO_ACCOUNTS } from '@shared/demo/seed';

/**
 * The login page.
 * @returns The page.
 */
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const form = useForm(loginSchema, { email: '', password: '' });
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string>();

  /**
   * Signs in with given values.
   * @param values - Email and password.
   */
  const signIn = async (values: { email: string; password: string }) => {
    await login(values);
    navigate(from, { replace: true });
  };

  /**
   * Signs in with a demo account, bypassing the form fields.
   * @param creds - Demo credentials.
   */
  const demo = async (creds: { email: string; password: string }) => {
    setDemoBusy(true);
    setDemoError(undefined);
    try {
      await signIn(creds);
    } catch (err) {
      setDemoError(messageOf(err));
      setDemoBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section
        className="peg-grid relative hidden flex-col justify-between bg-rail p-10 text-rail-ink lg:flex"
        aria-label="About Onboard"
      >
        <Wordmark />
        <div className="max-w-lg">
          <h2 className="text-5xl font-bold leading-[1.05]">Every shift, fully staffed.</h2>
          <p className="mt-4 text-lg text-rail-muted">
            Onboard helps nonprofits — robotics clubs, free clinics, youth leagues — recruit
            volunteers, match them to the right shifts, and show sponsors the hours behind the work.
          </p>
        </div>
        <p className="text-sm text-rail-muted">
          Runs on your laptop in any browser — no cloud account needed.
        </p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark onDark={false} />
          </div>
          <h1 className="text-4xl font-bold">Sign in</h1>
          <p className="mt-1 text-ink-muted">Welcome back. Use your Onboard email and password.</p>

          <form
            className="mt-8 space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void form.submit(signIn);
            }}
          >
            <FormError message={form.formError} />
            <FormField label="Email" error={form.errors.email} required>
              {(p) => (
                <TextInput
                  {...p}
                  type="email"
                  autoComplete="email"
                  value={form.values.email}
                  invalid={!!form.errors.email}
                  onChange={(e) => form.set('email', e.target.value)}
                  onBlur={() => form.touch('email')}
                />
              )}
            </FormField>
            <FormField label="Password" error={form.errors.password} required>
              {(p) => (
                <TextInput
                  {...p}
                  type="password"
                  autoComplete="current-password"
                  value={form.values.password}
                  invalid={!!form.errors.password}
                  onChange={(e) => form.set('password', e.target.value)}
                  onBlur={() => form.touch('password')}
                />
              )}
            </FormField>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={form.submitting}
              icon={<LogIn className="size-4" aria-hidden />}
            >
              Sign in
            </Button>
          </form>

          <div className="mt-8 rounded-panel border border-line bg-surface p-4">
            <h2 className="text-lg font-semibold">Try the demo</h2>
            <p className="text-sm text-ink-muted">Sample data with fictional names.</p>
            <ul className="mt-3 space-y-2">
              {DEMO_ACCOUNTS.map((d) => (
                <li key={d.key}>
                  <Button
                    variant="secondary"
                    className="w-full justify-between"
                    onClick={() => void demo(d)}
                    disabled={demoBusy}
                  >
                    <span>{d.label}</span>
                    <span className="text-xs font-normal text-ink-muted">{d.email}</span>
                  </Button>
                </li>
              ))}
            </ul>
            <FormError message={demoError} />
            <p className="mt-3 text-xs text-ink-muted">
              Alex’s password is {DEMO_ACCOUNTS[0].password}; everyone else uses{' '}
              {DEMO_ACCOUNTS[1].password}. One login can hold different roles in different
              organizations.
            </p>
          </div>

          <h2 className="mt-8 text-lg font-semibold">New here?</h2>
          <div className="mt-2 grid gap-2">
            <ButtonLink
              to="/signup"
              variant="accent"
              className="w-full"
              icon={<UserPlus className="size-4" aria-hidden />}
            >
              Create an account
            </ButtonLink>
            <ButtonLink
              to="/help-once"
              variant="secondary"
              className="w-full"
              icon={<Hand className="size-4" aria-hidden />}
            >
              Volunteer at one event — no account
            </ButtonLink>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            An account keeps your shifts, hours and certificate. Volunteering once needs only your
            name, email and phone.
          </p>
        </div>
      </section>
    </div>
  );
}
