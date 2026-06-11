/**
 * Project status vocabularies, shared between server models and client UI
 * (status pickers render these — they can't live in a .server.ts module).
 */

export const PROJECT_STATUSES = [
  "idea",
  "planned",
  "in_progress",
  "done",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const ITEM_STATUSES = [
  "proposed",
  "ordered",
  "received",
  "installed",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
