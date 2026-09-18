import type { ColumnDef } from "@streets/core/deck/deck";
import { type Component, For, Show } from "solid-js";
import { useDispatch } from "../ui-events";
import AccountMenu from "./AccountMenu";
import { useColumnTitle } from "./ColumnTitle";
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
      class="c-secondary relative grid size-10 shrink-0 cursor-pointer place-items-center rounded-2 bg-transparent hover:bg-secondary"
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
            class="absolute right-0.5 bottom-0 font-600 text-[10px] leading-none"
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
}> = (props) => {
  const dispatch = useDispatch();
  return (
    // 行：投稿・カラムの一覧・カラムを追加・（空き）・設定・アカウント。一覧の行は
    // 中身の高さ（max-content）まで伸び、画面の高さが足りないときだけ縮んで送れる
    // ようになる。ほかの行は縮まない。
    <nav class="grid w-14 shrink-0 grid-rows-[auto_minmax(0,max-content)_auto_1fr_auto_auto] justify-items-center gap-1 bg-primary px-2 py-2.5">
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
      {/* 縦にだけ送る。横は隠す（auto のままだと、横のはみ出しでスクロールバーが出る）。 */}
      <div class="flex min-h-0 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden">
        <For each={props.columns}>
          {(column, index) => <ColumnButton column={column} index={index()} />}
        </For>
      </div>
      <button
        type="button"
        aria-label="カラムを追加"
        class="c-secondary grid size-10 cursor-pointer place-items-center rounded-2 bg-transparent hover:bg-secondary"
        onClick={() =>
          dispatch({ type: "deck/open-panel", panel: "add-column" })
        }
      >
        <span
          class="i-material-symbols:add-rounded size-5.5"
          aria-hidden="true"
        />
      </button>
      <span aria-hidden="true" />
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

export const TabBar: Component<{ pubkey: string; onLogout: () => void }> = (
  props,
) => {
  const dispatch = useDispatch();
  return (
    <nav class="flex shrink-0 items-center justify-around bg-primary px-5 pb-2.5">
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
