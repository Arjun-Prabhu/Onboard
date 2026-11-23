/**
 * @file Status indicators. Status is ALWAYS color + icon + text, never color alone (§2.10).
 *
 * Includes the signature {@link PegMeter}: volunteer seats drawn as a row of open dots, filled
 * for each volunteer signed up (the same motif as the Onboard logo).
 */
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Clock,
  type LucideIcon,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
  XCircle,
} from 'lucide-react';
import { labelOf } from '@shared/enums';
import { cn } from '@/lib/cn';

/** Visual tone of a badge. */
export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  good: 'bg-good-soft text-good border-good/30',
  warn: 'bg-warn-soft text-warn border-warn/30',
  bad: 'bg-bad-soft text-bad border-bad/30',
  info: 'bg-primary-soft text-primary border-primary/30',
  neutral: 'bg-surface-2 text-ink-muted border-line',
};

/** Status value → tone + icon. Covers every status enum in the app. */
const STATUS_MAP: Record<string, { tone: Tone; icon: LucideIcon }> = {
  APPLIED: { tone: 'neutral', icon: UserPlus },
  INTERVIEWED: { tone: 'info', icon: CircleDashed },
  TRAINED: { tone: 'info', icon: ShieldCheck },
  ACTIVE: { tone: 'good', icon: UserCheck },
  INACTIVE: { tone: 'neutral', icon: UserX },
  SCHEDULED: { tone: 'info', icon: Clock },
  COMPLETED: { tone: 'good', icon: CheckCircle2 },
  CANCELLED: { tone: 'neutral', icon: CircleSlash },
  SIGNED_UP: { tone: 'info', icon: UserCheck },
  WAITLISTED: { tone: 'warn', icon: Clock },
  CHECKED_IN: { tone: 'good', icon: CheckCircle2 },
  NO_SHOW: { tone: 'bad', icon: XCircle },
  PENDING: { tone: 'warn', icon: Clock },
  APPROVED: { tone: 'good', icon: CheckCircle2 },
  REJECTED: { tone: 'bad', icon: XCircle },
  GOOD: { tone: 'good', icon: CheckCircle2 },
  NEEDS_REPAIR: { tone: 'warn', icon: AlertTriangle },
  MISSING_PARTS: { tone: 'warn', icon: AlertTriangle },
  RETIRED: { tone: 'neutral', icon: CircleSlash },
  COMPLETE: { tone: 'good', icon: CheckCircle2 },
  EXPIRING: { tone: 'warn', icon: Clock },
  EXPIRED: { tone: 'bad', icon: AlertOctagon },
  MISSING: { tone: 'neutral', icon: CircleDashed },
  HIGH: { tone: 'bad', icon: AlertOctagon },
  MEDIUM: { tone: 'warn', icon: AlertTriangle },
  LOW: { tone: 'good', icon: CheckCircle2 },
};

/** Props for {@link Badge}. */
export interface BadgeProps {
  tone?: Tone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

/**
 * A small pill label.
 * @param props - Badge props.
 * @returns The badge.
 */
export function Badge({ tone = 'neutral', icon: Icon, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold',
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

/**
 * Badge for any status enum value, with the correct tone, icon and label.
 * @param props - The status value.
 * @returns The badge.
 */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const m = STATUS_MAP[status] ?? { tone: 'neutral' as Tone, icon: CircleDashed };
  return (
    <Badge tone={m.tone} icon={m.icon} className={className}>
      {labelOf(status)}
    </Badge>
  );
}

/** Props for {@link PegMeter}. */
export interface PegMeterProps {
  filled: number;
  total: number;
  /** Waitlisted count, drawn as outlined pegs after the beam. */
  waitlist?: number;
  size?: 'sm' | 'md';
}

/** Above this many seats the meter collapses to a bar so it never wraps awkwardly. */
const MAX_PEGS = 14;

/**
 * Seat meter: one dot per volunteer seat, filled when taken.
 * The accessible name states the numbers, so the graphic itself is decorative.
 * @param props - Meter props.
 * @returns The meter.
 */
export function PegMeter({ filled, total, waitlist = 0, size = 'md' }: PegMeterProps) {
  const full = filled >= total;
  const open = Math.max(0, total - filled);
  const label = `${filled} of ${total} volunteers${full ? ', full' : `, ${open} spots open`}${waitlist ? `, ${waitlist} waiting` : ''}`;
  const dot = size === 'sm' ? 'size-2.5' : 'size-3.5';
  const fillClass = full
    ? 'bg-good border-good'
    : filled / total >= 0.5
      ? 'bg-primary border-primary'
      : 'bg-bad border-bad';
  return (
    <div className="flex items-center gap-2" role="img" aria-label={label}>
      {total <= MAX_PEGS ? (
        <span
          aria-hidden
          className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-1.5 py-1"
        >
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                'rounded-full border-2',
                dot,
                i < filled ? fillClass : 'border-line-strong bg-surface',
              )}
            />
          ))}
        </span>
      ) : (
        <span
          aria-hidden
          className="h-2.5 w-24 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line"
        >
          <span
            className={cn('block h-full', fillClass)}
            style={{ width: `${Math.min(100, (filled / total) * 100)}%` }}
          />
        </span>
      )}
      <span aria-hidden className="text-sm tabular-nums text-ink">
        {full ? (
          <span className="font-semibold">Full</span>
        ) : (
          <>
            <span className="font-semibold">{open}</span> of {total} spots open
          </>
        )}
      </span>
      {waitlist > 0 && (
        <span aria-hidden className="text-xs text-ink-muted">
          · {waitlist} waiting
        </span>
      )}
    </div>
  );
}
