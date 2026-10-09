import { Collapsible } from "@ark-ui/solid/collapsible";
import { RadioGroup } from "@ark-ui/solid/radio-group";
import type { DeckAppearance } from "@streets/core/deck/deck";
import {
  ACTION_BAR_MAX,
  type ActionLayout,
  defaultActionLayout,
  sameActionLayout,
} from "@streets/core/settings/action-layout";
import {
  type ChatOrder,
  loadChatOrder,
} from "@streets/core/settings/chat-order-setting";
import {
  type ColorScheme,
  loadColorScheme,
} from "@streets/core/settings/color-scheme";
import { loadColumnStretch } from "@streets/core/settings/column-stretch-setting";
import {
  type ContentWarningMode,
  loadContentWarningMode,
} from "@streets/core/settings/content-warning-setting";
import {
  type DeckLayout,
  loadDeckLayout,
} from "@streets/core/settings/deck-layout-setting";
import {
  type TimeFormat,
  loadTimeFormat,
} from "@streets/core/settings/time-format-setting";
  loadUiContrast,
  type UiContrast,
} from "@streets/core/settings/ui-contrast";
import { loadWriteProgress } from "@streets/core/settings/write-progress-setting";
import { type Component, For } from "solid-js";
import {
  DEFAULT_APPEARANCE,
  PALETTES,
  type PaletteName,
  paletteOf,
} from "../theme";
import { useDispatch } from "../ui-events";
import ColorField from "../ui/ColorField";
import SegmentedControl from "../ui/SegmentedControl";
import Switch from "../ui/Switch";
import ActionLayoutField from "./ActionLayoutField";
import DisplayPreview from "./DisplayPreview";
import SettingsDetails from "./SettingsDetails";
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

const CHAT_ORDERS: { value: ChatOrder; label: string }[] = [
  { value: "newest-last", label: "新しい発言を下に" },
  { value: "newest-first", label: "新しい発言を上に" },
];

const TIME_FORMATS: { value: TimeFormat; label: string }[] = [
  { value: "absolute", label: "絶対時間" },
  { value: "relative", label: "相対時間" },
];

