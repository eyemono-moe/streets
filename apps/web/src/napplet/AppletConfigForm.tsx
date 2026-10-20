import {
  type ConfigSchema,
  configFields,
  configValueValid,
} from "@streets/core/napplet/config";
import {
  type Component,
  For,
  type JSX,
  Match,
  Show,
  Switch,
  createSignal,
} from "solid-js";
import SettingField from "../deck/SettingField";
import SegmentedControl from "../ui/SegmentedControl";
import SelectMenu from "../ui/SelectMenu";
import UiSwitch from "../ui/Switch";
import TextField from "../ui/TextField";

type Schema = Record<string, unknown>;

const text = (schema: Schema, key: string) =>
  typeof schema[key] === "string" ? (schema[key] as string) : undefined;

const titleOf = (schema: Schema, key: string) => text(schema, "title") ?? key;

/** 入れられる値の説明。誤りのときに、なぜ入らないかを添える。 */
const rule = (schema: Schema): string => {
  const parts: string[] = [];
  const num = (key: string) =>
    typeof schema[key] === "number" ? (schema[key] as number) : undefined;
  if (schema.type === "integer") parts.push("整数");
  if (schema.type === "number") parts.push("数");
  if (num("minimum") !== undefined) parts.push(`${num("minimum")} 以上`);
  if (num("maximum") !== undefined) parts.push(`${num("maximum")} 以下`);
  if (num("minLength") !== undefined)
    parts.push(`${num("minLength")} 文字以上`);
  if (num("maxLength") !== undefined)
    parts.push(`${num("maxLength")} 文字以下`);
  if (num("minItems") !== undefined) parts.push(`${num("minItems")} 個以上`);
  if (num("maxItems") !== undefined) parts.push(`${num("maxItems")} 個以下`);
  return parts.length > 0
    ? `${parts.join("・")}で入れてください`
    : "入れられない値です";
};

const Notes: Component<{ schema: Schema }> = (props) => (
  <>
    {/* > Render `markdownDescription` as markdown ... Falling back to plain text. Never render as HTML. */}
    <Show
      when={
        text(props.schema, "markdownDescription") ??
        text(props.schema, "description")
      }
    >
      {(description) => (
        <p class="c-secondary whitespace-pre-wrap break-anywhere text-caption">
          {description()}
        </p>
      )}
    </Show>
    <Show when={text(props.schema, "deprecationMessage")}>
      {(message) => <p class="c-status-warn text-caption">{message()}</p>}
    </Show>
  </>
);

/** 文字・数・並びを打つ欄。打っている間は手元に持ち、離れたときに確かめて渡す。 */
const TypedField: Component<{
  label: string;
  schema: Schema;
  value: unknown;
  onCommit: (value: unknown) => void;
}> = (props) => {
  // 打つ欄に入るのは文字・数と、その並びだけ（スキーマで確かめてある）。
  const shown = (value: unknown) =>
    Array.isArray(value)
      ? value.join("\n")
      : typeof value === "string" || typeof value === "number"
        ? String(value)
        : "";
  const [draft, setDraft] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  const parse = (raw: string): unknown => {
    const item = (part: string, type: unknown) =>
      type === "number" || type === "integer" ? Number(part) : part;
    if (props.schema.type === "array") {
      const items = props.schema.items as Schema;
      return raw
        .split("\n")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => item(part, items.type));
    }
    return item(raw, props.schema.type);
  };
  const commit = () => {
    const raw = draft();
    if (raw === undefined) return;
    if (raw === "") {
      setError(undefined);
      setDraft(undefined);
      props.onCommit(undefined);
      return;
    }
    const value = parse(raw);
    if (!configValueValid(props.schema, value)) {
      setError(rule(props.schema));
      return;
    }
    setError(undefined);
    setDraft(undefined);
    props.onCommit(value);
  };
  const format = text(props.schema, "format");
  return (
    <TextField
      label={props.label}
      labelHidden
      value={draft() ?? shown(props.value)}
      // 入れていない間は既定の値が効いているので、それを薄く見せる。
      placeholder={shown(props.schema.default)}
      onInput={setDraft}
      onBlur={commit}
      multiline={props.schema.type === "array"}
      type={
        props.schema["x-napplet-secret"] === true
          ? "password"
          : props.schema.type === "number" || props.schema.type === "integer"
            ? "number"
            : format === "uri"
              ? "url"
              : format === "email"
                ? "email"
                : "text"
      }
      {...(props.schema.type === "array"
        ? { hint: "1 行に 1 つずつ入れます" }
        : {})}
      {...(error() ? { error: error() } : {})}
    />
  );
};

