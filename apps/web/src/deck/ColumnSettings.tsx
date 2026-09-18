import type { ColumnFacet } from "@streets/core/deck/column-facets";
import type {
  ColumnDef,
  ColumnDensity,
  ColumnShow,
  ColumnWidth,
} from "@streets/core/deck/deck";
import { columnShow, groupsNotifications } from "@streets/core/deck/deck";
import { type Component, For, Show } from "solid-js";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import SegmentedControl from "../ui/SegmentedControl";
import Switch from "../ui/Switch";

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

const Field: Component<{ label: string; children: unknown }> = (props) => (
  <div class="flex w-full flex-col gap-1.5">
    <span class="c-secondary font-600 text-caption">{props.label}</span>
    {props.children as never}
  </div>
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
        <SegmentedControl
          label="幅"
          options={WIDTHS}
          value={props.column.width ?? "m"}
          onChange={(width) => patch({ width })}
          block
        />
      </Field>

      <Field label="表示密度">
        <SegmentedControl
          label="表示密度"
          options={DENSITIES}
          value={props.column.density ?? "comfortable"}
          onChange={(density) => patch({ density })}
          block
        />
      </Field>

      <Switch
        label="画像・動画を展開"
        checked={props.column.expandMedia !== false}
        onChange={(expandMedia) => patch({ expandMedia })}
      />

      {/* 通知カラムだけの設定。ほかのカラムに出しても、切り替えて何も起きない。 */}
      <Show when={props.column.source.kind === "notifications"}>
        <Switch
          label="同じノートへのリアクション・リポストをまとめる"
          checked={groupsNotifications(props.column)}
          onChange={(groupNotifications) => patch({ groupNotifications })}
        />
      </Show>

      <Show when={props.facets.length > 0}>
        <Field label="表示するもの">
          <For each={props.facets}>
            {(facet) => (
              <Switch
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

      <Button
        variant="danger"
        shape="rounded"
        block
        icon="i-material-symbols:delete-outline-rounded"
        onClick={() =>
          dispatch({ type: "deck/remove-column", id: props.column.id })
        }
      >
        このカラムを削除
      </Button>
    </div>
  );
};

export default ColumnSettings;
