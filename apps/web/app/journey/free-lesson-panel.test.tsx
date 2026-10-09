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
  missing: ["CONFIDENCE"],
  credits: { balance: 70, toUnlock: 100 },
  earn: { initialAssessment: 30, calibrationRound: 20 },
  clubs: [{ id: "c1", name: "Padel Roma Nord", city: "Roma" }],
  attributedClubId: "c1",
  seat: null,
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

  it("shows the credits towards the lesson, with no micro-tests of its own", async () => {
    const calls = serve(base);
    render(<FreeLessonPanel refreshKey="a" />);
    expect(await screen.findByText("70 di 100 crediti")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "70",
    );
    // I micro-test sono passi della calibrazione: il pannello non li propone.
    expect(
      screen.getByText(/per ogni passo della calibrazione/),
    ).toBeInTheDocument();
    expect(calls.map((c) => c.url)).toEqual([
      "/api/athlete-journey/free-lesson",
    ]);
  });

  it("asks for the coach sharing consent before requesting the seat", async () => {
    const calls = serve(
      { ...base, phase: "ELIGIBLE", missing: [] },
      {
        ...base,
        phase: "REQUESTED",
        missing: [],
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

  it("AT-14: explains what unlocks the lesson, never the credits", async () => {
    serve(base);
    render(<FreeLessonPanel refreshKey="a" />);
    expect(
      await screen.findByText(/quando il tuo profilo è abbastanza attendibile/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Richiedi/ })).toBeNull();
  });

  it("AT-11: shows only a neutral message while the lesson is suspended", async () => {
    serve({ ...base, missing: ["PROFILE"] });
    render(<FreeLessonPanel refreshKey="a" />);
    expect(
      await screen.findByText(/Continuiamo a conoscere il tuo profilo/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/segnalazion|sospes|anomal/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Richiedi/ })).toBeNull();
  });

  it("AT-18: lets an eligible athlete decline, then change their mind", async () => {
    const onChanged = vi.fn();
    const calls = serve(
      { ...base, phase: "ELIGIBLE", missing: [] },
      { ...base, phase: "DECLINED", missing: [] },
    );
    render(<FreeLessonPanel refreshKey="a" onChanged={onChanged} />);
    expect(
      await screen.findByText(/si chiudono dopo la lezione/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Preferisco non fare la lezione" }),
    );
    expect(
      await screen.findByText(/Hai scelto di non fare la lezione/),
    ).toBeInTheDocument();
    expect(calls[1].url).toBe("/api/athlete-journey/free-lesson/decline");
    expect(onChanged).toHaveBeenCalledOnce();
    // Si può ancora richiedere il posto.
    expect(
      screen.getByRole("button", { name: /Richiedi il posto/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preferisco non fare la lezione" }),
    ).toBeNull();
  });
});
