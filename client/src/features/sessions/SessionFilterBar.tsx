/**
 * @file Smart Filters bar with saved presets (FR-25), shared by the Manage sessions list and
 * My volunteering → Find sessions. Screens differ only by which optional filters they enable.
 */
import { Bookmark, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { DAY_NAMES, labelOf, SessionType } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { GENERIC_TERMS, type Terms } from '@shared/terms';
import type { Organization, Site, SessionFilters } from '@shared/types';
import { Button } from '@/components/Button';
import { Checkbox, FormField, Select, TextInput } from '@/components/Form';
import { Modal } from '@/components/Modal';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';

/**
 * Removes empty keys so filters compare and save cleanly.
 * @param f - Filters.
 * @returns Filters without undefined/false/empty values.
 */
export function cleanFilters(f: SessionFilters): SessionFilters {
  return Object.fromEntries(
    Object.entries(f).filter(([, v]) => v !== undefined && v !== false && v !== ''),
  ) as SessionFilters;
}

/**
 * Reads filters from the URL so assistant links and switcher links land pre-filtered.
 * @param params - URL search params.
 * @returns Filters.
 */
export function filtersFromUrl(params: URLSearchParams): SessionFilters {
  const num = (k: string) => (params.get(k) ? Number(params.get(k)) : undefined);
  return cleanFilters({
    search: params.get('q') ?? undefined,
    needsVolunteersOnly: params.get('needs') === '1' || undefined,
    withinDays: num('within'),
    dayOfWeek: num('day'),
    skill: params.get('skill') ?? undefined,
    orgId: params.get('org') ?? undefined,
  });
}

/** Props for {@link SessionFilterBar}. */
export interface SessionFilterBarProps {
  filters: SessionFilters;
  onChange: (next: SessionFilters) => void;
  /** Sites to filter by (Manage). */
  sites?: Site[];
  /** Organizations to filter by (Find sessions). */
  orgs?: Organization[];
  /** Offer the "open to guests only" toggle. */
  showGuestToggle?: boolean;
  /** Offer "include past and cancelled". */
  showIncludePast?: boolean;
  /** Skills to filter by (the org's catalog). */
  skills: readonly string[];
  /** The org's words for sites and its priority flag. */
  terms?: Terms;
  /** Offer the priority-site toggle (orgs that flag priority sites). */
  showPriority?: boolean;
}

/**
 * The filter panel, preset chips, and "Save filters" dialog.
 * @param props - Bar props.
 * @returns The filter section.
 */
export function SessionFilterBar({
  filters,
  onChange,
  sites,
  orgs,
  showGuestToggle,
  showIncludePast,
  skills,
  terms = GENERIC_TERMS,
  showPriority = true,
}: SessionFilterBarProps) {
  const toast = useToast();
  const presets = useAsync(() => api.presets.list(), []);
  const [open, setOpen] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const active = Object.keys(cleanFilters(filters)).length;

  /**
   * Updates one filter.
   * @param key - Filter key.
   * @param value - New value (undefined clears it).
   */
  const set = <K extends keyof SessionFilters>(key: K, value: SessionFilters[K]) =>
    onChange(cleanFilters({ ...filters, [key]: value }));

  /** Saves the current filters as a named preset. */
  const save = async () => {
    try {
      await api.presets.save(name, cleanFilters(filters));
      toast.show(`Saved “${name.trim()}”.`);
      setSaveOpen(false);
      setName('');
      presets.reload();
    } catch (err) {
      setNameError(messageOf(err));
    }
  };

  return (
    <section aria-label="Filters" className="mb-5 rounded-panel border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls="filter-panel"
          onClick={() => setOpen((o) => !o)}
          icon={<SlidersHorizontal className="size-4" aria-hidden />}
        >
          Filters{active ? ` (${active})` : ''}
        </Button>
        {presets.data?.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center rounded-full border border-line bg-surface-2"
          >
            <button
              type="button"
              className="inline-flex min-h-8 items-center gap-1.5 pl-3 pr-1 text-sm font-medium text-ink hover:text-primary"
              onClick={() => onChange(cleanFilters(p.filters))}
            >
              <Bookmark className="size-3.5" aria-hidden />
              {p.name}
            </button>
            <button
              type="button"
              aria-label={`Delete preset ${p.name}`}
              className="rounded-full p-1.5 text-ink-muted hover:text-bad"
              onClick={() =>
                void api.presets
                  .remove(p.id)
                  .then(presets.reload)
                  .catch((err: unknown) => toast.show(messageOf(err), 'error'))
              }
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
        {active > 0 && (
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onChange({})}>
              Clear
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setNameError(undefined);
                setSaveOpen(true);
              }}
            >
              Save filters
            </Button>
          </div>
        )}
      </div>
      {open && (
        <div id="filter-panel" className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Search">
            {(p) => (
              <TextInput
                {...p}
                type="search"
                maxLength={80}
                placeholder={`Title, ${terms.site}, or organization`}
                value={filters.search ?? ''}
                onChange={(e) => set('search', e.target.value || undefined)}
              />
            )}
          </FormField>
          {orgs && (
            <FormField label="Organization">
              {(p) => (
                <Select
                  {...p}
                  value={filters.orgId ?? ''}
                  onChange={(e) => set('orgId', e.target.value || undefined)}
                >
                  <option value="">All organizations</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          )}
          {sites && (
            <FormField label={terms.Site}>
              {(p) => (
                <Select
                  {...p}
                  value={filters.siteId ?? ''}
                  onChange={(e) => set('siteId', e.target.value || undefined)}
                >
                  <option value="">Any {terms.site}</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          )}
          <FormField label="Day">
            {(p) => (
              <Select
                {...p}
                value={filters.dayOfWeek ?? ''}
                onChange={(e) =>
                  set('dayOfWeek', e.target.value === '' ? undefined : Number(e.target.value))
                }
              >
                <option value="">Any day</option>
                {DAY_NAMES.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="When">
            {(p) => (
              <Select
                {...p}
                value={filters.withinDays ?? ''}
                onChange={(e) =>
                  set('withinDays', e.target.value ? Number(e.target.value) : undefined)
                }
              >
                <option value="">Any upcoming date</option>
                <option value="7">Next 7 days</option>
                <option value="14">Next 14 days</option>
                <option value="30">Next 30 days</option>
              </Select>
            )}
          </FormField>
          <FormField label="Skill needed">
            {(p) => (
              <Select
                {...p}
                value={filters.skill ?? ''}
                onChange={(e) => set('skill', e.target.value || undefined)}
              >
                <option value="">Any skill</option>
                {skills.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Type">
            {(p) => (
              <Select
                {...p}
                value={filters.type ?? ''}
                onChange={(e) =>
                  set('type', (e.target.value || undefined) as SessionType | undefined)
                }
              >
                <option value="">Any type</option>
                {Object.values(SessionType).map((t) => (
                  <option key={t} value={t}>
                    {labelOf(t)}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <div className="flex flex-col justify-end gap-2 sm:col-span-2">
            {showPriority && (
              <Checkbox
                label={`${terms.priority} ${terms.sites} only`}
                checked={!!filters.priorityOnly}
                onChange={(c) => set('priorityOnly', c || undefined)}
              />
            )}
            <Checkbox
              label="Still needs volunteers"
              checked={!!filters.needsVolunteersOnly}
              onChange={(c) => set('needsVolunteersOnly', c || undefined)}
            />
            {showGuestToggle && (
              <Checkbox
                label="Open to everyone only"
                checked={!!filters.guestsOnly}
                onChange={(c) => set('guestsOnly', c || undefined)}
              />
            )}
            {showIncludePast && (
              <Checkbox
                label="Include past and cancelled sessions"
                checked={!!filters.includePast}
                onChange={(c) => set('includePast', c || undefined)}
              />
            )}
          </div>
        </div>
      )}
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save filters"
        description="Name this combination so you can reuse it with one click."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>Save preset</Button>
          </>
        }
      >
        <FormField label="Preset name" error={nameError} required>
          {(p) => (
            <TextInput
              {...p}
              maxLength={50}
              value={name}
              invalid={!!nameError}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(undefined);
              }}
              placeholder={`e.g. Tuesday shifts, ${terms.priority}`}
            />
          )}
        </FormField>
      </Modal>
    </section>
  );
}
