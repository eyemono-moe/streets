import type { ColumnDef } from "@streets/core/deck/deck";
import type { DeckPanel } from "@streets/core/deck/deck-ui";
import { type Component, For, Show, createEffect, onCleanup } from "solid-js";
import { ColumnHeaderActions } from "../columns/ColumnHeader";
import { ariaKeyShortcuts, shortcutTitle } from "../keymap";
import Avatar from "../note/Avatar";
import { tourTarget } from "../tour/tour-target";
import { useDispatch } from "../ui-events";
import IconButton from "../ui/IconButton";
import AccountMenu from "./AccountMenu";
import ColumnDigit from "./ColumnDigit";
import ColumnIcon from "./ColumnIcon";
import { useColumnTitle } from "./ColumnTitle";
import ColumnTitle from "./ColumnTitle";

/**
 * デッキのカラムを 1 つずつ並べるボタン。押すと、そのカラムが画面に収まるよう
 * 送る（狭い画面ではそのタブを選ぶ）。1〜9 番目は数字キーでも同じ（設定で切れる）。
 */
const ColumnButton: Component<{
  column: ColumnDef;
  index: number;
  /** 数字キーで見せられるカラムに、その番号を出す。 */
  numbers: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const title = useColumnTitle(() => props.column);
  const number = () =>
    props.numbers && props.index < 9 ? props.index + 1 : undefined;
  return (
    <button
      type="button"
      aria-label={number() ? `${title()}（${number()}）` : title()}
      title={title()}
      // 番号がボタンの外へはみ出すと、それだけで一覧がスクロールできるようになる。中で切る。
      class="c-secondary relative grid size-10 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2 bg-transparent hover:bg-secondary"
      onClick={() =>
        dispatch({ type: "deck/focus-column", id: props.column.id })
      }
    >
      <ColumnIcon
        column={props.column}
        class="size-5.5"
        avatarClass="size-6 rounded-1.5"
      />
      <Show when={number()}>
        {(n) => <ColumnDigit digit={n()} class="right-1 bottom-1" />}
      </Show>
    </button>
  );
};

export const Sidebar: Component<{
  /** ログインしていなければ undefined。 */
  pubkey: string | undefined;
  columns: readonly ColumnDef[];
  /** いま開いているパネル。押したボタンが開いているかを出すために使う。 */
  panel: DeckPanel | undefined;
  /** カラムに数字キーの番号を出すか。 */
  numbers: boolean;
  onLogout: () => void;
  feedbackUrl?: string | null;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    // 行：投稿・探す／カラムの一覧（＋追加）／（空き）・デッキの編集・コマンドパレット・
    // 設定・アカウント。一覧の行だけが縮んで送れるようになり、ほかの行は縮まない。
    <nav class="b-r-1 grid w-14 shrink-0 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto_auto_auto] justify-items-center gap-1 border-primary bg-primary px-2 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
      <IconButton
        {...tourTarget("compose")}
        variant="primary"
        size="lg"
        icon="i-material-symbols:edit-square-outline-rounded"
        label="投稿パネルを開く"
        title={shortcutTitle("compose")}
        aria-keyshortcuts={ariaKeyShortcuts("compose")}
        aria-expanded={props.panel === "compose"}
        onClick={() =>
          dispatch({ type: "deck/toggle-panel", panel: "compose" })
        }
      />
      <IconButton
        variant={props.panel === "search" ? "filled" : "ghost"}
        size="lg"
        icon="i-material-symbols:search-rounded"
        label="検索パネルを開く"
        title={shortcutTitle("search")}
        aria-keyshortcuts={ariaKeyShortcuts("search")}
        aria-expanded={props.panel === "search"}
        onClick={() => dispatch({ type: "deck/toggle-panel", panel: "search" })}
      />
      {/*
        カラムの一覧と「追加」を 1 つの送れる帯にする。横は隠す（auto のままだと
        横のはみ出しでスクロールバーが出る）。上下の余白は、フォントの違いで
        中身が数 px はみ出しても送れる状態にしないため。
      */}
      <div class="flex max-h-full min-h-0 w-full flex-col items-center gap-1 self-start overflow-y-auto overflow-x-hidden py-1">
        <For each={props.columns}>
          {(column, index) => (
            <ColumnButton
              column={column}
              index={index()}
              numbers={props.numbers}
            />
          )}
        </For>
        {/* 一覧が長くても押せるよう、帯の下に貼り付けておく。下を流れるカラムが透けないよう、地の色を敷く。 */}
        <div class="sticky bottom-0 rounded-2 bg-primary">
          <IconButton
            {...tourTarget("add-column")}
            variant={props.panel === "add-column" ? "filled" : "ghost"}
            size="lg"
            icon="i-material-symbols:add-rounded"
            label="カラムを追加"
            title={shortcutTitle("add-column")}
            aria-keyshortcuts={ariaKeyShortcuts("add-column")}
            aria-expanded={props.panel === "add-column"}
            onClick={() =>
              dispatch({ type: "deck/toggle-panel", panel: "add-column" })
            }
          />
        </div>
      </div>
      <IconButton
        variant={
          props.panel === "arrange" || props.panel === "new-deck"
            ? "filled"
            : "ghost"
        }
        size="lg"
        icon="i-material-symbols:view-column-outline-rounded"
        label="デッキを編集"
        aria-expanded={props.panel === "arrange"}
        onClick={() =>
          dispatch({ type: "deck/toggle-panel", panel: "arrange" })
        }
      />
      <IconButton
        size="lg"
        icon="i-material-symbols:manage-search-rounded"
        label="コマンドパレットを開く"
        title={shortcutTitle("palette")}
        aria-keyshortcuts={ariaKeyShortcuts("palette")}
        onClick={() => dispatch({ type: "deck/open-palette" })}
      />
      <IconButton
        size="lg"
        icon="i-material-symbols:settings-outline-rounded"
        label="設定"
        onClick={() => dispatch({ type: "deck/open-settings" })}
      />
      <AccountMenu
        pubkey={props.pubkey}
        onLogout={props.onLogout}
        feedbackUrl={props.feedbackUrl}
      />
    </nav>
  );
};

