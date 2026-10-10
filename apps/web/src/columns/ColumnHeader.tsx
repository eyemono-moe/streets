import type { ColumnDef } from "@streets/core/deck/deck";
import { type Component, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { columnPartOpen } from "../column-part-memory";
import ColumnIcon from "../deck/ColumnIcon";
import ColumnTitle from "../deck/ColumnTitle";
import { pipSupported } from "../deck/pip-window";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import { columnView } from "./column-views";

export type StackedColumn = {
  backTo: ColumnDef;
};

/**
 * カラムの見出しの右側。カラムの種類ごとの操作に続けて、一時カラムなら
 * 「カラムに残す」と閉じる、それ以外ならカラムの設定。広い画面のカラムの見出しと、
 * 狭い画面の上のバーの両方がこれを使う。
 */
export const ColumnHeaderActions: Component<{
  column: ColumnDef;
  /** カラムの設定を開いている。 */
  open: boolean;
  temporary?: boolean;
  /** ピクチャーインピクチャーに出して、その中に描いている。 */
  poppedOut?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <>
      <Show when={props.column.source.kind === "user" && !props.temporary}>
        <IconButton
          icon={
            columnPartOpen(props.column.id, "profile")
              ? "i-material-symbols:expand-less-rounded"
              : "i-material-symbols:expand-more-rounded"
          }
          label={
            columnPartOpen(props.column.id, "profile")
              ? "ユーザー詳細を隠す"
              : "ユーザー詳細を表示"
          }
          aria-expanded={columnPartOpen(props.column.id, "profile")}
          aria-controls={`column-profile-${props.column.id}`}
          onClick={() =>
            dispatch({
              type: "column-part/set-open",
              column: props.column.id,
              part: "profile",
              open: !columnPartOpen(props.column.id, "profile"),
            })
          }
        />
      </Show>
      <Show when={columnView(props.column.source).HeaderActions}>
        {(actions) => (
          <Dynamic component={actions()} source={props.column.source} />
        )}
      </Show>
      <Show when={props.temporary}>
        <>
          <Button
            size="sm"
            icon="i-material-symbols:bookmark-outline-rounded"
            onClick={() => dispatch({ type: "deck/keep-temp" })}
          >
            カラムに残す
          </Button>
          <IconButton
            icon="i-material-symbols:close-rounded"
            label="閉じる"
            onClick={() => dispatch({ type: "deck/close-temp" })}
          />
        </>
      </Show>
      <Show when={!props.temporary && pipSupported()}>
        <Show
          when={props.poppedOut}
          fallback={
            <IconButton
              icon="i-material-symbols:picture-in-picture-alt-outline-rounded"
              label="ピクチャーインピクチャーで開く"
              onClick={() =>
                dispatch({ type: "deck/pop-out", id: props.column.id })
              }
            />
          }
        >
          <IconButton
            icon="i-material-symbols:pip-exit-outline-rounded"
            label="デッキに戻す"
            active
            onClick={() => dispatch({ type: "deck/pop-in" })}
          />
        </Show>
      </Show>
      {/* カラムの設定はデッキの横に開くので、ピクチャーインピクチャーからは開かない。 */}
      <Show when={!props.temporary && !props.poppedOut}>
        <IconButton
          icon={
            props.open
              ? "i-material-symbols:close-rounded"
              : "i-material-symbols:more-horiz"
          }
          label="カラムの設定"
          aria-expanded={props.open}
          onClick={() =>
            dispatch({ type: "deck/toggle-settings", id: props.column.id })
          }
        />
      </Show>
    </>
  );
};

export const ColumnHeader: Component<{
  column: ColumnDef;
  open: boolean;
  /** 掴んで並べ替えられる。掴んだ後の動きは、並べている側（デッキ）が受け持つ。 */
  grip?: boolean;
  temporary?: boolean;
  poppedOut?: boolean;
  onTitle: () => void;
}> = (props) => {
  const meta = () => columnView(props.column.source).meta(props.column.source);
  return (
    <header
      class="flex h-11.25 shrink-0 items-center gap-2.5 border-primary border-b-1 bg-primary px-3"
      classList={{ "cursor-grab": props.grip === true }}
      data-column-grip={props.grip === true ? "" : undefined}
    >
      <ColumnIcon
        column={props.column}
        class="c-secondary size-4.5 shrink-0"
        avatarClass="size-5 shrink-0 rounded-1.5"
      />
      <button
        type="button"
        title="先頭へ戻る"
        class="flex min-w-0 flex-1 cursor-pointer flex-col bg-transparent p-0 text-left"
        onClick={() => props.onTitle()}
      >
        <h2 class="w-full truncate font-600 text-body">
          <ColumnTitle column={props.column} />
        </h2>
        <p class="c-secondary w-full truncate text-caption">
          {meta().subtitle}
        </p>
      </button>
      {/* 操作のボタンからは掴まない。押したつもりが、少し動いただけで並べ替えになる。 */}
      <div data-no-grip class="contents">
        <ColumnHeaderActions
          column={props.column}
          open={props.open}
          temporary={props.temporary}
          poppedOut={props.poppedOut}
        />
      </div>
    </header>
  );
};

export const StackedColumnHeader: Component<{
  column: ColumnDef;
  stacked: StackedColumn;
  onTitle: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- キーボードからは題名のボタンで先頭へ戻る
    <header
      class="flex h-11.25 shrink-0 items-center gap-2.5 border-primary border-b-1 bg-primary px-3"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) {
          return;
        }
        props.onTitle();
      }}
    >
      <IconButton
        icon="i-material-symbols:chevron-left-rounded"
        label="戻る"
        onClick={() => dispatch({ type: "stack/back" })}
      />
      <button
        type="button"
        title="先頭へ戻る"
        class="flex min-w-0 flex-1 cursor-pointer flex-col bg-transparent p-0 text-left"
        onClick={() => props.onTitle()}
      >
        <h2 class="w-full truncate font-600 text-body">
          <ColumnTitle column={props.column} />
        </h2>
        <p class="c-secondary w-full truncate text-caption">
          <ColumnTitle column={props.stacked.backTo} />
          に戻る
        </p>
      </button>
      <Show when={columnView(props.column.source).HeaderActions}>
        {(actions) => (
          <Dynamic component={actions()} source={props.column.source} />
        )}
      </Show>
      <IconButton
        icon="i-material-symbols:open-in-new-rounded"
        label="デッキのカラムとして開く"
        onClick={() => {
          dispatch({ type: "stack/back" });
          dispatch({ type: "deck/add-column", column: props.column });
        }}
      />
    </header>
  );
};
