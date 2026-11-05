"use client";

import { Fragment, useId, useMemo, useState, type ReactNode } from "react";

export type TableColumn<T> = {
  id: string;
  label: string;
  render: (row: T) => ReactNode;
  value?: (row: T) => string | number;
};

/** Local controls over the records returned by the existing authorized API. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchText,
  label,
  renderDetails,
  filters,
  loading = false,
  empty = "Nessun elemento disponibile.",
  initialSort,
}: {
  rows: T[];
  columns: TableColumn<T>[];
  rowKey: (row: T) => string;
  searchText: (row: T) => string;
  label: string;
  renderDetails?: (row: T) => ReactNode;
  filters?: ReactNode;
  loading?: boolean;
  empty?: string;
  initialSort?: { id: string; direction: "asc" | "desc" };
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(0);
  const [compact, setCompact] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState(initialSort);
  const matching = useMemo(() => {
    const words = query
      .trim()
      .toLocaleLowerCase("it")
      .split(/\s+/)
      .filter(Boolean);
    const result = rows.filter((row) => {
      const text = searchText(row).toLocaleLowerCase("it");
      return words.every((word) => text.includes(word));
    });
    const column = columns.find((c) => c.id === sort?.id);
    if (column?.value) {
      const value = column.value;
      result.sort((a, b) => {
        const left = value(a),
          right = value(b);
        const order =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right), "it", {
                numeric: true,
              });
        return sort?.direction === "desc" ? -order : order;
      });
    }
    return result;
  }, [rows, columns, query, searchText, sort]);
  const pages = Math.max(1, Math.ceil(matching.length / size));
  const currentPage = Math.min(page, pages - 1);
  const visible = matching.slice(currentPage * size, (currentPage + 1) * size);
  const changeSort = (column: TableColumn<T>) => {
    if (!column.value) return;
    setSort({
      id: column.id,
      direction:
        sort?.id === column.id && sort.direction === "asc" ? "desc" : "asc",
    });
    setPage(0);
  };
  return (
    <div
      className={`ws-data${compact ? " is-compact" : ""}`}
      aria-busy={loading}
    >
      <div className="ws-table-tools">
        <label className="ws-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            aria-label={`Cerca in ${label}`}
            placeholder={`Cerca in ${label.toLocaleLowerCase("it")}…`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        {filters}
        <button
          type="button"
          className="ws-control"
          aria-pressed={compact}
          onClick={() => setCompact(!compact)}
        >
          {compact ? "Righe compatte" : "Righe comode"}
        </button>
      </div>
      <div
        className="ws-table-scroll"
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        <table className="ws-table">
          <caption className="ws-sr-only">{label}</caption>
          <thead>
            <tr>
              {renderDetails && (
                <th scope="col">
                  <span className="ws-sr-only">Dettagli</span>
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    column.value
                      ? sort?.id === column.id
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                      : undefined
                  }
                >
                  {column.value ? (
                    <button type="button" onClick={() => changeSort(column)}>
                      {column.label}
                      <span aria-hidden="true">
                        {sort?.id === column.id
                          ? sort.direction === "asc"
                            ? " ↑"
                            : " ↓"
                          : " ↕"}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const key = rowKey(row),
                open = expanded === key;
              const detailsId = `${id}-${encodeURIComponent(key)}`;
              return (
                <Fragment key={key}>
                  <tr className={open ? "is-expanded" : undefined}>
                    {renderDetails && (
                      <td className="ws-expand-cell">
                        <button
                          type="button"
                          className="ws-expand"
                          aria-label={`${open ? "Chiudi" : "Apri"} dettagli ${searchText(row)}`}
                          aria-expanded={open}
                          aria-controls={open ? detailsId : undefined}
                          onClick={() => setExpanded(open ? null : key)}
                        >
                          {open ? "−" : "+"}
                        </button>
                      </td>
                    )}
                    {columns.map((column) => (
                      <td key={column.id}>{column.render(row)}</td>
                    ))}
                  </tr>
                  {renderDetails && open && (
                    <tr>
                      <td
                        id={detailsId}
                        className="ws-detail-cell"
                        colSpan={columns.length + 1}
                      >
                        {renderDetails(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!visible.length && (
              <tr>
                <td
                  colSpan={columns.length + (renderDetails ? 1 : 0)}
                  className="ws-no-results"
                >
                  {loading
                    ? "Caricamento…"
                    : rows.length
                      ? "Nessun risultato per i filtri impostati."
                      : empty}
                  {query && (
                    <button
                      type="button"
                      className="ws-control"
                      onClick={() => {
                        setQuery("");
                        setPage(0);
                      }}
                    >
                      Azzera ricerca
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="ws-table-footer">
        <span role="status">
          {matching.length ? currentPage * size + 1 : 0}–
          {Math.min((currentPage + 1) * size, matching.length)} di{" "}
          {matching.length} risultati
        </span>
        <label>
          Righe per pagina{" "}
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(0);
            }}
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="ws-page-buttons">
          <button
            type="button"
            className="ws-control"
            disabled={!currentPage}
            onClick={() => setPage(currentPage - 1)}
            aria-label={`Pagina precedente: ${label}`}
          >
            ←
          </button>
          <span>
            {currentPage + 1} / {pages}
          </span>
          <button
            type="button"
            className="ws-control"
            disabled={currentPage + 1 >= pages}
            onClick={() => setPage(currentPage + 1)}
            aria-label={`Pagina successiva: ${label}`}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
