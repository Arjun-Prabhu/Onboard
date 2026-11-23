/**
 * @file An editable list of short names (skills, event roles): remove with ×, add from a text
 * box (Enter or the Add button), and optionally a one-line description per name (skills). Used by
 * Organization settings and the new-organization wizard.
 */
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { FormField, TextInput } from '@/components/Form';

/** Props for {@link NameListEditor}. */
export interface NameListEditorProps {
  /** Group label, e.g. "Skills". */
  label: string;
  /** Singular noun for buttons, e.g. "skill". */
  noun: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  error?: string;
  /**
   * Optional one-line description per name. When given, each name gets a "description" field
   * (left empty when the name explains itself).
   */
  notes?: Record<string, string>;
  onNotesChange?: (next: Record<string, string>) => void;
}

/**
 * An editable list of short names (skills, event roles): remove with ×, add from a text box.
 * Duplicates (ignoring case) are refused inline.
 * @param props - See {@link NameListEditorProps}.
 * @returns The editor.
 */
export function NameListEditor({
  label,
  noun,
  items,
  onChange,
  placeholder,
  error,
  notes,
  onNotesChange,
}: NameListEditorProps) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string>();

  /** Adds the typed name if it is new. */
  const add = () => {
    const name = draft.trim();
    if (!name) return;
    if (items.some((i) => i.toLowerCase() === name.toLowerCase()))
      return setProblem(`“${name}” is already on the list.`);
    onChange([...items, name]);
    setDraft('');
    setProblem(undefined);
  };

  /**
   * Removes a name and its description.
   * @param item - Name to remove.
   */
  const remove = (item: string) => {
    onChange(items.filter((i) => i !== item));
    if (notes && onNotesChange && notes[item]) {
      const { [item]: _gone, ...rest } = notes;
      void _gone;
      onNotesChange(rest);
    }
  };

  return (
    <div>
      {notes && onNotesChange ? (
        <ul className="space-y-2" aria-label={label}>
          {items.map((item) => (
            <li
              key={item}
              className="grid grid-cols-1 items-center gap-2 rounded-control border border-line px-3 py-2 sm:grid-cols-[12rem_1fr_auto]"
            >
              <span className="font-medium text-ink">{item}</span>
              <label className="sr-only" htmlFor={`note-${item}`}>
                Description of {item} (optional)
              </label>
              <TextInput
                id={`note-${item}`}
                maxLength={120}
                placeholder="Short description (optional)"
                value={notes[item] ?? ''}
                onChange={(e) => onNotesChange({ ...notes, [item]: e.target.value })}
              />
              <button
                type="button"
                aria-label={`Remove ${item}`}
                className="justify-self-end rounded-full p-1.5 text-ink-muted hover:text-bad"
                onClick={() => remove(item)}
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="text-sm text-ink-muted">None yet.</li>}
        </ul>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {items.map((item) => (
            <li
              key={item}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line-strong bg-surface pl-3 pr-1 text-sm font-medium"
            >
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                className="rounded-full p-1.5 text-ink-muted hover:text-bad"
                onClick={() => remove(item)}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="text-sm text-ink-muted">None yet.</li>}
        </ul>
      )}
      <div className="mt-3 flex max-w-md gap-2">
        <FormField label={`New ${noun}`} error={problem ?? error} className="flex-1">
          {(p) => (
            <TextInput
              {...p}
              maxLength={40}
              placeholder={placeholder}
              value={draft}
              invalid={!!(problem ?? error)}
              onChange={(e) => {
                setDraft(e.target.value);
                setProblem(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
          )}
        </FormField>
        <Button
          variant="secondary"
          className="mt-7 self-start"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={add}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
