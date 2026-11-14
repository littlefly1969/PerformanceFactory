import { describe, expect, it } from "vitest";
import { clubInitials } from "./club-initials";

describe("clubInitials", () => {
  it("takes the first and last meaningful word, as in the demo", () => {
    expect(clubInitials("Padel Club Milano Nord")).toBe("PN");
    expect(clubInitials("Circolo Tennis di Roma")).toBe("CR");
    expect(clubInitials("Padelus")).toBe("P");
    expect(clubInitials("La Rete")).toBe("R");
    expect(clubInitials("A B")).toBe("AB");
    expect(clubInitials("  ")).toBe("");
  });
});
