/**
 * @file Custom Report Builder + presets (FR-26, FR-27, FR-28). Output is always a chart AND a
 * table with totals; exports carry the filters used.
 */
import { Download, FileText } from 'lucide-react';
import { useRef, useState } from 'react';
import { labelOf, PIPELINE_ORDER, ProgramType } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { groupLabel as groupLabelOf, METRIC_GROUPS, METRICS, metricMeta } from '@shared/reportMeta';
import type { Terms } from '@shared/terms';
import { addDays, todayIso } from '@shared/time';
import type {
  ChartType,
  OrgFeatures,
  ReportGroupBy,
  ReportMetric,
  ReportParams,
  ReportRow,
} from '@shared/types';
import { Button } from '@/components/Button';
import { formatValue, ReportChart } from '@/components/Chart';
import { DataTable } from '@/components/DataTable';
import { FormField, Select, TextInput } from '@/components/Form';
import { EmptyState, ErrorBlock, Loading, PageHeader, Panel } from '@/components/Layout';
import { useToast } from '@/context/ToastContext';
import { useManagedOrg } from '@/context/OrgContext';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { exportReportCsv, exportReportPdf } from '@/lib/export';

/** A named preset report (FR-27). */
interface Preset {
  id: string;
  name: string;
  description: string;
  params: Partial<ReportParams>;
}

const today = todayIso();

/**
 * Preset reports in the org's own words. Presets for features the org doesn't use are left out.
 * @param t - The org's terms.
 * @param features - The org's feature switches.
 * @returns Presets, in display order.
 */
function presetsFor(t: Terms, features: OrgFeatures): Preset[] {
  const all: Array<Preset | false> = [
    features.prioritySites && {
      id: 'sponsor',
      name: 'Sponsor impact',
      description: `Approved hours at ${t.priority} vs. other ${t.sites}`,
      params: {
        metric: 'hours',
        groupBy: 'priority',
        chartType: 'pie',
        from: addDays(today, -365),
        to: today,
      },
    },
    {
      id: 'hours',
      name: 'Volunteer hours summary',
      description: 'Approved hours per volunteer',
      params: { metric: 'hours', groupBy: 'volunteer', chartType: 'bar' },
    },
    {
      id: 'site',
      name: `${t.Site} summary`,
      description: `Share of sessions fully staffed, by ${t.site}`,
      params: { metric: 'staffedPct', groupBy: 'site', chartType: 'bar' },
    },
    {
      id: 'attendance',
      name: 'Attendance & reliability',
      description: 'Attendance rate by month',
      params: {
        metric: 'attendanceRate',
        groupBy: 'month',
        chartType: 'line',
        from: addDays(today, -180),
      },
    },
    features.equipment && {
      id: 'equipment',
      name: `${t.Equipment} utilization`,
      description: `${t.EquipmentPlural} checked out, by ${t.site}`,
      params: { metric: 'equipmentInUse', groupBy: 'site', chartType: 'bar' },
    },
  ];
  return all.filter((p): p is Preset => !!p);
}

const DEFAULT: ReportParams = {
  metric: 'hours',
  groupBy: 'site',
  from: addDays(today, -90),
  to: today,
  chartType: 'bar',
};

/**
 * The reports page.
 * @returns The page.
 */
