import { Collapsible } from "@ark-ui/solid/collapsible";
import { RadioGroup } from "@ark-ui/solid/radio-group";
import type { DeckAppearance } from "@streets/core/deck/deck";
import {
  ACTION_BAR_MAX,
  type ActionLayout,
} from "@streets/core/settings/action-layout";
import type { ColorScheme } from "@streets/core/settings/color-scheme";
import type { ContentWarningMode } from "@streets/core/settings/content-warning-setting";
import type { DeckLayout } from "@streets/core/settings/deck-layout-setting";
import { type Component, For } from "solid-js";
import { PALETTES, type PaletteName, paletteOf } from "../theme";
import { useDispatch } from "../ui-events";
import ColorField from "../ui/ColorField";
import SegmentedControl from "../ui/SegmentedControl";
import Switch from "../ui/Switch";
import ActionLayoutField from "./ActionLayoutField";
import DisplayPreview from "./DisplayPreview";
import SettingsSection from "./SettingsSection";

const CONTENT_WARNING_MODES: { value: ContentWarningMode; label: string }[] = [
  { value: "hide", label: "隠す" },
  { value: "show", label: "常に表示" },
  { value: "exclude", label: "一覧に出さない" },
];

const LAYOUTS: { value: DeckLayout; label: string }[] = [
  { value: "auto", label: "画面幅に合わせる" },
  { value: "single", label: "1 列" },
  { value: "multi", label: "複数列" },
];

