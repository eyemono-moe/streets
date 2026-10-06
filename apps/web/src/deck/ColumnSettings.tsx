import {
  type ColumnFacet,
  columnMutedDisplay,
  defaultMutedDisplay,
  mutedDisplayChoices,
} from "@streets/core/deck/column-kinds";
import type {
  ColumnDef,
  ColumnDensity,
  ColumnShow,
  ColumnWidth,
  MutedDisplay,
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
import { COLUMN_WIDTH_PX } from "./column-width";
import Field from "./SettingField";

export type ColumnPatch = Partial<Omit<ColumnDef, "id">>;

const WIDTH_NAMES: { value: ColumnWidth; name: string }[] = [
  { value: "s", name: "S" },
  { value: "m", name: "M" },
  { value: "l", name: "L" },
];

// 広げているときの px は、いちばん狭いときの幅なので「〜」を付ける。
const widthsOf = (stretch: boolean): { value: ColumnWidth; label: string }[] =>
  WIDTH_NAMES.map(({ value, name }) => ({
    value,
    label: `${name} ${COLUMN_WIDTH_PX[value]}${stretch ? "〜" : ""}`,
  }));

const LINK_CARDS: { value: LinkCardMode; label: string }[] = [
  { value: "off", label: "出さない" },
  { value: "compact", label: "小さく" },
  { value: "large", label: "大きく" },
];

const DENSITIES: { value: ColumnDensity; label: string }[] = [
  { value: "comfortable", label: "ゆったり" },
  { value: "compact", label: "高密度" },
];

const MUTED_LABELS: Record<MutedDisplay, string> = {
  hide: "隠す",
  fold: "畳む",
  show: "そのまま",
};

const TOGGLE_LABELS: Record<keyof ColumnShow, string> = {
  replies: "リプライ",
  quotes: "引用",
  mentions: "メンション",
  reposts: "リポスト",
  reactions: "リアクション",
  zaps: "Zap",
  chats: "チャンネルでの発言",
};

/** ヘッダーの直下に開く設定。変更はその場で保存する（保存ボタンは無い）。 */
const ColumnSettings: Component<{
  column: ColumnDef;
  signedIn: boolean;
  /** そのカラムで意味のある項目だけ。切っても何も起きない項目は出さない。 */
  facets: readonly ColumnFacet[];
  relayList?: RelayListState;
  /** カラムを画面の幅いっぱいに広げているか（この端末の設定）。 */
  stretch?: boolean;
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
          options={widthsOf(props.stretch === true)}
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

      <Show when={columnMutedDisplay(props.column)}>
        {(muted) => (
          <Field
            label="ミュートしている投稿"
            changed={muted() !== defaultMutedDisplay(props.column)}
            onReset={() => patch({ muted: undefined })}
          >
            <SegmentedControl
              label="ミュートしている投稿"
              options={mutedDisplayChoices(props.column).map((value) => ({
                value,
                label: MUTED_LABELS[value],
              }))}
              value={muted()}
              onChange={(value) => patch({ muted: value })}
              block
            />
          </Field>
        )}
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

      <Show when={columnView(props.column.source).Settings}>
        {(settings) => (
          <Dynamic
            component={settings()}
            column={props.column}
            source={props.column.source}
            signedIn={props.signedIn}
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

      <Show when={columnView(props.column.source).SettingsFooter}>
        {(footer) => (
          <Dynamic component={footer()} source={props.column.source} />
        )}
      </Show>
    </div>
  );
};

export default ColumnSettings;
