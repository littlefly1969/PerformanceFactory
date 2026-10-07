import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FlagsPage from "./page";
import PartnersPage from "../partners/page";

vi.mock("../../components/product-shell", () => ({
  ProductShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
  StatusBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

type Call = { url: string; method: string; body?: unknown };
function serve(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const path = url.replace("/api", "").split("?")[0];
      return new Response(JSON.stringify(routes[`${method} ${path}`] ?? {}));
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("admin ingresso", () => {
  it("releases a flag to everyone and manages beta testers", async () => {
    const calls = serve({
      "GET /admin/feature-flags": [
        {
          key: "referral_share",
          description: "Link di invito",
          enabled: true,
          betaTesters: true,
          rolloutPercent: 0,
          updatedAt: null,
        },
      ],
      "GET /admin/beta-testers": [
        { id: "u1", email: "beta@pf.test", firstName: null, lastName: null },
      ],
    });
    render(<FlagsPage />);
    expect(await screen.findByText("beta tester")).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText("Percentuale di utenti"),
      "100",
    );
    await userEvent.click(screen.getByRole("button", { name: "Rimuovi" }));
    await waitFor(() =>
      expect(calls.filter((c) => c.method !== "GET")).toEqual([
        {
          url: "/api/admin/feature-flags/referral_share",
          method: "PATCH",
          body: { rolloutPercent: 100 },
        },
        {
          url: "/api/admin/beta-testers",
          method: "PUT",
          body: { email: "beta@pf.test", isBetaTester: false },
        },
      ]),
    );
  });

  it("creates a club and shows its QR link and the funnel", async () => {
    const calls = serve({
      "GET /admin/partners": [
        {
          id: "p1",
          code: "padel-nord",
          name: "Padel Nord",
          city: "Roma",
          isActive: true,
          attributedUsers: 4,
        },
      ],
      "GET /admin/analytics/funnel": {
        days: 30,
        events: { landing_viewed: 40, registration_completed: 4 },
        registrationsByPartner: [{ partner: "Padel Nord", registrations: 4 }],
      },
    });
    render(<PartnersPage />);
    expect(
      await screen.findByText(/\/start\?club=padel-nord/),
    ).toBeInTheDocument();
    expect(screen.getByText("Atterraggi").nextElementSibling).toHaveTextContent(
      "40",
    );
    await userEvent.type(screen.getByLabelText("Nome"), "Padel Sud");
    await userEvent.type(
      screen.getByLabelText("Codice (es. padel-roma-nord)"),
      "Padel-Sud",
    );
    await userEvent.click(screen.getByRole("button", { name: "Crea circolo" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        code: "padel-sud",
        name: "Padel Sud",
      }),
    );
  });
});
