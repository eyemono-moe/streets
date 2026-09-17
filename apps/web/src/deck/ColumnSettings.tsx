import { SegmentGroup } from "@ark-ui/solid/segment-group";
import { Switch } from "@ark-ui/solid/switch";
import type { ColumnFacet } from "@streets/core/deck/column-facets";
import type {
  ColumnDef,
  ColumnDensity,
  ColumnShow,
  ColumnWidth,
} from "@streets/core/deck/deck";
import { columnShow } from "@streets/core/deck/deck";
import { type Component, For, Show } from "solid-js";
import { useDispatch } from "../ui-events";

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

const TOGGLE_LABELS: Record<keyof ColumnShow, string> = {
  replies: "リプライ",
  quotes: "引用",
  mentions: "メンション",
  reposts: "リポスト",
  reactions: "リアクション",
};

/** 1 行のスイッチ。色は data-state で切り替える —— bg-tertiary を静的に置くと、
 *  ダークモードの `.dark .bg-tertiary` が checked の色を打ち消す。 */
const Toggle: Component<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = (props) => (
  <Switch.Root
    class="flex h-8 w-full cursor-pointer items-center gap-2 text-body"
    checked={props.checked}
    onCheckedChange={(details) => props.onChange(details.checked)}
  >
    <Switch.Label class="min-w-0 flex-1 truncate">{props.label}</Switch.Label>
    <Switch.Control class="flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors data-[state=checked]:bg-accent-primary data-[state=unchecked]:bg-tertiary">
      <Switch.Thumb class="size-4 rounded-full bg-primary transition-transform data-[state=checked]:translate-x-4" />
    </Switch.Control>
    <Switch.HiddenInput />
  </Switch.Root>
);

const Field: Component<{ label: string; children: unknown }> = (props) => (
  <div class="flex w-full flex-col gap-1.5">
    <span class="c-secondary font-600 text-caption">{props.label}</span>
    {props.children as never}
  </div>
);

/** 排他の選択。ラジオグループなので、矢印キーでも選べる。 */
const Segmented = <T extends string>(props: {
  label: string;
  options: { value: T; label: string }[];
  current: T;
  onSelect: (value: T) => void;
}) => (
  <SegmentGroup.Root
    // 既定は縦。横に並べるので、矢印キーの向きも合わせる。
    orientation="horizontal"
    class="flex w-full gap-0.5 rounded-2 border border-primary bg-primary p-0.5"
    value={props.current}
    onValueChange={(details) => {
      if (details.value) props.onSelect(details.value as T);
    }}
  >
    <SegmentGroup.Label class="sr-only">{props.label}</SegmentGroup.Label>
    <For each={props.options}>
      {(option) => (
        <SegmentGroup.Item
          value={option.value}
          class="data-[state=checked]:c-white flex h-7.5 flex-1 cursor-pointer items-center justify-center rounded-1.5 text-caption data-[state=checked]:bg-accent-primary"
        >
          <SegmentGroup.ItemText>{option.label}</SegmentGroup.ItemText>
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      )}
    </For>
  </SegmentGroup.Root>
);

/** ヘッダーの直下に開く設定。変更はその場で保存する（保存ボタンは無い）。 */
const ColumnSettings: Component<{
  column: ColumnDef;
  /** そのカラムで意味のある項目だけ。切っても何も起きない項目は出さない。 */
  facets: readonly ColumnFacet[];
}> = (props) => {
  const dispatch = useDispatch();
  const show = () => columnShow(props.column);
  const patch = (patch: ColumnPatch) =>
    dispatch({ type: "deck/patch-column", id: props.column.id, patch });

  return (
    <div class="flex shrink-0 flex-col gap-4.5 bg-secondary p-4">
      <Field label="カラム名">
        <input
          class="c-primary h-9 w-full rounded-2 border border-primary bg-primary px-2.5 text-body outline-none"
          value={props.column.title}
          aria-label="カラム名"
          // 空のままにするとカラムが保存できないので、変更は入力のたびに送り、空は上流で弾く。
          onInput={(event) => patch({ title: event.currentTarget.value })}
        />
      </Field>

      <Field label="幅">
        <Segmented
          label="幅"
          options={WIDTHS}
          current={props.column.width ?? "m"}
          onSelect={(width) => patch({ width })}
        />
      </Field>

      <Field label="表示密度">
        <Segmented
          label="表示密度"
          options={DENSITIES}
          current={props.column.density ?? "comfortable"}
          onSelect={(density) => patch({ density })}
        />
      </Field>

      <Toggle
        label="画像・動画を展開"
        checked={props.column.expandMedia !== false}
        onChange={(expandMedia) => patch({ expandMedia })}
      />

      <Show when={props.facets.length > 0}>
        <Field label="表示するもの">
          <For each={props.facets}>
            {(facet) => (
              <Toggle
                label={TOGGLE_LABELS[facet]}
                checked={show()[facet]}
                onChange={(checked) =>
                  patch({
                    show: { ...props.column.show, [facet]: checked },
                  })
                }
              />
            )}
          </For>
        </Field>
      </Show>

      <button
        type="button"
        class="c-danger flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-2 border border-primary bg-primary font-600 text-caption"
        onClick={() =>
          dispatch({ type: "deck/remove-column", id: props.column.id })
        }
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
