import { describe, expect, it } from "vitest";
import type { DiscoveryQuestion } from "./discovery-types";
import { screenIds, screenOf, screenQuestions } from "./funnel-screens";

const question = (
  id: string,
  contextKey?: string,
  type: DiscoveryQuestion["type"] = "number",
): DiscoveryQuestion => ({
  id,
  code: id,
  title: id,
  type,
  required: true,
  order: 1,
  options: [],
  contextKey,
});

describe("funnel screens", () => {
  const goal = question("goal", undefined, "single_choice");
  const height = question("h", "general_height_cm");
  const weight = question("w", "general_weight_kg");

  it("merges height and weight into the screen of the first of the two", () => {
    expect(screenIds([goal, weight, height])).toEqual(["goal", "w"]);
    expect(screenOf([goal, weight, height], "h")).toBe("w");
    expect(screenQuestions([goal, weight, height], "w")).toEqual([
      height,
      weight,
    ]);
  });

  it("keeps a lone measure as its own question", () => {
    expect(screenIds([goal, height])).toEqual(["goal", "h"]);
    expect(screenQuestions([goal, height], "h")).toEqual([height]);
    expect(screenOf([goal, height], "h")).toBe("h");
  });
});
