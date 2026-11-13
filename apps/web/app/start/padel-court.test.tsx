import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  courtShift,
  judgeHit,
  PadelCourt,
  rallyAt,
  resetCourtClock,
  RHYTHM_PERIOD_MS,
  RhythmCourt,
} from "./padel-court";

/** requestAnimationFrame manuale: ogni frame avanza del tempo indicato. */
function fakeFrames() {
  let now = 0;
  let next = 1;
  const queue = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.set(next, cb);
    return next++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
  return {
    pending: () => queue.size,
    advance(ms: number, step = 16) {
      for (let t = 0; t < ms; t += step) {
        now += step;
        const callbacks = [...queue.values()];
        queue.clear();
        act(() => callbacks.forEach((cb) => cb(now)));
      }
    },
    /** Un salto unico, come il ritorno da una scheda in background. */
    jump(ms: number) {
      now += ms;
      const callbacks = [...queue.values()];
      queue.clear();
      act(() => callbacks.forEach((cb) => cb(now)));
    },
  };
}

function reducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

/** Porta lo scambio nella zona di colpo (fase 0.5) a partire da fase 0. */
const toZone = RHYTHM_PERIOD_MS * 0.5;

beforeEach(() => reducedMotion(false));
afterEach(() => {
  cleanup();
  resetCourtClock();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Trova il ritmo", () => {
  it("judges a tolerant window around the near player", () => {
    expect(judgeHit(0.5)).toBe("hit");
    expect(judgeHit(0.44)).toBe("hit");
    expect(judgeHit(0.56)).toBe("hit");
    expect(judgeHit(0.3)).toBe("early");
    expect(judgeHit(0.65)).toBe("late");
    expect(judgeHit(0.05)).toBe("wait");
    expect(judgeHit(0.25)).toBe("wait");
    expect(rallyAt(0.5)).toMatchObject({ x: 120, y: 114, scale: 1 });
    expect(rallyAt(0)).toMatchObject({ x: 86, y: 58 });
  });

  it("flies straight from player to player, never stopping at the net", () => {
    // Fermate solo sui quattro giocatori, mai sulla rete (x = 177).
    expect(rallyAt(0.25)).toMatchObject({ x: 268, y: 104, scale: 1 });
    expect(rallyAt(0.75)).toMatchObject({ x: 234, y: 50, scale: 1 });
    // A metà volo la pallina si ingrandisce: è il pallonetto.
    const mid = rallyAt(0.125);
    expect(mid.x).toBeCloseTo(177, 0);
    expect(mid.scale).toBeCloseTo(1.6, 1);
  });

  it("is only the animated court while the flag is off", () => {
    render(<RhythmCourt />);
    expect(screen.queryByRole("button", { name: "Prova il ritmo" })).toBeNull();
    expect(document.querySelectorAll(".pf4-court-players circle")).toHaveLength(
      4,
    );
  });

  it("starts only on request and counts three hits to complete", () => {
    const frames = fakeFrames();
    render(<RhythmCourt enabled />);
    expect(frames.pending()).toBe(0);
    expect(screen.queryByRole("button", { name: "Colpisci" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Prova il ritmo" }));
    const hit = () =>
      fireEvent.click(screen.getByRole("button", { name: "Colpisci" }));
    frames.advance(toZone);
    hit();
    expect(screen.getByRole("status")).toHaveTextContent("Preso!");
    expect(screen.getByLabelText("Colpi riusciti 1 su 3")).toBeInTheDocument();

    // Secondo colpo nello stesso scambio: non conta.
    hit();
    expect(screen.getByRole("status")).toHaveTextContent("Già preso");
    expect(screen.getByLabelText("Colpi riusciti 1 su 3")).toBeInTheDocument();

    frames.advance(RHYTHM_PERIOD_MS);
    hit();
    frames.advance(RHYTHM_PERIOD_MS);
    hit();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Hai trovato il ritmo!",
    );
    expect(screen.getByLabelText("Colpi riusciti 3 su 3")).toBeInTheDocument();
    // Completato: il ciclo si ferma.
    expect(frames.pending()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Gioca ancora" }));
    expect(screen.getByLabelText("Colpi riusciti 0 su 3")).toBeInTheDocument();
  });

  it("lets a miss continue without penalty", () => {
    const frames = fakeFrames();
    render(<RhythmCourt enabled />);
    fireEvent.click(screen.getByRole("button", { name: "Prova il ritmo" }));
    frames.advance(RHYTHM_PERIOD_MS * 0.3);
    fireEvent.click(screen.getByRole("button", { name: "Colpisci" }));
    expect(screen.getByRole("status")).toHaveTextContent("Un po' presto");
    expect(screen.getByLabelText("Colpi riusciti 0 su 3")).toBeInTheDocument();
    frames.advance(RHYTHM_PERIOD_MS * 0.2);
    fireEvent.click(screen.getByRole("button", { name: "Colpisci" }));
    expect(screen.getByLabelText("Colpi riusciti 1 su 3")).toBeInTheDocument();
  });

  it("does not jump ahead after a background tab", () => {
    const frames = fakeFrames();
    render(<RhythmCourt enabled />);
    fireEvent.click(screen.getByRole("button", { name: "Prova il ritmo" }));
    frames.advance(160);
    // 10 secondi in un solo frame valgono al massimo 50 ms.
    frames.jump(10_000);
    fireEvent.click(screen.getByRole("button", { name: "Colpisci" }));
    expect(screen.getByLabelText("Colpi riusciti 0 su 3")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Aspetta");
  });

  it("pauses while hidden and cleans up on close and unmount", () => {
    const frames = fakeFrames();
    const { unmount } = render(<RhythmCourt enabled />);
    fireEvent.click(screen.getByRole("button", { name: "Prova il ritmo" }));
    expect(frames.pending()).toBe(1);
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    fireEvent(document, new Event("visibilitychange"));
    expect(frames.pending()).toBe(0);
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    fireEvent(document, new Event("visibilitychange"));
    expect(frames.pending()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Chiudi il gioco" }));
    expect(frames.pending()).toBe(0);
    expect(
      screen.getByRole("button", { name: "Prova il ritmo" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Prova il ritmo" }));
    expect(frames.pending()).toBe(1);
    unmount();
    expect(frames.pending()).toBe(0);
  });

  it("stays static without timed interactions with reduced motion", () => {
    reducedMotion(true);
    const frames = fakeFrames();
    render(<RhythmCourt enabled />);
    expect(screen.queryByRole("button", { name: "Prova il ritmo" })).toBeNull();
    expect(frames.pending()).toBe(0);
  });
});

describe("campo del funnel", () => {
  it("keeps the rally going across questions instead of restarting it", () => {
    vi.useFakeTimers();
    const first = render(<PadelCourt />);
    const court = () => document.querySelector(".pf4-court") as HTMLElement;
    expect(court().style.getPropertyValue("--pf4-court-shift")).toBe("-0ms");
    expect(court()).not.toHaveClass("is-settled");
    first.unmount();
    // La domanda dopo, tre secondi più tardi: lo scambio riprende da lì e
    // le linee sono già tracciate.
    vi.advanceTimersByTime(3000);
    render(<PadelCourt />);
    expect(court().style.getPropertyValue("--pf4-court-shift")).toBe("-3000ms");
    expect(court()).toHaveClass("is-settled");
  });

  it("measures the shift from the first court", () => {
    expect(courtShift(1000)).toBe(0);
    expect(courtShift(5000)).toBe(4000);
    resetCourtClock();
    expect(courtShift(7000)).toBe(0);
  });

  it("does not start the clock while rendering on the server", () => {
    vi.stubGlobal("window", undefined);
    try {
      expect(courtShift(1000)).toBe(0);
      expect(courtShift(9000)).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
    // Il campo idratato nasce a 0 come quello del server e avvia l'orologio.
    expect(courtShift(20000)).toBe(0);
    expect(courtShift(21000)).toBe(1000);
  });
});
