import type { ColumnDef } from "@streets/core/deck/deck";
import type { DeckPanel } from "@streets/core/deck/deck-ui";
import {
  type Component,
  For,
  Show,
  createEffect,
  createSignal,
} from "solid-js";
import { ariaKeyShortcuts, shortcutTitle } from "../keymap";
import { tourTarget } from "../tour/DeckTour";
import { useDispatch } from "../ui-events";
import AccountMenu from "./AccountMenu";
import ColumnIcon from "./ColumnIcon";
import { useColumnTitle } from "./ColumnTitle";
import ColumnTitle from "./ColumnTitle";
import FeedbackLink, { FeedbackDialog, feedbackHref } from "./FeedbackLink";

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
        {(n) => (
          <span
            class="absolute right-1 bottom-1 font-600 text-[10px] leading-none"
            aria-hidden="true"
          >
            {n()}
          </span>
        )}
      </Show>
    </button>
  );
};

export const Sidebar: Component<{
  pubkey: string;
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
    // 行：投稿・探す／カラムの一覧（＋追加）／（空き）・フィードバック・設定・
    // アカウント。一覧の行だけが縮んで送れるようになり、ほかの行は縮まない。
    <nav class="b-r-1 grid w-14 shrink-0 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto_auto] justify-items-center gap-1 border-primary bg-primary px-2 py-2.5">
      <button
        type="button"
        {...tourTarget("compose")}
        aria-label="投稿パネルを開く"
        title={shortcutTitle("compose")}
        aria-keyshortcuts={ariaKeyShortcuts("compose")}
        aria-expanded={props.panel === "compose"}
        class="grid size-10 cursor-pointer place-items-center rounded-2 bg-accent-primary hover:bg-accent-hover"
        onClick={() =>
          dispatch({ type: "deck/toggle-panel", panel: "compose" })
        }
      >
        <span
          class="i-material-symbols:edit-square-outline-rounded c-white size-5.5"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        aria-label="検索パネルを開く"
        title={shortcutTitle("search")}
        aria-keyshortcuts={ariaKeyShortcuts("search")}
        aria-expanded={props.panel === "search"}
        class="grid size-10 cursor-pointer place-items-center rounded-2 hover:bg-secondary"
        classList={{
          "c-primary bg-secondary": props.panel === "search",
          "c-secondary bg-transparent": props.panel !== "search",
        }}
        onClick={() => dispatch({ type: "deck/toggle-panel", panel: "search" })}
      >
        <span
          class="i-material-symbols:search-rounded size-5.5"
          aria-hidden="true"
        />
      </button>
      {/*
        カラムの一覧と「追加」を 1 つの送れる帯にする。横は隠す（auto のままだと
        横のはみ出しでスクロールバーが出る）。上下の余白は、フォントの違いで
        中身が数 px はみ出しても送れる状態にしないため。
      */}
      <div class="flex min-h-0 w-full flex-col items-center gap-1 self-start overflow-y-auto overflow-x-hidden py-1">
        <For each={props.columns}>
          {(column, index) => (
            <ColumnButton
              column={column}
              index={index()}
              numbers={props.numbers}
            />
          )}
        </For>
        {/* 一覧が長くても押せるよう、帯の下に貼り付けておく。 */}
        <button
          type="button"
          {...tourTarget("add-column")}
          aria-label="カラムを追加"
          title={shortcutTitle("add-column")}
          aria-keyshortcuts={ariaKeyShortcuts("add-column")}
          aria-expanded={props.panel === "add-column"}
          class="sticky bottom-0 grid size-10 shrink-0 cursor-pointer place-items-center rounded-2 hover:bg-secondary"
          classList={{
            "c-primary bg-secondary": props.panel === "add-column",
            "c-secondary bg-primary": props.panel !== "add-column",
          }}
          onClick={() =>
            dispatch({ type: "deck/toggle-panel", panel: "add-column" })
          }
        >
          <span
            class="i-material-symbols:add-rounded size-5.5"
            aria-hidden="true"
          />
        </button>
      </div>
      <FeedbackLink template={props.feedbackUrl} size="sidebar" />
      <button
        type="button"
        aria-label="設定"
        class="c-secondary grid size-10 cursor-pointer place-items-center rounded-2 bg-transparent hover:bg-secondary"
        onClick={() => dispatch({ type: "deck/open-settings" })}
      >
        <span
          class="i-material-symbols:settings-outline-rounded size-5.5"
          aria-hidden="true"
        />
      </button>
      <AccountMenu pubkey={props.pubkey} onLogout={props.onLogout} />
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
 * 狭い画面の上のバー。左の自分のアイコンから、設定・フィードバック・ログアウトを
 * 開く（下のバーはカラムの切り替えに使うので、ここへ寄せる）。真ん中に今のカラム、
 * 右にそのカラムの設定。
 */
export const MobileTopBar: Component<{
  pubkey: string;
  /** 今見ているカラム。パネルを開いている間は undefined。 */
  column: ColumnDef | undefined;
  /** 一時カラム（URL で開いたもの）を見ている。設定は持たない。 */
  temporary: boolean;
  settingsOpen: boolean;
  onLogout: () => void;
  feedbackUrl?: string | null;
}> = (props) => {
  const dispatch = useDispatch();
  const [feedbackOpen, setFeedbackOpen] = createSignal(false);
  const href = () => feedbackHref(props.feedbackUrl);
  return (
    <header class="flex h-12 shrink-0 items-center gap-2.5 border-primary border-b bg-primary px-3">
      <AccountMenu
        pubkey={props.pubkey}
        onLogout={props.onLogout}
        onFeedback={href() ? () => setFeedbackOpen(true) : undefined}
      />
      <Show when={href()}>
        {(url) => (
          <FeedbackDialog
            href={url()}
            open={feedbackOpen()}
            onClose={() => setFeedbackOpen(false)}
          />
        )}
      </Show>
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
            <Show when={!props.temporary}>
              <button
                type="button"
                aria-label="カラムの設定"
                aria-expanded={props.settingsOpen}
                class="grid size-9 shrink-0 cursor-pointer place-items-center rounded-2 hover:bg-secondary"
                classList={{
                  "c-primary bg-secondary": props.settingsOpen,
                  "c-secondary bg-transparent": !props.settingsOpen,
                }}
                onClick={() =>
                  dispatch({ type: "deck/toggle-settings", id: column().id })
                }
              >
                <span
                  class="i-material-symbols:more-horiz size-5"
                  aria-hidden="true"
                />
              </button>
            </Show>
          </>
        )}
      </Show>
    </header>
  );
};

