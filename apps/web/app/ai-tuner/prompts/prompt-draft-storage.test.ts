import assert from "node:assert/strict";
import test from "node:test";
import {
  areaConfigDraftsKey,
  makeHistoryDraftId,
  parseStoredAreaConfigDrafts,
  parseStoredSportAreaDrafts,
  parseStoredTrainingDrafts,
  sportAreaDraftsKey,
  trainingDraftsKey,
} from "./prompt-draft-storage.ts";
import {
  areaDisplayName,
  defaultSportAreaPromptText,
  stringifyJson,
} from "./prompt-model.ts";

test("builds stable and isolated draft keys", () => {
  assert.equal(
    sportAreaDraftsKey("running", "trail", "mental"),
    "pf-ai-tuner-prompt-draft-v1:sport-area-drafts:running:trail:mental",
  );
  assert.equal(
    trainingDraftsKey("running", "trail"),
    "pf-ai-tuner-prompt-draft-v1:training-drafts:running:trail",
  );
  assert.equal(
    areaConfigDraftsKey("mental", "running", "trail"),
    "pf-ai-tuner-prompt-draft-v1:area-config-drafts:mental:running:trail",
  );
  assert.equal(
    areaConfigDraftsKey("mental"),
    "pf-ai-tuner-prompt-draft-v1:area-config-drafts:mental",
  );
});

test("returns an empty collection for malformed stored data", () => {
  assert.deepEqual(parseStoredSportAreaDrafts("not-json"), []);
  assert.deepEqual(parseStoredAreaConfigDrafts("{}"), []);
  assert.deepEqual(parseStoredTrainingDrafts(null), []);
});

test("keeps valid drafts and rejects incomplete records", () => {
  const valid = {
    id: "draft-1",
    name: "Versione controllata",
    basePrompt: "Prompt",
    updatedAt: "2026-09-14T10:00:00.000Z",
  };
  const parsed = parseStoredSportAreaDrafts(
    JSON.stringify([valid, { ...valid, basePrompt: 42 }, null]),
  );

  assert.deepEqual(parsed, [valid]);
});

test("creates deterministic history identifiers when time is supplied", () => {
  assert.equal(makeHistoryDraftId(1234), "previous-1234");
});

test("normalizes legacy area labels for presentation", () => {
  assert.equal(areaDisplayName("allenamento mentale"), "Mental training");
  assert.equal(areaDisplayName("TECNICA"), "Tecnico-tattica");
  assert.equal(areaDisplayName("Nuova area"), "Nuova area");
});

test("builds default prompts and formats empty JSON values", () => {
  assert.match(
    defaultSportAreaPromptText("Running", "Trail", "Mental training"),
    /Running - Trail/,
  );
  assert.equal(stringifyJson(null), "{}");
  assert.equal(stringifyJson({ score: 5 }), '{\n  "score": 5\n}');
});