export default function ReportsPage() {
  const { org, terms: t, features } = useManagedOrg();
  const PRESETS = presetsFor(t, features);
  /** Group-bys that fit a metric and the org's features. */
  const groupsFor = (m: ReportMetric) =>
    METRIC_GROUPS[m].filter((g) => g !== 'priority' || features.prioritySites);
  const metrics = METRICS.filter((m) => m !== 'equipmentInUse' || features.equipment);
  const toast = useToast();
  const chartRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useState<ReportParams>(DEFAULT);
  const [activePreset, setActivePreset] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const report = useAsync(() => api.reports.run(org.id, params), [org.id, JSON.stringify(params)]);
  const sites = useAsync(() => api.sites.list(org.id, true), [org.id]);
  const dateError =
    params.to < params.from ? 'End date must be on or after the start date.' : undefined;

  /**
   * Updates params; switching metric snaps group-by to a valid option.
   * @param patch - Changed params.
   */
  const update = (patch: Partial<ReportParams>) => {
    setActivePreset(undefined);
    setParams((p) => {
      const next = { ...p, ...patch };
      if (!groupsFor(next.metric).includes(next.groupBy)) next.groupBy = groupsFor(next.metric)[0];
      return next;
    });
  };

  /**
   * Applies a preset.
   * @param preset - Preset.
   */
  const applyPreset = (preset: Preset) => {
    setParams({ ...DEFAULT, ...preset.params });
    setActivePreset(preset.id);
  };

  /** Describes the active filters for exports. */
  const filtersText = () => {
    const parts = [`${params.from} to ${params.to}`];
    if (params.siteId)
      parts.push(sites.data?.find((s) => s.id === params.siteId)?.name ?? `One ${t.site}`);
    if (params.programType) parts.push(labelOf(params.programType));
    if (params.volunteerStatus) parts.push(`${labelOf(params.volunteerStatus)} volunteers`);
    if (params.skill) parts.push(params.skill);
    return parts.join(', ');
  };

  const title = report.data?.title ?? '';
  const groupLabel = groupLabelOf(params.groupBy, t);

  return (
    <>
      <PageHeader
        title="Reports"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download className="size-4" aria-hidden />}
              disabled={!report.data?.rows.length}
              onClick={() => report.data && exportReportCsv(report.data, groupLabel)}
            >
              Export CSV
            </Button>
            <Button
              icon={<FileText className="size-4" aria-hidden />}
              loading={exporting}
              disabled={!report.data?.rows.length}
              onClick={() => {
                if (!report.data) return;
                setExporting(true);
                exportReportPdf(report.data, groupLabel, filtersText(), chartRef.current)
                  .then(() => toast.show('PDF exported.'))
                  .catch((err: unknown) => toast.show(messageOf(err), 'error'))
                  .finally(() => setExporting(false));
              }}
            >
              Export PDF
            </Button>
          </>
        }
      />

      <section
        aria-label="Preset reports"
        className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5"
      >
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={activePreset === p.id}
            onClick={() => applyPreset(p)}
            className={cn(
              'rounded-panel border p-3 text-left transition-colors',
              activePreset === p.id
                ? 'border-primary bg-primary-soft'
                : 'border-line bg-surface hover:border-line-strong',
            )}
          >
            <span className="block font-semibold text-ink">{p.name}</span>
            <span className="block text-sm text-ink-muted">{p.description}</span>
          </button>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_1fr]">
        <Panel title="Build a report" className="self-start">
          <div className="space-y-4">
            <FormField label="Measure">
              {(p) => (
                <Select
                  {...p}
                  value={params.metric}
                  onChange={(e) => update({ metric: e.target.value as ReportMetric })}
                >
                  {metrics.map((m) => (
                    <option key={m} value={m}>
                      {metricMeta(m, t).label}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="Group by" hint="Options that don’t fit this measure are hidden">
              {(p) => (
                <Select
                  {...p}
                  value={params.groupBy}
                  onChange={(e) => update({ groupBy: e.target.value as ReportGroupBy })}
                >
                  {groupsFor(params.metric).map((g) => (
                    <option key={g} value={g}>
                      {groupLabelOf(g, t)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="From">
                {(p) => (
                  <TextInput
                    {...p}
                    type="date"
                    value={params.from}
                    onChange={(e) => e.target.value && update({ from: e.target.value })}
                  />
                )}
              </FormField>
              <FormField label="To" error={dateError}>
                {(p) => (
                  <TextInput
                    {...p}
                    type="date"
                    value={params.to}
                    invalid={!!dateError}
                    onChange={(e) => e.target.value && update({ to: e.target.value })}
                  />
                )}
              </FormField>
            </div>
            <FormField label={t.Site}>
              {(p) => (
                <Select
                  {...p}
                  value={params.siteId ?? ''}
                  onChange={(e) => update({ siteId: e.target.value || undefined })}
                >
                  <option value="">All {t.sites}</option>
                  {sites.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="Program type">
              {(p) => (
                <Select
                  {...p}
                  value={params.programType ?? ''}
                  onChange={(e) =>
                    update({
                      programType: (e.target.value || undefined) as ProgramType | undefined,
                    })
                  }
                >
                  <option value="">All types</option>
                  {Object.values(ProgramType).map((t) => (
                    <option key={t} value={t}>
                      {labelOf(t)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="Volunteer status">
              {(p) => (
                <Select
                  {...p}
                  value={params.volunteerStatus ?? ''}
                  onChange={(e) =>
                    update({
                      volunteerStatus: (e.target.value ||
                        undefined) as ReportParams['volunteerStatus'],
                    })
                  }
                >
                  <option value="">Any status</option>
                  {PIPELINE_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {labelOf(s)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="Skill">
              {(p) => (
                <Select
                  {...p}
                  value={params.skill ?? ''}
                  onChange={(e) => update({ skill: e.target.value || undefined })}
                >
                  <option value="">Any skill</option>
                  {org.settings.skills.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              )}
            </FormField>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">Chart</legend>
              <div className="grid grid-cols-3 gap-1 rounded-control border border-line-strong p-1">
                {(['bar', 'line', 'pie'] as ChartType[]).map((t) => (
                  <label
                    key={t}
                    className={cn(
                      'cursor-pointer rounded px-2 py-1.5 text-center text-sm font-medium capitalize has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus',
                      params.chartType === t
                        ? 'bg-primary text-on-primary'
                        : 'text-ink hover:bg-surface-2',
                    )}
                  >
                    <input
                      type="radio"
                      name="chart"
                      value={t}
                      className="sr-only"
                      checked={params.chartType === t}
                      onChange={() => update({ chartType: t })}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Panel>

        <div className="min-w-0 space-y-6">
          {report.error ? (
            <ErrorBlock message={report.error} onRetry={report.reload} />
          ) : report.loading && !report.data ? (
            <Loading label="Building report…" />
          ) : (
            report.data && (
              <>
                <Panel
                  title={title}
                  description={`${filtersText()} · Total ${formatValue(report.data.total, report.data.unit)}`}
                >
                  {report.data.rows.length === 0 ? (
                    <EmptyState
                      title="No data for these filters"
                      message="Widen the date range or remove a filter."
                    />
                  ) : (
                    <div ref={chartRef}>
                      <ReportChart
                        rows={report.data.rows}
                        type={params.chartType}
                        unit={report.data.unit}
                        label={`${params.chartType} chart: ${title}`}
                      />
                    </div>
                  )}
                </Panel>
                {report.data.rows.length > 0 && (
                  <DataTable<ReportRow>
                    caption={`${title} — table view`}
                    showCaption
                    rows={[...report.data.rows]}
                    rowKey={(r) => r.group}
                    columns={[
                      {
                        key: 'g',
                        header: groupLabel,
                        sortValue: (r) => r.group,
                        render: (r) => <span className="font-medium">{r.group}</span>,
                      },
                      {
                        key: 'v',
                        header: metricMeta(params.metric, t).label,
                        sortValue: (r) => r.value,
                        className: 'text-right tabular-nums',
                        render: (r) => formatValue(r.value, report.data!.unit),
                      },
                      {
                        key: 'c',
                        header: 'Records',
                        sortValue: (r) => r.count,
                        className: 'text-right tabular-nums',
                        render: (r) => r.count,
                      },
                    ]}
                  />
                )}
              </>
            )
          )}
        </div>
      </div>
    </>
  );
}
