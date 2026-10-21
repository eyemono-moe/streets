import { Collapsible } from "@ark-ui/solid/collapsible";
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
import type { Locale } from "@streets/core/settings/locale-setting";
import {
  type SwipeMode,
  loadSwipeMode,
} from "@streets/core/settings/swipe-mode-setting";
import {
  type TimeFormat,
  loadTimeFormat,
} from "@streets/core/settings/time-format-setting";
import {
  formatUiContrast,
  loadUiContrast,
  UI_CONTRAST_MAX,
  UI_CONTRAST_MIN,
  UI_CONTRAST_STEP,
  type UiContrast,
} from "@streets/core/settings/ui-contrast";
import { loadWriteProgress } from "@streets/core/settings/write-progress-setting";
import type { Component } from "solid-js";
import { locale, messageOrText, t } from "../i18n/locale";
import { DEFAULT_APPEARANCE, paletteOf } from "../theme";
import { useDispatch } from "../ui-events";
import ColorField from "../ui/ColorField";
import SegmentedControl from "../ui/SegmentedControl";
import Slider from "../ui/Slider";
import Switch from "../ui/Switch";
import ActionLayoutField from "./ActionLayoutField";
import DisplayPreview from "./DisplayPreview";
import PalettePicker from "./PalettePicker";
import { settingTitle } from "./setting-registry";
import SettingsDetails from "./SettingsDetails";
import SettingsSection from "./SettingsSection";

const LOCALES: { value: Locale; label: string }[] = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];

const contentWarningModes = (): {
  value: ContentWarningMode;
  label: string;
}[] => [
  { value: "hide", label: t("settings.display.contentWarning.hide") },
  { value: "show", label: t("settings.display.contentWarning.show") },
  { value: "exclude", label: t("settings.display.contentWarning.exclude") },
];

const layouts = (): { value: DeckLayout; label: string }[] => [
  { value: "auto", label: t("settings.display.deckLayout.auto") },
  { value: "single", label: t("settings.display.deckLayout.single") },
  { value: "multi", label: t("settings.display.deckLayout.multi") },
];

const swipeModes = (): { value: SwipeMode; label: string }[] => [
  { value: "loop", label: t("settings.display.swipeMode.loop") },
  { value: "stop", label: t("settings.display.swipeMode.stop") },
  { value: "off", label: t("settings.display.swipeMode.off") },
];

const chatOrders = (): { value: ChatOrder; label: string }[] => [
  { value: "newest-last", label: t("settings.display.chatOrder.newestLast") },
  { value: "newest-first", label: t("settings.display.chatOrder.newestFirst") },
];

const timeFormats = (): { value: TimeFormat; label: string }[] => [
  { value: "absolute", label: t("settings.display.timeFormat.absolute") },
  { value: "relative", label: t("settings.display.timeFormat.relative") },
];

