export const AUDITS_PAGE_SIZE = 30;

export const REPLAYS_PAGE_SIZE = 30;

export const EXPORT_SEPARATOR =
  '======================================================================';

export type ExportBlock = {
  title: string;
  text: string;
};

export type ExportPromptEntry = {
  type: string;
  id: string;
  version?: number | null;
  activeVersionId?: string | null;
  activeVersion?: number | null;
  scope: string;
  flags?: string[];
  warning?: string | null;
  blocks: ExportBlock[];
};
