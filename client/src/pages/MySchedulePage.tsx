/**
 * @file My volunteering → My schedule: every sign-up across every org in one grid, grouped into
 * Upcoming and Past, with check-in/out and cancel on upcoming rows. Guest sign-ups appear too.
 */
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { createContext, useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { SignUpStatus } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { formatDate, todayIso } from '@shared/time';
import { Button, ButtonLink } from '@/components/Button';
import { DataGrid } from '@/components/DataGrid';
import { ACTIONS_COLUMN, dateColumn, statusColumn, timeColumn } from '@/components/gridCells';
import { ErrorBlock, Loading, PageHeader } from '@/components/Layout';
import { ConfirmDialog } from '@/components/Modal';
import { useUser } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import type { MySignUp } from '@/lib/api/contract';

/** A grid row: the sign-up plus whether it is still ahead. */
type Row = MySignUp & { upcoming: boolean };

/** Row actions, shared with the cell renderers through context. */
interface ScheduleActions {
  busy?: string;
  act: (key: string, fn: () => Promise<unknown>, message: string) => Promise<void>;
  askCancel: (row: Row) => void;
}
const ActionsContext = createContext<ScheduleActions | null>(null);

/** Whether a sign-up is still ahead (or happening today). */
const isUpcoming = (s: MySignUp, today: string) =>
  s.session.date >= today &&
  (s.status === SignUpStatus.SIGNED_UP ||
    s.status === SignUpStatus.WAITLISTED ||
    s.status === SignUpStatus.CHECKED_IN);

/** The session title, linking to its page. */
function SessionCell({ data }: ICellRendererParams<Row>) {
  if (!data) return null;
  return (
    <Link
      to={`/sessions/${data.session.id}`}
      className="font-semibold text-primary hover:underline"
    >
      {data.session.title}
    </Link>
  );
}

/** Check in / Check out / Cancel, depending on the sign-up's state. */
function ActionsCell({ data }: ICellRendererParams<Row>) {
  const ctx = useContext(ActionsContext);
  if (!data || !ctx || !data.upcoming) return null;
  const today = todayIso();
  return (
    <div className="flex gap-1.5">
      {data.status === SignUpStatus.SIGNED_UP && data.session.date === today && (
        <Button
          size="sm"
          loading={ctx.busy === `in-${data.id}`}
          onClick={() =>
            void ctx.act(
              `in-${data.id}`,
              () => api.signups.checkIn(data.id),
              'Checked in. Have a great session!',
            )
          }
        >
          Check in
        </Button>
      )}
      {data.status === SignUpStatus.CHECKED_IN && (
        <Button
          size="sm"
          variant="accent"
          loading={ctx.busy === `out-${data.id}`}
          onClick={() =>
            void ctx.act(
              `out-${data.id}`,
              () => api.signups.checkOut(data.id),
              'Checked out. Your hours were sent for approval.',
            )
          }
        >
          Check out
        </Button>
      )}
      {(data.status === SignUpStatus.SIGNED_UP || data.status === SignUpStatus.WAITLISTED) && (
        <Button size="sm" variant="ghost" onClick={() => ctx.askCancel(data)}>
          Cancel
        </Button>
      )}
    </div>
  );
}

/** Upcoming first, then past. */
const timingOrder = (a: string, b: string) => (a === b ? 0 : a === 'Upcoming' ? -1 : 1);

const COLUMNS: ColDef<Row>[] = [
  {
    colId: 'timing',
    headerName: 'When',
    valueGetter: (p) => (p.data?.upcoming ? 'Upcoming' : 'Past'),
    rowGroup: true,
    hide: true,
    comparator: timingOrder,
    filter: 'agSetColumnFilter',
    filterParams: { comparator: timingOrder },
    enableRowGroup: true,
  },
  dateColumn<Row>('date', 'Date', (r) => r.session.date, {
    sort: 'asc',
    valueFormatter: (p) =>
      p.value === todayIso() ? 'Today' : p.value ? formatDate(p.value as string) : '',
    cellClassRules: { 'font-semibold text-primary': (p) => p.value === todayIso() },
  }),
  timeColumn<Row>((r) => ({ start: r.session.startTime, end: r.session.endTime })),
  {
    colId: 'session',
    headerName: 'Session',
    valueGetter: (p) => p.data?.session.title,
    cellRenderer: SessionCell,
    filter: 'agTextColumnFilter',
    minWidth: 220,
    flex: 1,
  },
  {
    colId: 'org',
    headerName: 'Organization',
    valueGetter: (p) => p.data?.session.org.name,
    filter: 'agSetColumnFilter',
    enableRowGroup: true,
    enablePivot: true,
    minWidth: 180,
  },
  {
    colId: 'site',
    headerName: 'Site',
    valueGetter: (p) => p.data?.session.site.name,
    filter: 'agSetColumnFilter',
    enableRowGroup: true,
    minWidth: 180,
  },
  {
    colId: 'role',
    headerName: 'Role',
    valueGetter: (p) => p.data?.role,
    filter: 'agSetColumnFilter',
    enableRowGroup: true,
  },
  statusColumn<Row>('status', 'Status', (r) => r.status),
  {
    colId: 'waitlist',
    headerName: 'Waitlist #',
    valueGetter: (p) => p.data?.waitlistPosition ?? null,
    type: 'numericColumn',
    filter: 'agNumberColumnFilter',
    minWidth: 120,
  },
  {
    colId: 'guest',
    headerName: 'Guest',
    headerTooltip: 'One-time guest sign-up (no ongoing standing with that organization)',
    valueGetter: (p) => (p.data ? (p.data.guest ? 'Yes' : 'No') : null),
    filter: 'agSetColumnFilter',
    enableRowGroup: true,
    hide: true,
  },
  { ...ACTIONS_COLUMN, cellRenderer: ActionsCell, minWidth: 220 } as ColDef<Row>,
];

/**
 * The schedule page.
 * @returns The page.
 */
export default function MySchedulePage() {
  const user = useUser();
  const toast = useToast();
  const list = useAsync(() => api.signups.mine(), [user.id]);
  const [busy, setBusy] = useState<string>();
  const [toCancel, setToCancel] = useState<Row>();

  /**
   * Runs an action, reports the result and refreshes.
   * @param key - Busy key.
   * @param fn - API call.
   * @param message - Success message.
   */
  const act = async (key: string, fn: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await fn();
      toast.show(message);
      list.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  if (list.loading && !list.data) return <Loading />;
  if (list.error || !list.data)
    return <ErrorBlock message={list.error ?? 'Could not load.'} onRetry={list.reload} />;
  const today = todayIso();
  const rows: Row[] = list.data.map((s) => ({ ...s, upcoming: isUpcoming(s, today) }));

  return (
    <>
      <PageHeader
        title="My shifts"
        actions={
          <ButtonLink to="/me/find" variant="primary">
            Find more sessions
          </ButtonLink>
        }
      />
      <ActionsContext.Provider value={{ busy, act, askCancel: setToCancel }}>
        <DataGrid<Row>
          height="fill"
          selectable={false}
          label="My schedule"
          layoutKey="my-schedule"
          exportName="onboard-my-schedule"
          searchPlaceholder="Search sessions, sites, organizations…"
          rows={rows}
          columns={COLUMNS}
          emptyMessage="Nothing scheduled yet. Find a session that fits your week."
          options={{
            groupDefaultExpanded: 1,
            // Upcoming before Past, whatever the sort.
            initialGroupOrderComparator: ({ nodeA, nodeB }) =>
              timingOrder(nodeA.key ?? '', nodeB.key ?? ''),
            autoGroupColumnDef: { headerName: 'When', minWidth: 170, pinned: 'left' },
          }}
        />
      </ActionsContext.Provider>
      <ConfirmDialog
        open={!!toCancel}
        title="Cancel this sign-up?"
        message={
          toCancel
            ? `${toCancel.session.title} at ${toCancel.session.site.name}. If someone is on the waitlist, they’ll get your spot.`
            : ''
        }
        confirmLabel="Cancel sign-up"
        danger
        loading={busy === 'cancel'}
        onCancel={() => setToCancel(undefined)}
        onConfirm={() =>
          toCancel &&
          void act('cancel', () => api.signups.cancel(toCancel.id), 'Sign-up cancelled.').then(() =>
            setToCancel(undefined),
          )
        }
      />
    </>
  );
}
