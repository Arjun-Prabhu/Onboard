/**
 * @file Top-bar search (§2.10) — an accessible combobox over volunteers, sessions, sites and
 * help articles. Results follow the person's role in the active org: people without a
 * management role there never see other volunteers. Press "/" anywhere to jump here.
 */
import Fuse from 'fuse.js';
import { Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { visibleFaq } from '@shared/faq';
import { formatDate } from '@shared/time';
import type { Site, SessionView, Volunteer } from '@shared/types';
import { useOrg } from '@/context/OrgContext';
import { relationshipLabel } from './OrgSwitcher';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/** One search result. */
interface Hit {
  id: string;
  kind: 'Organization' | 'Volunteer' | 'Session' | 'Site' | 'Help';
  label: string;
  detail: string;
  to: string;
}

/**
 * Global search box with a results listbox.
 * @returns The search component.
 */
export function GlobalSearch() {
  const { affiliations, managed, activeOrg, can } = useOrg();
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [corpus, setCorpus] = useState<Hit[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // The index depends on which org is being managed; rebuild it after a switch.
  useEffect(() => setCorpus([]), [activeOrg?.id]);

  // "/" jumps to search from anywhere (§2.10 click-reduction), unless the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '/' || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
        return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Build the index lazily on first focus so startup stays fast (NFR-3).
  const loadCorpus = async () => {
    if (corpus.length) return;
    const orgId = activeOrg?.id;
    const [vols, sessions, sites] = await Promise.all([
      orgId && can('volunteers.view')
        ? api.volunteers.list(orgId)
        : Promise.resolve([] as Volunteer[]),
      orgId && can('volunteers.view') ? api.sessions.list(orgId) : api.sessions.browse(),
      orgId && can('sites.edit') ? api.sites.list(orgId) : Promise.resolve([] as Site[]),
    ]).catch(() => [[], [], []] as [Volunteer[], SessionView[], Site[]]);
    setCorpus([
      ...affiliations.map<Hit>((a) => ({
        id: a.org.id,
        kind: 'Organization',
        label: a.org.name,
        detail: relationshipLabel(a),
        to: a.role ? '/me/orgs' : `/me/find?org=${a.org.id}`,
      })),
      ...vols.map<Hit>((v) => ({
        id: v.id,
        kind: 'Volunteer',
        label: `${v.firstName} ${v.lastName}`,
        detail: v.affiliation,
        to: `/volunteers/${v.id}`,
      })),
      ...sessions.map<Hit>((s) => ({
        id: s.id,
        kind: 'Session',
        label: s.title,
        detail: `${s.org.name} · ${s.site.name} · ${formatDate(s.date, { year: undefined })}`,
        to: `/sessions/${s.id}`,
      })),
      ...sites.map<Hit>((s) => ({
        id: s.id,
        kind: 'Site',
        label: s.name,
        detail: s.address,
        to: '/sites',
      })),
      ...visibleFaq(managed.length > 0).map<Hit>((f) => ({
        id: f.id,
        kind: 'Help',
        label: f.question,
        detail: f.category,
        to: `/help?q=${encodeURIComponent(f.question)}`,
      })),
    ]);
  };

  const fuse = useMemo(
    () => new Fuse(corpus, { keys: ['label', 'detail'], threshold: 0.35, ignoreLocation: true }),
    [corpus],
  );
  const hits = useMemo(
    () => (query.trim() ? fuse.search(query.trim(), { limit: 8 }).map((r) => r.item) : []),
    [fuse, query],
  );

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const onDown = (e: MouseEvent) =>
      !wrapRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  /**
   * Navigates to a hit and resets the box.
   * @param hit - The chosen result.
   */
  const go = (hit: Hit) => {
    navigate(hit.to);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative w-full max-w-md" data-tour="search">
      <label htmlFor="global-search" className="sr-only">
        Search Onboard
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
        aria-hidden
      />
      <input
        id="global-search"
        ref={inputRef}
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
        value={query}
        maxLength={80}
        placeholder={activeOrg ? 'Search people, sessions and places' : 'Search shifts and help'}
        onFocus={() => {
          void loadCorpus();
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(hits.length - 1, a + 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          }
          if (e.key === 'Enter' && hits[active]) {
            e.preventDefault();
            go(hits[active]);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        className="min-h-10 w-full rounded-control border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink"
      />
      {open && query.trim() && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded-panel border border-line bg-surface py-1 shadow-xl"
        >
          {hits.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-muted">
              No matches. Try a name, site, or topic.
            </li>
          )}
          {hits.map((h, i) => (
            <li
              key={`${h.kind}-${h.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(h);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm',
                i === active && 'bg-primary-soft',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{h.label}</span>
                <span className="block truncate text-xs text-ink-muted">{h.detail}</span>
              </span>
              <span className="shrink-0 rounded-full border border-line px-2 text-xs text-ink-muted">
                {h.kind}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
