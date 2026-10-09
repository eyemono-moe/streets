import { columnForNoteRef } from "@streets/core/deck/open-event";
import type { EventRef } from "@streets/core/nostr/event-refs";
import type { Nip19Ref } from "@streets/core/nostr/nip19";
import { quotePreview } from "@streets/core/view/quote-preview";
import { type Component, Match, Show, Switch } from "solid-js";
import { useDispatch } from "../ui-events";
import Name from "./Name";
import { useEvent } from "./use-event";

const buttonClass =
  "bg-transparent p-0 text-left enabled:cursor-pointer enabled:hover:underline";

/**
 * 本文の中にある note / nevent の参照を、誰のどの投稿かが分かる 1 行にする。
 * カード（`EventRefView`）にしないのは、本文の流れの中に置くため。投稿を丸ごと描くと
 * 高密度の 1 行に収まらない。
 */
const QuoteChip: Component<{
  ref: Extract<Nip19Ref, { kind: "note" | "nevent" }>;
  raw: string;
  short: string;
}> = (props) => {
  const dispatch = useDispatch();
  const target = (): EventRef => ({
    form: "id",
    id: props.ref.id,
    ...(props.ref.kind === "nevent" && props.ref.author
      ? { pubkey: props.ref.author }
      : {}),
  });
  const lookup = useEvent(target);
  const open = () =>
    dispatch({ type: "stack/open", column: columnForNoteRef(props.ref) });

  return (
    <Switch>
      <Match
        when={(() => {
          const current = lookup();
          return current.phase === "found" && current.event;
        })()}
      >
        {(event) => (
          <button
            type="button"
            title={props.raw}
            class={`${buttonClass} inline-flex max-w-full min-w-0 items-center gap-1 rounded-1 bg-tertiary px-1 align-bottom`}
            onClick={open}
          >
            <span
              class="i-material-symbols:format-quote-rounded size-4 shrink-0 c-secondary"
              aria-hidden="true"
            />
            <span class="min-w-0 shrink truncate font-600">
              <Name pubkey={event().pubkey} />
            </span>
            <Show when={quotePreview(event())}>
              {(text) => (
                <span class="min-w-0 flex-1 truncate c-secondary">
                  {text()}
                </span>
              )}
            </Show>
          </button>
        )}
      </Match>
      <Match when={lookup().phase === "missing"}>
        <button
          type="button"
          class={`${buttonClass} text-link`}
          title={props.raw}
          onClick={open}
        >
          {props.short}
        </button>
      </Match>
      <Match when={true}>
        {/* 取得中は失敗に見せない。リンクの色にせず、押せることだけ残す。 */}
        <button
          type="button"
          class={`${buttonClass} c-secondary`}
          title={props.raw}
          onClick={open}
        >
          {props.short}
        </button>
      </Match>
    </Switch>
  );
};

export default QuoteChip;
