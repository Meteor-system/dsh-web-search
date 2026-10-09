export const WEB_SEARCH_NAMESPACE = "dsh-web-search";

/** Search engines the plugin can query, in their default order. */
export const ENGINE_IDS = ["duckduckgo", "bing"] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export type WebSearchSettings = {
  /** Whether the search provider is offered to the agent. Absent or non-false means on. */
  enabled: boolean;
  /**
   * The user's engine order, tried in sequence. An empty list means automatic: engines are
   * probed and the reachable ones go first. A non-empty list always names every engine.
   */
  engineOrder: EngineId[];
};

function isEngineId(value: unknown): value is EngineId {
  return typeof value === "string" && (ENGINE_IDS as readonly string[]).includes(value);
}

/** Keep the known engines in the user's order, then append any engine the user left out. */
export function normalizeEngineOrder(raw: unknown): EngineId[] {
  if (!Array.isArray(raw)) return [];
  const order: EngineId[] = [];
  for (const item of raw) {
    if (isEngineId(item) && !order.includes(item)) order.push(item);
  }
  if (order.length === 0) return [];
  for (const id of ENGINE_IDS) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

export function parseWebSearchSettings(raw: unknown): WebSearchSettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { enabled: true, engineOrder: [] };
  }
  const record = raw as { enabled?: unknown; engineOrder?: unknown };
  return {
    enabled: record.enabled !== false,
    engineOrder: normalizeEngineOrder(record.engineOrder),
  };
}

/** The three choices the settings page offers, keyed by a stable string. */
export const ENGINE_ORDER_CHOICES = {
  auto: [],
  "duckduckgo,bing": ["duckduckgo", "bing"],
  "bing,duckduckgo": ["bing", "duckduckgo"],
} as const satisfies Record<string, readonly EngineId[]>;

export type EngineOrderChoice = keyof typeof ENGINE_ORDER_CHOICES;

export function orderToChoice(order: readonly EngineId[]): EngineOrderChoice {
  if (order.length === 0) return "auto";
  const key = order.join(",");
  return key in ENGINE_ORDER_CHOICES ? (key as EngineOrderChoice) : "auto";
}

export function choiceToOrder(choice: string): EngineId[] {
  if (!(choice in ENGINE_ORDER_CHOICES)) return [];
  return [...ENGINE_ORDER_CHOICES[choice as EngineOrderChoice]];
}
