/** Generic sortable paginated table. */
import { type ReactNode } from "react";
import { fmtNum } from "../lib/theme";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  numeric?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  total?: number;
  page?: number;
  pages?: number;
  onPage?: (page: number) => void;
  sort?: string;
  dir?: "asc" | "desc";
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  rows,
  total,
  page,
  pages,
  onPage,
  sort,
  dir,
  onSort,
  onRowClick,
  emptyMessage = "No species match the current filters.",
}: DataTableProps<T>) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left">
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={`overline whitespace-nowrap px-3 py-2 ${c.sortable && onSort ? "cursor-pointer select-none hover:text-accent" : ""}`}
                  onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
                >
                  {c.header}
                  {sort === c.key && <span className="ml-1 text-accent">{dir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-ink3">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr
                key={i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-line ${onRowClick ? "cursor-pointer hover:bg-panel2" : ""}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-1.5 align-middle ${c.numeric ? "tnum text-right" : ""}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages && pages > 1 && onPage && page && (
        <div className="mt-3 flex items-center justify-between text-xs text-ink2">
          <span className="tnum">
            {total !== undefined ? `${fmtNum(total)} species` : ""} · page {fmtNum(page)} / {fmtNum(pages)}
          </span>
          <span className="flex items-center gap-1">
            <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-sm border border-line px-2 py-1 disabled:opacity-40 hover:border-accent">
              ← prev
            </button>
            <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-sm border border-line px-2 py-1 disabled:opacity-40 hover:border-accent">
              next →
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