/** 狭い画面の右下に浮かぶ、ノートを書くボタン。 */
export const ComposeFab: Component = () => {
  const dispatch = useDispatch();
  return (
    <button
      type="button"
      {...tourTarget("compose")}
      aria-label="投稿パネルを開く"
      title={shortcutTitle("compose")}
      aria-keyshortcuts={ariaKeyShortcuts("compose")}
      class="absolute right-4 bottom-4 grid size-14 cursor-pointer place-items-center rounded-full bg-accent-primary shadow-lg hover:bg-accent-hover"
      onClick={() => dispatch({ type: "deck/toggle-panel", panel: "compose" })}
    >
      <span
        class="i-material-symbols:edit-square-outline-rounded c-white size-6"
        aria-hidden="true"
      />
    </button>
  );
};

/**
 * 狭い画面の上のバー。左の自分のアイコンから、アプリ全体のメニュー（検索・カラムの追加・
 * 設定など）を開く。真ん中に今のカラム、右は広い画面のカラムの見出しと同じ操作。
 * 狭い画面ではカラムごとの見出しを出さず、このバーが今のカラムの見出しを兼ねる。
 */
export const MobileTopBar: Component<{
  /** ログインしていなければ undefined。 */
  pubkey: string | undefined;
  /** 今見ているカラム。パネルを開いている間は undefined。 */
  column: ColumnDef | undefined;
  /** 一時カラム（URL で開いたもの）を見ている。設定の代わりに「カラムに残す」と閉じるを出す。 */
  temporary: boolean;
  settingsOpen: boolean;
  /** 今見ているカラムをピクチャーインピクチャーに出している。 */
  poppedOut?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <header class="flex h-12 shrink-0 items-center gap-2.5 border-primary border-b bg-primary px-3">
      <button
        type="button"
        {...tourTarget("account")}
        aria-label="メニューを開く"
        aria-haspopup="dialog"
        class="cursor-pointer rounded-full bg-transparent"
        onClick={() => dispatch({ type: "deck/open-menu" })}
      >
        <Show
          when={props.pubkey}
          fallback={
            <span class="c-accent-5 grid size-8 place-items-center rounded-full bg-secondary">
              <span
                class="i-material-symbols:menu-rounded size-5"
                aria-hidden="true"
              />
            </span>
          }
        >
          {(pubkey) => <Avatar pubkey={pubkey()} size="compact" static />}
        </Show>
      </button>
      <Show when={props.column}>
        {(column) => (
          <>
            <h1 class="flex min-w-0 flex-1 items-center gap-2 font-600 text-body">
              <ColumnIcon
                column={column()}
                class="c-secondary size-4.5 shrink-0"
                avatarClass="size-5 shrink-0 rounded-1.5"
              />
              <span class="min-w-0 truncate">
                <ColumnTitle column={column()} />
              </span>
            </h1>
            <ColumnHeaderActions
              column={column()}
              open={props.settingsOpen}
              temporary={props.temporary}
              poppedOut={props.poppedOut}
            />
          </>
        )}
      </Show>
    </header>
  );
};

