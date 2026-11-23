/**
 * @file Searchable Help Center (FR-32) with category filter and tour replay (FR-30).
 */
import Fuse from 'fuse.js';
import { Bot, PlayCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { visibleFaq, type FaqEntry } from '@shared/faq';
import { Button } from '@/components/Button';
import { FormField, TextInput } from '@/components/Form';
import { EmptyState, PageHeader, Panel } from '@/components/Layout';
import { useOrg } from '@/context/OrgContext';
import { useHelp } from '@/features/help/HelpContext';
import { cn } from '@/lib/cn';

/**
 * The Help Center.
 * @returns The page.
 */
export default function HelpPage() {
  const { managed } = useOrg();
  const { startTour, setAssistantOpen } = useHelp();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState<FaqEntry['category'] | 'All'>('All');
  const visible = useMemo(() => visibleFaq(managed.length > 0), [managed.length]);
  const fuse = useMemo(
    () =>
      new Fuse(visible, {
        keys: ['question', 'keywords', 'answer'],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [visible],
  );
  const categories = ['All', ...new Set(visible.map((f) => f.category))] as const;
  const results = (query.trim() ? fuse.search(query.trim()).map((r) => r.item) : visible).filter(
    (f) => category === 'All' || f.category === category,
  );

  return (
    <>
      <PageHeader
        title="Help Center"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<PlayCircle className="size-4" aria-hidden />}
              onClick={startTour}
            >
              Replay the tour
            </Button>
            <Button
              icon={<Bot className="size-4" aria-hidden />}
              onClick={() => setAssistantOpen(true)}
            >
              Ask the assistant
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <FormField label="Search help" className="w-full max-w-md">
          {(p) => (
            <TextInput
              {...p}
              type="search"
              maxLength={100}
              placeholder="e.g. waitlist, certificate, dark mode"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </FormField>
        <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                'min-h-9 rounded-full border px-3 text-sm font-medium',
                category === c
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-line bg-surface text-ink',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-3 text-sm text-ink-muted" role="status">
        {results.length} articles
      </p>
      {results.length === 0 ? (
        <EmptyState
          title="No answers found"
          message="Try different words, or ask the assistant."
          action={<Button onClick={() => setAssistantOpen(true)}>Ask the assistant</Button>}
        />
      ) : (
        <div className="space-y-2">
          {results.map((f) => (
            <details
              key={f.id}
              className="group rounded-panel border border-line bg-surface"
              open={results.length === 1}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 font-semibold">
                {f.question}
                <span className="shrink-0 rounded-full bg-surface-2 px-2 text-xs font-medium text-ink-muted">
                  {f.category}
                </span>
              </summary>
              <div className="border-t border-line px-5 py-3.5 text-sm text-ink">
                <p>{f.answer}</p>
                {f.route && (
                  <Link
                    to={f.route}
                    className="mt-2 inline-block font-semibold text-primary underline underline-offset-2"
                  >
                    Take me there
                  </Link>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
      <Panel className="mt-8" title="Keyboard shortcuts">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {[
            ['F1', 'Help for this screen'],
            ['Tab / Shift+Tab', 'Move between controls'],
            ['Enter or Space', 'Activate a button'],
            ['Esc', 'Close a dialog or the assistant'],
            ['[', 'Collapse or expand the sidebar'],
            ['↑ ↓ in search', 'Move through results'],
          ].map(([k, d]) => (
            <div key={k} className="flex items-center gap-3">
              <dt>
                <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-sans text-xs font-semibold">
                  {k}
                </kbd>
              </dt>
              <dd className="text-ink-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </>
  );
}
