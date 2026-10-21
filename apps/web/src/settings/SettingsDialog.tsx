import type { DeckAppearance } from "@streets/core/deck/deck";
import type { ReactionInput } from "@streets/core/nostr/reaction";
import type { ColorScheme } from "@streets/core/settings/color-scheme";
import type { DeckLayout } from "@streets/core/settings/deck-layout-setting";
import type { Keymap } from "@streets/core/settings/keymap";
import type { SwipeMode } from "@streets/core/settings/swipe-mode-setting";
import type { UiContrast } from "@streets/core/settings/ui-contrast";
import { searchEntries } from "@streets/core/signal/search";
import {
  type Component,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
} from "solid-js";
import { actionLayout } from "../action-layout-setting";
import { chatOrder } from "../chat-order-setting";
import { contentWarningMode } from "../content-warning-setting";
import { timeFormat } from "../time-format-setting";
import { Mediates, type UiEvent, useDispatch } from "../ui-events";
import PagedDialog, { type DialogPage } from "../ui/PagedDialog";
import SearchInput from "../ui/SearchInput";
import AccountSettings from "./AccountSettings";
import DisplaySettings from "./DisplaySettings";
import EmojiSettings from "./EmojiSettings";
import KeyboardSettings from "./KeyboardSettings";
import MediaSettings from "./MediaSettings";
import MuteSettings from "./MuteSettings";
import PrivacySettings from "./PrivacySettings";
import { useProfileEdit } from "./ProfileMediator";
import RelaySettings from "./RelaySettings";
import SearchSettings from "./SearchSettings";
import {
  ACCOUNT_PAGES,
  availableSettings,
  pageName,
  type SettingEntry,
  type SettingPage,
} from "./setting-registry";
import { SettingFilter } from "./SettingFilter";
import StatsSettings from "./StatsSettings";

/**
 * 設定。デッキの上に開くダイアログで、左（狭い画面では上）にページの一覧を置く。
 */
