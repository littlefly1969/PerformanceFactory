"use client";

import { PromptOverviewGrid } from "./prompt-overview-grid";
import type { PromptManagementModel } from "./use-prompt-management";

export function renderPromptOverview(model: PromptManagementModel) {
  const { openPromptMode, getPromptOverview } = model;
  return (
    <PromptOverviewGrid
      getOverview={getPromptOverview}
      onOpen={openPromptMode}
    />
  );
}