const schemes = (): { value: ColorScheme; label: string }[] => [
  { value: "system", label: t("settings.display.theme.system") },
  { value: "light", label: t("settings.display.theme.light") },
  { value: "dark", label: t("settings.display.theme.dark") },
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
  /** 1 列ずつのときに左右へ払うと何が起きるか（この端末の設定）。 */
  swipeMode: SwipeMode;
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
  const initialSwipeMode = loadSwipeMode(null);
  const initialContentWarning = loadContentWarningMode(null);
  const initialWriteProgress = loadWriteProgress(null);
  const initialChatOrder = loadChatOrder(null);
  const initialTimeFormat = loadTimeFormat(null);

  return (
    <div class="flex flex-col gap-7">
      <SettingsSection
        id="language"
        scope="device"
        description={t("settings.language.description")}
      >
        {/* 読めない言語に切り替えても戻せるよう、言語の名前はその言語で書く。 */}
        <SegmentedControl
          label={settingTitle("language")}
          options={LOCALES}
          value={locale()}
          onChange={(value) =>
            dispatch({ type: "deck/set-locale", locale: value })
          }
        />
      </SettingsSection>

      <SettingsSection
        id="theme"
        scope="device"
        changed={props.scheme !== initialScheme}
        onReset={() =>
          dispatch({ type: "deck/set-color-scheme", scheme: initialScheme })
        }
        description={t("settings.display.theme.description")}
      >
        <SegmentedControl
          label={settingTitle("theme")}
          options={schemes()}
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
        description={t("settings.display.contrast.description")}
      >
        <Slider
          label={settingTitle("contrast")}
          labelHidden
          value={props.contrast}
          min={UI_CONTRAST_MIN}
          max={UI_CONTRAST_MAX}
          step={UI_CONTRAST_STEP}
          format={(contrast) => messageOrText(formatUiContrast(contrast))}
          onChange={(contrast) =>
            dispatch({ type: "deck/preview-ui-contrast", contrast })
          }
          onChangeEnd={(contrast) =>
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
        description={t("settings.display.accent.description")}
      >
        <PalettePicker
          value={current()}
          onChange={(palette) =>
            commit({ accent: palette.accent, ui: palette.ui })
          }
        />

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
            {t("settings.display.accent.custom")}
          </Collapsible.Trigger>
          <Collapsible.Content class="motion-collapse">
            <div class="flex flex-col gap-1 px-3 pb-3">
              <ColorField
                label={t("settings.display.accent.accent")}
                value={props.appearance.accent}
                onPreview={(accent) => preview({ accent })}
                onCommit={(accent) => commit({ accent })}
              />
              <ColorField
                label={t("settings.display.accent.ui")}
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
        description={t("settings.display.deckLayout.description")}
      >
        <SegmentedControl
          label={settingTitle("deckLayout")}
          options={layouts()}
          value={props.deckLayout}
          onChange={(layout) =>
            dispatch({ type: "deck/set-deck-layout", layout })
          }
        />
      </SettingsSection>

      <SettingsSection
        id="swipeMode"
        scope="device"
        changed={props.swipeMode !== initialSwipeMode}
        onReset={() =>
          dispatch({ type: "deck/set-swipe-mode", mode: initialSwipeMode })
        }
        description={t("settings.display.swipeMode.description")}
      >
        <SegmentedControl
          label={settingTitle("swipeMode")}
          options={swipeModes()}
          value={props.swipeMode}
          onChange={(mode) => dispatch({ type: "deck/set-swipe-mode", mode })}
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
        description={t("settings.display.columnWidth.description")}
      >
        <Switch
          label={t("settings.display.columnWidth.switch")}
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
        description={t("settings.display.contentWarning.description")}
      >
        <SegmentedControl
          label={settingTitle("contentWarning")}
          options={contentWarningModes()}
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
        description={t("settings.display.timeFormat.description")}
      >
        <SegmentedControl
          label={settingTitle("timeFormat")}
          options={timeFormats()}
          value={props.timeFormat}
          onChange={(format) =>
            dispatch({ type: "deck/set-time-format", format })
          }
        />
      </SettingsSection>

      <SettingsDetails
        page="display"
        summary={t("settings.display.detailsSummary")}
      >
        <SettingsSection
          id="chatOrder"
          scope="device"
          changed={props.chatOrder !== initialChatOrder}
          onReset={() =>
            dispatch({ type: "deck/set-chat-order", order: initialChatOrder })
          }
          description={t("settings.display.chatOrder.description")}
        >
          <SegmentedControl
            label={settingTitle("chatOrder")}
            options={chatOrders()}
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
          description={t("settings.display.writeProgress.description")}
        >
          <Switch
            label={t("settings.display.writeProgress.switch")}
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
          description={t("settings.display.actionLayout.description", {
            max: ACTION_BAR_MAX,
          })}
        >
          <ActionLayoutField layout={props.actionLayout} />
        </SettingsSection>
      </SettingsDetails>
    </div>
  );
};

export default DisplaySettings;
