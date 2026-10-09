import { describe, expect, it } from "vitest";
import {
  ENGINE_TTL_MS,
  EngineRouter,
  probeEngines,
  rankEngines,
  type ProbeResult,
} from "../src/engines.ts";

const DDG_RESULT = `<a class="result__a" href="https://example.com/ddg">DDG result</a>`;
const BING_RESULT = `<li class="b_algo"><h2><a href="https://example.org/bing">Bing result</a></h2><p>snippet</p></li>`;
const DDG_CHALLENGE = `<html><body>no results here</body></html>`;

type Behavior = "ok" | "empty" | "throw";

// Fake fetch: each engine answers according to its behavior and records every call.
function fakeFetch(behaviors: Record<"duckduckgo" | "bing", () => Behavior>) {
  const calls: Array<{ engine: "duckduckgo" | "bing"; signal: AbortSignal | undefined }> = [];
  const fetch = async (url: string, init?: { signal?: AbortSignal }) => {
    const engine = url.includes("duckduckgo") ? "duckduckgo" : "bing";
    calls.push({ engine, signal: init?.signal });
    const behavior = behaviors[engine]();
    if (behavior === "throw") throw new Error(`${engine} unreachable`);
    if (engine === "duckduckgo") {
      return {
        ok: true,
        status: behavior === "ok" ? 200 : 202,
        text: async () => (behavior === "ok" ? DDG_RESULT : DDG_CHALLENGE),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => (behavior === "ok" ? BING_RESULT : "<html></html>"),
    };
  };
  return { fetch, calls };
}

const ok = (id: "duckduckgo" | "bing", latencyMs: number): ProbeResult => ({ id, ok: true, latencyMs });
const bad = (id: "duckduckgo" | "bing"): ProbeResult => ({ id, ok: false, latencyMs: 0 });

describe("rankEngines", () => {
  it("puts reachable engines first, fastest first", () => {
    expect(rankEngines([ok("duckduckgo", 900), ok("bing", 300)])).toEqual(["bing", "duckduckgo"]);
  });

  it("keeps unreachable engines last, in default order", () => {
    expect(rankEngines([bad("duckduckgo"), ok("bing", 300)])).toEqual(["bing", "duckduckgo"]);
    expect(rankEngines([bad("duckduckgo"), bad("bing")])).toEqual(["duckduckgo", "bing"]);
  });
});

describe("probeEngines", () => {
  it("counts an engine as reachable only when a real query returns results", async () => {
    const { fetch } = fakeFetch({ duckduckgo: () => "empty", bing: () => "ok" });
    const probes = await probeEngines({ fetch });
    expect(probes.find((probe) => probe.id === "duckduckgo")?.ok).toBe(false);
    expect(probes.find((probe) => probe.id === "bing")?.ok).toBe(true);
    expect(probes.find((probe) => probe.id === "bing")?.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("EngineRouter with auto ordering", () => {
  it("probes once, then reuses the ranking until its TTL expires", async () => {
    let now = 0;
    const { fetch, calls } = fakeFetch({ duckduckgo: () => "ok", bing: () => "ok" });
    const router = new EngineRouter({ fetch, now: () => now });

    await router.search({ query: "a" }, { order: [] });
    expect(calls).toHaveLength(3); // two probes plus the search on the winner

    calls.length = 0;
    await router.search({ query: "b" }, { order: [] });
    expect(calls).toHaveLength(1); // cached ranking: only the search

    now = ENGINE_TTL_MS + 1;
    calls.length = 0;
    await router.search({ query: "c" }, { order: [] });
    expect(calls).toHaveLength(3); // expired: probe again
  });

  it("does not cache a ranking in which every engine failed", async () => {
    let healthy = false;
    const { fetch, calls } = fakeFetch({
      duckduckgo: () => (healthy ? "ok" : "throw"),
      bing: () => (healthy ? "ok" : "throw"),
    });
    const router = new EngineRouter({ fetch, now: () => 0 });

    await expect(router.search({ query: "a" }, { order: [] })).rejects.toThrow(/all engines failed/);
    healthy = true;
    calls.length = 0;
    const result = await router.search({ query: "b" }, { order: [] });
    expect(result.sources[0]?.url).toBeDefined();
    expect(calls.length).toBeGreaterThan(1); // it probed again instead of reusing the failure
  });
});

describe("EngineRouter with a user-defined order", () => {
  it("searches the user's first engine without probing", async () => {
    const { fetch, calls } = fakeFetch({ duckduckgo: () => "ok", bing: () => "ok" });
    const router = new EngineRouter({ fetch, now: () => 0 });

    const result = await router.search({ query: "a" }, { order: ["bing", "duckduckgo"] });

    expect(calls.map((call) => call.engine)).toEqual(["bing"]);
    expect(result.sources[0]?.url).toBe("https://example.org/bing");
  });

  it("falls back through every engine in the user's order when one fails", async () => {
    const { fetch, calls } = fakeFetch({ duckduckgo: () => "ok", bing: () => "throw" });
    const router = new EngineRouter({ fetch, now: () => 0 });

    const result = await router.search({ query: "a" }, { order: ["bing", "duckduckgo"] });

    expect(calls.map((call) => call.engine)).toEqual(["bing", "duckduckgo"]);
    expect(result.sources[0]?.url).toBe("https://example.com/ddg");
  });

  it("falls back when an engine answers with no results", async () => {
    const { fetch, calls } = fakeFetch({ duckduckgo: () => "ok", bing: () => "empty" });
    const router = new EngineRouter({ fetch, now: () => 0 });

    await router.search({ query: "a" }, { order: ["bing", "duckduckgo"] });

    expect(calls.map((call) => call.engine)).toEqual(["bing", "duckduckgo"]);
  });

  it("returns an empty result, not an error, when every engine answers without results", async () => {
    const { fetch } = fakeFetch({ duckduckgo: () => "empty", bing: () => "empty" });
    const router = new EngineRouter({ fetch, now: () => 0 });

    const result = await router.search({ query: "a" }, { order: ["bing", "duckduckgo"] });

    expect(result).toEqual({ sources: [], truncated: false });
  });

  it("stops at the caller's cancellation instead of trying the next engine", async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetch, calls } = fakeFetch({ duckduckgo: () => "ok", bing: () => "ok" });
    const router = new EngineRouter({ fetch, now: () => 0 });

    await expect(
      router.search({ query: "a" }, { order: ["bing", "duckduckgo"], signal: controller.signal }),
    ).rejects.toThrow();
    expect(calls.length).toBeLessThanOrEqual(1);
  });

  it("bounds every engine call with a timeout even when the caller passes no signal", async () => {
    const { fetch, calls } = fakeFetch({ duckduckgo: () => "ok", bing: () => "ok" });
    const router = new EngineRouter({ fetch, now: () => 0 });

    await router.search({ query: "a" }, { order: ["bing"] });

    expect(calls[0]?.signal).toBeDefined();
  });
});
