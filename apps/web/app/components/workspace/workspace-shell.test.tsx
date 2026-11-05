import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./workspace-shell";

afterEach(cleanup);
it("groups administrator navigation, marks the active route and preserves logout", async () => {
  const logout = vi.fn();
  render(
    <WorkspaceShell
      role="ADMIN"
      pathname="/admin/free-lessons"
      nav={[
        { href: "/admin/cycles", label: "Operazioni" },
        { href: "/admin/free-lessons", label: "Lezioni" },
        { href: "/admin/calibration", label: "Calibrazione" },
      ]}
      email="admin@pf.test"
      loggingOut={false}
      onLogout={logout}
      title="Calendario"
      eyebrow="Operatività"
    >
      <p>Contenuto</p>
    </WorkspaceShell>,
  );
  expect(screen.getByRole("link", { name: "Lezioni" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByText("Percorso e contenuti")).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveAttribute("id", "workspace-content");
  await userEvent.click(screen.getByRole("button", { name: "Esci" }));
  expect(logout).toHaveBeenCalledOnce();
  const menu = screen.getByRole("button", { name: "Menu" });
  await userEvent.click(menu);
  expect(menu).toHaveAttribute("aria-expanded", "true");
});

it("keeps coach navigation separate and includes the lesson section", () => {
  render(
    <WorkspaceShell
      role="PROFESSIONAL"
      pathname="/professional/lessons"
      nav={[
        { href: "/professional", label: "Atleti" },
        { href: "/professional/lessons", label: "Lezioni gratuite" },
      ]}
      loggingOut={false}
      onLogout={() => {}}
      title="Lezioni"
      eyebrow="Coach"
    >
      <p>Gruppi</p>
    </WorkspaceShell>,
  );
  expect(screen.getByRole("link", { name: "Atleti" })).not.toHaveAttribute(
    "aria-current",
  );
  expect(
    screen.getByRole("link", { name: "Lezioni gratuite" }),
  ).toHaveAttribute("aria-current", "page");
  expect(screen.queryByText("Configurazione")).not.toBeInTheDocument();
});
