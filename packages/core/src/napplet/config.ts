/*
 * NAP-CONFIG（napplet/naps PR #14）。アップレットが JSON Schema で設定の形を宣言し、
 * Streets がカラムの設定に描いて、確かめた値だけをアップレットに渡す。値を書くのは
 * Streets だけ。
 *
 * 受け付けるのは NAP-CONFIG の Core Subset だけ。`$ref`・`pattern`・組み合わせの
 * キーワードなどを使ったスキーマは登録のときに断る。
 */

export type ConfigSchema = Record<string, unknown>;
export type ConfigValues = Record<string, unknown>;

export type ConfigSchemaErrorCode =
  | "invalid-schema"
  | "unsupported-draft"
  | "ref-not-allowed"
  | "pattern-not-allowed"
  | "secret-with-default"
  | "schema-too-deep";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// > Shells MUST reject schemas nesting `object` properties more than 4 levels deep
const MAX_DEPTH = 4;

const DRAFTS = [
  "http://json-schema.org/draft-07/schema",
  "https://json-schema.org/draft/2019-09/schema",
  "https://json-schema.org/draft/2020-12/schema",
];

const COMBINATORS = [
  "oneOf",
  "anyOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "patternProperties",
  "propertyNames",
  "dependencies",
  "dependentSchemas",
  "unevaluatedProperties",
];

const TYPES = ["object", "string", "number", "integer", "boolean", "array"];

type Refusal = { ok: false; code: ConfigSchemaErrorCode; error: string };

const refuse = (code: ConfigSchemaErrorCode, error: string): Refusal => ({
  ok: false,
  code,
  error,
});

const checkNode = (node: unknown, depth: number): Refusal | undefined => {
  if (!isRecord(node))
    return refuse("invalid-schema", "schema must be an object");
  if ("$ref" in node || "definitions" in node || "$defs" in node) {
    return refuse(
      "ref-not-allowed",
      "`$ref`, `definitions` and `$defs` are not permitted",
    );
  }
  if ("pattern" in node) {
    return refuse(
      "pattern-not-allowed",
      "JSON Schema `pattern` keyword is not permitted in the Core Subset",
    );
  }
  const combinator = COMBINATORS.find((key) => key in node);
  if (combinator) {
    return refuse(
      "invalid-schema",
      `\`${combinator}\` is not in the Core Subset`,
    );
  }
  if (typeof node.type !== "string" || !TYPES.includes(node.type)) {
    return refuse("invalid-schema", "every property needs a supported `type`");
  }
  if (node["x-napplet-secret"] === true && "default" in node) {
    return refuse(
      "secret-with-default",
      "a secret property cannot declare a `default`",
    );
  }
  if (node.type === "object") {
    if (depth > MAX_DEPTH) {
      return refuse(
        "schema-too-deep",
        `objects may nest at most ${MAX_DEPTH} levels`,
      );
    }
    if (!isRecord(node.properties)) {
      return refuse("invalid-schema", "objects need `properties`");
    }
    for (const child of Object.values(node.properties)) {
      const refused = checkNode(child, depth + 1);
      if (refused) return refused;
    }
  }
  if (node.type === "array") {
    // > Tuple-typed arrays (`items: [schemaA, schemaB]`) are NOT in the Core Subset.
    if (!isRecord(node.items)) {
      return refuse(
        "invalid-schema",
        "arrays need a homogeneous `items` schema",
      );
    }
    const itemType = node.items.type;
    if (itemType === "object" || itemType === "array") {
      return refuse("invalid-schema", "arrays may only hold primitives");
    }
    const refused = checkNode(node.items, depth);
    if (refused) return refused;
  }
  return undefined;
};

