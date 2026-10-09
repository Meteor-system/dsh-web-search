import { describe, expect, it } from "vitest";
import { apply, inject } from "../src/client/index.ts";

describe("dsh-web-search client", () => {
  it("declares every Client service it reads", () => {
    expect(inject).toEqual(["slots", "configForms"]);
  });

  it("contributes one row to the General settings section", () => {
    const registrations: string[] = [];
    const form = {
      getSnapshot: () => ({ value: undefined }),
      subscribe: () => () => undefined,
      set: async () => undefined,
    };
    const ctx = {
      get: (name: string) => (name === "configForms" ? { get: () => form } : undefined),
      slots: {
        inject: (name: string, register: () => unknown) => {
          registrations.push(name);
          register();
          return () => undefined;
        },
        register: (meta: { name: string; id: string }) => {
          registrations.push(`${meta.name}#${meta.id}`);
          return () => undefined;
        },
      },
    };

    apply(ctx as never);

    expect(registrations).toEqual([
      "settings.general.item",
      "settings.general.item#dsh-web-search",
    ]);
  });
});
