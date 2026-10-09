import { describe, expect, it } from "vitest";
import { apply } from "../src/index.ts";

type Provider = {
  id: string;
  available(): boolean;
  search(request: unknown, signal?: AbortSignal): Promise<unknown>;
};

// Minimal Host context: one `web` service that records registered search providers,
// and a settings store whose stored section can change between offers.
function harness(stored: { value: unknown }, rowConfig?: unknown) {
  const providers: Provider[] = [];
  const web = {
    registerSearchProvider(provider: Provider) {
      providers.push(provider);
      return () => {
        providers.splice(providers.indexOf(provider), 1);
      };
    },
  };
  const ctx = {
    get: (name: string) => (name === "web" ? web : undefined),
    settings: {
      writable: true,
      get: (namespace: string) => (namespace === "dsh-web-search" ? stored.value : undefined),
      register: () => undefined,
      update: async () => undefined,
    },
    timeout: () => () => undefined,
    on: () => () => undefined,
    effect: (callback: () => () => void) => callback(),
  };
  apply(ctx as never, rowConfig);
  return providers;
}

describe("dsh-web-search host plugin", () => {
  it("registers a duckduckgo provider that is offered only while the stored switch is on", () => {
    const off = harness({ value: { enabled: false } });
    expect(off.map((provider) => provider.id)).toEqual(["duckduckgo"]);
    expect(off[0]?.available()).toBe(false);

    const on = harness({ value: { enabled: true } });
    expect(on[0]?.available()).toBe(true);
  });

  it("offers the provider by default when nothing is stored", () => {
    const providers = harness({ value: undefined });
    expect(providers[0]?.available()).toBe(true);
  });

  it("reads the switch on every offer, so a settings change needs no restart", () => {
    const stored = { value: { enabled: true } };
    const providers = harness(stored);
    expect(providers[0]?.available()).toBe(true);
    stored.value = { enabled: false };
    expect(providers[0]?.available()).toBe(false);
  });

  it("prefers the live plugin row config over the stored section", () => {
    const providers = harness({ value: { enabled: true } }, { enabled: false });
    expect(providers[0]?.available()).toBe(false);
  });
});
