import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import Page from "./page";

vi.mock("@/app/components/product-shell", () => ({
  ProductShell: ({
    title,
    children,
  }: {
    title: string;
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/app/lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));

const settings = {
  confidenceThreshold: 70,
  levelConfidenceThreshold: 50,
  maxDays: 30,
  closingDay: 25,
  questionsPerDriver: 2,
  driversPerRound: 2,
  minHoursBetweenRounds: 20,
  trainingDuringCalibration: false,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("saves the calibration parameters and shows the server's refusal", async () => {
  const puts: Record<string, number | boolean>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "PUT") return new Response(JSON.stringify(settings));
      const body = JSON.parse(String(init.body));
      puts.push(body);
      if (body.closingDay > body.maxDays)
        return new Response(
          JSON.stringify({
            message: [
              "Il giorno di chiusura non può superare la durata massima",
            ],
          }),
          { status: 400 },
        );
      return new Response(JSON.stringify(body));
    }),
  );
  render(<Page />);
  const threshold = await screen.findByLabelText(
    /Soglia di confidence per driver/,
  );
  await userEvent.clear(threshold);
  await userEvent.type(threshold, "80");
  await userEvent.click(
    screen.getByRole("button", { name: "Salva parametri" }),
  );
  expect(puts[0]).toMatchObject({
    confidenceThreshold: 80,
    maxDays: 30,
    trainingDuringCalibration: false,
  });
  expect(await screen.findByText(/Parametri salvati/)).toBeVisible();

  const closing = screen.getByLabelText(/Giorno dell'assessment di chiusura/);
  await userEvent.clear(closing);
  await userEvent.type(closing, "40");
  await userEvent.click(
    screen.getByRole("button", { name: "Salva parametri" }),
  );
  expect(
    await screen.findByText(
      "Il giorno di chiusura non può superare la durata massima",
    ),
  ).toBeVisible();
});

it("turns on training during calibration only when the admin ticks it", async () => {
  const puts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "PUT") return new Response(JSON.stringify(settings));
      const body = JSON.parse(String(init.body));
      puts.push(body);
      return new Response(JSON.stringify(body));
    }),
  );
  render(<Page />);
  const toggle = await screen.findByLabelText(
    /Programma di allenamento durante la calibrazione/,
  );
  expect(toggle).not.toBeChecked();
  await userEvent.click(toggle);
  await userEvent.click(
    screen.getByRole("button", { name: "Salva parametri" }),
  );
  expect(puts[0]).toMatchObject({ trainingDuringCalibration: true });
});
