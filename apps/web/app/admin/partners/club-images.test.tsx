import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClubImages, resizeClubImage } from "./club-images";

vi.mock("@/app/lib/api", () => ({ API_BASE: "/api" }));

afterEach(cleanup);

describe("ClubImages", () => {
  it("previews the current logo and hands new files or removals to the page", async () => {
    const onChange = vi.fn();
    render(
      <ClubImages
        name="Padelus"
        logoUrl="/partners/c1/logo?v=1"
        photoUrl={null}
        busy={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByAltText("Logo Padelus")).toHaveAttribute(
      "src",
      "/api/partners/c1/logo?v=1",
    );
    expect(screen.getByText("Nessuna immagine")).toBeInTheDocument();
    const photo = new File(["x"], "campo.jpg", { type: "image/jpeg" });
    await userEvent.upload(
      screen.getByLabelText("Carica foto di Padelus"),
      photo,
    );
    await userEvent.click(screen.getByRole("button", { name: "Rimuovi" }));
    expect(onChange.mock.calls).toEqual([
      ["photo", photo],
      ["logo", null],
    ]);
  });

  it("refuses vector images before resizing", async () => {
    await expect(
      resizeClubImage(
        new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }),
        "logo",
      ),
    ).rejects.toThrow("PNG, JPEG o WebP");
  });
});
