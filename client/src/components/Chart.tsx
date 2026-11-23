/**
 * @file Report chart (FR-26) built on Recharts.
 *
 * Follows the dataviz rules: one y-axis only, thin marks with 4px rounded bar ends, 2px lines
 * with ≥8px markers, recessive grid, hover tooltips by default, categorical hues in FIXED order
 * from a CVD-validated palette, and pie slices beyond six folded into "Other". Identity is never
 * color-alone: pies are direct-labeled + legend, and every chart sits beside a data table.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import type { ChartType, ReportRow } from '@shared/types';

/** Categorical series colors (CSS vars switch per theme). */
export const SERIES = [
  'var(--rh-series-1)',
  'var(--rh-series-2)',
  'var(--rh-series-3)',
  'var(--rh-series-4)',
  'var(--rh-series-5)',
  'var(--rh-series-6)',
];
/** Max named pie slices before folding into "Other". */
const MAX_SLICES = 6;
const AXIS = { fill: 'var(--rh-ink-muted)', fontSize: 12 };

/** Props for {@link ReportChart}. */
export interface ReportChartProps {
  rows: ReportRow[];
  type: ChartType;
  unit: string;
  /** Accessible summary, e.g. "Bar chart of volunteer hours by site". */
  label: string;
  height?: number;
}

/**
 * Formats a value with its unit for tooltips.
 * @param value - Number.
 * @param unit - Unit label.
 * @returns e.g. "42 hours" or "87.5%".
 */
export function formatValue(value: number, unit: string): string {
  return unit === '%' ? `${value}%` : `${value.toLocaleString()} ${unit}`;
}

/**
 * Folds rows past the slice limit into "Other" (pie only).
 * @param rows - Sorted rows.
 * @returns At most MAX_SLICES rows.
 */
function foldForPie(rows: ReportRow[]): ReportRow[] {
  if (rows.length <= MAX_SLICES) return rows;
  const head = rows.slice(0, MAX_SLICES - 1);
  const rest = rows.slice(MAX_SLICES - 1);
  return [
    ...head,
    {
      group: 'Other',
      value: Math.round(rest.reduce((s, r) => s + r.value, 0) * 10) / 10,
      count: rest.reduce((s, r) => s + r.count, 0),
    },
  ];
}

/** Shared tooltip styling. */
const tooltipProps = {
  contentStyle: {
    background: 'var(--rh-surface)',
    border: '1px solid var(--rh-line)',
    borderRadius: 8,
    color: 'var(--rh-ink)',
    fontSize: 13,
  },
  labelStyle: { color: 'var(--rh-ink)', fontWeight: 600 },
  itemStyle: { color: 'var(--rh-ink)' },
};

/**
 * Renders the chosen chart type for report rows.
 * @param props - Chart props.
 * @returns The chart.
 */
export function ReportChart({ rows, type, unit, label, height = 320 }: ReportChartProps) {
  const fmt = (v: unknown) => [formatValue(Number(v), unit), ''];
  return (
    <figure aria-label={label} className="m-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {type === 'pie' ? (
          <PieChart>
            <Pie
              data={foldForPie(rows)}
              dataKey="value"
              nameKey="group"
              innerRadius="45%"
              outerRadius="78%"
              stroke="var(--rh-surface)"
              strokeWidth={2}
              label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
              labelLine={false}
              isAnimationActive={false}
            >
              {foldForPie(rows).map((r, i) => (
                <Cell
                  key={r.group}
                  fill={r.group === 'Other' ? 'var(--rh-line-strong)' : SERIES[i % SERIES.length]}
                />
              ))}
            </Pie>
            <Tooltip {...tooltipProps} formatter={fmt} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--rh-ink)' }} />
          </PieChart>
        ) : type === 'line' ? (
          <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--rh-chart-grid)" vertical={false} />
            <XAxis
              dataKey="group"
              tick={AXIS}
              tickLine={false}
              axisLine={{ stroke: 'var(--rh-line)' }}
              interval="preserveStartEnd"
            />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              {...tooltipProps}
              formatter={fmt}
              cursor={{ stroke: 'var(--rh-line-strong)', strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={SERIES[0]}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, fill: 'var(--rh-surface)' }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        ) : (
          <BarChart
            data={rows}
            margin={{ top: 12, right: 16, bottom: 8, left: 0 }}
            barCategoryGap="28%"
          >
            <CartesianGrid stroke="var(--rh-chart-grid)" vertical={false} />
            <XAxis
              dataKey="group"
              tick={AXIS}
              tickLine={false}
              axisLine={{ stroke: 'var(--rh-line)' }}
              interval={0}
              angle={rows.length > 6 ? -30 : 0}
              textAnchor={rows.length > 6 ? 'end' : 'middle'}
              height={rows.length > 6 ? 70 : 30}
            />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
            <Tooltip {...tooltipProps} formatter={fmt} cursor={{ fill: 'var(--rh-surface-2)' }} />
            <Bar
              dataKey="value"
              fill={SERIES[0]}
              radius={[4, 4, 0, 0]}
              maxBarSize={56}
              isAnimationActive={false}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </figure>
  );
}
