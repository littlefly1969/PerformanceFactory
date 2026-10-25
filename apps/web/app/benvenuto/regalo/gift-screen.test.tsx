import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GiftScreen, areaShort } from "./gift-screen";

vi.mock("@/app/lib/api", () => ({ API_BASE: "/api" }));

afterEach(cleanup);

const areas = [
  { id: "a1", name: "Tecnico-tattica", real: false },
  { id: "a2", name: "Preparazione atletica", real: true },
  { id: "a3", name: "Allenamento mentale", real: false },
  { id: "a4", name: "Nutrizione", real: false },
  { id: "a5", name: "Equipaggiamento", real: false },
  { id: "a6", name: "Fisioterapia", real: false },
];

describe("GiftScreen", () => {
  it("shows the clubs with logo, photo or initials and the Real areas", () => {
    render(
      <GiftScreen
        clubs={[
          {
            id: "c1",
            name: "Padelus",
            city: "L'Aquila",
            logoUrl: "/partners/c1/logo?v=1",
            photoUrl: "/partners/c1/photo?v=1",
          },
          {
            id: "c2",
            name: "Padel Roma Nord",
            city: null,
            logoUrl: null,
            photoUrl: null,
          },
        ]}
        areas={areas}
        onContinue={() => {}}
        onSkip={() => {}}
      />,
    );
    const carousel = screen.getByRole("region", { name: "Circoli affiliati" });
    const first = within(carousel).getByRole("group", {
      name: "1 di 2: Padelus",
    });
    expect(within(first).getByAltText("Logo Padelus")).toHaveAttribute(
      "src",
      "/api/partners/c1/logo?v=1",
    );
    expect(within(first).getByText("L'Aquila")).toBeInTheDocument();
    expect(
      within(
        within(carousel).getByRole("group", {
          name: "2 di 2: Padel Roma Nord",
        }),
      ).getByText("PR"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "1Una lezione di prova, gratis.",
    );
    expect(screen.getByText(/tutte e sei le aree/)).toBeInTheDocument();
    expect(screen.getByText("1 di 6 aree reali")).toBeInTheDocument();
    expect(
      screen.getByTitle("Preparazione atletica").closest("li"),
    ).toHaveClass("is-real");
    expect(screen.getByLabelText("Passo 3 di 4")).toBeInTheDocument();
  });

  it("moves on with Continua and Salta", async () => {
    const onContinue = vi.fn();
    const onSkip = vi.fn();
    render(
      <GiftScreen
        clubs={[]}
        areas={areas}
        onContinue={onContinue}
        onSkip={onSkip}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "Circoli affiliati" }),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Continua" }));
    await userEvent.click(screen.getByRole("button", { name: "Salta" }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("abbreviates area names to five letters", () => {
    expect(areaShort("Allenamento mentale")).toBe("MENTA");
    expect(areaShort("Nutrizione")).toBe("NUTRI");
    expect(areaShort("Équipe")).toBe("EQUIP");
  });
});
