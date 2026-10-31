import {
  type ColumnFacet,
  columnMutedDisplay,
  defaultMutedDisplay,
  mutedDisplayChoices,
} from "@streets/core/deck/column-kinds";
import type {
  ColumnDef,
  ColumnDensity,
  ColumnWidth,
} from "@streets/core/deck/deck";
import {
  COLUMN_WIDTH_MAX,
  COLUMN_WIDTH_MIN,
  COLUMN_WIDTH_PX,
  type LinkCardMode,
  columnLinkCards,
  columnShow,
  columnWidthPatch,
  columnWidthPreset,
  columnWidthPx,
} from "@streets/core/deck/deck";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import { type Component, For, Show, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import { columnView } from "../columns/column-views";
import { t } from "../i18n/locale";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import SegmentedControl from "../ui/SegmentedControl";
import Slider from "../ui/Slider";
import Switch from "../ui/Switch";
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

const linkCardChoices = (): { value: LinkCardMode; label: string }[] => [
  { value: "off", label: t("deck.columnSettings.linkCards.off") },
  { value: "compact", label: t("deck.columnSettings.linkCards.compact") },
  { value: "large", label: t("deck.columnSettings.linkCards.large") },
];

const densityChoices = (): { value: ColumnDensity; label: string }[] => [
  { value: "comfortable", label: t("deck.columnSettings.density.comfortable") },
  { value: "compact", label: t("deck.columnSettings.density.compact") },
];

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
  // 動かしている間はカラムの幅を変えない。この欄はカラムの右に開くので、幅に合わせて
  // 欄ごと左右へ動き、つまみがポインタから逃げる。幅は離したときに当てる。
  const [movingWidth, setMovingWidth] = createSignal<number>();

  return (
    <div class="flex shrink-0 flex-col gap-4.5 bg-secondary p-4">
      <Field label={t("deck.columnSettings.width")}>
        <SegmentedControl
          label={t("deck.columnSettings.width")}
          options={widthsOf(props.stretch === true)}
          value={
            movingWidth() === undefined
              ? columnWidthPreset(props.column)
              : columnWidthPreset({ widthPx: movingWidth() })
          }
          onChange={(width) => patch({ width, widthPx: undefined })}
          block
        />
        <Slider
          label={t("deck.columnSettings.widthPx")}
          labelHidden
          value={movingWidth() ?? columnWidthPx(props.column)}
          min={COLUMN_WIDTH_MIN}
          max={COLUMN_WIDTH_MAX}
          step={10}
          format={(px) => `${px}px${props.stretch === true ? "〜" : ""}`}
          onChange={setMovingWidth}
          onChangeEnd={(px) => {
            // 保存した幅を当ててから手元の値を外す。逆だと、離した瞬間だけつまみが前の幅に戻る。
            patch(columnWidthPatch(px));
            setMovingWidth(undefined);
          }}
        />
      </Field>

      <Field label={t("deck.columnSettings.density.label")}>
        <SegmentedControl
          label={t("deck.columnSettings.density.label")}
          options={densityChoices()}
          value={props.column.density ?? "comfortable"}
          onChange={(density) => patch({ density })}
          block
        />
      </Field>

      <Switch
        label={t("deck.columnSettings.expandMedia")}
        checked={props.column.expandMedia !== false}
        onChange={(expandMedia) => patch({ expandMedia })}
      />

      <Field label={t("deck.columnSettings.linkCards.label")}>
        <SegmentedControl
          label={t("deck.columnSettings.linkCards.label")}
          options={linkCardChoices()}
          value={columnLinkCards(props.column)}
          onChange={(linkCards) => patch({ linkCards })}
          block
        />
      </Field>

      <Show when={columnMutedDisplay(props.column)}>
        {(muted) => (
          <Field
            label={t("deck.columnSettings.muted.label")}
            changed={muted() !== defaultMutedDisplay(props.column)}
            onReset={() => patch({ muted: undefined })}
          >
            <SegmentedControl
              label={t("deck.columnSettings.muted.label")}
              options={mutedDisplayChoices(props.column).map((value) => ({
                value,
                label: t(`deck.columnSettings.muted.${value}`),
              }))}
              value={muted()}
              onChange={(value) => patch({ muted: value })}
              block
            />
          </Field>
        )}
      </Show>

      <Show when={props.facets.length > 0}>
        <Field label={t("deck.columnSettings.show.label")}>
          <For each={props.facets}>
            {(facet) => (
              <Switch
                label={t(`deck.columnSettings.show.${facet}`)}
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
        {t("deck.columnSettings.delete")}
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