const SettingsDialog: Component<{
  open: boolean;
  /** ログインしているか。していなければ、アカウントに保存するページを出さない。 */
  signedIn: boolean;
  /** 狭い画面では、ページの一覧を横に並べて全面に出す。 */
  wide: boolean;
  scheme: ColorScheme;
  contrast: UiContrast;
  appearance: DeckAppearance;
  writeProgress: boolean;
  /** 不具合の報告を送るか（この端末の設定）。 */
  errorReport: boolean;
  /** 投稿に client タグを付けるか（アカウントの設定）。 */
  clientTag: boolean;
  /** 引用した先の作者に知らせるか（アカウントの設定）。 */
  notifyQuoted: boolean;
  /** ショートカットキーの割り当て（この端末の設定）。 */
  keymap: Keymap;
  /** 数字キーでカラムを見せるか（この端末の設定）。 */
  columnDigits: boolean;
  /** カラムの並べ方（この端末の設定）。 */
  deckLayout: DeckLayout;
  /** 1 列ずつのときに左右へ払うと何が起きるか（この端末の設定）。 */
  swipeMode: SwipeMode;
  columnStretch: boolean;
  /** いいねボタンで送るリアクション（この端末の設定）。 */
  defaultReaction: ReactionInput;
  /** 開いたときに出すページ。 */
  initialPage?: string;
  /** パレットなどから検索結果を直接開くときの語。 */
  initialQuery?: string;
  /** パレットで選んだ項目。開いたとき、その編集欄だけを出す。 */
  requestedSetting?: string;
}> = (props) => {
  const dispatch = useDispatch();
  // 一覧の先頭（アカウント）から開く。どこから開いても同じ場所で始まる。
  const [page, setPage] = createSignal(
    props.initialPage ?? (props.signedIn ? "account" : "display"),
  );
  const [query, setQuery] = createSignal(props.initialQuery ?? "");
  const [target, setTarget] = createSignal<SettingEntry>();
  const hits = createMemo(() => {
    const chosen = target();
    return chosen
      ? [{ entry: chosen, score: 0 }]
      : searchEntries(availableSettings(props.signedIn), query());
  });
  createEffect(
    on(
      () => [props.open, props.requestedSetting] as const,
      ([open, id]) => {
        if (!open) return;
        const setting = availableSettings(props.signedIn).find(
          (entry) => entry.id === id,
        );
        setTarget(setting);
        setQuery(setting?.title ?? props.initialQuery ?? "");
        if (setting) setPage(setting.page);
      },
    ),
  );
  // プロフィールを書きかけのまま閉じようとしたら、そのページを見せる。
  const profileEdit = useProfileEdit();
  createEffect(
    on(
      () => profileEdit?.attention() ?? 0,
      (count) => {
        if (count > 0) {
          setTarget(undefined);
          setQuery("");
          setPage("account");
        }
      },
      { defer: true },
    ),
  );

  // 名前は getter で引く。ダイアログを開いたまま言語を切り替えても、並びの名前が変わる。
  const allPages: (DialogPage & { value: SettingPage })[] = [
    {
      value: "account",
      get label() {
        return pageName("account");
      },
      icon: "i-material-symbols:person-outline-rounded",
      get title() {
        return pageName("account");
      },
      content: () => <AccountSettings />,
    },
    {
      value: "relays",
      get label() {
        return pageName("relays");
      },
      icon: "i-material-symbols:globe",
      get title() {
        return pageName("relays");
      },
      content: () => <RelaySettings />,
    },

    {
      value: "media",
      get label() {
        return pageName("media");
      },
      icon: "i-material-symbols:image-outline-rounded",
      get title() {
        return pageName("media");
      },
      content: () => <MediaSettings />,
    },
    {
      value: "search",
      get label() {
        return pageName("search");
      },
      icon: "i-material-symbols:search-rounded",
      get title() {
        return pageName("search");
      },
      content: () => <SearchSettings />,
    },
    {
      value: "emoji",
      get label() {
        return pageName("emoji");
      },
      icon: "i-material-symbols:add-reaction-outline-rounded",
      get title() {
        return pageName("emoji");
      },
      description:
        "いいねボタンで送る絵文字と、リアクションのピッカーに出る絵文字を設定します",
      content: () => <EmojiSettings defaultReaction={props.defaultReaction} />,
    },
    {
      value: "mute",
      get label() {
        return pageName("mute");
      },
      icon: "i-material-symbols:volume-off-outline-rounded",
      get title() {
        return pageName("mute");
      },
      content: () => <MuteSettings />,
    },
    {
      value: "keyboard",
      get label() {
        return pageName("keyboard");
      },
      icon: "i-material-symbols:keyboard-outline-rounded",
      get title() {
        return pageName("keyboard");
      },
      content: () => (
        <KeyboardSettings
          keymap={props.keymap}
          columnDigits={props.columnDigits}
        />
      ),
    },
    {
      value: "display",
      get label() {
        return pageName("display");
      },
      icon: "i-material-symbols:visibility-outline-rounded",
      get title() {
        return pageName("display");
      },
      content: () => (
        <DisplaySettings
          scheme={props.scheme}
          contrast={props.contrast}
          appearance={props.appearance}
          writeProgress={props.writeProgress}
          contentWarning={contentWarningMode()}
          chatOrder={chatOrder()}
          timeFormat={timeFormat()}
          deckLayout={props.deckLayout}
          swipeMode={props.swipeMode}
          columnStretch={props.columnStretch}
          actionLayout={actionLayout()}
        />
      ),
    },
    {
      value: "privacy",
      get label() {
        return pageName("privacy");
      },
      icon: "i-material-symbols:lock-person-outline-rounded",
      get title() {
        return pageName("privacy");
      },
      content: () => (
        <PrivacySettings
          clientTag={props.clientTag}
          notifyQuoted={props.notifyQuoted}
          errorReport={props.errorReport}
        />
      ),
    },
    {
      value: "stats",
      get label() {
        return pageName("stats");
      },
      icon: "i-material-symbols:bar-chart-rounded",
      get title() {
        return pageName("stats");
      },
      description:
        "リレーとやりとりしたデータの量と、いま投稿を読んでいるリレーです。",
      content: () => <StatsSettings />,
    },
  ];

  const pages = () =>
    props.signedIn
      ? allPages
      : allPages.filter((page) => !ACCOUNT_PAGES.has(page.value));

  const searchPage: DialogPage = {
    value: "settings-results",
    label: "検索結果",
    icon: "i-material-symbols:search-rounded",
    title: "設定の検索結果",
    content: () => (
      <Show
        when={hits().length > 0}
        fallback={
          <p class="c-secondary text-body">該当する設定はありません。</p>
        }
      >
        <div class="flex flex-col gap-7">
          <For each={hits()}>
            {({ entry }) => {
              const foundPage = allPages.find(
                (item) => item.value === entry.page,
              );
              return (
                <div class="flex flex-col gap-2 border-b border-primary pb-6 last:border-b-0 last:pb-0">
                  <span class="c-secondary text-caption">{entry.section}</span>
                  <SettingFilter id={entry.id}>
                    {foundPage?.content?.()}
                  </SettingFilter>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    ),
  };

  // 設定はカラムではないので、重ねる先が無い。人やノートを開く操作は、デッキに
  // カラムとして足してからダイアログを閉じ、足したカラムを見せる。
  const handle = (event: UiEvent): boolean => {
    if (event.type !== "stack/open") return false;
    dispatch({ type: "deck/add-column", column: event.column });
    dispatch({ type: "deck/close-settings" });
    return true;
  };

  return (
    <Mediates handle={handle}>
      <PagedDialog
        open={props.open}
        wide={props.wide}
        title="設定"
        description={
          props.signedIn
            ? "アカウントと、この端末の表示を設定します。"
            : "この端末の表示を設定します。アカウントの設定は、ログインすると使えます。"
        }
        pages={pages()}
        navigationBefore={
          <SearchInput
            label="設定を検索"
            placeholder="設定を検索"
            value={query()}
            onValueChange={(value) => {
              setTarget(undefined);
              setQuery(value);
            }}
            clearable
            class="w-full"
          />
        }
        extraPage={searchPage}
        page={query().trim() ? searchPage.value : page()}
        onPageChange={(value) => {
          setTarget(undefined);
          setQuery("");
          setPage(value);
        }}
        onClose={() => dispatch({ type: "deck/close-settings" })}
        // 表示を変えている間は、後ろのデッキに色や並びがどう当たるかを暗くせずに見せる。
        backdropClass={
          !query().trim() && page() === "display" ? "bg-transparent" : undefined
        }
      />
    </Mediates>
  );
};

export default SettingsDialog;
