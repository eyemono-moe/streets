import type { ColumnFacet } from "@streets/core/deck/column-kinds";
import type {
  ColumnDef,
  ColumnDensity,
  ColumnShow,
  ColumnWidth,
} from "@streets/core/deck/deck";
import {
  type LinkCardMode,
  columnLinkCards,
  columnShow,
} from "@streets/core/deck/deck";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import { type Component, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { columnView } from "../columns/column-views";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import SegmentedControl from "../ui/SegmentedControl";
import Switch from "../ui/Switch";
import Field from "./SettingField";

export type ColumnPatch = Partial<Omit<ColumnDef, "id">>;

const WIDTHS: { value: ColumnWidth; label: string }[] = [
  { value: "s", label: "S 320" },
  { value: "m", label: "M 380" },
  { value: "l", label: "L 440" },
];

const LINK_CARDS: { value: LinkCardMode; label: string }[] = [
  { value: "off", label: "出さない" },
  { value: "compact", label: "小さく" },
  { value: "large", label: "大きく" },
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
  zaps: "Zap",
};

/** ヘッダーの直下に開く設定。変更はその場で保存する（保存ボタンは無い）。 */
const ColumnSettings: Component<{
  column: ColumnDef;
  /** そのカラムで意味のある項目だけ。切っても何も起きない項目は出さない。 */
  facets: readonly ColumnFacet[];
  relayList?: RelayListState;
}> = (props) => {
  const dispatch = useDispatch();
  const show = () => columnShow(props.column);
  const patch = (patch: ColumnPatch) =>
    dispatch({ type: "deck/patch-column", id: props.column.id, patch });

  return (
    <div class="flex shrink-0 flex-col gap-4.5 bg-secondary p-4">
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

      <Field label="リンクのカード">
        <SegmentedControl
          label="リンクのカード"
          options={LINK_CARDS}
          value={columnLinkCards(props.column)}
          onChange={(linkCards) => patch({ linkCards })}
          block
        />
      </Field>

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

      <Show when={columnView(props.column.source).Settings}>
        {(settings) => (
          <Dynamic
            component={settings()}
            column={props.column}
            source={props.column.source}
            relayList={props.relayList}
          />
        )}
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
