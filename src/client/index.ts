import { createElement, useSyncExternalStore, type ChangeEvent, type CSSProperties } from "react";
import { parseWebSearchSettings, type WebSearchSettings, WEB_SEARCH_NAMESPACE } from "../settings.js";

export const name = "dsh-web-search";
// Dynamic Client packages must declare every service they read; configuration is read
// through configForms, the same way dsh-fixes reads its own section.
export const inject = ["slots", "configForms"];

const LOG_PREFIX = "[dsh-web-search]";
const FALLBACK: WebSearchSettings = { enabled: true };

type ConfigForm = {
  getSnapshot(): { value?: unknown };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<unknown>;
};

type SettingsScope = {
  getSnapshot(): { value?: WebSearchSettings };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<unknown>;
};

type ClientContext = {
  get?(name: string): unknown;
  slots: {
    inject(name: string, register: () => unknown): unknown;
    register(
      meta: { name: string; id: string; order: number; label: string },
      render: () => unknown,
    ): unknown;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scopeOf(ctx: ClientContext): SettingsScope | undefined {
  if (typeof ctx.get !== "function") return undefined;
  const forms = ctx.get("configForms");
  if (!isRecord(forms) || typeof forms.get !== "function") return undefined;
  const form = (forms.get as (id: string) => ConfigForm)(WEB_SEARCH_NAMESPACE);
  const unset = Symbol("dsh-web-search: unset form snapshot");
  let previousRaw: unknown = unset;
  let previousSnapshot: { value?: WebSearchSettings } | undefined;
  return {
    getSnapshot() {
      const raw = form.getSnapshot().value;
      if (previousSnapshot !== undefined && Object.is(raw, previousRaw)) return previousSnapshot;
      previousRaw = raw;
      previousSnapshot = { value: parseWebSearchSettings(raw) };
      return previousSnapshot;
    },
    subscribe(listener) {
      return form.subscribe(listener);
    },
    set(field, value) {
      return form.set(field, value);
    },
  };
}

const rowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const checkStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "var(--dsw-alias-label-primary, inherit)",
  cursor: "pointer",
};

const noteStyle: CSSProperties = {
  fontSize: 12,
  opacity: 0.72,
  margin: 0,
  lineHeight: "18px",
};

function WebSearchRow(props: { scope: SettingsScope | undefined }) {
  const { scope } = props;
  const value = useSyncExternalStore(
    (onChange) => (scope === undefined ? () => undefined : scope.subscribe(onChange)),
    () => scope?.getSnapshot().value ?? FALLBACK,
    () => FALLBACK,
  );
  return createElement(
    "div",
    { style: rowStyle },
    createElement(
      "label",
      { style: checkStyle },
      createElement("input", {
        type: "checkbox",
        checked: value.enabled,
        disabled: scope === undefined,
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          scope?.set("enabled", event.currentTarget.checked).catch((reason: unknown) => {
            console.warn(LOG_PREFIX, "save failed", reason);
          });
        },
      }),
      "启用联网搜索",
    ),
    createElement("p", { style: noteStyle }, "关闭后，智能体不再能调用联网搜索。"),
  );
}

function mount(ctx: ClientContext): void {
  const scope = scopeOf(ctx);
  ctx.slots.inject("settings.general.item", function () {
    return ctx.slots.register(
      { name: "settings.general.item", id: WEB_SEARCH_NAMESPACE, order: 50, label: "联网搜索" },
      function () {
        return createElement(WebSearchRow, { scope });
      },
    );
  });
}

export function apply(ctx: ClientContext): void {
  try {
    mount(ctx);
  } catch (error) {
    console.warn(LOG_PREFIX, "client mount failed", error);
  }
}
