/**
 * @file My volunteering → My hours (FR-18, FR-20): hours across every org, manual logging for a
 * chosen org (V-S6, V-S7), and one service certificate per org — each certificate includes only
 * the hours THAT org approved.
 */
import type { ColDef } from 'ag-grid-community';
import { Download, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { HourStatus } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { hourLogSchema, type HourLogInput } from '@shared/schemas';
import { todayIso } from '@shared/time';
import type { Organization } from '@shared/types';
import { Button } from '@/components/Button';
import { DataGrid } from '@/components/DataGrid';
import { dateColumn, statusColumn, yesNoColumn } from '@/components/gridCells';
import { FormError, FormField, Select, TextArea, TextInput } from '@/components/Form';
import { ErrorBlock, Loading, PageHeader, Panel, StatTile } from '@/components/Layout';
import { Modal } from '@/components/Modal';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { useForm } from '@/hooks/useForm';
import { api } from '@/lib/api';
import type { HourRow } from '@/lib/api/contract';
import { exportCertificate } from '@/lib/export';

/**
 * Modal to log manual hours for one org.
 * @param props - Open state, orgs the person can log for, callbacks.
 * @returns The modal.
 */
function LogHoursModal({
  open,
  orgs,
  onClose,
  onSaved,
}: {
  open: boolean;
  orgs: Organization[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const blank = (): HourLogInput => ({
    orgId: orgs[0]?.id ?? '',
    date: todayIso(),
    hours: 1,
    description: '',
    sessionId: '',
  });
  const form = useForm(hourLogSchema, blank());
  const { values: v, errors: e, set, touch } = form;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log hours"
      description="For service outside a checked-in session, like outreach events or prep work."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={form.submitting}
            onClick={() =>
              void form.submit(async (d) => {
                await api.hours.create({ ...d, sessionId: d.sessionId || undefined });
                toast.show('Hours logged and sent for approval.');
                form.reset(blank());
                onSaved();
              })
            }
          >
            Log hours
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(ev) => ev.preventDefault()}
      >
        <div className="sm:col-span-2">
          <FormError message={form.formError} />
        </div>
        <FormField
          label="Organization"
          hint="Who you volunteered for"
          error={e.orgId}
          required
          className="sm:col-span-2"
        >
          {(p) => (
            <Select
              {...p}
              value={v.orgId}
              invalid={!!e.orgId}
              onChange={(x) => set('orgId', x.target.value)}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Date" error={e.date} required>
          {(p) => (
            <TextInput
              {...p}
              type="date"
              max={todayIso()}
              value={v.date}
              invalid={!!e.date}
              onChange={(x) => set('date', x.target.value)}
              onBlur={() => touch('date')}
            />
          )}
        </FormField>
        <FormField label="Hours" hint="Quarter-hour steps; max 12 per day" error={e.hours} required>
          {(p) => (
            <TextInput
              {...p}
              type="number"
              step={0.25}
              min={0.25}
              max={12}
              value={Number.isNaN(v.hours) ? '' : v.hours}
              invalid={!!e.hours}
              onChange={(x) =>
                set('hours', x.target.value === '' ? Number.NaN : Number(x.target.value))
              }
              onBlur={() => touch('hours')}
            />
          )}
        </FormField>
        <FormField
          label="What did you do?"
          error={e.description}
          required
          className="sm:col-span-2"
        >
          {(p) => (
            <TextArea
              {...p}
              maxLength={200}
              value={v.description}
              invalid={!!e.description}
              onChange={(x) => set('description', x.target.value)}
              onBlur={() => touch('description')}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}

/** Hour-history columns. */
const HISTORY_COLUMNS: ColDef<HourRow>[] = [
  dateColumn<HourRow>('date', 'Date', (r) => r.date, { sort: 'desc', pinned: 'left' }),
  {
    colId: 'org',
    headerName: 'Organization',
    valueGetter: (p) => p.data?.orgName,
    filter: 'agSetColumnFilter',
    enableRowGroup: true,
    enablePivot: true,
    minWidth: 180,
  },
  {
    colId: 'activity',
    headerName: 'Activity',
    valueGetter: (p) => p.data?.description,
    filter: 'agTextColumnFilter',
    minWidth: 220,
    flex: 1,
  },
  {
    colId: 'source',
    headerName: 'Where',
    headerTooltip: 'The session’s site, or Manual entry',
    valueGetter: (p) => (p.data ? (p.data.session?.site.name ?? 'Manual entry') : null),
    filter: 'agSetColumnFilter',
    enableRowGroup: true,
    enablePivot: true,
    minWidth: 180,
  },
  yesNoColumn<HourRow>('fromCheckout', 'From check-out', (r) => r.autoGenerated, {
    headerTooltip: 'Logged automatically when you checked out of a session',
  }),
  {
    colId: 'hours',
    headerName: 'Hours',
    valueGetter: (p) => p.data?.hours ?? null,
    type: 'numericColumn',
    filter: 'agNumberColumnFilter',
    enableValue: true,
    aggFunc: 'sum',
    valueFormatter: (p) =>
      p.value == null
        ? ''
        : Number(p.value)
            .toFixed(2)
            .replace(/\.?0+$/, ''),
    cellClass: 'font-semibold tabular-nums',
    minWidth: 110,
  },
  statusColumn<HourRow>('status', 'Status', (r) => r.status),
  {
    colId: 'reviewedBy',
    headerName: 'Reviewed by',
    valueGetter: (p) => p.data?.reviewedBy ?? '',
    filter: 'agSetColumnFilter',
    minWidth: 160,
  },
  {
    colId: 'note',
    headerName: 'Reviewer note',
    valueGetter: (p) => p.data?.reviewNote ?? '',
    filter: 'agTextColumnFilter',
    minWidth: 200,
  },
];

/**
 * The My hours page.
 * @returns The page.
 */
export default function MyHoursPage() {
  const { affiliations } = useOrg();
  const toast = useToast();
  const [logOpen, setLogOpen] = useState(false);
  const logs = useAsync(() => api.hours.mine(), []);
  const all = useMemo(() => logs.data ?? [], [logs.data]);
  const sum = (s: HourStatus) => all.filter((h) => h.status === s).reduce((t, h) => t + h.hours, 0);

  // One certificate per org with approved hours, including guest events.
  const certificates = useMemo(() => {
    const byOrg = new Map<string, { name: string; hours: number }>();
    for (const h of all.filter((x) => x.status === HourStatus.APPROVED)) {
      const e = byOrg.get(h.orgId) ?? { name: h.orgName, hours: 0 };
      e.hours += h.hours;
      byOrg.set(h.orgId, e);
    }
    return [...byOrg.entries()].map(([orgId, v]) => ({ orgId, ...v }));
  }, [all]);
  // Manual logs are for orgs where the person has volunteer standing.
  const loggableOrgs = affiliations.filter((a) => a.volunteerStatus).map((a) => a.org);

  /**
   * Downloads the certificate for one org.
   * @param orgId - Org.
   * @param orgName - Org name for the certificate.
   */
  const certificate = async (orgId: string, orgName: string) => {
    try {
      const me = await api.profile.get();
      exportCertificate(
        me,
        orgName,
        all.filter((h) => h.orgId === orgId),
      );
    } catch (err) {
      toast.show(messageOf(err), 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="My hours"
        actions={
          <Button
            variant="secondary"
            icon={<Plus className="size-4" aria-hidden />}
            disabled={!loggableOrgs.length}
            onClick={() => setLogOpen(true)}
          >
            Log hours
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Approved hours" value={sum(HourStatus.APPROVED)} />
        <StatTile label="Pending approval" value={sum(HourStatus.PENDING)} />
        <StatTile label="Organizations served" value={new Set(all.map((h) => h.orgId)).size} />
      </div>

      <Panel
        className="mb-6"
        title="Service certificates"
        description="Download a PDF of approved hours for each organization."
      >
        {certificates.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Certificates appear once an organization approves your hours.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {certificates.map((c) => (
              <li
                key={c.orgId}
                className="flex items-center justify-between gap-3 rounded-control border border-line px-4 py-3"
              >
                <span>
                  <span className="block font-semibold">{c.name}</span>
                  <span className="text-sm text-ink-muted">{c.hours} approved hours</span>
                </span>
                <Button
                  variant="accent"
                  size="sm"
                  icon={<Download className="size-4" aria-hidden />}
                  onClick={() => void certificate(c.orgId, c.name)}
                >
                  Certificate
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <h2 className="mb-2 text-xl font-semibold">History</h2>
      {logs.error ? (
        <ErrorBlock message={logs.error} onRetry={logs.reload} />
      ) : logs.loading && !logs.data ? (
        <Loading />
      ) : (
        <DataGrid<HourRow>
          height="fill"
          label="Hour history"
          layoutKey="my-hours"
          exportName="onboard-my-hours"
          searchPlaceholder="Search activities, organizations, sites…"
          rows={all}
          columns={HISTORY_COLUMNS}
          emptyMessage="No hours yet. They appear after you check out of a session, or when you log them."
        />
      )}
      <LogHoursModal
        open={logOpen}
        orgs={loggableOrgs}
        onClose={() => setLogOpen(false)}
        onSaved={() => {
          setLogOpen(false);
          logs.reload();
        }}
      />
    </>
  );
}
