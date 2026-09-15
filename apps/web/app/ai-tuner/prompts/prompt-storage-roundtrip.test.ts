import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as storage from "./prompt-draft-storage";

describe("prompt storage round trips", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("writes and removes a draft without touching another context", () => {
    storage.writeStoredDraft("one", "text");
    storage.writeStoredDraft("two", "other");
    expect(storage.readStoredDraft("one")).toBe("text");
    storage.removeStoredDraft("one");
    expect(storage.readStoredDraft("one")).toBeNull();
    expect(storage.readStoredDraft("two")).toBe("other");
  });

  it("round trips each draft history format", () => {
    const common = { id: "draft", name: "Draft", updatedAt: "2026-09-15" };
    const sport = [{ ...common, basePrompt: "Sport instructions" }];
    const area = [
      {
        ...common,
        initialContext: "Context",
        responseFormatPrompt: "JSON",
        questionnaireLayoutJson: {},
      },
    ];
    const training = [{ ...common, trainingPrompt: "Training instructions" }];
    storage.writeStoredSportAreaDrafts("sport", sport);
    storage.writeStoredAreaConfigDrafts("area", area);
    storage.writeStoredTrainingDrafts("training", training);
    expect(storage.readStoredSportAreaDrafts("sport")).toEqual(sport);
    expect(storage.readStoredAreaConfigDrafts("area")).toEqual(area);
    expect(storage.readStoredTrainingDrafts("training")).toEqual(training);
  });

  it("returns empty histories for missing or corrupt values", () => {
    for (const read of [
      storage.readStoredSportAreaDrafts,
      storage.readStoredAreaConfigDrafts,
      storage.readStoredTrainingDrafts,
    ]) {
      expect(read("missing")).toEqual([]);
      storage.writeStoredDraft("broken", "{invalid");
      expect(read("broken")).toEqual([]);
    }
  });

  it("rejects incomplete and incorrectly typed records in every format", () => {
    const complete = {
      id: "id",
      name: "name",
      updatedAt: "now",
      basePrompt: "sport",
      initialContext: "context",
      responseFormatPrompt: "format",
      questionnaireLayoutJson: {},
      trainingPrompt: "training",
    };
    for (const [parse, fields] of [
      [
        storage.parseStoredSportAreaDrafts,
        ["id", "name", "basePrompt", "updatedAt"],
      ],
      [
        storage.parseStoredAreaConfigDrafts,
        ["id", "name", "initialContext", "responseFormatPrompt", "updatedAt"],
      ],
      [
        storage.parseStoredTrainingDrafts,
        ["id", "name", "trainingPrompt", "updatedAt"],
      ],
    ] as const) {
      for (const field of fields) {
        const missing: Record<string, unknown> = { ...complete };
        delete missing[field];
        expect(parse(JSON.stringify([missing]))).toEqual([]);
        expect(parse(JSON.stringify([{ ...complete, [field]: 123 }]))).toEqual(
          [],
        );
      }
      expect(parse(JSON.stringify([null, false, 42]))).toEqual([]);
    }
  });

  it("supports server rendering without browser storage", () => {
    vi.stubGlobal("window", undefined);
    expect(storage.readStoredDraft("draft")).toBeNull();
    expect(storage.readStoredSportAreaDrafts("draft")).toEqual([]);
    expect(storage.readStoredAreaConfigDrafts("draft")).toEqual([]);
    expect(storage.readStoredTrainingDrafts("draft")).toEqual([]);
    expect(() => {
      storage.writeStoredDraft("draft", "value");
      storage.writeStoredSportAreaDrafts("draft", []);
      storage.writeStoredAreaConfigDrafts("draft", []);
      storage.writeStoredTrainingDrafts("draft", []);
      storage.removeStoredDraft("draft");
    }).not.toThrow();
  });
});
