import { describe, expect, it } from "vitest";
import { parseWebSearchSettings, WEB_SEARCH_NAMESPACE } from "../src/settings.ts";

describe("web search settings", () => {
  it("uses its own settings namespace", () => {
    expect(WEB_SEARCH_NAMESPACE).toBe("dsh-web-search");
  });

  it("defaults to enabled when nothing is stored", () => {
    expect(parseWebSearchSettings(undefined)).toEqual({ enabled: true });
    expect(parseWebSearchSettings({})).toEqual({ enabled: true });
  });

  it("reads an explicit false and treats any other value as enabled", () => {
    expect(parseWebSearchSettings({ enabled: false })).toEqual({ enabled: false });
    expect(parseWebSearchSettings({ enabled: "no" })).toEqual({ enabled: true });
  });
});
