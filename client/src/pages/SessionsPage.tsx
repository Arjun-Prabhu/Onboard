/**
 * @file Manage → Sessions for the active org: smart filters, presets and scheduling (FR-11,
 * FR-25). `?new=1` opens the "New session" form directly (dashboard shortcut).
 */
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { SessionFilters } from '@shared/types';
import { Button, ButtonLink } from '@/components/Button';
import { EmptyState, ErrorBlock, Loading, PageHeader } from '@/components/Layout';
import { useManagedOrg } from '@/context/OrgContext';
import { SessionCard } from '@/features/sessions/SessionCard';
import { filtersFromUrl, SessionFilterBar } from '@/features/sessions/SessionFilterBar';
import { SessionFormModal } from '@/features/sessions/SessionFormModal';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';

/**
 * The Manage sessions page.
 * @returns The page.
 */
export default function SessionsPage() {
  const { org, can, terms, features } = useManagedOrg();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState<SessionFilters>(() => filtersFromUrl(params));
  const [createOpen, setCreateOpen] = useState(params.get('new') === '1');
  const sessions = useAsync(
    () => api.sessions.list(org.id, filters),
    [org.id, JSON.stringify(filters)],
  );
  const lookups = useAsync(
    () => Promise.all([api.sites.list(org.id), api.programs.list(org.id)]),
    [org.id],
  );
  const [sites, programs] = lookups.data ?? [[], []];

  return (
    <>
      <PageHeader
        title="Sessions"
        actions={
          can('sessions.edit') && (
            <Button
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => setCreateOpen(true)}
              disabled={!programs.length}
            >
              New session
            </Button>
          )
        }
      />
      <SessionFilterBar
        filters={filters}
        onChange={setFilters}
        sites={sites}
        skills={org.settings.skills}
        terms={terms}
        showPriority={features.prioritySites}
        showIncludePast
      />
      {sessions.error ? (
        <ErrorBlock message={sessions.error} onRetry={sessions.reload} />
      ) : sessions.loading && !sessions.data ? (
        <Loading />
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-muted" role="status">
            {sessions.data?.length ?? 0} sessions
          </p>
          {sessions.data?.length === 0 ? (
            <EmptyState
              title={programs.length ? 'No sessions match' : 'No programs yet'}
              message={
                programs.length
                  ? 'Try removing a filter or widening the date range.'
                  : 'Sessions are the dates of a program. Add a program first, then its sessions.'
              }
              action={
                programs.length ? (
                  <Button variant="secondary" onClick={() => setFilters({})}>
                    Clear filters
                  </Button>
                ) : (
                  can('sites.edit') && (
                    <ButtonLink to="/programs" variant="primary">
                      Go to Programs
                    </ButtonLink>
                  )
                )
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {sessions.data?.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  actions={
                    <ButtonLink to={`/sessions/${s.id}`} size="sm">
                      Manage
                    </ButtonLink>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
      {can('sessions.edit') && (
        <SessionFormModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          programs={programs}
          sites={sites}
          org={org}
          onSaved={(s, count = 1) => {
            setCreateOpen(false);
            // One new session: open it. Several (repeat weekly): stay on the refreshed list.
            if (count > 1) sessions.reload();
            else navigate(`/sessions/${s.id}`);
          }}
        />
      )}
    </>
  );
}
