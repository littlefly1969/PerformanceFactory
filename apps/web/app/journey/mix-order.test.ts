import { describe, expect, it } from "vitest";
import { mixOrder, mixedOptions } from "./mix-order";

const options = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ value: String(i), label: `R${i}` }));

const sorted = (order: number[]) =>
  order.every((v, i) => i === 0 || v > order[i - 1]!) ||
  order.every((v, i) => i === 0 || v < order[i - 1]!);

describe("mixOrder", () => {
  it("is fixed for the same question", () => {
    expect(mixOrder(4, "q-1")).toEqual(mixOrder(4, "q-1"));
    expect(mixOrder(7, "q-1")).toEqual(mixOrder(7, "q-1"));
  });

  it("never shows 3 or 4 answers in score order, ascending or descending", () => {
    for (const n of [3, 4])
      for (let k = 0; k < 50; k++) {
        const order = mixOrder(n, `q-${k}`);
        expect([...order].sort()).toEqual(options(n).map((_, i) => i));
        expect(sorted(order)).toBe(false);
      }
  });

  it("keeps every answer once with longer lists, and leaves one or two alone", () => {
    const order = mixOrder(6, "domanda");
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(mixOrder(2, "x")).toEqual([0, 1]);
  });
});

describe("mixedOptions", () => {
  it("mixes the answers without touching values and keeps «Nessuna» last", () => {
    const list = [
      ...options(4),
      { value: "none", label: "Nessuna", exclusive: true },
    ];
    const shown = mixedOptions(list, "q-7");
    expect(shown).toHaveLength(5);
    expect(shown.at(-1)).toEqual(list[4]);
    expect(new Set(shown)).toEqual(new Set(list));
    expect(sorted(shown.slice(0, 4).map((o) => Number(o.value)))).toBe(false);
  });
});
