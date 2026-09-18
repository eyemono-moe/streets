import { Collapsible } from "@ark-ui/solid/collapsible";
import { RadioGroup } from "@ark-ui/solid/radio-group";
import type { DeckAppearance } from "@streets/core/deck/deck";
import type { ColorScheme } from "@streets/core/settings/color-scheme";
import { type Component, For } from "solid-js";
import { PALETTES, type PaletteName, paletteOf } from "../theme";
import { useDispatch } from "../ui-events";
import ColorField from "../ui/ColorField";
import SegmentedControl from "../ui/SegmentedControl";
import Switch from "../ui/Switch";
import DisplayPreview from "./DisplayPreview";
import SettingsSection from "./SettingsSection";

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
        description="ボタン、選んでいる項目、リンク、自分が付けたいいねなどに使う色です。"
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

      <SettingsSection
        title="保存の進み具合"
        scope="device"
        description="投稿やいいね、設定を保存するとき、送り先のリレーそれぞれに届いたかを画面の右下に出します。どこか 1 つに届いた時点で「保存しました」と出ます。切ると、設定を保存したときと、届かなかったときだけ知らせます。"
      >
        <Switch
          label="保存の進み具合を表示する"
          checked={props.writeProgress}
          onChange={(on) => dispatch({ type: "deck/set-write-progress", on })}
        />
      </SettingsSection>

      <SettingsSection
        title="プレビュー"
        description="選んだ色が、投稿でどう見えるかの見本です。"
      >
        <DisplayPreview />
      </SettingsSection>
    </div>
  );
};

export default DisplaySettings;
