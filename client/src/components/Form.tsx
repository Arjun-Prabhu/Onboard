/**
 * @file Accessible form controls (§2.7 step 1).
 *
 * {@link FormField} wires a label, an optional hint, and an inline error to its control via
 * `htmlFor`, `aria-describedby` and `aria-invalid`. Errors render in an `aria-live` region so
 * screen readers announce them as they appear.
 */
import { AlertCircle } from 'lucide-react';
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

/** Shared control styling. */
export const controlClass = (invalid?: boolean) =>
  cn(
    'w-full min-h-10 rounded-control border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/80',
    invalid ? 'border-bad ring-1 ring-bad' : 'border-line-strong',
  );

/** Props passed to a field's render function. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** Props for {@link FormField}. */
export interface FormFieldProps {
  label: string;
  /** Inline error message. */
  error?: string;
  /** Helper text shown under the label. */
  hint?: string;
  required?: boolean;
  className?: string;
  /** Render prop receiving the ids/ARIA attributes to spread on the control. */
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + hint + control + inline error, correctly associated for assistive tech.
 * @param props - Field props.
 * @returns The field wrapper.
 */
export function FormField({ label, error, hint, required, className, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = `${id}-error`;
  const describedBy = [hintId, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required && (
          <span className="text-bad" aria-hidden>
            {' '}
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      <div aria-live="polite" id={errorId}>
        {error && (
          <p className="flex items-start gap-1.5 text-sm font-medium text-bad">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Styled text input.
 * @param props - Native input props plus `invalid`.
 * @returns The input.
 */
export function TextInput({
  invalid,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn(controlClass(invalid), className)} {...rest} />;
}

/**
 * Styled select.
 * @param props - Native select props plus `invalid`.
 * @returns The select.
 */
export function Select({
  invalid,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={cn(controlClass(invalid), 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

/**
 * Styled textarea.
 * @param props - Native textarea props plus `invalid`.
 * @returns The textarea.
 */
export function TextArea({
  invalid,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={cn(controlClass(invalid), 'min-h-24', className)} {...rest} />;
}

/** Props for {@link Checkbox}. */
export interface CheckboxProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
}

/**
 * A labeled checkbox with a large click target.
 * @param props - Checkbox props.
 * @returns The checkbox row.
 */
export function Checkbox({ label, checked, onChange, description, disabled }: CheckboxProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 accent-[var(--rh-primary)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={description ? `${id}-d` : undefined}
      />
      <label htmlFor={id} className="text-sm text-ink">
        <span className="font-medium">{label}</span>
        {description && (
          <span id={`${id}-d`} className="block text-xs text-ink-muted">
            {description}
          </span>
        )}
      </label>
    </div>
  );
}

/** Props for {@link ChipGroup}. */
export interface ChipGroupProps {
  /** Accessible group label. */
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
  describedBy?: string;
  /** Optional one-line description per option, listed under the chips (e.g. skill notes). */
  notes?: Record<string, string>;
}

/**
 * Multi-select as toggle chips (e.g. skills). Each chip is a real checkbox for keyboard users.
 * @param props - Chip group props.
 * @returns The chip group.
 */
export function ChipGroup({
  label,
  options,
  selected,
  onChange,
  invalid,
  describedBy,
  notes,
}: ChipGroupProps) {
  const described = options.filter((o) => notes?.[o]);
  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o]);
  return (
    <fieldset aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <label
              key={o}
              className={cn(
                'inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus',
                on
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-line-strong bg-surface text-ink',
                invalid && !on && 'border-bad',
              )}
            >
              <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(o)} />
              <span
                aria-hidden
                className={cn(
                  'size-2.5 rounded-full border',
                  on ? 'border-primary bg-primary' : 'border-line-strong',
                )}
              />
              {o}
            </label>
          );
        })}
      </div>
      {described.length > 0 && (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-ink-muted sm:grid-cols-[auto_1fr]">
          {described.map((o) => (
            <div key={o} className="contents">
              <dt className="font-semibold text-ink">{o}</dt>
              <dd>{notes?.[o]}</dd>
            </div>
          ))}
        </dl>
      )}
    </fieldset>
  );
}

/**
 * Banner for a form-level error (e.g. a rule violation not tied to one field).
 * @param props - The message.
 * @returns The banner, or null.
 */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-control border border-bad bg-bad-soft px-3 py-2.5 text-sm font-medium text-bad"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </div>
  );
}
