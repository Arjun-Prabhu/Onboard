/**
 * @file Manage → Hours approval for the active org (FR-19). Approve is one click on the row;
 * reject asks for an optional note. Leaders can't approve their own hours.
 */
import { Check, Download, X } from 'lucide-react';
import { useState } from 'react';
import { HourStatus } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { formatDate, todayIso } from '@shared/time';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { FormField, Select, TextArea } from '@/components/Form';
import { EmptyState, ErrorBlock, Loading, PageHeader, Panel } from '@/components/Layout';
import { Modal } from '@/components/Modal';
import { Badge, StatusBadge } from '@/components/Status';
import { useUser } from '@/context/AuthContext';
import { useManagedOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import type { HourRow } from '@/lib/api/contract';
import { downloadBlob, toCsv } from '@/lib/export';

/**
 * The hours approval page.
 * @returns The page.
 */
export default function HoursApprovalPage() {
  const me = useUser();
  const { org } = useManagedOrg();
  const toast = useToast();
  const [filter, setFilter] = useState<HourStatus | ''>(HourStatus.PENDING);
  const [rejecting, setRejecting] = useState<HourRow>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string>();
  const logs = useAsync(
    () => api.hours.list(org.id, { status: filter || undefined }),
    [org.id, filter],
  );

  /**
   * Reviews one log.
   * @param row - Hour log.
   * @param status - Decision.
   * @param reviewNote - Optional note.
   */
  const review = async (row: HourRow, status: HourStatus, reviewNote?: string) => {
    setBusy(row.id);
    try {
      await api.hours.review(row.id, status, reviewNote);
      toast.show(
        status === HourStatus.APPROVED
          ? `Approved ${row.hours} hours for ${row.volunteer.firstName}.`
          : 'Hours rejected.',
      );
      setRejecting(undefined);
      setNote('');
      logs.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  /** Exports the visible rows to CSV. */
  const exportCsv = () =>
    downloadBlob(
      `hours-${filter || 'all'}-${todayIso()}.csv`,
      new Blob(
        [
          toCsv(
            ['Date', 'Volunteer', 'Hours', 'Description', 'Status'],
            (logs.data ?? []).map((h) => [
              h.date,
              `${h.volunteer.firstName} ${h.volunteer.lastName}`,
              h.hours,
              h.description,
              h.status,
            ]),
          ),
        ],
        { type: 'text/csv' },
      ),
    );

  return (
    <>
      <PageHeader
        title="Hours"
        actions={
          <Button
            variant="secondary"
            icon={<Download className="size-4" aria-hidden />}
            disabled={!logs.data?.length}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        }
      />
      <Panel
        title="Hour logs"
        actions={
          <FormField label="Show" className="w-44">
            {(p) => (
              <Select
                {...p}
                value={filter}
                onChange={(e) => setFilter(e.target.value as HourStatus | '')}
              >
                <option value="">All</option>
                <option value={HourStatus.PENDING}>Pending</option>
                <option value={HourStatus.APPROVED}>Approved</option>
                <option value={HourStatus.REJECTED}>Rejected</option>
              </Select>
            )}
          </FormField>
        }
        bodyClassName="p-0 sm:p-5"
      >
        {logs.error ? (
          <ErrorBlock message={logs.error} onRetry={logs.reload} />
        ) : logs.loading && !logs.data ? (
          <Loading />
        ) : (
          <DataTable<HourRow>
            caption="Hour logs"
            rows={logs.data ?? []}
            rowKey={(r) => r.id}
            initialSort={{ key: 'date', dir: 'desc' }}
            empty={
              <EmptyState
                title={filter === HourStatus.PENDING ? 'All caught up' : 'No hours here'}
                message={
                  filter === HourStatus.PENDING
                    ? 'There are no hours waiting for review.'
                    : 'Try a different filter.'
                }
              />
            }
            columns={[
              {
                key: 'date',
                header: 'Date',
                sortValue: (r) => r.date,
                render: (r) => formatDate(r.date, { weekday: undefined }),
              },
              {
                key: 'vol',
                header: 'Volunteer',
                sortValue: (r) => r.volunteer.lastName,
                render: (r) => (
                  <span className="font-medium">
                    {r.volunteer.firstName} {r.volunteer.lastName}
                  </span>
                ),
              },
              {
                key: 'desc',
                header: 'Activity',
                render: (r) => (
                  <span>
                    <span className="block">{r.description}</span>
                    <span className="text-xs text-ink-muted">
                      {r.session ? r.session.site.name : 'Manual entry'}
                      {r.autoGenerated && ' · from check-out'}
                    </span>
                    {r.reviewNote && (
                      <span className="block text-xs text-ink-muted">Note: {r.reviewNote}</span>
                    )}
                  </span>
                ),
              },
              {
                key: 'hours',
                header: 'Hours',
                sortValue: (r) => r.hours,
                render: (r) => <span className="font-semibold tabular-nums">{r.hours}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                sortValue: (r) => r.status,
                render: (r) => <StatusBadge status={r.status} />,
              },
              {
                key: 'act',
                header: 'Review',
                className: 'text-right',
                render: (r) =>
                  r.status !== HourStatus.PENDING ? (
                    <Badge>{r.reviewedBy ? `by ${r.reviewedBy}` : 'Reviewed'}</Badge>
                  ) : r.userId === me.id ? (
                    <span className="text-xs text-ink-muted">
                      Another leader reviews your hours
                    </span>
                  ) : (
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        loading={busy === r.id}
                        icon={<Check className="size-4" aria-hidden />}
                        onClick={() => void review(r, HourStatus.APPROVED)}
                        aria-label={`Approve ${r.hours} hours for ${r.volunteer.firstName}`}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<X className="size-4" aria-hidden />}
                        onClick={() => {
                          setNote('');
                          setRejecting(r);
                        }}
                        aria-label={`Reject hours for ${r.volunteer.firstName}`}
                      >
                        Reject
                      </Button>
                    </div>
                  ),
              },
            ]}
          />
        )}
      </Panel>
      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(undefined)}
        size="sm"
        title="Reject these hours?"
        description={
          rejecting
            ? `${rejecting.hours} hours for ${rejecting.volunteer.firstName} on ${rejecting.date}`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(undefined)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={!!rejecting && busy === rejecting.id}
              onClick={() => rejecting && void review(rejecting, HourStatus.REJECTED, note)}
            >
              Reject hours
            </Button>
          </>
        }
      >
        <FormField
          label="Note for the volunteer"
          hint="Optional — explain what to fix, up to 200 characters"
        >
          {(p) => (
            <TextArea
              {...p}
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </FormField>
      </Modal>
    </>
  );
}
