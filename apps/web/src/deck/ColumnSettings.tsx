import type {
  ColumnDef,
  ColumnDensity,
  ColumnShow,
  ColumnWidth,
} from "@streets/core/deck/deck";
import { columnShow } from "@streets/core/deck/deck";
import { type Component, For, Show } from "solid-js";
import { PALETTES, type PaletteName } from "../theme";

export type ColumnPatch = Partial<Omit<ColumnDef, "id" | "source">>;

const WIDTHS: { value: ColumnWidth; label: string }[] = [
  { value: "s", label: "S 320" },
  { value: "m", label: "M 380" },
  { value: "l", label: "L 440" },
];

const DENSITIES: { value: ColumnDensity; label: string }[] = [
  { value: "comfortable", label: "ゆったり" },
  { value: "compact", label: "高密度" },
];

const TOGGLES: { key: keyof ColumnShow; label: string }[] = [
  { key: "replies", label: "返信" },
  { key: "reposts", label: "リポスト" },
  { key: "reactions", label: "リアクション" },
  { key: "media", label: "画像・動画を展開" },
];

const Field: Component<{ label: string; children: unknown }> = (props) => (
  <div class="flex w-full flex-col gap-1.5">
    <span class="c-secondary font-600 text-caption">{props.label}</span>
    {props.children as never}
  </div>
);

const Segmented = <T extends string>(props: {
  options: { value: T; label: string }[];
  current: T;
  onSelect: (value: T) => void;
}) => (
  <div class="flex w-full gap-0.5 rounded-2 border border-primary bg-primary p-0.5">
    <For each={props.options}>
      {(option) => (
        <button
          type="button"
          aria-pressed={props.current === option.value}
          // bg-transparent を静的に置くと、選択時の背景色を打ち消す。
          class="h-7.5 flex-1 cursor-pointer rounded-1.5 text-caption"
          classList={{
            "bg-accent-primary c-white": props.current === option.value,
            "c-primary bg-transparent": props.current !== option.value,
          }}
          onClick={() => props.onSelect(option.value)}
        >
          {option.label}
        </button>
      )}
    </For>
  </div>
);

/** ヘッダーの直下に開く設定。変更はその場で保存する（保存ボタンは無い）。 */
const ColumnSettings: Component<{
  column: ColumnDef;
  onPatch: (patch: ColumnPatch) => void;
  onRemove: () => void;
}> = (props) => {
  const show = () => columnShow(props.column);

  return (
    <div class="flex shrink-0 flex-col gap-4.5 bg-secondary p-4">
      <Field label="カラム名">
        <input
          class="c-primary h-9 w-full rounded-2 border border-primary bg-primary px-2.5 text-body outline-none"
          value={props.column.title}
          aria-label="カラム名"
          // 空のままにするとカラムが保存できないので、変更は入力のたびに送り、空は上流で弾く。
          onInput={(event) =>
            props.onPatch({ title: event.currentTarget.value })
          }
        />
      </Field>

      <Field label="幅">
        <Segmented
          options={WIDTHS}
          current={props.column.width ?? "m"}
          onSelect={(width) => props.onPatch({ width })}
        />
      </Field>

      <Field label="表示密度">
        <Segmented
          options={DENSITIES}
          current={props.column.density ?? "comfortable"}
          onSelect={(density) => props.onPatch({ density })}
        />
      </Field>

      <Field label="表示するもの">
        <For each={TOGGLES}>
          {(toggle) => (
            <label class="flex h-8 w-full cursor-pointer items-center gap-2 text-body">
              <span class="min-w-0 flex-1 truncate">{toggle.label}</span>
              <input
                type="checkbox"
                class="h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-tertiary transition-colors before:ml-0.5 before:block before:size-4 before:translate-y-0.5 before:rounded-full before:bg-primary before:transition-transform checked:bg-accent-primary checked:before:translate-x-4"
                checked={show()[toggle.key]}
                onChange={(event) =>
                  props.onPatch({
                    show: {
                      ...props.column.show,
                      [toggle.key]: event.currentTarget.checked,
                    },
                  })
                }
              />
            </label>
          )}
        </For>
      </Field>

      <Field label="アクセント">
        <div class="flex gap-2">
          <For each={Object.keys(PALETTES) as PaletteName[]}>
            {(name) => (
              <button
                type="button"
                aria-label={name}
                aria-pressed={props.column.accent === name}
                class="grid size-7 cursor-pointer place-items-center rounded-full"
                style={{ "background-color": PALETTES[name].accent }}
                onClick={() => props.onPatch({ accent: name })}
              >
                <Show when={props.column.accent === name}>
                  <span
                    class="i-material-symbols:check-rounded c-white size-4"
                    aria-hidden="true"
                  />
                </Show>
              </button>
            )}
          </For>
          <button
            type="button"
            aria-label="アプリ全体の色に合わせる"
            aria-pressed={props.column.accent === undefined}
            class="grid size-7 cursor-pointer place-items-center rounded-full bg-tertiary"
            onClick={() => props.onPatch({ accent: undefined })}
          >
            <Show when={props.column.accent === undefined}>
              <span
                class="i-material-symbols:check-rounded c-secondary size-4"
                aria-hidden="true"
              />
            </Show>
          </button>
        </div>
      </Field>

      <button
        type="button"
        class="c-danger flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-2 border border-primary bg-primary font-600 text-caption"
        onClick={() => props.onRemove()}
      >
        <span
          class="i-material-symbols:delete-outline-rounded size-4.5"
          aria-hidden="true"
        />
        このカラムを削除
      </button>
    </div>
  );
};

export default ColumnSettings;
