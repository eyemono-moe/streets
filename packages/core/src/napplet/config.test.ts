import { describe, expect, it } from "vite-plus/test";
import {
  checkConfigSchema,
  configFields,
  configValueValid,
  resolveConfigValues,
} from "./config";

// NAP-CONFIG の「Register schema (success)」の例。
const theme = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    theme: { type: "string", enum: ["light", "dark"], default: "dark" },
  },
};

describe("checkConfigSchema", () => {
  it("仕様の例のスキーマを受け付ける", () => {
    expect(checkConfigSchema(theme)).toEqual({ ok: true, schema: theme });
  });

  // NAP-CONFIG の「Register schema (rejection)」の例。
  it("pattern を使うスキーマは断る", () => {
    expect(
      checkConfigSchema({
        type: "object",
        properties: { username: { type: "string", pattern: "^[a-z]+$" } },
      }),
    ).toEqual({
      ok: false,
      code: "pattern-not-allowed",
      error:
        "JSON Schema `pattern` keyword is not permitted in the Core Subset",
    });
  });

  // > Shells MUST reject any schema containing `$ref` at `config.registerSchema` time.
  // > Shells MUST reject any schema that declares both on the same property with
  // > `code: "secret-with-default"`.
  // > Shells MUST reject schemas nesting `object` properties more than 4 levels deep
  it("$ref・秘密の既定値・深すぎる入れ子・組み合わせを断る", () => {
    const wrap = (property: object) => ({
      type: "object",
      properties: { a: property },
    });
    expect(checkConfigSchema(wrap({ $ref: "#/definitions/a" }))).toMatchObject({
      code: "ref-not-allowed",
    });
    expect(
      checkConfigSchema(
        wrap({ type: "string", "x-napplet-secret": true, default: "x" }),
      ),
    ).toMatchObject({ code: "secret-with-default" });
    const deep = (depth: number): object =>
      depth === 0
        ? { type: "string" }
        : { type: "object", properties: { a: deep(depth - 1) } };
    expect(checkConfigSchema(deep(4)).ok).toBe(true);
    expect(checkConfigSchema(deep(5))).toMatchObject({
      code: "schema-too-deep",
    });
    expect(
      checkConfigSchema(wrap({ oneOf: [{ type: "string" }] })),
    ).toMatchObject({ code: "invalid-schema" });
    expect(
      checkConfigSchema(
        wrap({
          type: "array",
          items: [{ type: "string" }, { type: "number" }],
        }),
      ),
    ).toMatchObject({ code: "invalid-schema" });
  });

  // > the shell emits ... `code: "invalid-schema", "error": "schema root must be of type `object`"`
  it("根が object でないスキーマは断る", () => {
    expect(checkConfigSchema({ type: "string" })).toEqual({
      ok: false,
      code: "invalid-schema",
      error: "schema root must be of type `object`",
    });
  });
});

describe("configValueValid", () => {
  it("型・列挙・範囲・長さを確かめ、format では断らない", () => {
    expect(
      configValueValid({ type: "integer", minimum: 1, maximum: 5 }, 3),
    ).toBe(true);
    expect(configValueValid({ type: "integer", minimum: 1 }, 1.5)).toBe(false);
    expect(configValueValid({ type: "string", maxLength: 2 }, "abc")).toBe(
      false,
    );
    expect(configValueValid({ type: "string", enum: ["a"] }, "b")).toBe(false);
    expect(
      configValueValid({ type: "string", format: "email" }, "not-mail"),
    ).toBe(true);
    expect(
      configValueValid(
        { type: "array", items: { type: "string" }, maxItems: 1 },
        ["a", "b"],
      ),
    ).toBe(false);
  });
});

describe("resolveConfigValues", () => {
  // > 1. If a persisted value exists AND validates against the current schema, use it.
  // > 2. Else if the property has its own `default`, use that.
  it("確かめた保存値、なければ既定値を使い、スキーマに無い値は渡さない", () => {
    expect(resolveConfigValues(theme, { theme: "light", stale: 1 })).toEqual({
      theme: "light",
    });
    expect(resolveConfigValues(theme, { theme: "sepia" })).toEqual({
      theme: "dark",
    });
  });

  // > 3. Else if an ancestor `default` object supplies a value for this property
  it("入れ子の欄は、親の既定値から引く", () => {
    const schema = {
      type: "object",
      properties: {
        feed: {
          type: "object",
          default: { limit: 20 },
          properties: { limit: { type: "integer" } },
        },
      },
    };
    expect(resolveConfigValues(schema, {})).toEqual({ feed: { limit: 20 } });
  });

  // > do NOT deliver the property in `config.values` if the value has never been explicitly
  // > set by the user.
  it("秘密の欄は、ユーザーが入れたときだけ渡す", () => {
    const schema = {
      type: "object",
      properties: { token: { type: "string", "x-napplet-secret": true } },
    };
    expect(resolveConfigValues(schema, {})).toEqual({});
    expect(resolveConfigValues(schema, { token: "s" })).toEqual({ token: "s" });
  });
});

describe("configFields", () => {
  // > Sort within a section by `x-napplet-order` | Ascending; ties broken by property-key
  // > alphabetical order. Properties without `x-napplet-order` come after
  it("節ごとにまとめ、その中は順番の指定、無ければ名前の順に並べる", () => {
    const fields = configFields({
      type: "object",
      properties: {
        c: { type: "string", "x-napplet-section": "main" },
        b: {
          type: "string",
          "x-napplet-section": "main",
          "x-napplet-order": 1,
        },
        z: { type: "string", "x-napplet-section": "extra" },
        a: { type: "string", "x-napplet-section": "main" },
      },
    });
    expect(fields.map((field) => field.key)).toEqual(["b", "a", "c", "z"]);
  });
});
