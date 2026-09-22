import type { ColumnDef } from "@streets/core/deck/deck";
import { type Component, For, Show } from "solid-js";
import { useDispatch } from "../ui-events";
import AccountMenu from "./AccountMenu";
import { useColumnTitle } from "./ColumnTitle";
import FeedbackLink from "./FeedbackLink";
import { columnMeta } from "./column-meta";

/**
 * デッキのカラムを 1 つずつ並べるボタン。押すと、そのカラムが画面に収まるよう
 * 送る（狭い画面ではそのタブを選ぶ）。1〜9 番目は数字キーでも同じ。
 */
const ColumnButton: Component<{ column: ColumnDef; index: number }> = (
  props,
) => {
  const dispatch = useDispatch();
  const title = useColumnTitle(() => props.column);
  const number = () => (props.index < 9 ? props.index + 1 : undefined);
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
      <span
        class={`${columnMeta(props.column).icon} size-5.5`}
        aria-hidden="true"
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
        aria-label="ノートを書く"
        class="grid size-10 cursor-pointer place-items-center rounded-2 bg-accent-primary hover:bg-accent-hover"
        onClick={() => dispatch({ type: "deck/open-panel", panel: "compose" })}
      >
        <span
          class="i-material-symbols:edit-square-outline-rounded c-white size-5.5"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        aria-label="探す"
        class="c-secondary grid size-10 cursor-pointer place-items-center rounded-2 bg-transparent hover:bg-secondary"
        onClick={() => dispatch({ type: "deck/open-panel", panel: "search" })}
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
          {(column, index) => <ColumnButton column={column} index={index()} />}
        </For>
        {/* 一覧が長くても押せるよう、帯の下に貼り付けておく。 */}
        <button
          type="button"
          aria-label="カラムを追加"
          class="c-secondary sticky bottom-0 grid size-10 shrink-0 cursor-pointer place-items-center rounded-2 bg-primary hover:bg-secondary"
          onClick={() =>
            dispatch({ type: "deck/open-panel", panel: "add-column" })
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
      aria-label="ノートを書く"
      class="absolute right-4 bottom-20 grid size-14 cursor-pointer place-items-center rounded-full bg-accent-primary shadow-lg hover:bg-accent-hover"
      onClick={() => dispatch({ type: "deck/open-panel", panel: "compose" })}
    >
      <span
        class="i-material-symbols:edit-square-outline-rounded c-white size-6"
        aria-hidden="true"
      />
    </button>
  );
};

export const TabBar: Component<{
  pubkey: string;
  onLogout: () => void;
  feedbackUrl?: string | null;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <nav class="flex shrink-0 items-center justify-around bg-primary px-5 pb-2.5">
      <button
        type="button"
        aria-label="探す"
        class="c-secondary grid h-11 w-11 cursor-pointer place-items-center bg-transparent"
        onClick={() => dispatch({ type: "deck/open-panel", panel: "search" })}
      >
        <span
          class="i-material-symbols:search-rounded size-6"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        aria-label="カラムを追加"
        class="c-secondary grid h-11 w-11 cursor-pointer place-items-center bg-transparent"
        onClick={() =>
          dispatch({ type: "deck/open-panel", panel: "add-column" })
        }
      >
        <span
          class="i-material-symbols:add-rounded size-6"
          aria-hidden="true"
        />
      </button>
      <FeedbackLink template={props.feedbackUrl} size="tab" />
      <button
        type="button"
        aria-label="設定"
        class="c-secondary grid h-11 w-11 cursor-pointer place-items-center bg-transparent"
        onClick={() => dispatch({ type: "deck/open-settings" })}
      >
        <span
          class="i-material-symbols:settings-outline-rounded size-6"
          aria-hidden="true"
        />
      </button>
      <AccountMenu pubkey={props.pubkey} onLogout={props.onLogout} />
    </nav>
  );
};
