/**
 * @file Generic sortable data table.
 *
 * Responsive: on narrow screens the table scrolls horizontally inside its own focusable box
 * rather than breaking the page layout. Sort state is exposed with `aria-sort`.
 */
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** One column definition. */
export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. */
  render: (row: T) => ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  className?: string;
  /** Hide on small screens to keep tables readable on phones. */
  hideOnMobile?: boolean;
}

/** Props for {@link DataTable}. */
export interface DataTableProps<T> {
  /** Visible caption for screen readers (and optionally sighted users). */
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  /** Initial sort column key. */
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** Show the caption visually. */
  showCaption?: boolean;
}

/**
 * Renders rows as an accessible, sortable table.
 * @param props - Table props.
 * @returns The table.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  initialSort,
  showCaption,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort);
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col?.sortValue || !sort) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const r =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? r : -r;
    });
  }, [rows, columns, sort]);

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div
      className="overflow-x-auto rounded-panel border border-line"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className={showCaption ? 'px-4 py-2 text-left text-sm text-ink-muted' : 'sr-only'}>
          {caption}
        </caption>
        <thead className="bg-surface-2">
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = active
                ? sort?.dir === 'asc'
                  ? 'ascending'
                  : 'descending'
                : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn(
                    'whitespace-nowrap border-b border-line px-4 py-2.5 font-semibold text-ink',
                    c.hideOnMobile && 'hidden md:table-cell',
                    c.className,
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      onClick={() =>
                        setSort({ key: c.key, dir: active && sort?.dir === 'asc' ? 'desc' : 'asc' })
                      }
                    >
                      {c.header}
                      {active ? (
                        sort?.dir === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3.5" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" aria-hidden />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="bg-surface">
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-line last:border-0 hover:bg-surface-2/60"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-4 py-3 align-middle text-ink',
                    c.hideOnMobile && 'hidden md:table-cell',
                    c.className,
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
