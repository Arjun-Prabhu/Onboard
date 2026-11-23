/**
 * @file Volunteer directory (FR-8) on AG Grid: quick search, column filters (set, text, number,
 * date), grouping, pivoting with sums and averages, integrated charts, Excel/CSV export, and an
 * expandable detail row with each volunteer's availability and pipeline history.
 */
import type { GridState, ICellRendererParams, ValueFormatterParams } from 'ag-grid-community';
import { Link2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DAY_NAMES, labelOf, PIPELINE_ORDER } from '@shared/enums';
import { formatDate, formatTimeRange } from '@shared/time';
import type { VolunteerGridRow } from '@shared/types';
import { Button } from '@/components/Button';
import { DataGrid, type ColDef } from '@/components/DataGrid';
import { ErrorBlock, Loading, PageHeader } from '@/components/Layout';
import { StatusBadge } from '@/components/Status';
import { useManagedOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { AddVolunteerModal, copyApplyLink } from '@/features/volunteers/AddVolunteerModal';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';

type Row = VolunteerGridRow;

/** Formats an ISO date cell, blank when missing. */
const dateCell = (p: ValueFormatterParams<Row, string | null | undefined>) =>
  p.value ? formatDate(p.value, { weekday: undefined }) : '';

/** Formats a yes/no cell. */
const yesNo = (p: ValueFormatterParams<Row, boolean>) => (p.value ? 'Yes' : 'No');

/** Formats an enum cell (status, experience) with its label. */
const enumLabel = (p: ValueFormatterParams<Row, string | null>) =>
  p.value ? labelOf(p.value) : '';

/** Orders weekday names Sunday → Saturday in filters. */
const byWeekday = (a: string, b: string) => DAY_NAMES.indexOf(a) - DAY_NAMES.indexOf(b);

/** Orders statuses along the pipeline. */
const byPipeline = (a: string | null, b: string | null) =>
  (a ? PIPELINE_ORDER.indexOf(a as never) : -1) - (b ? PIPELINE_ORDER.indexOf(b as never) : -1);

/** A date column: real date filtering on ISO strings, readable display. */
const dateColumn = (field: keyof Row, headerName: string, hide = false): ColDef<Row> => ({
  field,
  headerName,
  hide,
  cellDataType: 'dateString',
  filter: 'agDateColumnFilter',
  valueFormatter: dateCell,
  enableRowGroup: false,
  minWidth: 140,
});

/** A numeric metric that can be summed or averaged in groups and pivots. */
const metricColumn = (
  field: keyof Row,
  headerName: string,
  aggFunc: 'sum' | 'avg',
  format?: (n: number) => string,
): ColDef<Row> => ({
  field,
  headerName,
  type: 'numericColumn',
  filter: 'agNumberColumnFilter',
  enableValue: true,
  aggFunc,
  allowedAggFuncs: ['sum', 'avg', 'min', 'max', 'count'],
  valueFormatter: format && ((p) => (p.value == null ? '' : format(Number(p.value)))),
  minWidth: 130,
});

/** The name cell: links to the volunteer's profile. */
function NameCell({ data }: ICellRendererParams<Row>) {
  if (!data) return null;
  return (
    <Link to={`/volunteers/${data.id}`} className="font-semibold text-primary hover:underline">
      {data.firstName} {data.lastName}
    </Link>
  );
}

/** The status cell: the same badge used everywhere else in the app. */
function StatusCell({ value }: ICellRendererParams<Row, string | null>) {
  return value ? <StatusBadge status={value} /> : null;
}

/** The expandable detail row: weekly availability and pipeline history. */
function DetailRow({ data }: ICellRendererParams<Row>) {
  if (!data) return null;
  return (
    <div className="grid grid-cols-1 gap-6 bg-canvas p-4 text-sm md:grid-cols-3">
      <div>
        <h3 className="mb-2 font-semibold">Availability</h3>
        {data.availability.length ? (
          <ul className="space-y-1">
            {data.availability.map((a) => (
              <li key={a.id}>
                {DAY_NAMES[a.dayOfWeek]}, {formatTimeRange(a.startTime, a.endTime)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted">No times added yet.</p>
        )}
      </div>
      <div>
        <h3 className="mb-2 font-semibold">Pipeline history</h3>
        <ol className="space-y-1">
          {[...data.statusHistory].reverse().map((h) => (
            <li key={h.id}>
              <span className="font-medium">{labelOf(h.toStatus)}</span>{' '}
              <span className="text-ink-muted">
                {formatDate(h.changedAt.slice(0, 10), { weekday: undefined })} by {h.changedBy}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h3 className="mb-2 font-semibold">About</h3>
        <p className="text-ink-muted">{data.bio || 'No bio yet.'}</p>
        <Link
          to={`/volunteers/${data.id}`}
          className="mt-2 inline-block font-semibold text-primary hover:underline"
        >
          Open full profile
        </Link>
      </div>
    </div>
  );
}

/** Column definitions, in display order. */
const COLUMNS: ColDef<Row>[] = [
  {
    colId: 'name',
    headerName: 'Name',
    valueGetter: (p) => (p.data ? `${p.data.firstName} ${p.data.lastName}` : ''),
    comparator: (_a, _b, na, nb) =>
      `${na.data?.lastName} ${na.data?.firstName}`.localeCompare(
        `${nb.data?.lastName} ${nb.data?.firstName}`,
      ),
    cellRenderer: 'agGroupCellRenderer',
    cellRendererParams: { innerRenderer: NameCell },
    filter: 'agTextColumnFilter',
    pinned: 'left',
    minWidth: 210,
    sort: 'asc',
  },
  {
    field: 'status',
    headerName: 'Status',
    cellRenderer: StatusCell,
    comparator: byPipeline,
    filter: 'agSetColumnFilter',
    filterParams: { valueFormatter: enumLabel, comparator: byPipeline },
    enableRowGroup: true,
    enablePivot: true,
    minWidth: 150,
  },
  { field: 'email', headerName: 'Email', filter: 'agTextColumnFilter', minWidth: 220 },
  { field: 'phone', headerName: 'Phone', filter: 'agTextColumnFilter', hide: true },
  {
    field: 'affiliation',
    headerName: 'Affiliation',
    filter: 'agSetColumnFilter',
    enableRowGroup: true,
    enablePivot: true,
    minWidth: 180,
  },
  {
    field: 'experienceLevel',
    headerName: 'Experience',
    valueFormatter: enumLabel,
    filter: 'agSetColumnFilter',
    filterParams: { valueFormatter: enumLabel },
    enableRowGroup: true,
    enablePivot: true,
  },
  {
    field: 'skills',
    headerName: 'Skills',
    valueFormatter: (p: ValueFormatterParams<Row, string[]>) => (p.value ?? []).join(', '),
    filter: 'agSetColumnFilter',
    sortable: false,
    minWidth: 220,
  },
  {
    field: 'availableDays',
    headerName: 'Available days',
    valueFormatter: (p: ValueFormatterParams<Row, string[]>) =>
      (p.value ?? []).map((d) => d.slice(0, 3)).join(', '),
    filter: 'agSetColumnFilter',
    filterParams: { comparator: byWeekday },
    sortable: false,
    minWidth: 170,
  },
  {
    field: 'hasTransportation',
    headerName: 'Has transportation',
    valueFormatter: yesNo,
    filter: 'agSetColumnFilter',
    filterParams: { valueFormatter: yesNo },
    enableRowGroup: true,
    enablePivot: true,
    minWidth: 150,
  },
  {
    field: 'cleared',
    headerName: 'Cleared',
    headerTooltip: 'Every requirement on the org’s checklist is complete and current',
    valueFormatter: yesNo,
    filter: 'agSetColumnFilter',
    filterParams: { valueFormatter: yesNo },
    enableRowGroup: true,
    enablePivot: true,
  },
  {
    colId: 'checklist',
    headerName: 'Checklist',
    headerTooltip: 'Requirements complete and current, of the org’s active requirements',
    valueGetter: (p) => (p.data ? `${p.data.requirementsDone} of ${p.data.requirementsTotal}` : ''),
    filter: 'agSetColumnFilter',
    enableRowGroup: true,
    minWidth: 120,
  },
  {
    colId: 'renewals',
    headerName: 'Needs renewal',
    headerTooltip: 'Requirements expiring within 30 days or already expired',
    valueGetter: (p) =>
      p.data?.requirements
        .filter((c) => c.state === 'EXPIRING' || c.state === 'EXPIRED')
        .map((c) => `${c.requirement.name} (${c.state === 'EXPIRED' ? 'expired' : 'expiring'})`)
        .join(', ') ?? '',
    filter: 'agTextColumnFilter',
    minWidth: 200,
    hide: false,
  },
  metricColumn('sessionsCompleted', 'Sessions', 'sum'),
  metricColumn('noShows', 'No-shows', 'sum'),
  metricColumn('attendancePct', 'Attendance', 'avg', (n) => `${Math.round(n)}%`),
  metricColumn('approvedHours', 'Approved hours', 'sum', (n) => n.toFixed(1)),
  metricColumn('pendingHours', 'Pending hours', 'sum', (n) => n.toFixed(1)),
  dateColumn('lastSessionDate', 'Last session'),
  dateColumn('createdAt', 'Joined'),
  { field: 'zip', headerName: 'ZIP', filter: 'agTextColumnFilter', hide: true },
];

/**
 * The volunteers page.
 * @returns The page.
 */
export default function VolunteersPage() {
  const [params] = useSearchParams();
  const { org, can } = useManagedOrg();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const list = useAsync(() => api.volunteers.metrics(org.id), [org.id]);

  // `?day=2` (from the assistant's "Who's free Tuesday?") starts the grid filtered to that day.
  const day = Number(params.get('day'));
  const dayFilter: GridState | undefined =
    params.has('day') && DAY_NAMES[day]
      ? {
          filter: {
            filterModel: { availableDays: { filterType: 'set', values: [DAY_NAMES[day]] } },
          },
        }
      : undefined;

  return (
    <>
      <PageHeader
        title="Volunteers"
        actions={
          can('volunteers.pipeline') && (
            <>
              <Button
                variant="secondary"
                icon={<Link2 className="size-4" aria-hidden />}
                onClick={() => void copyApplyLink(org.id, toast.show)}
              >
                Copy application link
              </Button>
              <Button
                icon={<UserPlus className="size-4" aria-hidden />}
                onClick={() => setAddOpen(true)}
              >
                Add volunteer
              </Button>
            </>
          )
        }
      />
      {list.error ? (
        <ErrorBlock message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <Loading />
      ) : (
        <DataGrid<Row>
          height="fill"
          // A day filter from the URL starts from that view instead of the saved layout.
          key={dayFilter ? `day-${day}` : 'saved'}
          label="Volunteers"
          layoutKey={dayFilter ? `volunteers-day-${day}` : `volunteers-${org.id}`}
          exportName={`onboard-volunteers-${org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          searchPlaceholder="Search names, emails, skills, sites…"
          rows={list.data ?? []}
          columns={COLUMNS}
          defaultState={dayFilter}
          emptyMessage="No volunteers yet. Use Add volunteer, or share the application link."
          options={{
            masterDetail: true,
            detailCellRenderer: DetailRow,
            detailRowAutoHeight: true,
          }}
        />
      )}
      <AddVolunteerModal
        open={addOpen}
        org={org}
        onClose={() => setAddOpen(false)}
        onAdded={() => list.reload()}
      />
    </>
  );
}
