import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FreeLessonPanel, type FreeLessonView } from "./free-lesson-panel";

vi.mock("@/app/lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));

const base: Extract<FreeLessonView, { enabled: true }> = {
  enabled: true,
  phase: "LOCKED",
  missing: ["CREDITS"],
  credits: { balance: 70, toUnlock: 100 },
  earn: { initialAssessment: 30, calibrationRound: 20, microTest: 10 },
  clubs: [{ id: "c1", name: "Padel Roma Nord", city: "Roma" }],
  attributedClubId: "c1",
  seat: null,
  microTests: [
    {
      id: "m1",
      title: "Bandeja",
      instructions: "Dieci bandeje: quante finiscono in campo?",
      areaName: "Tecnico-tattico",
      personal: false,
      options: [
        { value: "low", label: "Meno di 5" },
        { value: "high", label: "5 o più" },
      ],
    },
  ],
  microTestsLeft: 1,
  generateMicroTests: false,
};

const serve = (...views: FreeLessonView[]) => {
  const calls: Array<{ url: string; body?: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(
        JSON.stringify(views[Math.min(calls.length - 1, views.length - 1)]),
      );
    }),
  );
  return calls;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FreeLessonPanel", () => {
  it("renders nothing while the feature is off", async () => {
    serve({ enabled: false });
    const { container } = render(<FreeLessonPanel refreshKey="a" />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the credits towards the lesson and reports a micro-test", async () => {
    const calls = serve(base, {
      ...base,
      credits: { balance: 80, toUnlock: 100 },
      microTests: [],
      microTestsLeft: 0,
    });
    render(<FreeLessonPanel refreshKey="a" />);
    expect(await screen.findByText("70 di 100 crediti")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "70",
    );
    await userEvent.click(screen.getByRole("button", { name: /5 o più/ }));
    expect(await screen.findByText("80 di 100 crediti")).toBeInTheDocument();
    expect(calls[1]).toEqual({
      url: "/api/athlete-journey/free-lesson/micro-tests/m1",
      body: { value: "high" },
    });
  });

  it("asks for the coach sharing consent before requesting the seat", async () => {
    const calls = serve(
      { ...base, phase: "ELIGIBLE", missing: [], microTests: [] },
      {
        ...base,
        phase: "REQUESTED",
        missing: [],
        microTests: [],
        seat: {
          status: "REQUESTED",
          club: { name: "Padel Roma Nord", city: "Roma" },
          lesson: null,
        },
      },
    );
    render(<FreeLessonPanel refreshKey="a" />);
    const request = await screen.findByRole("button", {
      name: /Richiedi il posto/,
    });
    expect(request).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(request);
    expect(
      await screen.findByText(/Richiesta inviata a Padel Roma Nord, Roma/),
    ).toBeInTheDocument();
    expect(calls[1].body).toEqual({ partnerId: "c1", shareWithCoach: true });
  });

  it("asks once for the micro-tests written for the athlete", async () => {
    const calls = serve(
      { ...base, microTests: [], generateMicroTests: true },
      {
        ...base,
        microTests: [
          {
            ...base.microTests[0],
            id: "m2",
            title: "Uscita dalla parete",
            personal: true,
          },
        ],
      },
    );
    render(<FreeLessonPanel refreshKey="a" />);
    expect(
      await screen.findByText(
        /Uscita dalla parete · Tecnico-tattico · su misura/,
      ),
    ).toBeInTheDocument();
    expect(calls.map((c) => c.url)).toEqual([
      "/api/athlete-journey/free-lesson",
      "/api/athlete-journey/free-lesson/micro-tests/generate",
    ]);
  });
});
