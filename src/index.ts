import { DUCKDUCKGO_PROVIDER_ID } from "./duckduckgo.js";
import { EngineRouter } from "./engines.js";
import { Config } from "./config.js";
import {
  normalizeEngineOrder,
  parseWebSearchSettings,
  WEB_SEARCH_NAMESPACE,
  type EngineId,
} from "./settings.js";

const LOG_PREFIX = "[dsh-web-search]";

export const name = "dsh-web-search";
export const inject = ["settings"];
export { Config };

// The row config of this plugin. Fields are volatile in 0.1.7, so the live value can be
// newer than the stored section; read it first, as dsh-fixes does.
let activeConfig: unknown;
// One router per process: it holds the reachability ranking between searches.
const router = new EngineRouter({ fetch: globalThis.fetch });

type SettingsLike = {
  get?(namespace: string): unknown;
  register?(namespace: string, schema: unknown, options?: unknown): unknown;
};

type WebLike = {
  registerSearchProvider(provider: {
    id: string;
    available(): boolean;
    search(
      request: { query: string; maxResults?: number },
      signal?: AbortSignal,
    ): Promise<{ sources: Array<{ url: string; title?: string; snippet?: string }>; truncated: boolean }>;
  }): () => void;
};

type PluginContext = {
  settings: SettingsLike;
  effect: (callback: () => () => void, name?: string) => unknown;
  get(name: string): unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapField(value: unknown): unknown {
  if (isRecord(value) && typeof value.get === "function") {
    try {
      return (value.get as () => unknown)();
    } catch {
      return undefined;
    }
  }
  return value;
}

export function readWebSearchEnabled(settings: SettingsLike, config?: unknown): boolean {
  if (isRecord(config) && "enabled" in config) {
    return parseWebSearchSettings({ enabled: unwrapField(config.enabled) }).enabled;
  }
  try {
    return parseWebSearchSettings(settings.get?.(WEB_SEARCH_NAMESPACE)).enabled;
  } catch (error) {
    console.warn(LOG_PREFIX, "read settings error:", error instanceof Error ? error.message : String(error));
    return true;
  }
}

function webSearchSchema(value: unknown) {
  return parseWebSearchSettings(value);
}

/** The user's engine order, read live: the plugin row config wins over the stored section. */
export function readEngineOrder(settings: SettingsLike, config?: unknown): EngineId[] {
  if (isRecord(config) && "engineOrder" in config) {
    return normalizeEngineOrder(unwrapField(config.engineOrder));
  }
  try {
    return parseWebSearchSettings(settings.get?.(WEB_SEARCH_NAMESPACE)).engineOrder;
  } catch {
    return [];
  }
}

webSearchSchema.toJSON = () => ({
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    engineOrder: { type: "array", items: { type: "string", enum: ["duckduckgo", "bing"] } },
  },
});

function installNamespace(ctx: PluginContext): void {
  const register = ctx.settings.register;
  if (typeof register !== "function") return;
  try {
    register.call(ctx.settings, WEB_SEARCH_NAMESPACE, webSearchSchema);
  } catch (error) {
    console.warn(LOG_PREFIX, "settings register error:", error instanceof Error ? error.message : String(error));
  }
}

function installSearch(ctx: PluginContext): void {
  const web = ctx.get("web") as WebLike | undefined;
  if (web === undefined) {
    console.warn(LOG_PREFIX, "web service unavailable; search not registered");
    return;
  }
  ctx.effect(() => {
    const dispose = web.registerSearchProvider({
      id: DUCKDUCKGO_PROVIDER_ID,
      // Read on every offer, so the General switch takes effect without a restart.
      available: () => readWebSearchEnabled(ctx.settings, activeConfig),
      search: (request, signal) =>
        router.search(request, {
          order: readEngineOrder(ctx.settings, activeConfig),
          signal,
        }),
    });
    return () => {
      dispose();
    };
  }, "dsh-web-search: search provider");
}

export function apply(ctx: PluginContext, config?: unknown): void {
  activeConfig = config;
  installNamespace(ctx);
  installSearch(ctx);
}
