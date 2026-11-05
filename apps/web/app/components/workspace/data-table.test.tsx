import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { DataTable } from "./data-table";

afterEach(cleanup);
const rows = Array.from({ length: 70 }, (_, i) => ({
  id: String(i),
  name: `Circolo ${i + 1}`,
  seats: i,
}));
const props = {
  label: "Circoli di prova",
  rows,
  rowKey: (r: (typeof rows)[number]) => r.id,
  searchText: (r: (typeof rows)[number]) => r.name,
  columns: [
    {
      id: "name",
      label: "Nome",
      value: (r: (typeof rows)[number]) => r.name,
      render: (r: (typeof rows)[number]) => r.name,
    },
    {
      id: "seats",
      label: "Posti",
      value: (r: (typeof rows)[number]) => r.seats,
      render: (r: (typeof rows)[number]) => r.seats,
    },
  ],
};

it("paginates a large list, searches all loaded rows and resets to the first page", async () => {
  render(<DataTable {...props} />);
  expect(screen.getByRole("status")).toHaveTextContent("1–25 di 70");
  expect(screen.queryByText("Circolo 70")).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: /Pagina successiva/ }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("26–50 di 70");
  const search = screen.getByRole("searchbox");
  await userEvent.type(search, "circolo 70");
  expect(screen.getByText("Circolo 70")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("1–1 di 1");
  await userEvent.clear(search);
  expect(screen.getByRole("status")).toHaveTextContent("1–25 di 70");
});

it("sorts numeric values in both directions and exposes the direction", async () => {
  render(<DataTable {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Posti" }));
  expect(screen.getByRole("columnheader", { name: "Posti" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await userEvent.click(screen.getByRole("button", { name: "Posti" }));
  expect(screen.getByRole("columnheader", { name: "Posti" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  const bodyRows = within(screen.getByRole("table")).getAllByRole("row");
  expect(within(bodyRows[1]).getByText("Circolo 70")).toBeInTheDocument();
});

it("clamps the page when external filters reduce the records and supports details", async () => {
  const detail = (r: (typeof rows)[number]) => <p>Gestisci {r.name}</p>;
  const { rerender } = render(<DataTable {...props} renderDetails={detail} />);
  await userEvent.click(
    screen.getByRole("button", { name: /Pagina successiva/ }),
  );
  rerender(
    <DataTable {...props} rows={rows.slice(0, 3)} renderDetails={detail} />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("1–3 di 3");
  const open = screen.getByRole("button", { name: "Apri dettagli Circolo 1" });
  await userEvent.click(open);
  expect(open).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Gestisci Circolo 1")).toBeInTheDocument();
  await userEvent.click(open);
  expect(screen.queryByText("Gestisci Circolo 1")).not.toBeInTheDocument();
});