const SCHEMES: { value: ColorScheme; label: string }[] = [
  { value: "system", label: "OS に合わせる" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
];

const CONTRASTS: { value: UiContrast; label: string }[] = [
  { value: "low", label: "低い" },
  { value: "normal", label: "標準" },
  { value: "high", label: "高い" },
];

/** 表示の設定。今の値を受け取って描き、変えたらイベントを上へ渡す。 */
const DisplaySettings: Component<{
  scheme: ColorScheme;
  /** 文字と背景のコントラスト（この端末の設定）。 */
  contrast: UiContrast;
  appearance: DeckAppearance;
  /** 保存の進み具合を出すか（この端末の設定）。 */
  writeProgress: boolean;
  /** 閲覧注意の投稿の扱い（この端末の設定）。 */
  contentWarning: ContentWarningMode;
  /** カラムの並べ方（この端末の設定）。 */
  deckLayout: DeckLayout;
  /** チャットの発言の並び順（この端末の設定）。 */
  chatOrder: ChatOrder;
  /** 投稿の時刻の見せ方（この端末の設定）。 */
  timeFormat: TimeFormat;
  /** カラムを画面の幅いっぱいに広げるか（この端末の設定）。 */
  columnStretch: boolean;
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

  // 既定は、何も保存していないときに読み込む値。
  const initialScheme = loadColorScheme(null);
  const initialContrast = loadUiContrast(null);
  const initialLayout = loadDeckLayout(null);
  const initialContentWarning = loadContentWarningMode(null);
  const initialWriteProgress = loadWriteProgress(null);
  const initialChatOrder = loadChatOrder(null);
  const initialTimeFormat = loadTimeFormat(null);

  return (
    <div class="flex flex-col gap-7">
      <SettingsSection
        id="theme"
        scope="device"
        changed={props.scheme !== initialScheme}
        onReset={() =>
          dispatch({ type: "deck/set-color-scheme", scheme: initialScheme })
        }
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
        id="contrast"
        scope="device"
        changed={props.contrast !== initialContrast}
        onReset={() =>
          dispatch({ type: "deck/set-ui-contrast", contrast: initialContrast })
        }
        description="文字と背景の明るさの差を選びます。「高い」にすると文字がくっきりし、「低い」にすると画面がやわらかくなります。ライトでもダークでも効きます。"
      >
        <SegmentedControl
          label="コントラスト"
          options={CONTRASTS}
          value={props.contrast}
          onChange={(contrast) =>
            dispatch({ type: "deck/set-ui-contrast", contrast })
          }
        />
      </SettingsSection>

      <SettingsSection
        id="accent"
        scope="account"
        changed={
          props.appearance.accent !== DEFAULT_APPEARANCE.accent ||
          props.appearance.ui !== DEFAULT_APPEARANCE.ui
        }
        onReset={() =>
          dispatch({
            type: "deck/set-appearance",
            appearance: { ...DEFAULT_APPEARANCE },
          })
        }
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

      <SettingsSection id="preview">
        <DisplayPreview />
      </SettingsSection>

      <SettingsSection
        id="deckLayout"
        scope="device"
        changed={props.deckLayout !== initialLayout}
        onReset={() =>
          dispatch({ type: "deck/set-deck-layout", layout: initialLayout })
        }
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
        id="columnWidth"
        scope="device"
        changed={props.columnStretch !== loadColumnStretch(null)}
        onReset={() =>
          dispatch({
            type: "deck/set-column-stretch",
            on: loadColumnStretch(null),
          })
        }
        description="オンにすると、横に並べたカラムを画面の幅いっぱいに広げて表示します。カラムごとの幅の比をS/M/Lから選んで設定できます。カラムが多くて入りきらないときは、横にスクロールできます。"
      >
        <Switch
          label="カラムを画面の幅いっぱいに広げる"
          checked={props.columnStretch}
          onChange={(on) => dispatch({ type: "deck/set-column-stretch", on })}
        />
      </SettingsSection>

      <SettingsSection
        id="contentWarning"
        scope="device"
        changed={props.contentWarning !== initialContentWarning}
        onReset={() =>
          dispatch({
            type: "deck/set-content-warning",
            mode: initialContentWarning,
          })
        }
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
        id="timeFormat"
        scope="device"
        changed={props.timeFormat !== initialTimeFormat}
        onReset={() =>
          dispatch({ type: "deck/set-time-format", format: initialTimeFormat })
        }
        description="投稿の時刻を「12:34」のような絶対時間で出すか、「5分」「3時間」のような今からの相対時間で出すかを選びます。1 日より前の投稿は、どちらでも日付で出します。"
      >
        <SegmentedControl
          label="投稿の時刻"
          options={TIME_FORMATS}
          value={props.timeFormat}
          onChange={(format) =>
            dispatch({ type: "deck/set-time-format", format })
          }
        />
      </SettingsSection>

      <SettingsDetails
        page="display"
        summary="チャットの並び順、ローディング表示、アクション欄の並べ替え"
      >
        <SettingsSection
          id="chatOrder"
          scope="device"
          changed={props.chatOrder !== initialChatOrder}
          onReset={() =>
            dispatch({ type: "deck/set-chat-order", order: initialChatOrder })
          }
          description="パブリックチャットのカラムで、新しい発言を一番下に表示するか、一番上に表示するかを選びます。「新しい発言を上に」では、メッセージ送信欄も上に表示します。"
        >
          <SegmentedControl
            label="チャットの並び順"
            options={CHAT_ORDERS}
            value={props.chatOrder}
            onChange={(order) =>
              dispatch({ type: "deck/set-chat-order", order })
            }
          />
        </SettingsSection>

        <SettingsSection
          id="writeProgress"
          scope="device"
          changed={props.writeProgress !== initialWriteProgress}
          onReset={() =>
            dispatch({
              type: "deck/set-write-progress",
              on: initialWriteProgress,
            })
          }
          description="投稿やいいね、設定を保存するとき、アップロード先のそれぞれのリレーに届いたかを画面の右下に出します。オフにすると、設定を保存 または 保存に失敗したときだけ表示します。"
        >
          <Switch
            label="ローディングの進行状況を表示する"
            checked={props.writeProgress}
            onChange={(on) => dispatch({ type: "deck/set-write-progress", on })}
          />
        </SettingsSection>

        <SettingsSection
          id="actionLayout"
          scope="device"
          changed={!sameActionLayout(props.actionLayout, defaultActionLayout())}
          onReset={() =>
            dispatch({
              type: "deck/set-action-layout",
              layout: defaultActionLayout(),
            })
          }
          description={`投稿の下に並べる操作を選びます。並べられるのは ${ACTION_BAR_MAX} 個までで、残りは投稿の右上の「︙」のメニューに入ります。行を掴んで動かすか、右端のつまみを選んで ↑↓ キーで並べ替えます。`}
        >
          <ActionLayoutField layout={props.actionLayout} />
        </SettingsSection>
      </SettingsDetails>
    </div>
  );
};

export default DisplaySettings;
