import z from "@deepseek-ai/schemastery";

/** 0.1.7 only projects `.volatile()` fields into editable forms. Older schemastery has no such method. */
function maybeVolatile<T>(schema: T): T {
  const candidate = schema as T & { volatile?: () => T };
  return typeof candidate.volatile === "function" ? candidate.volatile() : schema;
}

/**
 * Host Config schema. The profile entry id (`dsh-web-search`) is the settings
 * namespace; the client reads it through `ctx.configForms.get("dsh-web-search")`.
 * `engineOrder` lists engine ids in the order to try; an empty list means automatic.
 * Unknown ids are dropped by `normalizeEngineOrder`, so the schema stays permissive.
 */
export const Config = z.object({
  enabled: maybeVolatile(z.boolean().default(true)),
  engineOrder: maybeVolatile(z.array(z.string()).default([])),
});
