/**
 * @file My volunteering → Organizations: every org in Onboard with the person's relationship to
 * it, in a grid. Applying to volunteer is one click because skills and availability live on the
 * person's profile and carry over (§2.5 VolunteerProfile). Leaving an org ends the person's
 * volunteer place there (upcoming shifts cancelled, past hours kept); a role there stays.
 */
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Plus } from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { labelOf } from '@shared/enums';
import { messageOf } from '@shared/errors';
import type { OrgDirectoryEntry } from '@shared/types';
import { Button, ButtonLink } from '@/components/Button';
import { DataGrid } from '@/components/DataGrid';
import { ACTIONS_COLUMN, dateColumn, roleColumn, statusColumn } from '@/components/gridCells';
import { ErrorBlock, Loading, PageHeader } from '@/components/Layout';
import { ConfirmDialog } from '@/components/Modal';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';

/** A directory entry with the id the grid keys rows by. */
type Row = OrgDirectoryEntry & { id: string };

/** Row actions, shared with the cell renderers through context. */
interface OrgActions {
  busy?: string;
  join: (row: Row) => Promise<void>;
  manage: (row: Row) => void;
  askLeave: (row: Row) => void;
}
const ActionsContext = createContext<OrgActions | null>(null);

/** Manage (for orgs you run), Find sessions (where you volunteer) or Apply to volunteer. */
function ActionsCell({ data }: ICellRendererParams<Row>) {
  const ctx = useContext(ActionsContext);
  if (!data || !ctx) return null;
  return (
    <div className="flex gap-1.5">
      {data.role && (
        <Button size="sm" onClick={() => ctx.manage(data)}>
          Manage
        </Button>
      )}
      {data.volunteerStatus ? (
        <>
          <ButtonLink to={`/me/find?org=${data.org.id}`} size="sm" variant="secondary">
            Find sessions here
          </ButtonLink>
          <Button size="sm" variant="ghost" onClick={() => ctx.askLeave(data)}>
            Leave
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant={data.role ? 'secondary' : 'primary'}
          loading={ctx.busy === data.org.id}
          onClick={() => void ctx.join(data)}
        >
          Apply to volunteer
        </Button>
      )}
    </div>
  );
}

const COLUMNS: ColDef<Row>[] = [
  {
    colId: 'name',
    headerName: 'Organization',
    valueGetter: (p) => p.data?.org.name,
    cellClass: 'font-semibold',
    filter: 'agTextColumnFilter',
    sort: 'asc',
    pinned: 'left',
    minWidth: 220,
  },
  {
    colId: 'description',
    headerName: 'About',
    valueGetter: (p) => p.data?.org.description,
    filter: 'agTextColumnFilter',
    wrapText: true,
    autoHeight: true,
    cellClass: 'leading-snug py-2',
    minWidth: 280,
    flex: 1,
  },
  roleColumn<Row>('role', 'Your role', (r) => r.role, {
    headerTooltip: 'Your management role in this organization, if any',
  }),
  statusColumn<Row>('volunteerStatus', 'Volunteer status', (r) => r.volunteerStatus),
  {
    colId: 'volunteers',
    headerName: 'Active volunteers',
    valueGetter: (p) => p.data?.volunteerCount ?? null,
    type: 'numericColumn',
    filter: 'agNumberColumnFilter',
    enableValue: true,
    aggFunc: 'sum',
    minWidth: 150,
  },
  dateColumn<Row>('createdAt', 'On Onboard since', (r) => r.org.createdAt, { hide: true }),
  { ...ACTIONS_COLUMN, cellRenderer: ActionsCell, minWidth: 360 } as ColDef<Row>,
];

/**
 * The organizations directory.
 * @returns The page.
 */
export default function OrganizationsPage() {
  const { reload: reloadOrgs, setActiveOrg } = useOrg();
  const toast = useToast();
  const navigate = useNavigate();
  const dir = useAsync(() => api.orgs.directory(), []);
  const [busy, setBusy] = useState<string>();
  const [leaving, setLeaving] = useState<Row>();

  /** Leaves the org being confirmed. */
  const leave = async () => {
    if (!leaving) return;
    setBusy('leave');
    try {
      const { cancelledSignUps: n } = await api.volunteers.leave(leaving.org.id);
      toast.show(
        `You left ${leaving.org.name}.` +
          (n ? ` ${n} upcoming ${n === 1 ? 'shift was' : 'shifts were'} cancelled.` : ''),
      );
      setLeaving(undefined);
      dir.reload();
      await reloadOrgs();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  /**
   * Applies to volunteer with an org.
   * @param row - Directory entry.
   */
  const join = async (row: Row) => {
    setBusy(row.org.id);
    try {
      await api.orgs.joinAsVolunteer(row.org.id);
      toast.show(`Application sent to ${row.org.name}. A leader there will follow up.`);
      dir.reload();
      await reloadOrgs();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  /**
   * Switches the Manage area to this org and opens its dashboard.
   * @param row - Directory entry.
   */
  const manage = (row: Row) => {
    setActiveOrg(row.org.id);
    navigate('/');
  };

  if (dir.loading && !dir.data) return <Loading />;
  if (dir.error || !dir.data)
    return <ErrorBlock message={dir.error ?? 'Could not load.'} onRetry={dir.reload} />;

  return (
    <>
      <PageHeader
        title="Organizations"
        actions={
          <ButtonLink
            to="/orgs/new"
            variant="primary"
            icon={<Plus className="size-4" aria-hidden />}
          >
            Create organization
          </ButtonLink>
        }
      />
      <ActionsContext.Provider value={{ busy, join, manage, askLeave: setLeaving }}>
        <DataGrid<Row>
          height="auto"
          selectable={false}
          label="Organizations"
          layoutKey="organizations"
          exportName="onboard-organizations"
          searchPlaceholder="Search organizations…"
          rows={dir.data.map((e) => ({ ...e, id: e.org.id }))}
          columns={COLUMNS}
          emptyMessage="No organizations yet. Create the first one."
        />
      </ActionsContext.Provider>
      <ConfirmDialog
        open={!!leaving}
        danger
        title={`Leave ${leaving?.org.name}?`}
        message={
          <ul className="list-disc space-y-1 pl-5">
            <li>Your upcoming shifts there are cancelled.</li>
            <li>Your past shifts and hours stay on your record and certificate.</li>
            {leaving?.role && (
              <li>
                You stay {leaving.role === 'ADMIN' ? 'an' : 'a'} {labelOf(leaving.role)} there. To
                give that up, use Step down on its Team &amp; roles page.
              </li>
            )}
            <li>You can apply again any time.</li>
          </ul>
        }
        confirmLabel="Leave"
        loading={busy === 'leave'}
        onCancel={() => setLeaving(undefined)}
        onConfirm={() => void leave()}
      />
    </>
  );
}
