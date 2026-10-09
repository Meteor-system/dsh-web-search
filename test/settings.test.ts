import { describe, expect, it } from "vitest";
import {
  choiceToOrder,
  orderToChoice,
  parseWebSearchSettings,
  WEB_SEARCH_NAMESPACE,
} from "../src/settings.ts";

describe("web search settings", () => {
  it("uses its own settings namespace", () => {
    expect(WEB_SEARCH_NAMESPACE).toBe("dsh-web-search");
  });

  it("defaults to enabled when nothing is stored", () => {
    expect(parseWebSearchSettings(undefined)).toEqual({ enabled: true, engineOrder: [] });
    expect(parseWebSearchSettings({})).toEqual({ enabled: true, engineOrder: [] });
  });

  it("reads an explicit false and treats any other value as enabled", () => {
    expect(parseWebSearchSettings({ enabled: false })).toEqual({ enabled: false, engineOrder: [] });
    expect(parseWebSearchSettings({ enabled: "no" })).toEqual({ enabled: true, engineOrder: [] });
  });
});

describe("engine order setting", () => {
  it("uses automatic ordering (an empty list) when nothing is stored", () => {
    expect(parseWebSearchSettings({}).engineOrder).toEqual([]);
  });

  it("keeps the user's order and appends any engine the user left out", () => {
    expect(parseWebSearchSettings({ engineOrder: ["bing"] }).engineOrder).toEqual(["bing", "duckduckgo"]);
  });

  it("drops unknown and duplicate engine ids", () => {
    expect(
      parseWebSearchSettings({ engineOrder: ["bing", "bing", "google", "duckduckgo"] }).engineOrder,
    ).toEqual(["bing", "duckduckgo"]);
    expect(parseWebSearchSettings({ engineOrder: "auto" }).engineOrder).toEqual([]);
  });

  it("maps the settings choice to and from its stored order", () => {
    expect(orderToChoice([])).toBe("auto");
    expect(orderToChoice(["duckduckgo", "bing"])).toBe("duckduckgo,bing");
    expect(choiceToOrder("bing,duckduckgo")).toEqual(["bing", "duckduckgo"]);
    expect(choiceToOrder("auto")).toEqual([]);
  });
});
