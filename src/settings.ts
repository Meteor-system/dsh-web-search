export const WEB_SEARCH_NAMESPACE = "dsh-web-search";

export type WebSearchSettings = {
  /** Whether the search provider is offered to the agent. Absent or non-false means on. */
  enabled: boolean;
};

export function parseWebSearchSettings(raw: unknown): WebSearchSettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { enabled: true };
  return { enabled: (raw as { enabled?: unknown }).enabled !== false };
}
