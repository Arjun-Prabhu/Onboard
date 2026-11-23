/**
 * @file Report Builder metadata shared by the UI and the report service (FR-26).
 */
import type { Terms } from './terms';
import type { ReportGroupBy, ReportMetric } from './types';

/** Display metadata per metric, before the org's own words are filled in. */
const METRIC_META: Record<
  ReportMetric,
  { label: string; unit: string; kind: 'sum' | 'rate' | 'distinct' }
> = {
  hours: { label: 'Volunteer hours', unit: 'hours', kind: 'sum' },
  staffedPct: { label: 'Sessions staffed', unit: '%', kind: 'rate' },
  attendanceRate: { label: 'Attendance rate', unit: '%', kind: 'rate' },
  noShowRate: { label: 'No-show rate', unit: '%', kind: 'rate' },
  activeVolunteers: { label: 'Active volunteers', unit: 'volunteers', kind: 'distinct' },
  newRecruits: { label: 'New recruits', unit: 'recruits', kind: 'distinct' },
  equipmentInUse: { label: 'Equipment in use', unit: 'items', kind: 'sum' },
};

/** Group-by options that make sense for each metric — the UI disables the rest. */
export const METRIC_GROUPS: Record<ReportMetric, ReportGroupBy[]> = {
  hours: ['volunteer', 'site', 'program', 'month', 'skill', 'priority'],
  staffedPct: ['site', 'program', 'month', 'priority'],
  attendanceRate: ['volunteer', 'site', 'program', 'month', 'skill', 'priority'],
  noShowRate: ['volunteer', 'site', 'program', 'month', 'skill', 'priority'],
  activeVolunteers: ['site', 'program', 'month', 'skill', 'priority'],
  newRecruits: ['month', 'skill'],
  equipmentInUse: ['site', 'program', 'priority'],
};

/** Every metric, in menu order. */
export const METRICS = Object.keys(METRIC_META) as ReportMetric[];

/**
 * Display metadata for a metric in one org's words ("Kits in use", "Gear bags in use").
 * @param metric - Metric.
 * @param t - The org's terms.
 * @returns Label, unit and aggregation kind.
 */
export function metricMeta(metric: ReportMetric, t: Terms) {
  const meta = METRIC_META[metric];
  return metric === 'equipmentInUse'
    ? { ...meta, label: `${t.EquipmentPlural} in use`, unit: t.equipmentPlural }
    : meta;
}

/**
 * Human label for a group-by dimension in one org's words.
 * @param groupBy - Dimension.
 * @param t - The org's terms.
 * @returns Label, e.g. "School" or "Title I vs. other schools".
 */
export function groupLabel(groupBy: ReportGroupBy, t: Terms): string {
  switch (groupBy) {
    case 'site':
      return t.Site;
    case 'priority':
      return `${t.priority} vs. other ${t.sites}`;
    case 'volunteer':
      return 'Volunteer';
    case 'program':
      return 'Program';
    case 'month':
      return 'Month';
    case 'skill':
      return 'Skill';
  }
}
