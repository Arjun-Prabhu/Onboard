/**
 * @file The one AG Grid wrapper every record table can reuse (§2.11a "one grid, many tables").
 *
 * A screen passes column definitions and rows; the wrapper adds the parts every table shares.
 * It is simple by default (§1.2a): quick search, sortable columns and one Download button.
 * "More tools" (remembered per browser) adds the Enterprise features for power users:
 * - per-column filters, CSV export (all or selected rows) and "Reset layout";
 * - the sidebar (columns, grouping, pivot mode and filter tool panels) and the row-group bar;
 * - row selection, cell-range selection with integrated charts, and a status bar with aggregates.
 * The layout (columns, sort, filters, grouping) is remembered per browser either way.
 */
import type {
  ColDef,
  GetRowIdParams,
  GridApi,
  GridOptions,
  GridReadyEvent,
  GridState,
  SelectionChangedEvent,
  StateUpdatedEvent,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { FileSpreadsheet, FileText, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { todayIso } from '@shared/time';
import { chartThemeName, gridTheme } from '@/lib/agGrid';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { TextInput } from './Form';

/** Grid state parts that describe a moment, not a layout, so they aren't remembered. */
const TRANSIENT_STATE: (keyof GridState)[] = [
  'scroll',
  'focusedCell',
  'rowSelection',
  'cellSelection',
  'rowGroupExpansion',
];

/**
 * Reads a saved layout.
 * @param key - Storage key.
 * @returns The saved state, if any (storage can be unavailable).
 */
function loadState(key: string): GridState | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as GridState) : undefined;
  } catch {
    return undefined;
  }
}

/** Props for {@link DataGrid}. */
export interface DataGridProps<T extends { id: string }> {
  /** Accessible name of the table region, e.g. "Volunteers". */
  label: string;
  rows: T[];
  columns: ColDef<T>[];
  /** Unique id; the layout is saved under it. */
  layoutKey: string;
  /** Export file name without extension, e.g. "onboard-volunteers". */
  exportName: string;
  /** Placeholder for the quick search. */
  searchPlaceholder?: string;
  /** Applied when no saved layout exists (or after Reset), e.g. a filter from the URL. */
  defaultState?: GridState;
  /** Extra AG Grid options (master/detail, aggregation, …). */
  options?: GridOptions<T>;
  /** Extra toolbar controls. */
  toolbarExtra?: ReactNode;
  /** Shown when there are no rows at all. */
  emptyMessage?: string;
  /**
   * How tall the grid is:
   * - `fill`: down to the bottom of the window (the page's main content);
   * - `auto`: exactly as tall as its rows (short lists);
   * - `fixed`: 70% of the window.
   */
  height?: 'fill' | 'auto' | 'fixed';
  /** Row checkboxes (exports then include only selected rows). Default true. */
  selectable?: boolean;
}

/** Where the "More tools" choice is remembered (one setting for every grid). */
const TOOLS_KEY = 'onboard.gridTools';

/**
 * Reads the saved "More tools" choice.
 * @returns Whether advanced grid tools start on.
 */