/** 登録されたスキーマが Core Subset に収まるか確かめる。 */
export const checkConfigSchema = (
  schema: unknown,
): { ok: true; schema: ConfigSchema } | Refusal => {
  if (!isRecord(schema))
    return refuse("invalid-schema", "schema must be an object");
  const draft = schema.$schema;
  if (
    draft !== undefined &&
    (typeof draft !== "string" ||
      !DRAFTS.some((known) => draft.replace(/#$/, "") === known))
  ) {
    return refuse("unsupported-draft", "only draft-07 or later is supported");
  }
  // > The schema root MUST be `{ "type": "object", "properties": { ... } }`.
  if (schema.type !== "object" || !isRecord(schema.properties)) {
    return refuse("invalid-schema", "schema root must be of type `object`");
  }
  const refused = checkNode(schema, 1);
  return refused ?? { ok: true, schema };
};

/** 値がそのスキーマに合うか。`format` は見ない（> MUST NOT reject a value solely because it fails the `format`）。 */
export const configValueValid = (schema: unknown, value: unknown): boolean => {
  if (!isRecord(schema)) return false;
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((item) => item === value)
  ) {
    return false;
  }
  const number = (key: string) =>
    typeof schema[key] === "number" ? (schema[key] as number) : undefined;
  switch (schema.type) {
    case "string":
      return (
        typeof value === "string" &&
        value.length >= (number("minLength") ?? 0) &&
        value.length <= (number("maxLength") ?? Number.POSITIVE_INFINITY)
      );
    case "integer":
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (schema.type === "number" || Number.isInteger(value)) &&
        value >= (number("minimum") ?? Number.NEGATIVE_INFINITY) &&
        value <= (number("maximum") ?? Number.POSITIVE_INFINITY)
      );
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return (
        Array.isArray(value) &&
        value.length >= (number("minItems") ?? 0) &&
        value.length <= (number("maxItems") ?? Number.POSITIVE_INFINITY) &&
        value.every((item) => configValueValid(schema.items, item))
      );
    case "object": {
      if (!isRecord(value) || !isRecord(schema.properties)) return false;
      const properties = schema.properties;
      const required = Array.isArray(schema.required) ? schema.required : [];
      return (
        required.every((key) => typeof key !== "string" || key in value) &&
        Object.entries(value).every(
          ([key, item]) =>
            key in properties && configValueValid(properties[key], item),
        )
      );
    }
    default:
      return false;
  }
};

/**
 * アップレットに渡す値。
 *
 * > 1. If a persisted value exists AND validates against the current schema, use it.
 * > 2. Else if the property has its own `default`, use that.
 * > 3. Else if an ancestor `default` object supplies a value for this property, use the
 * >    ancestor's value for this property.
 * > 4. Else the property is `undefined` in the delivered `config.values`.
 *
 * スキーマに無い値は渡さない（`additionalProperties` は既定で false として扱う）。
 * 秘密の欄は、ユーザーが入れたときだけ渡す。
 */
export const resolveConfigValues = (
  schema: ConfigSchema,
  stored: unknown,
  ancestorDefault?: unknown,
): ConfigValues => {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const saved = isRecord(stored) ? stored : {};
  const inherited = isRecord(ancestorDefault) ? ancestorDefault : {};
  const values: ConfigValues = {};
  for (const [key, property] of Object.entries(properties)) {
    if (!isRecord(property)) continue;
    if (property.type === "object") {
      const nested = resolveConfigValues(
        property,
        saved[key],
        isRecord(property.default) ? property.default : inherited[key],
      );
      if (Object.keys(nested).length > 0) values[key] = nested;
      continue;
    }
    if (key in saved && configValueValid(property, saved[key])) {
      values[key] = saved[key];
    } else if (property["x-napplet-secret"] === true) {
      continue;
    } else if ("default" in property) {
      values[key] = property.default;
    } else if (key in inherited && configValueValid(property, inherited[key])) {
      values[key] = inherited[key];
    }
  }
  return values;
};

/** `x-napplet-section` に挙がっている名前。`openSettings` の行き先を確かめるのに使う。 */
export const configSections = (schema: ConfigSchema): string[] => {
  const sections = new Set<string>();
  const walk = (node: unknown) => {
    if (!isRecord(node)) return;
    if (typeof node["x-napplet-section"] === "string") {
      sections.add(node["x-napplet-section"]);
    }
    if (isRecord(node.properties)) Object.values(node.properties).forEach(walk);
  };
  walk(schema);
  return [...sections];
};

export type ConfigField = {
  key: string;
  schema: Record<string, unknown>;
  section?: string;
};

/**
 * 並べる順。`x-napplet-section` ごとにまとめ、その中は `x-napplet-order` の小さい順、
 * 同じなら鍵の名前の順（> Properties without `x-napplet-order` come after, alphabetically
 * sorted.）。
 */
export const configFields = (schema: ConfigSchema): ConfigField[] => {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const order = (field: ConfigField) => {
    const value = field.schema["x-napplet-order"];
    return typeof value === "number" && value >= 0
      ? value
      : Number.POSITIVE_INFINITY;
  };
  const fields = Object.entries(properties).flatMap(
    ([key, property]): ConfigField[] =>
      isRecord(property)
        ? [
            {
              key,
              schema: property,
              ...(typeof property["x-napplet-section"] === "string"
                ? { section: property["x-napplet-section"] }
                : {}),
            },
          ]
        : [],
  );
  const sections = [...new Set(fields.map((field) => field.section ?? ""))];
  return fields.sort(
    (a, b) =>
      sections.indexOf(a.section ?? "") - sections.indexOf(b.section ?? "") ||
      order(a) - order(b) ||
      a.key.localeCompare(b.key),
  );
};