const SCHEMES: { value: ColorScheme; label: string }[] = [
  { value: "system", label: "OS に合わせる" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
];

/** 表示の設定。今の値を受け取って描き、変えたらイベントを上へ渡す。 */
const DisplaySettings: Component<{
  scheme: ColorScheme;
  appearance: DeckAppearance;
  /** 保存の進み具合を出すか（この端末の設定）。 */
  writeProgress: boolean;
  /** 閲覧注意の投稿の扱い（この端末の設定）。 */
  contentWarning: ContentWarningMode;
  /** カラムの並べ方（この端末の設定）。 */
  deckLayout: DeckLayout;
  /** アクション欄に出す操作（この端末の設定）。 */
  actionLayout: ActionLayout;
}> = (props) => {
  const dispatch = useDispatch();
  const current = () => paletteOf(props.appearance);
  const preview = (patch: Partial<DeckAppearance>) =>
    dispatch({
      type: "deck/preview-appearance",
      appearance: { ...props.appearance, ...patch },
    });
  const commit = (patch: Partial<DeckAppearance>) =>
    dispatch({
      type: "deck/set-appearance",
      appearance: { ...props.appearance, ...patch },
    });

  return (
    <div class="flex flex-col gap-7">
      <SettingsSection
        title="カラムの並べ方"
        scope="device"
        description="カラムを横に並べるか、1 列ずつ切り替えて見せるかを選びます。「画面幅に合わせる」では、スマホのような狭い画面で 1 列、それより広い画面で横に並べます。「複数列」で幅が足りないときは、横にスクロールして見ます。"
      >
        <SegmentedControl
          label="カラムの並べ方"
          options={LAYOUTS}
          value={props.deckLayout}
          onChange={(layout) =>
            dispatch({ type: "deck/set-deck-layout", layout })
          }
        />
      </SettingsSection>

      <SettingsSection
        title="ローディング表示"
        scope="device"
        description="投稿やいいね、設定を保存するとき、アップロード先のそれぞれのリレーに届いたかを画面の右下に出します。オフにすると、設定を保存 または 保存に失敗したときだけ表示します。"
      >
        <Switch
          label="ローディングの進行状況を表示する"
          checked={props.writeProgress}
          onChange={(on) => dispatch({ type: "deck/set-write-progress", on })}
        />
      </SettingsSection>

      <SettingsSection
        title="閲覧注意の投稿"
        scope="device"
        description="投稿した人が「見る前に確かめてほしい」と印を付けた投稿の扱いを選びます。「隠す」では本文や画像の代わりに閲覧注意の理由を出し、「表示する」を押すと中身を出します。「一覧に出さない」ではタイムラインや通知に並べません（自分の投稿は並べます）。"
      >
        <SegmentedControl
          label="閲覧注意の投稿"
          options={CONTENT_WARNING_MODES}
          value={props.contentWarning}
          onChange={(mode) =>
            dispatch({ type: "deck/set-content-warning", mode })
          }
        />
      </SettingsSection>

      <SettingsSection
        title="アクション欄"
        scope="device"
        description={`投稿の下に並べる操作を選びます。並べられるのは ${ACTION_BAR_MAX} 個までで、残りは投稿の右上の「︙」のメニューに入ります。行を掴んで動かすか、右端のつまみを選んで ↑↓ キーで並べ替えます。`}
      >
        <ActionLayoutField layout={props.actionLayout} />
      </SettingsSection>

      <SettingsSection
        title="カラーテーマ"
        scope="device"
        description="画面を明るい色で表示するか、暗い色で表示するかを選びます。「OS に合わせる」にすると、端末のダークモードの設定に合わせて切り替わります。"
      >
        <SegmentedControl
          label="カラーテーマ"
          options={SCHEMES}
          value={props.scheme}
          onChange={(scheme) =>
            dispatch({ type: "deck/set-color-scheme", scheme })
          }
        />
      </SettingsSection>

      <SettingsSection
        title="アクセントカラー"
        scope="account"
        description="ボタン、リンク、自分が付けたいいねなどに使う色を設定できます。"
      >
        <RadioGroup.Root
          orientation="horizontal"
          class="flex flex-wrap gap-2"
          value={current() ?? ""}
          onValueChange={(details) => {
            const palette = PALETTES[details.value as PaletteName];
            if (palette) commit({ accent: palette.accent, ui: palette.ui });
          }}
        >
          <RadioGroup.Label class="sr-only">色の組み合わせ</RadioGroup.Label>
          <For each={Object.entries(PALETTES)}>
            {([name, palette]) => (
              <RadioGroup.Item
                value={name}
                class="group grid size-12 cursor-pointer place-items-center rounded-full border border-primary transition-colors data-[state=checked]:border-2 data-[state=checked]:border-ui-9 dark:data-[state=checked]:border-ui-1"
              >
                {/*
                  左がアクセント、右が文字と背景の色味。境目は斜めにする（v0 と同じ）。
                  斜めにすると角が欠けるので、中身を丸より広げてはみ出させる。
                */}
                <span class="h-8 w-8 overflow-hidden rounded-full">
                  <span class="-ml-[20%] -skew-x-12 flex h-full w-[140%]">
                    <span
                      class="h-full w-1/2"
                      style={{ background: palette.accent }}
                    />
                    <span
                      class="h-full w-1/2"
                      style={{ background: palette.ui }}
                    />
                  </span>
                </span>
                <RadioGroup.ItemText class="sr-only">
                  {palette.label}
                </RadioGroup.ItemText>
                <RadioGroup.ItemHiddenInput />
              </RadioGroup.Item>
            )}
          </For>
        </RadioGroup.Root>

        <Collapsible.Root
          lazyMount
          unmountOnExit
          // 自分で選んだ色のときは、はじめから開いておく（プリセットのどれも選ばれていないので）。
          defaultOpen={current() === undefined}
          class="rounded-2 border border-primary"
        >
          <Collapsible.Trigger class="group c-primary flex h-10 w-full cursor-pointer items-center gap-1.5 bg-transparent px-3 text-body">
            <span
              class="i-material-symbols:expand-more-rounded size-5 transition-transform group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
            色を自分で選ぶ
          </Collapsible.Trigger>
          <Collapsible.Content class="motion-collapse">
            <div class="flex flex-col gap-1 px-3 pb-3">
              <ColorField
                label="アクセント"
                value={props.appearance.accent}
                onPreview={(accent) => preview({ accent })}
                onCommit={(accent) => commit({ accent })}
              />
              <ColorField
                label="文字と背景の色味"
                value={props.appearance.ui}
                onPreview={(ui) => preview({ ui })}
                onCommit={(ui) => commit({ ui })}
              />
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      </SettingsSection>

      <SettingsSection title="プレビュー">
        <DisplayPreview />
      </SettingsSection>
    </div>
  );
};

export default DisplaySettings;
