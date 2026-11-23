/**
 * @file Typed application error (§2.7 step 4).
 *
 * Every expected failure — validation, permission, not-found — is thrown as an `AppError`
 * carrying a stable `code`, an optional `field` for inline display, and a friendly message
 * that is safe to show to users. Anything else is treated as unknown and replaced with a
 * generic message by the error boundary / centralized error handler.
 */

/** Stable error codes shared by the client and the API. */
export type AppErrorCode =
  | 'VALIDATION'
  | 'RULE_VIOLATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNKNOWN';

/** JSON shape the API returns for any error. */
export interface AppErrorBody {
  code: AppErrorCode;
  message: string;
  field?: string;
  fieldErrors?: Record<string, string>;
}

/** An expected, user-presentable error. */
export class AppError extends Error {
  /** Stable machine-readable code. */
  readonly code: AppErrorCode;
  /** Form field the error belongs to, if any. */
  readonly field?: string;
  /** Multiple field errors (e.g. from Zod). */
  readonly fieldErrors?: Record<string, string>;

  /**
   * Creates an AppError.
   * @param code - Error code.
   * @param message - Friendly message safe to show the user.
   * @param field - Optional field name for inline display.
   * @param fieldErrors - Optional map of field errors.
   */
  constructor(
    code: AppErrorCode,
    message: string,
    field?: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.field = field;
    this.fieldErrors = fieldErrors;
  }

  /**
   * Serializes the error to the API's JSON error body.
   * @returns The error body.
   */
  toJSON(): AppErrorBody {
    return {
      code: this.code,
      message: this.message,
      field: this.field,
      fieldErrors: this.fieldErrors,
    };
  }
}

/** Generic message used for unexpected errors — never leak internals. */
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Your data is safe — please try again.';

/**
 * Converts any thrown value into a friendly message.
 * @param err - The caught value.
 * @returns A message safe to show users.
 */
export function messageOf(err: unknown): string {
  if (err instanceof AppError) return err.message;
  return GENERIC_ERROR_MESSAGE;
}
