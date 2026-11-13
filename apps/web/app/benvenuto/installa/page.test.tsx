import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetInstallPromptForTests } from "../../lib/pwa";
import { resetTapGuard } from "../_components/tap-guard";
import InstallaPage from "./page";

vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";

function setup({
  userAgent,
  standalone = false,
}: {
  userAgent: string;
  standalone?: boolean;
}) {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push(`${init?.method ?? "GET"} ${url}`);
      return new Response(
        url.endsWith("/athlete-journey/profile")
          ? JSON.stringify({ firstName: "Mario Rossi" })
          : "{}",
      );
    }),
  );
  vi.stubGlobal("navigator", { ...navigator, userAgent, maxTouchPoints: 5 });
  vi.stubGlobal("matchMedia", () => ({ matches: standalone }));
  const assign = vi.fn();
  const replace = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign, replace });
  return { requests, assign, replace };
}

afterEach(() => {
  cleanup();
  resetTapGuard();
  resetInstallPromptForTests();
  vi.unstubAllGlobals();
});

describe("04 · La tua app", () => {
  it("closes the welcome on the server as soon as it opens", async () => {
    const { requests } = setup({ userAgent: IPHONE });
    render(<InstallaPage />);
    await waitFor(() =>
      expect(requests).toContain("POST /api/athlete-journey/welcome"),
    );
  });

  it("guides iPhone users through Share → Add to Home Screen", async () => {
    const { assign } = setup({ userAgent: IPHONE });
    render(<InstallaPage />);
    expect(
      await screen.findByText("Aggiungi alla schermata Home"),
    ).toBeInTheDocument();
    expect(screen.getByText(/accesso separato da Safari/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Continua nel browser" }),
    );
    // Prima della home, «Sei dentro, Mario.» (demo V11).
    expect(
      await screen.findByRole("heading", { name: "Sei dentro, Mario." }),
    ).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
    resetTapGuard();
    await userEvent.click(
      screen.getByRole("button", { name: /Entra nell’app/ }),
    );
    expect(assign).toHaveBeenCalledWith("/journey");
  });

  it("ignores the second tap of a double tap: «Sei dentro» stays", async () => {
    const { assign } = setup({ userAgent: IPHONE });
    render(<InstallaPage />);
    // Il primo tocco arriva dalla slide 4, il secondo cade qui su «Più tardi».
    await userEvent.click(
      await screen.findByRole("button", { name: "Più tardi" }),
    );
    expect(
      await screen.findByRole("heading", { name: /Sei dentro/ }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Entra nell’app/ }),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("offers the one-tap install on Android", async () => {
    setup({ userAgent: ANDROID });
    render(<InstallaPage />);
    const event = Object.assign(
      new Event("beforeinstallprompt", { cancelable: true }),
      {
        prompt: vi.fn(async () => undefined),
        userChoice: Promise.resolve({ outcome: "accepted" as const }),
      },
    );
    window.dispatchEvent(event);
    await userEvent.click(
      await screen.findByRole("button", { name: "Installa l’app" }),
    );
    expect(event.prompt).toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", { name: /PF è sulla tua Home/ }),
    ).toBeInTheDocument();
  });

  it("goes straight to the home when already opened as an app", async () => {
    const { replace } = setup({ userAgent: IPHONE, standalone: true });
    render(<InstallaPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/journey"));
  });
});