const LONG_PRESS_MS = 500;

/**
 * 狭い画面の下のバー。カラムのタブだけを並べる（検索やカラムの追加は左から出るメニューに
 * ある）。カラムが少なければ幅を等分し、多ければ横に送る。見ているカラムのタブをもう一度
 * 押すと、そのカラムの先頭へ戻る。タブを長押しすると、カラムを並べ替えるパネルを開く。
 */
export const MobileTabBar: Component<{
  columns: readonly ColumnDef[];
  /** 一時カラム（URL で開いたもの）。先頭に並べる。 */
  temp: ColumnDef | undefined;
  /** 選んでいるカラムの id。パネルを開いている間は undefined。 */
  active: string | undefined;
}> = (props) => {
  const dispatch = useDispatch();
  let strip: HTMLDivElement | undefined;
  // 選んだカラムのタブを、帯の中に見えるように送る。
  createEffect(() => {
    const id = props.active;
    if (id === undefined) return;
    strip
      ?.querySelector(`[data-tab="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  });
  // タブを長押ししたら、並べ替えるためのパネルを開く。押し続けた後の click は捨てる。
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressedAt: { x: number; y: number } | undefined;
  let longPressed = false;
  const releasePress = () => {
    clearTimeout(pressTimer);
    pressTimer = undefined;
    pressedAt = undefined;
  };
  onCleanup(releasePress);
  const tab = (column: ColumnDef, id: string) => {
    const title = useColumnTitle(() => column);
    const selected = () => props.active === id;
    return (
      <button
        type="button"
        data-tab={id}
        aria-label={title()}
        aria-current={selected() ? "page" : undefined}
        // 押しやすさのため、1 つの幅は 56px を下回らせない。少ないときは等分して広げる。
        class="relative grid h-14 min-w-14 flex-1 shrink-0 cursor-pointer select-none place-items-center bg-transparent [-webkit-touch-callout:none]"
        classList={{
          "c-accent-5": selected(),
          "c-secondary": !selected(),
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || id === "temp") return;
          longPressed = false;
          pressedAt = { x: event.clientX, y: event.clientY };
          clearTimeout(pressTimer);
          pressTimer = setTimeout(() => {
            longPressed = true;
            releasePress();
            dispatch({ type: "deck/open-panel", panel: "arrange" });
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(event) => {
          // 帯を横に送り始めたら、長押しではない。
          if (
            pressedAt &&
            Math.hypot(
              event.clientX - pressedAt.x,
              event.clientY - pressedAt.y,
            ) > 8
          ) {
            releasePress();
          }
        }}
        onPointerUp={releasePress}
        onPointerCancel={releasePress}
        onPointerLeave={releasePress}
        // 長押しで出る端末のメニュー（リンクを開く、など）を出さない。
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => {
          if (longPressed) {
            longPressed = false;
            return;
          }
          dispatch(
            selected()
              ? { type: "deck/press-column", id }
              : { type: "deck/focus-column", id },
          );
        }}
      >
        <ColumnIcon
          column={column}
          class="size-7"
          avatarClass="size-7.5 rounded-1.5"
        />
        <span
          class="absolute bottom-1.5 h-0.75 w-5 rounded-full"
          classList={{ "bg-accent-primary": selected() }}
          aria-hidden="true"
        />
      </button>
    );
  };
  return (
    // 下から上がるパネルより上に描く（位置を持たせ、DOM の順で重ねる）。
    <nav
      aria-label="カラム"
      class="relative shrink-0 border-primary border-t bg-primary pb-[env(safe-area-inset-bottom)]"
    >
      {/* 帯の端が切れていることで、横に送れると分かるようにする。 */}
      <div
        ref={strip}
        {...tourTarget("columns")}
        class="scrollbar-none flex overflow-x-auto overscroll-x-contain px-1"
      >
        <Show when={props.temp}>{(column) => tab(column(), "temp")}</Show>
        <For each={props.columns}>{(column) => tab(column, column.id)}</For>
      </div>
    </nav>
  );
};
