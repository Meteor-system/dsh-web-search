import {
  searchBing,
  searchDuckDuckGo,
  type FetchLike,
  type SearchRequest,
  type SearchResult,
} from "./duckduckgo.js";
import { ENGINE_IDS, normalizeEngineOrder, type EngineId } from "./settings.js";

/** How long a reachability ranking is reused before the engines are probed again. */
export const ENGINE_TTL_MS = 10 * 60 * 1000;
/** Upper bound for one engine call, probe or search, when the caller gives no shorter signal. */
export const ENGINE_TIMEOUT_MS = 5000;
/** A fixed query whose answer proves an engine is reachable and returns results. */
export const PROBE_QUERY = "wikipedia";

type Searcher = (
  request: SearchRequest,
  deps: { fetch: FetchLike; signal?: AbortSignal },
) => Promise<SearchResult>;

const SEARCHERS: Record<EngineId, Searcher> = {
  duckduckgo: searchDuckDuckGo,
  bing: searchBing,
};

export type ProbeResult = {
  id: EngineId;
  /** True only when a real query returned at least one result. */
  ok: boolean;
  latencyMs: number;
};

export type RouterDeps = {
  fetch: FetchLike;
  now?: () => number;
};

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

// A helper keeps TypeScript from narrowing `aborted` to false after the first check.
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

async function probeOne(id: EngineId, fetch: FetchLike): Promise<ProbeResult> {
  const started = performance.now();
  try {
    const result = await SEARCHERS[id](
      { query: PROBE_QUERY, maxResults: 1 },
      { fetch, signal: withTimeout(undefined, ENGINE_TIMEOUT_MS) },
    );
    return { id, ok: result.sources.length > 0, latencyMs: performance.now() - started };
  } catch {
    return { id, ok: false, latencyMs: performance.now() - started };
  }
}

/** Query every engine with the probe query in parallel and report which ones returned results. */
export async function probeEngines(deps: { fetch: FetchLike }): Promise<ProbeResult[]> {
  return Promise.all(ENGINE_IDS.map((id) => probeOne(id, deps.fetch)));
}

/** Reachable engines first, fastest first; unreachable engines follow in default order. */
export function rankEngines(probes: readonly ProbeResult[]): EngineId[] {
  const reachable = probes
    .filter((probe) => probe.ok)
    .sort((a, b) => a.latencyMs - b.latencyMs)
    .map((probe) => probe.id);
  const rest = ENGINE_IDS.filter((id) => !reachable.includes(id));
  return [...reachable, ...rest];
}

/**
 * Runs searches through the engines in order. With no user order it probes first and caches
 * the ranking for {@link ENGINE_TTL_MS}; a ranking where every engine failed is not cached.
 */
export class EngineRouter {
  private cached: { order: EngineId[]; expiresAt: number } | undefined;

  constructor(private readonly deps: RouterDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  /** The order to try: the user's order when set, otherwise the ranking from a probe. */
  async resolveOrder(userOrder: readonly EngineId[]): Promise<EngineId[]> {
    const explicit = normalizeEngineOrder(userOrder);
    if (explicit.length > 0) return explicit;
    const now = this.now();
    if (this.cached !== undefined && now < this.cached.expiresAt) return [...this.cached.order];
    const probes = await probeEngines({ fetch: this.deps.fetch });
    const order = rankEngines(probes);
    this.cached = probes.some((probe) => probe.ok)
      ? { order, expiresAt: now + ENGINE_TTL_MS }
      : undefined;
    return order;
  }

  /**
   * Try each engine in order and return the first with results. An engine that fails or
   * answers with nothing hands over to the next one. If every engine answered without results,
   * that is an empty result; if every engine failed, the search throws.
   */
  async search(
    request: SearchRequest,
    options: { order: readonly EngineId[]; signal?: AbortSignal },
  ): Promise<SearchResult> {
    const order = await this.resolveOrder(options.order);
    const failures: string[] = [];
    let answered = false;
    for (const id of order) {
      if (isAborted(options.signal)) throw new Error("web search aborted");
      try {
        const result = await SEARCHERS[id](request, {
          fetch: this.deps.fetch,
          signal: withTimeout(options.signal, ENGINE_TIMEOUT_MS),
        });
        if (result.sources.length > 0) return result;
        answered = true;
      } catch (error) {
        if (isAborted(options.signal)) throw error;
        failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (answered) return { sources: [], truncated: false };
    throw new Error(`all engines failed (${failures.join("; ")})`);
  }
}
