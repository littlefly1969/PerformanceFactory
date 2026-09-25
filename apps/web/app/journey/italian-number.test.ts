import { describe, expect, it } from "vitest";
import {
  italianNumber,
  minutesInWords,
  questionsInWords,
} from "./italian-number";

describe("italianNumber", () => {
  it.each([
    [0, "zero"],
    [5, "cinque"],
    [12, "dodici"],
    [14, "quattordici"],
    [16, "sedici"],
    [20, "venti"],
    [21, "ventuno"],
    [23, "ventitré"],
    [28, "ventotto"],
    [40, "quaranta"],
    [99, "novantanove"],
    [120, "120"],
  ])("%i → %s", (n, words) => expect(italianNumber(n)).toBe(words));

  it("concorda il singolare", () => {
    expect(questionsInWords(1)).toBe("una domanda");
    expect(minutesInWords(1)).toBe("un minuto");
    expect(questionsInWords(14)).toBe("quattordici domande");
    expect(minutesInWords(5)).toBe("cinque minuti");
  });
});
