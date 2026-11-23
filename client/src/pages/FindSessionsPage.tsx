/**
 * @file My volunteering → Find sessions (FR-13, FR-2b, FR-3d, FR-25): open sessions across every
 * org where the person has standing, plus events any org has opened to guests, in one grid with
 * search, filters, grouping and a sign-up button on each row.
 */
import type { ColDef, GridState, ICellRendererParams } from 'ag-grid-community';
import { createContext, useContext, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { messageOf } from '@shared/errors';
import { termsOf } from '@shared/terms';
import type { SessionView } from '@shared/types';
import { Button, ButtonLink } from '@/components/Button';
import { DataGrid } from '@/components/DataGrid';
import {
  ACTIONS_COLUMN,
  dateColumn,
  enumLabel,
  timeColumn,
  yesNoColumn,
} from '@/components/gridCells';
import { EmptyState, ErrorBlock, Loading, PageHeader } from '@/components/Layout';
import { Badge, PegMeter } from '@/components/Status';
import { useUser } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';

/** Sign-up state shared with the row buttons through context. */
interface FindActions {
  userId: string;
  busyId?: string;
  activeOrgIds: Set<string>;
  signUp: (sessionId: string) => Promise<void>;
}
const ActionsContext = createContext<FindActions | null>(null);

/** The session title, linking to its page. */
function SessionCell({ data }: ICellRendererParams<SessionView>) {
  if (!data) return null;
  return (
    <Link to={`/sessions/${data.id}`} className="font-semibold text-primary hover:underline">
      {data.title}
    </Link>
  );
}

/** Seats filled, as dots on the seat meter (same meter as everywhere else). */
function StaffingCell({ data }: ICellRendererParams<SessionView>) {
  if (!data) return null;
  return (
    <PegMeter
      filled={data.signedUpCount}
      total={data.volunteersNeeded}
      waitlist={data.waitlistCount}
      size="sm"
    />
  );
}

/** "You're signed up", or the right sign-up button for this person and session. */
function ActionCell({ data }: ICellRendererParams<SessionView>) {
  const ctx = useContext(ActionsContext);
  if (!data || !ctx) return null;
  const mine = data.roster.find((r) => r.userId === ctx.userId);
  if (mine)
    return (
      <Badge tone={mine.status === 'WAITLISTED' ? 'warn' : 'good'}>
        {mine.status === 'WAITLISTED' ? `Waitlist #${mine.waitlistPosition}` : 'You’re signed up'}
      </Badge>
    );
  const full = data.signedUpCount >= data.volunteersNeeded;
  return (
    <Button size="sm" loading={ctx.busyId === data.id} onClick={() => void ctx.signUp(data.id)}>
      {full ? 'Join waiting list' : ctx.activeOrgIds.has(data.org.id) ? 'Sign up' : 'Help once'}
    </Button>
  );
}

const COLUMNS: ColDef<SessionView>[] = [
  dateColumn<SessionView>('date', 'Date', (s) => s.date, { sort: 'asc', pinned: 'left' }),
  timeColumn<SessionView>((s) => ({ start: s.startTime, end: s.endTime })),
  {
    colId: 'session',
    headerName: 'Session',
    valueGetter: (p) => p.data?.title,
    cellRenderer: SessionCell,
    filter: 'agTextColumnFilter',
    minWidth: 220,
    flex: 1,
  },
  {
    colId: 'org',
    headerName: 'Organization',
    valueGetter: (p) => p.data?.org.name,
    filter: 'agSetColumnFilter',
    enableRowGroup: true,
    enablePivot: true,
    minWidth: 180,
  },
  {
    colId: 'site',
    headerName: 'Site',
    valueGetter: (p) => p.data?.site.name,
    filter: 'agSetColumnFilter',
    enableRowGroup: true,
    enablePivot: true,
    minWidth: 180,
  },
  {
    colId: 'type',
    headerName: 'Type',
    valueGetter: (p) => p.data?.type,
    valueFormatter: enumLabel,
    filter: 'agSetColumnFilter',
    filterParams: { valueFormatter: enumLabel },
    enableRowGroup: true,
    enablePivot: true,
    minWidth: 130,
  },
  {
    colId: 'skills',
    headerName: 'Skills needed',
    valueGetter: (p) => p.data?.requiredSkills ?? [],
    valueFormatter: (p) => ((p.value as string[] | undefined) ?? []).join(', '),
    filter: 'agSetColumnFilter',
    sortable: false,
    minWidth: 180,
  },
  {
    colId: 'staffing',
    headerName: 'Staffing',
    headerTooltip: 'Volunteers signed up out of volunteers needed; outlined dots are the waitlist',
    valueGetter: (p) => (p.data ? `${p.data.signedUpCount}/${p.data.volunteersNeeded}` : null),
    cellRenderer: StaffingCell,
    filter: false,
    sortable: false,
    minWidth: 170,
  },
  {
    colId: 'openSeats',
    headerName: 'Open seats',
    valueGetter: (p) =>
      p.data ? Math.max(0, p.data.volunteersNeeded - p.data.signedUpCount) : null,
    type: 'numericColumn',
    filter: 'agNumberColumnFilter',
    enableValue: true,
    aggFunc: 'sum',
    minWidth: 120,
  },
  yesNoColumn<SessionView>('guests', 'Open to everyone', (s) => s.openToGuests),
  {
    colId: 'priority',
    headerName: 'Priority site',
    headerTooltip: 'The organization flags this site as a priority (e.g. Title I schools)',
    valueGetter: (p) =>
      p.data?.site.priority && p.data.org.settings.features.prioritySites
        ? termsOf(p.data.org).priority
        : '',
    filter: 'agSetColumnFilter',
    enableRowGroup: true,
    minWidth: 140,
  },
  {
    ...ACTIONS_COLUMN,
    headerName: 'Sign up',
    cellRenderer: ActionCell,
    minWidth: 170,
  } as ColDef<SessionView>,
];

/**
 * The Find sessions page.
 * @returns The page.
 */
export default function FindSessionsPage() {
  const user = useUser();
  const { affiliations } = useOrg();
  const toast = useToast();
  const [params] = useSearchParams();
  const [busyId, setBusyId] = useState<string>();
  const sessions = useAsync(() => api.sessions.browse({}), []);
  const activeOrgIds = useMemo(
    () => new Set(affiliations.filter((a) => a.volunteerStatus === 'ACTIVE').map((a) => a.org.id)),
    [affiliations],
  );

  /**
   * Signs the person up (or onto the waitlist).
   * @param sessionId - Session.
   */
  const signUp = async (sessionId: string) => {
    setBusyId(sessionId);
    try {
      const out = await api.signups.signUp(sessionId);
      toast.show(out.message, out.waitlisted ? 'info' : 'success');
      sessions.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusyId(undefined);
    }
  };

  // `?org=<id>` (from the org switcher and Organizations page) starts filtered to that org.
  const orgParam = params.get('org');
  const orgName =
    orgParam &&
    (affiliations.find((a) => a.org.id === orgParam)?.org.name ??
      sessions.data?.find((s) => s.org.id === orgParam)?.org.name);
  const orgFilter: GridState | undefined = orgName
    ? { filter: { filterModel: { org: { filterType: 'set', values: [orgName] } } } }
    : undefined;

  return (
    <>
      <PageHeader title="Find a shift" />
      {sessions.error ? (
        <ErrorBlock message={sessions.error} onRetry={sessions.reload} />
      ) : sessions.loading && !sessions.data ? (
        <Loading />
      ) : sessions.data?.length === 0 ? (
        <EmptyState
          title="No open sessions right now"
          message="Join another organization to see its sessions, or check back soon."
          action={<ButtonLink to="/me/orgs">Browse organizations</ButtonLink>}
        />
      ) : (
        <ActionsContext.Provider value={{ userId: user.id, busyId, activeOrgIds, signUp }}>
          <DataGrid<SessionView>
            // An org filter from the URL starts from that view instead of the saved layout.
            key={orgName ? `org-${orgParam}` : 'saved'}
            height="fill"
            selectable={false}
            label="Open sessions"
            layoutKey={orgName ? `find-sessions-org-${orgParam}` : 'find-sessions'}
            exportName="onboard-open-sessions"
            searchPlaceholder="Search topics, sites, organizations, skills…"
            rows={sessions.data ?? []}
            columns={COLUMNS}
            defaultState={orgFilter}
            emptyMessage="No sessions match these filters."
            options={{ tooltipShowDelay: 300 }}
          />
        </ActionsContext.Provider>
      )}
    </>
  );
}