/**
 * 狭い画面の下のバー。広い画面のサイドバーと同じく「探す｜カラム｜足す」の順に
 * 並べ、カラムの帯だけを横に送れるようにする。
 */
export const MobileTabBar: Component<{
  columns: readonly ColumnDef[];
  /** 一時カラム（URL で開いたもの）。先頭に並べる。 */
  temp: ColumnDef | undefined;
  /** 選んでいるカラムの id。パネルを開いている間は undefined。 */
  active: string | undefined;
  panel: DeckPanel | undefined;
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
  const tab = (column: ColumnDef, id: string) => {
    const title = useColumnTitle(() => column);
    const selected = () => props.active === id;
    return (
      <button
        type="button"
        data-tab={id}
        aria-label={title()}
        aria-current={selected() ? "page" : undefined}
        class="relative grid size-11 shrink-0 cursor-pointer place-items-center bg-transparent"
        classList={{
          "c-accent-5": selected(),
          "c-secondary": !selected(),
        }}
        onClick={() => dispatch({ type: "deck/focus-column", id })}
      >
        <ColumnIcon
          column={column}
          class="size-6"
          avatarClass="size-6.5 rounded-1.5"
        />
        <span
          class="absolute bottom-1 h-0.75 w-4 rounded-full"
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
      class="relative flex shrink-0 items-center border-primary border-t bg-primary pb-[env(safe-area-inset-bottom)]"
    >
      <button
        type="button"
        aria-label="検索パネルを開く"
        title={shortcutTitle("search")}
        aria-keyshortcuts={ariaKeyShortcuts("search")}
        aria-expanded={props.panel === "search"}
        class="grid h-12 w-12 shrink-0 cursor-pointer place-items-center bg-transparent"
        classList={{
          "c-accent-5": props.panel === "search",
          "c-secondary": props.panel !== "search",
        }}
        onClick={() => dispatch({ type: "deck/toggle-panel", panel: "search" })}
      >
        <span
          class="i-material-symbols:search-rounded size-6"
          aria-hidden="true"
        />
      </button>
      {/* 帯の端が切れていることで、横に送れると分かるようにする。 */}
      <div
        ref={strip}
        {...tourTarget("columns")}
        class="scrollbar-none flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overscroll-x-contain border-primary border-x px-1"
      >
        <Show when={props.temp}>{(column) => tab(column(), "temp")}</Show>
        <For each={props.columns}>{(column) => tab(column, column.id)}</For>
      </div>
      <button
        type="button"
        {...tourTarget("add-column")}
        aria-label="カラムを追加"
        title={shortcutTitle("add-column")}
        aria-keyshortcuts={ariaKeyShortcuts("add-column")}
        aria-expanded={props.panel === "add-column"}
        class="grid h-12 w-12 shrink-0 cursor-pointer place-items-center bg-transparent"
        classList={{
          "c-accent-5": props.panel === "add-column",
          "c-secondary": props.panel !== "add-column",
        }}
        onClick={() =>
          dispatch({ type: "deck/toggle-panel", panel: "add-column" })
        }
      >
        <span
          class="i-material-symbols:add-rounded size-6"
          aria-hidden="true"
        />
      </button>
    </nav>
  );
};
