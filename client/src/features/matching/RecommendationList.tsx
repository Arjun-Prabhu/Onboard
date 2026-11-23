/**
 * @file Volunteer Matching results with a visible "why recommended" breakdown (FR-22).
 */
import { ChevronDown, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { MatchResult } from '@shared/types';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/Layout';
import { MATCH_WEIGHTS } from '@shared/constants';

/** Props for {@link RecommendationList}. */
export interface RecommendationListProps {
  matches: MatchResult[];
  onAssign: (volunteerId: string) => void;
  busyId?: string;
  /** Disable assigning (e.g. past session). */
  disabled?: boolean;
}

/**
 * Ranked volunteer recommendations. Each row expands to show every factor's points.
 * @param props - List props.
 * @returns The list.
 */
export function RecommendationList({
  matches,
  onAssign,
  busyId,
  disabled,
}: RecommendationListProps) {
  const [openId, setOpenId] = useState<string>();
  if (matches.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="size-6" />}
        title="No eligible volunteers right now"
        message="Everyone who is active, cleared, and available at this time is already booked. Try widening the session time or recruiting from the pipeline."
      />
    );
  }
  return (
    <ol className="divide-y divide-line">
      {matches.map((m, rank) => {
        const open = openId === m.volunteer.id;
        return (
          <li key={m.volunteer.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-lg font-bold text-primary"
              >
                {rank + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold">
                    {m.volunteer.firstName} {m.volunteer.lastName}
                  </span>
                  <span>
                    <span className="font-display text-xl font-bold tabular-nums text-primary">
                      {m.score}
                    </span>
                    <span className="text-sm text-ink-muted">/100</span>
                  </span>
                </p>
                <p className="text-sm text-ink-muted">{m.summary}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => onAssign(m.volunteer.id)}
                    loading={busyId === m.volunteer.id}
                    disabled={disabled}
                  >
                    Assign
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={open}
                    aria-controls={`why-${m.volunteer.id}`}
                    onClick={() => setOpenId(open ? undefined : m.volunteer.id)}
                    icon={
                      <ChevronDown
                        className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    }
                  >
                    Why this match
                  </Button>
                </div>
              </div>
            </div>
            {open && (
              <dl
                id={`why-${m.volunteer.id}`}
                className="mt-3 grid grid-cols-1 gap-2 rounded-control bg-surface-2 p-3 sm:grid-cols-2"
              >
                {m.factors.map((f) => (
                  <div key={f.key}>
                    <dt className="flex justify-between text-sm font-medium">
                      <span>{f.label}</span>
                      <span className="tabular-nums text-ink-muted">
                        {Math.round(f.points)} / {MATCH_WEIGHTS[f.key]} pts
                      </span>
                    </dt>
                    <dd className="mt-1">
                      <span
                        aria-hidden
                        className="block h-2 overflow-hidden rounded-full bg-surface ring-1 ring-line"
                      >
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${(f.points / MATCH_WEIGHTS[f.key]) * 100}%` }}
                        />
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">{f.explanation}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}
