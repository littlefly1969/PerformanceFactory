import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Page from "./page";
import { adminRequest } from "../components/admin-request";

vi.mock("../components/admin-request", () => ({ adminRequest: vi.fn() }));
vi.mock("@/app/components/product-shell", () => ({
  ProductShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
const overview = {
  settings: {
    creditsToUnlock: 100,
    creditsInitialAssessment: 30,
    creditsCalibrationRound: 20,
    creditsMicroTest: 10,
  },
  clubs: [
    { id: "c1", name: "Circolo Nord", city: "Roma", freeLessonsEnabled: true },
    { id: "c2", name: "Circolo Sud", city: "Roma", freeLessonsEnabled: true },
  ],
  coaches: [{ id: "coach1", email: "coach@pf.test", firstName: "Anna" }],
  lessons: Array.from({ length: 30 }, (_, i) => ({
    id: `l${i}`,
    partnerId: i === 29 ? "c2" : "c1",
    club: i === 29 ? "Circolo Sud" : "Circolo Nord",
    startsAt: new Date(Date.UTC(2027, 0, 10 + i, 9)).toISOString(),
    durationMinutes: 60,
    capacity: 4,
    levelLabel: "Intermedio",
    status: "SCHEDULED",
    coach: null,
    seats: [],
  })),
  requests: [
    {
      userId: "u1",
      name: "Mario",
      email: "mario@pf.test",
      level: "INTERMEDIATE",
      partnerId: "c2",
      club: "Circolo Sud",
      preferredLessonId: "l29",
    },
  ],
};
beforeEach(() => {
  vi.mocked(adminRequest).mockReset();
  vi.mocked(adminRequest).mockResolvedValue(overview);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("filters a 30-lesson calendar and assigns a coach through the existing API", async () => {
  render(<Page />);
  expect(
    await screen.findByRole("table", { name: "Lezioni" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("1–25 di 30");
  await userEvent.selectOptions(
    screen.getByLabelText("Filtra lezioni per circolo"),
    "c2",
  );
  expect(screen.getByRole("status")).toHaveTextContent("1–1 di 1");
  await userEvent.click(
    screen.getByRole("button", { name: /Apri dettagli Circolo Sud/ }),
  );
  await userEvent.selectOptions(
    screen.getByLabelText(/Coach per Circolo Sud/),
    "coach1",
  );
  await waitFor(() =>
    expect(adminRequest).toHaveBeenCalledWith(
      "/admin/free-lessons/lessons/l29/coach",
      "PATCH",
      { coachId: "coach1" },
    ),
  );
});

it("assigns a request only to a future lesson of the same club", async () => {
  render(<Page />);
  await screen.findByRole("table", { name: "Lezioni" });
  await userEvent.click(screen.getByRole("button", { name: "Richieste (1)" }));
  const select = screen.getByLabelText("Lezione per Mario");
  expect(select.querySelectorAll("option")).toHaveLength(2);
  await userEvent.selectOptions(select, "l29");
  await waitFor(() =>
    expect(adminRequest).toHaveBeenCalledWith(
      "/admin/free-lessons/lessons/l29/seats",
      "POST",
      { userId: "u1" },
    ),
  );
  expect(screen.queryByText("Micro-test")).not.toBeInTheDocument();
});

it("creates a lesson with the unchanged API contract", async () => {
  render(<Page />);
  await screen.findByRole("table", { name: "Lezioni" });
  await userEvent.click(screen.getByText("+ Nuova lezione"));
  await userEvent.selectOptions(screen.getByLabelText("Circolo"), "c1");
  await userEvent.type(screen.getByLabelText("Data e ora"), "2027-01-10T09:00");
  await userEvent.selectOptions(screen.getByLabelText("Coach"), "coach1");
  await userEvent.type(
    screen.getByLabelText("Livello del gruppo"),
    "Intermedio",
  );
  await userEvent.click(screen.getByRole("button", { name: "Crea lezione" }));
  await waitFor(() =>
    expect(adminRequest).toHaveBeenCalledWith(
      "/admin/free-lessons/lessons",
      "POST",
      {
        partnerId: "c1",
        startsAt: new Date("2027-01-10T09:00").toISOString(),
        capacity: 4,
        coachId: "coach1",
        levelLabel: "Intermedio",
      },
    ),
  );
});

it("requires confirmation before cancelling a lesson", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Page />);
  await screen.findByRole("table", { name: "Lezioni" });
  await userEvent.click(
    screen.getAllByRole("button", { name: /Apri dettagli Circolo Nord/ })[0],
  );
  const cancel = screen.getByRole("button", { name: "Annulla lezione" });
  await userEvent.click(cancel);
  expect(
    vi
      .mocked(adminRequest)
      .mock.calls.some((c) => String(c[0]).endsWith("/cancel")),
  ).toBe(false);
  confirm.mockReturnValue(true);
  await userEvent.click(cancel);
  await waitFor(() =>
    expect(adminRequest).toHaveBeenCalledWith(
      "/admin/free-lessons/lessons/l0/cancel",
      "POST",
    ),
  );
});

it("retires historical controls while preserving their stored value on save", async () => {
  render(<Page />);
  await screen.findByRole("table", { name: "Lezioni" });
  await userEvent.click(screen.getByRole("button", { name: "Crediti" }));
  expect(
    screen.queryByLabelText(/Crediti per micro-test del catalogo/),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Salva parametri" }),
  );
  await waitFor(() =>
    expect(adminRequest).toHaveBeenCalledWith(
      "/admin/free-lessons/config",
      "PUT",
      overview.settings,
    ),
  );
});
