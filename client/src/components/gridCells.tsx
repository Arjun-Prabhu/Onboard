/**
 * @file Cell formatters, renderers and column builders shared by every {@link DataGrid} page, so
 * a date, a yes/no or a status looks and filters the same in every table.
 */
import type {
  ColDef,
  ICellRendererParams,
  ValueFormatterParams,
  ValueGetterParams,
} from 'ag-grid-community';
import { labelOf, OrgRole } from '@shared/enums';
import { formatDate, formatTimeRange } from '@shared/time';
import { Badge, StatusBadge } from './Status';

/** The part of AG Grid's formatter params these helpers read (fits every row type). */
type ValueOnly<V> = Pick<ValueFormatterParams<never, V>, 'value'>;

/** Formats an ISO date (`YYYY-MM-DD`) cell, blank when missing. */
export const dateText = (p: ValueOnly<string | null | undefined>) =>
  p.value ? formatDate(p.value, { weekday: undefined }) : '';

/** Formats a yes/no cell. */
export const yesNo = (p: ValueOnly<boolean | null | undefined>) => (p.value ? 'Yes' : 'No');

/** Formats an enum cell (status, role, experience) with its display label. */
export const enumLabel = (p: ValueOnly<string | null | undefined>) =>
  p.value ? labelOf(p.value) : '';

/**
 * Renders an enum value as the app's status badge (icon + label + color).
 * @param props - Cell params.
 * @returns The badge, or nothing.
 */
export function StatusCell({ value }: Pick<ICellRendererParams<never, string | null>, 'value'>) {
  return value ? <StatusBadge status={value} /> : null;
}

/**
 * Renders a management role the way the rest of the app does (Owner highlighted).
 * @param props - Cell params.
 * @returns The badge, or nothing.
 */
export function RoleCell({ value }: Pick<ICellRendererParams<never, string | null>, 'value'>) {
  return value ? (
    <Badge tone={value === OrgRole.OWNER ? 'info' : 'neutral'}>{labelOf(value)}</Badge>
  ) : null;
}

/** Orders roles by rank: Owner, Admin, Coordinator. */
export const byRoleRank = (a: string | null, b: string | null) =>
  ORDER.indexOf(a ?? '') - ORDER.indexOf(b ?? '');
const ORDER: string[] = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.COORDINATOR, ''];

/**
 * A management-role column: role badge, a checkbox-list filter, rank ordering, groupable.
 * @param colId - Column id.
 * @param headerName - Header.
 * @param valueGetter - Reads the role.
 * @param extra - Overrides.
 * @returns The column.
 */
export function roleColumn<T>(
  colId: string,
  headerName: string,
  valueGetter: (row: T) => string | null | undefined,
  extra: ColDef<T> = {},
): ColDef<T> {
  return statusColumn(colId, headerName, valueGetter, {
    cellRenderer: RoleCell,
    comparator: byRoleRank,
    filterParams: { valueFormatter: enumLabel, comparator: byRoleRank },
    minWidth: 140,
    ...extra,
  });
}

/**
 * A date column on an ISO string: real date filtering, readable display.
 * @param colId - Column id.
 * @param headerName - Header.
 * @param valueGetter - Reads the ISO date from a row.
 * @param extra - Overrides.
 * @returns The column.
 */
export function dateColumn<T>(
  colId: string,
  headerName: string,
  valueGetter: (row: T) => string | null | undefined,
  extra: ColDef<T> = {},
): ColDef<T> {
  return {
    colId,
    headerName,
    valueGetter: (p: ValueGetterParams<T>) => (p.data ? (valueGetter(p.data) ?? null) : null),
    cellDataType: 'dateString',
    filter: 'agDateColumnFilter',
    valueFormatter: dateText,
    minWidth: 140,
    ...extra,
  };
}

/**
 * An enum column (status, role…): badge cell, a checkbox-list filter with labels, groupable.
 * @param colId - Column id.
 * @param headerName - Header.
 * @param valueGetter - Reads the enum value.
 * @param extra - Overrides.
 * @returns The column.
 */
export function statusColumn<T>(
  colId: string,
  headerName: string,
  valueGetter: (row: T) => string | null | undefined,
  extra: ColDef<T> = {},
): ColDef<T> {
  return {
    colId,
    headerName,
    valueGetter: (p: ValueGetterParams<T>) => (p.data ? (valueGetter(p.data) ?? null) : null),
    cellRenderer: StatusCell,
    filter: 'agSetColumnFilter',
    filterParams: { valueFormatter: enumLabel },
    enableRowGroup: true,
    enablePivot: true,
    minWidth: 150,
    ...extra,
  };
}

/**
 * A yes/no column with a Yes/No checkbox-list filter.
 * @param colId - Column id.
 * @param headerName - Header.
 * @param valueGetter - Reads the flag.
 * @param extra - Overrides.
 * @returns The column.
 */
export function yesNoColumn<T>(
  colId: string,
  headerName: string,
  valueGetter: (row: T) => boolean,
  extra: ColDef<T> = {},
): ColDef<T> {
  return {
    colId,
    headerName,
    valueGetter: (p: ValueGetterParams<T>) => (p.data ? valueGetter(p.data) : null),
    valueFormatter: yesNo,
    filter: 'agSetColumnFilter',
    filterParams: { valueFormatter: yesNo },
    enableRowGroup: true,
    enablePivot: true,
    minWidth: 120,
    ...extra,
  };
}

/**
 * A time-range column ("3:00–4:30 PM") that sorts by start time.
 * @param getter - Reads start and end times (`HH:mm`).
 * @returns The column.
 */
export function timeColumn<T>(getter: (row: T) => { start: string; end: string }): ColDef<T> {
  return {
    colId: 'time',
    headerName: 'Time',
    valueGetter: (p: ValueGetterParams<T>) => (p.data ? getter(p.data).start : null),
    valueFormatter: (p) =>
      p.data ? formatTimeRange(getter(p.data).start, getter(p.data).end) : '',
    filter: 'agTextColumnFilter',
    minWidth: 150,
  };
}

/** Columns that only hold buttons: no sorting, filtering, menus or export. */
export const ACTIONS_COLUMN: Partial<ColDef> = {
  colId: 'actions',
  headerName: 'Actions',
  sortable: false,
  filter: false,
  floatingFilter: false,
  resizable: true,
  suppressHeaderMenuButton: true,
  suppressMovable: true,
  pinned: 'right',
  minWidth: 150,
  // Once focus is on a button or dropdown inside the cell, it handles Enter, Space and arrows.
  suppressKeyboardEvent: ({ event }) =>
    ['Enter', ' ', 'ArrowUp', 'ArrowDown'].includes(event.key) &&
    !!(event.target as HTMLElement).closest('button, select, a'),
  cellClass: 'flex items-center',
};
