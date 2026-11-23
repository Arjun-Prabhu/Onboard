/**
 * @file Button — the one clickable-action component. Large targets (≥40px) per NFR-4.
 */
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

/** Visual variants. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
/** Size options. */
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-bad text-white hover:opacity-90',
  accent: 'bg-accent text-on-accent hover:brightness-95',
};
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm gap-1.5',
  md: 'min-h-10 px-4 text-sm gap-2',
  lg: 'min-h-12 px-5 text-base gap-2',
};

/**
 * Builds the className for a button-styled element.
 * @param variant - Visual variant.
 * @param size - Size.
 * @param extra - Extra classes.
 * @returns The className string.
 */
export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra?: string,
): string {
  return cn(
    'inline-flex items-center justify-center rounded-control font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

/** Props for {@link Button}. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Leading icon. */
  icon?: ReactNode;
}

/**
 * A styled `<button>`.
 * @param props - Button props.
 * @returns The button element.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** Props for {@link ButtonLink}. */
export interface ButtonLinkProps {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * A router link styled as a button — for navigation actions.
 * @param props - Link props.
 * @returns The link element.
 */
export function ButtonLink({
  to,
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
}: ButtonLinkProps) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}
