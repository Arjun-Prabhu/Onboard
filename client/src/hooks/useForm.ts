/**
 * @file `useForm` — Zod-driven form state (§2.7 step 1).
 *
 * Validates a field on blur and the whole form on submit using the SAME shared schema the API
 * runs. Server-side rule violations (AppError with `field`) are merged back into the inline
 * errors so semantic messages appear next to the right input.
 */
import { useCallback, useState } from 'react';
import type { z } from 'zod';
import { AppError, messageOf } from '@shared/errors';
import { toFieldErrors } from '@shared/schemas';

/** Values returned by {@link useForm}. */
export interface FormApi<V> {
  values: V;
  errors: Record<string, string>;
  /** Form-level error not tied to a field. */
  formError: string | undefined;
  submitting: boolean;
  /** Sets one field's value and clears its error. */
  set: <K extends keyof V>(key: K, value: V[K]) => void;
  /** Validates one field (call on blur). */
  touch: (key: keyof V) => void;
  /** Validates everything, then runs `onValid`; server errors are mapped to fields. */
  submit: (onValid: (data: V) => Promise<void> | void) => Promise<void>;
  /** Replaces all values (e.g. when editing a different record). */
  reset: (next: V) => void;
}

/**
 * Creates form state bound to a Zod schema.
 * @param schema - Shared Zod schema for the form.
 * @param initial - Initial values.
 * @returns Form API.
 */
export function useForm<V extends Record<string, unknown>>(
  schema: z.ZodType,
  initial: V,
): FormApi<V> {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const set = useCallback(<K extends keyof V>(key: K, value: V[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const { [key as string]: _removed, ...rest } = e;
      void _removed;
      return rest;
    });
  }, []);

  const touch = useCallback(
    (key: keyof V) => {
      const result = schema.safeParse(values);
      const fieldErrors = result.success ? {} : toFieldErrors(result.error);
      setErrors((e) => {
        const next = { ...e };
        const msg = fieldErrors[key as string];
        if (msg) next[key as string] = msg;
        else delete next[key as string];
        return next;
      });
    },
    [schema, values],
  );

  const submit = useCallback(
    async (onValid: (data: V) => Promise<void> | void) => {
      setFormError(undefined);
      const result = schema.safeParse(values);
      if (!result.success) {
        setErrors(toFieldErrors(result.error));
        // Move focus to the first invalid field so keyboard and screen-reader users land on it.
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        );
        return;
      }
      setSubmitting(true);
      try {
        await onValid(result.data as V);
      } catch (err) {
        if (err instanceof AppError && err.field && err.field !== '_form') {
          setErrors((e) => ({
            ...e,
            ...(err.fieldErrors ?? {}),
            [err.field as string]: err.message,
          }));
          // Some rule fields (e.g. volunteerId) have no input — show those at form level too.
          if (!(err.field in values)) setFormError(err.message);
        } else {
          setFormError(messageOf(err));
        }
      } finally {
        setSubmitting(false);
      }
    },
    [schema, values],
  );

  const reset = useCallback((next: V) => {
    setValues(next);
    setErrors({});
    setFormError(undefined);
  }, []);

  return { values, errors, formError, submitting, set, touch, submit, reset };
}
