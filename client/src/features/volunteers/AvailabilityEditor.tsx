/**
 * @file Weekly availability editor used by the application form and the profile page.
 */
import { Plus, Trash2 } from 'lucide-react';
import { DAY_NAMES } from '@shared/enums';
import { Button } from '@/components/Button';
import { Select, TextInput } from '@/components/Form';

/** One editable window. */
export interface AvailabilityDraft {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/** Props for {@link AvailabilityEditor}. */
export interface AvailabilityEditorProps {
  value: AvailabilityDraft[];
  onChange: (next: AvailabilityDraft[]) => void;
  /** Error keyed by `availability.<index>.<field>` from Zod. */
  errors?: Record<string, string>;
  describedBy?: string;
}

/** Max windows per volunteer — keeps the form manageable. */
const MAX_WINDOWS = 10;

/**
 * Editable list of day + start + end rows.
 * @param props - Editor props.
 * @returns The editor.
 */
export function AvailabilityEditor({
  value,
  onChange,
  errors = {},
  describedBy,
}: AvailabilityEditorProps) {
  /**
   * Updates one row.
   * @param i - Row index.
   * @param patch - Changed fields.
   */
  const update = (i: number, patch: Partial<AvailabilityDraft>) =>
    onChange(value.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  return (
    <div className="space-y-2" aria-describedby={describedBy}>
      {value.map((w, i) => {
        const rowError =
          errors[`availability.${i}.startTime`] ??
          errors[`availability.${i}.endTime`] ??
          (w.endTime <= w.startTime ? 'End time must be after start time.' : undefined);
        return (
          <div key={i} className="rounded-control border border-line p-2">
            <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-center">
              <Select
                aria-label={`Day for window ${i + 1}`}
                value={w.dayOfWeek}
                onChange={(e) => update(i, { dayOfWeek: Number(e.target.value) })}
                className="col-span-1"
              >
                {DAY_NAMES.map((d, di) => (
                  <option key={d} value={di}>
                    {d}
                  </option>
                ))}
              </Select>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove window ${i + 1}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                icon={<Trash2 className="size-4" aria-hidden />}
                className="sm:order-last"
              />
              <TextInput
                type="time"
                aria-label={`Start time for window ${i + 1}`}
                value={w.startTime}
                invalid={!!rowError}
                onChange={(e) => update(i, { startTime: e.target.value })}
              />
              <TextInput
                type="time"
                aria-label={`End time for window ${i + 1}`}
                value={w.endTime}
                invalid={!!rowError}
                onChange={(e) => update(i, { endTime: e.target.value })}
              />
            </div>
            {rowError && <p className="mt-1 text-sm font-medium text-bad">{rowError}</p>}
          </div>
        );
      })}
      <Button
        variant="secondary"
        size="sm"
        disabled={value.length >= MAX_WINDOWS}
        icon={<Plus className="size-4" aria-hidden />}
        onClick={() => onChange([...value, { dayOfWeek: 2, startTime: '15:00', endTime: '17:00' }])}
      >
        Add a time
      </Button>
    </div>
  );
}