const Field: Component<{
  name: string;
  schema: Schema;
  value: unknown;
  stored: boolean;
  onCommit: (value: unknown) => void;
}> = (props) => {
  const label = () => titleOf(props.schema, props.name);
  const fallback = () => props.value ?? props.schema.default;
  const options = () =>
    Array.isArray(props.schema.enum)
      ? props.schema.enum.map((value, index) => {
          const descriptions = props.schema.enumDescriptions;
          const description = Array.isArray(descriptions)
            ? descriptions[index]
            : undefined;
          return {
            value: String(value),
            label:
              typeof description === "string"
                ? `${String(value)}（${description}）`
                : String(value),
            raw: value as unknown,
          };
        })
      : undefined;
  const pick = (value: string) =>
    props.onCommit(options()?.find((option) => option.value === value)?.raw);
  const body = (): JSX.Element => (
    <Switch
      fallback={
        <TypedField
          label={label()}
          schema={props.schema}
          value={props.value}
          onCommit={props.onCommit}
        />
      }
    >
      <Match when={props.schema.type === "boolean"}>
        <UiSwitch
          label={label()}
          checked={fallback() === true}
          onChange={(on) => props.onCommit(on)}
        />
      </Match>
      <Match when={options()}>
        {(choices) => (
          <Show
            when={choices().length <= 3}
            fallback={
              <SelectMenu
                label={label()}
                value={
                  fallback() === undefined ? undefined : String(fallback())
                }
                options={choices()}
                placeholder="選んでいない"
                onChange={pick}
              />
            }
          >
            <SegmentedControl
              label={label()}
              options={choices()}
              value={fallback() === undefined ? undefined : String(fallback())}
              onChange={pick}
            />
          </Show>
        )}
      </Match>
      <Match when={props.schema.type === "object" && props.schema}>
        {(schema) => (
          <div class="flex flex-col gap-3 border-primary border-l-2 pl-3">
            <For each={configFields(schema() as ConfigSchema)}>
              {(field) => {
                const nested = () =>
                  typeof props.value === "object" && props.value !== null
                    ? (props.value as Record<string, unknown>)
                    : {};
                return (
                  <Field
                    name={field.key}
                    schema={field.schema}
                    value={nested()[field.key]}
                    stored={field.key in nested()}
                    onCommit={(value) => {
                      const { [field.key]: _, ...rest } = nested();
                      const next =
                        value === undefined
                          ? rest
                          : { ...rest, [field.key]: value };
                      props.onCommit(
                        Object.keys(next).length > 0 ? next : undefined,
                      );
                    }}
                  />
                );
              }}
            </For>
          </div>
        )}
      </Match>
    </Switch>
  );
  return (
    <SettingField
      label={props.schema.type === "boolean" ? "" : label()}
      changed={props.stored}
      onReset={() => props.onCommit(undefined)}
    >
      {body()}
      <Notes schema={props.schema} />
    </SettingField>
  );
};

/**
 * アップレットが NAP-CONFIG で宣言した設定を、Streets の部品で描く。値を書くのは
 * ここだけ。入れた値は確かめてから渡し、合わない値は誤りとして出して残さない。
 */
const AppletConfigForm: Component<{
  schema: ConfigSchema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}> = (props) => {
  const sections = () => {
    const groups: {
      section?: string;
      fields: ReturnType<typeof configFields>;
    }[] = [];
    for (const field of configFields(props.schema)) {
      const last = groups.at(-1);
      if (last && last.section === field.section) last.fields.push(field);
      else
        groups.push({
          ...(field.section ? { section: field.section } : {}),
          fields: [field],
        });
    }
    return groups;
  };
  return (
    <div class="flex flex-col gap-4">
      <For each={sections()}>
        {(group) => (
          <section class="flex flex-col gap-3">
            <Show when={group.section}>
              {(section) => (
                <h4 class="c-primary font-600 text-body">{section()}</h4>
              )}
            </Show>
            <For each={group.fields}>
              {(field) => (
                <Field
                  name={field.key}
                  schema={field.schema}
                  value={props.values[field.key]}
                  stored={field.key in props.values}
                  onCommit={(value) => props.onChange(field.key, value)}
                />
              )}
            </For>
          </section>
        )}
      </For>
    </div>
  );
};

export default AppletConfigForm;
