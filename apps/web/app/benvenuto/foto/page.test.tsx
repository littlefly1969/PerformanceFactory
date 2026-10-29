import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import WelcomePhotoPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/app/lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));
vi.mock("./resize-photo", () => ({
  resizePhoto: vi.fn(async () => "data:image/jpeg;base64,AAAA"),
}));

const serve = (image: string | null) => {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method: init?.method ?? "GET", body });
      return new Response(JSON.stringify({ image: body?.image ?? image }));
    }),
  );
  return calls;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("benvenuto 01 · foto profilo", () => {
  it("lascia rimandare la foto e porta allo Spider", async () => {
    serve(null);
    render(<WelcomePhotoPage />);
    expect(
      screen.getByRole("heading", { name: "Mettici la faccia." }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Lo farò dopo" }).getAttribute("href"),
    ).toBe("/benvenuto/spider");
    expect(
      screen.getByRole("link", { name: "Salta" }).getAttribute("href"),
    ).toBe("/benvenuto/spider");
  });

  it("carica la foto ridimensionata e passa a Continua", async () => {
    const calls = serve(null);
    render(<WelcomePhotoPage />);
    const file = new File(["x"], "me.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Scegli una foto"), file);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Continua" })).toBeTruthy(),
    );
    expect(calls.at(-1)).toEqual({
      url: "/api/athlete/profile/photo",
      method: "PUT",
      body: { image: "data:image/jpeg;base64,AAAA" },
    });
    expect(
      screen.getByAltText("La tua foto profilo").getAttribute("src"),
    ).toBe("data:image/jpeg;base64,AAAA");
  });

  it("mostra la foto già salvata", async () => {
    serve("data:image/jpeg;base64,BBBB");
    render(<WelcomePhotoPage />);
    expect(await screen.findByAltText("La tua foto profilo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cambia foto profilo" })).toBeTruthy();
  });

  it("salva la classifica compilata anche senza «Salva» prima di continuare", async () => {
    const posts: unknown[] = [];
    const empty = {
      ranking: null,
      options: {
        PADEL: [
          { value: "3", label: "3ª fascia" },
          { value: "NONE", label: "Nessuna classifica" },
        ],
        TENNIS: [{ value: "NONE", label: "Nessuna classifica" }],
      },
      recalculationPending: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!url.endsWith("/athlete-journey/fit-ranking"))
          return new Response(JSON.stringify({ image: null }));
        if (init?.method !== "POST") return new Response(JSON.stringify(empty));
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return new Response(JSON.stringify({ ...empty, ranking: body }));
      }),
    );
    render(<WelcomePhotoPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Aggiungi" }));
    const [padelNow, padelBest, tennisNow, tennisBest] =
      screen.getAllByRole("combobox");
    await userEvent.selectOptions(padelNow, "3");
    await userEvent.selectOptions(padelBest, "3");
    await userEvent.selectOptions(tennisNow, "NONE");
    await userEvent.selectOptions(tennisBest, "NONE");
    await userEvent.click(screen.getByRole("link", { name: "Lo farò dopo" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/benvenuto/spider"));
    expect(posts).toEqual([
      {
        padelCurrent: "3",
        padelBest: "3",
        tennisCurrent: "NONE",
        tennisBest: "NONE",
        cardNumber: "",
      },
    ]);
  });
});