function loadTools(): boolean {
  try {
    return localStorage.getItem(TOOLS_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Saves the "More tools" choice, ignoring storage failures.
 * @param on - New value.
 */
function saveTools(on: boolean): void {
  try {
    localStorage.setItem(TOOLS_KEY, String(on));
  } catch {
    /* not remembered; harmless */
  }
}

/**
 * A full-featured, accessible data grid.
 * @param props - See {@link DataGridProps}.
 * @returns The toolbar and grid.
 */
export function DataGrid<T extends { id: string }>({
  label,
  rows,
  columns,
  layoutKey,
  exportName,
  searchPlaceholder = 'Search every column',
  defaultState,
  options,
  toolbarExtra,
  emptyMessage = 'Nothing to show yet.',
  height = 'fixed',
  selectable = true,
}: DataGridProps<T>) {
  const fill = height === 'fill';
  const auto = height === 'auto';
  const storageKey = `onboard.grid.${layoutKey}`;
  const apiRef = useRef<GridApi<T> | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(0);
  const [visibleCount, setVisibleCount] = useState(rows.length);
  // Bumping the key remounts the grid, which is how "Reset layout" returns to the defaults.
  const [generation, setGeneration] = useState(0);
  // Simple by default: search, sort and download. "More tools" adds filters per column,
  // grouping, pivoting, charts and selection — remembered for every grid on this computer.
  const [tools, setTools] = useState(loadTools);
  const toggleTools = () => {
    setTools((t) => {
      saveTools(!t);
      return !t;
    });
  };
  const searchId = useId();
  const initialState = useMemo(
    () => loadState(storageKey) ?? defaultState,
    // Re-read on reset (generation) only; later changes are saved, not reapplied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey, generation],
  );

  const onStateUpdated = useCallback(
    (e: StateUpdatedEvent<T>) => {
      const state = { ...e.state };
      for (const part of TRANSIENT_STATE) delete state[part];
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        /* layout just isn't remembered */
      }
    },
    [storageKey],
  );

  const exportRows = (kind: 'excel' | 'csv') => {
    const api = apiRef.current;
    if (!api) return;
    const params = {
      fileName: `${exportName}-${todayIso()}.${kind === 'excel' ? 'xlsx' : 'csv'}`,
      onlySelected: selected > 0,
    };
    if (kind === 'excel') api.exportDataAsExcel({ ...params, sheetName: label });
    else api.exportDataAsCsv(params);
  };

  const resetLayout = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* nothing saved */
    }
    setSearch('');
    setGeneration((g) => g + 1);
  };

  /** Counts records passing search and filters (not group, detail or total rows). */
  const countVisible = (api: GridApi<T>) => {
    let n = 0;
    api.forEachNodeAfterFilter((node) => {
      if (node.data && !node.group) n++;
    });
    setVisibleCount(n);
  };
  const scope = selected > 0 ? `${selected} selected` : 'all rows';

  return (
    <section
      aria-label={label}
      className={cn('flex flex-col gap-2', fill && 'min-h-0 flex-1')}
      data-layout={fill ? 'fill' : undefined}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-panel border border-line bg-surface p-2">
        <div className="min-w-[14rem] flex-1">
          {/* The magnifier and placeholder show the purpose; the label names it for assistive tech. */}
          <label htmlFor={searchId} className="sr-only">
            Search {label.toLowerCase()}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <TextInput
              id={searchId}
              type="search"
              maxLength={80}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        {toolbarExtra}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => exportRows('excel')}
          icon={<FileSpreadsheet className="size-4" aria-hidden />}
          title={`Download ${scope} as an Excel file`}
        >
          Download
        </Button>
        {tools && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportRows('csv')}
              icon={<FileText className="size-4" aria-hidden />}
              title={`Export ${scope} to CSV`}
            >
              CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetLayout}
              icon={<RotateCcw className="size-4" aria-hidden />}
            >
              Reset layout
            </Button>
          </>
        )}
        <Button
          variant={tools ? 'primary' : 'ghost'}
          size="sm"
          aria-pressed={tools}
          onClick={toggleTools}
          icon={<SlidersHorizontal className="size-4" aria-hidden />}
          title="Column filters, grouping, pivot and charts"
        >
          More tools
        </Button>
      </div>

      <p className="px-1 text-sm text-ink-muted" aria-live="polite">
        {visibleCount === rows.length
          ? `${rows.length} shown`
          : `${visibleCount} of ${rows.length} shown`}
        {selected > 0 && ` · ${selected} selected (downloads include only these)`}
      </p>

      {/* Fill: take the rest of the column (never under 28rem; short windows scroll instead).
          Auto: the grid sets its own height from its rows. */}
      <div
        className={cn(
          !auto && 'relative min-h-[28rem]',
          fill && 'flex-1',
          height === 'fixed' && 'h-[70vh]',
        )}
      >
        <AgGridReact<T>
          key={`${generation}-${tools}`}
          // Pinned to the box so the grid always matches its size, however the box is sized.
          containerStyle={auto ? undefined : { position: 'absolute', inset: 0 }}
          domLayout={auto ? 'autoHeight' : 'normal'}
          theme={gridTheme}
          rowData={rows}
          columnDefs={columns}
          getRowId={(p: GetRowIdParams<T>) => p.data.id}
          initialState={initialState}
          onStateUpdated={onStateUpdated}
          quickFilterText={search}
          defaultColDef={{
            sortable: true,
            resizable: true,
            filter: true,
            floatingFilter: tools,
            minWidth: 110,
          }}
          autoGroupColumnDef={{ minWidth: 240, pinned: 'left' }}
          rowSelection={
            selectable && tools
              ? { mode: 'multiRow', checkboxes: true, headerCheckbox: true, selectAll: 'filtered' }
              : undefined
          }
          selectionColumnDef={{ pinned: 'left', suppressHeaderMenuButton: true }}
          cellSelection={tools}
          enableCharts={tools}
          chartThemes={[chartThemeName()]}
          sideBar={
            tools
              ? { toolPanels: ['columns', 'filters'], hiddenByDefault: false, defaultToolPanel: '' }
              : false
          }
          rowGroupPanelShow={tools ? 'always' : 'never'}
          pivotPanelShow="onlyWhenPivoting"
          groupDefaultExpanded={0}
          suppressAggFuncInHeader={false}
          animateRows
          statusBar={
            tools
              ? {
                  statusPanels: [
                    { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
                    { statusPanel: 'agSelectedRowCountComponent', align: 'left' },
                    { statusPanel: 'agAggregationComponent', align: 'right' },
                  ],
                }
              : undefined
          }
          overlayNoRowsTemplate={`<span role="status">${emptyMessage}</span>`}
          onGridReady={(e: GridReadyEvent<T>) => {
            apiRef.current = e.api;
            countVisible(e.api);
          }}
          onModelUpdated={(e) => countVisible(e.api)}
          onSelectionChanged={(e: SelectionChangedEvent<T>) =>
            setSelected(e.api.getSelectedRows().length)
          }
          {...options}
        />
      </div>
    </section>
  );
}

export type { ColDef } from 'ag-grid-community';
