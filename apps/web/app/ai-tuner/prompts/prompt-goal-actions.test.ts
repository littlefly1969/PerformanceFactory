import { secureFetch } from "@/app/lib/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveGoalPromptAction } from "./prompt-goal-actions";
import { emptyGoalPrompt } from "./prompt-model";

vi.mock("@/app/lib/api", () => ({ API_BASE: "/api", secureFetch: vi.fn() }));

const state = () => ({
  setBusyKey: vi.fn(),
  setMessage: vi.fn(),
  setGoalDraft: vi.fn(),
  goalDraft: {
    ...emptyGoalPrompt,
    id: "active",
    name: "Race",
    basePrompt: "Prepare for a race",
    isActive: true,
  },
  hasChanges: true,
  uniqueGoalDraftName: vi.fn((name: string) => name),
  loadSettings: vi.fn().mockResolvedValue(undefined),
  showSuccess: vi.fn(),
});

describe("goal prompt drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves edits to an active prompt as a new inactive draft", async () => {
    const context = state();
    const draft = { ...context.goalDraft, id: "draft", isActive: false };
    vi.mocked(secureFetch).mockResolvedValue(Response.json(draft));
    await saveGoalPromptAction(context);
    const request = vi.mocked(secureFetch).mock.calls[0][1];
    expect(JSON.parse(request!.body as string)).toEqual({
      name: "Race bozza",
      basePrompt: "Prepare for a race",
      isActive: false,
    });
    expect(context.setGoalDraft).toHaveBeenCalledWith(draft);
    expect(context.loadSettings).toHaveBeenCalledOnce();
    expect(context.showSuccess).toHaveBeenCalledOnce();
    expect(context.setBusyKey).toHaveBeenLastCalledWith(null);
  });

  it("updates an existing inactive draft without changing its id", async () => {
    const context = state();
    context.goalDraft.isActive = false;
    vi.mocked(secureFetch).mockResolvedValue(Response.json(context.goalDraft));
    await saveGoalPromptAction(context);
    expect(
      JSON.parse(vi.mocked(secureFetch).mock.calls[0][1]!.body as string),
    ).toMatchObject({ id: "active", isActive: false });
  });

  it("reports server validation failures without confirming a save", async () => {
    const context = state();
    vi.mocked(secureFetch).mockResolvedValue(
      Response.json({ message: "Nome duplicato" }, { status: 400 }),
    );
    await saveGoalPromptAction(context);
    expect(context.setMessage).toHaveBeenLastCalledWith(
      "Salvataggio non riuscito: Nome duplicato",
    );
    expect(context.loadSettings).not.toHaveBeenCalled();
    expect(context.showSuccess).not.toHaveBeenCalled();
    expect(context.setBusyKey).toHaveBeenLastCalledWith(null);
  });
});
