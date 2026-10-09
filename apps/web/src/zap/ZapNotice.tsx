import { buildThreadColumn } from "@streets/core/deck/column-presets";
import type { NostrEvent } from "@streets/core/nostr/event";
import { parseZapReceipt } from "@streets/core/zap/zap-receipt";
import { type Component, Show } from "solid-js";
import Avatar from "../note/Avatar";
import { EventRefView, type EventSize } from "../note/Event";
import EventTime from "../note/EventTime";
import QuoteBox from "../note/QuoteBox";
import UserLink from "../note/UserLink";
import { useDispatch } from "../ui-events";

const isInteractive = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest("a, button, input, textarea, [role='button']") !== null;

const formatSats = (msat: number) =>
  `${Math.floor(msat / 1000).toLocaleString("ja-JP")} sats`;

/**
 * 通知に流れる Zap。誰から・いくら・一言と、Zap された投稿を出す。1 件ずつ出し、
 * リアクションのようにはまとめない（一言が添えられることが多いため）。受領が
 * 本物かは、通知カラムが並べる前に確かめてある。
 */
const ZapNotice: Component<{
  receipt: NostrEvent;
  size: EventSize;
  expandMedia?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  // 宛先は並べる前に確かめてあるので、ここでは受領に書かれた宛先で読む。
  const zap = () =>
    parseZapReceipt(props.receipt, {
      recipient: props.receipt.tags.find((tag) => tag[0] === "p")?.[1] ?? "",
    });
  const at = () => new Date(props.receipt.created_at * 1000);

  return (
    <Show when={zap()}>
      {(current) => (
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- キーボードでスレッドを開く経路はまだ無い（押せるのはポインタだけ）
        <article
          class="flex flex-col bg-primary"
          classList={{ "cursor-pointer": current().targetId !== undefined }}
          onClick={(event) => {
            const targetId = current().targetId;
            if (!targetId || isInteractive(event.target)) return;
            if (
              event.target instanceof Element &&
              event.target.closest("article") !== event.currentTarget
            ) {
              return;
            }
            dispatch({
              type: "stack/open",
              column: buildThreadColumn(targetId),
              from: targetId,
            });
          }}
        >
          <div
            class="offscreen-skip flex flex-col gap-2"
            classList={{
              "p-3": props.size === "normal",
              "p-2": props.size === "compact",
            }}
          >
            {/* ゆったりは 1 行目に誰から（投稿の見出しと同じ形）、2 行目に金額を大きく出す。
                高密度は金額を同じ行に詰め、入り切らないときは名前から縮める。 */}
            <div class="flex min-w-0 items-center gap-2">
              <span
                class="i-material-symbols:bolt-rounded c-accent-5 shrink-0"
                classList={{
                  "size-5": props.size === "normal",
                  "size-3.5": props.size === "compact",
                }}
                aria-hidden="true"
              />
              <Show when={props.size === "normal"}>
                <Avatar pubkey={current().sender} size="compact" />
              </Show>
              <p
                class="c-secondary flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap"
                classList={{
                  "flex-1 text-body": props.size === "normal",
                  "text-[14px]": props.size === "compact",
                }}
              >
                <UserLink
                  pubkey={current().sender}
                  class="c-primary min-w-6 truncate font-600"
                />
                <span class="shrink-0">から</span>
              </p>
              {/* 金額は切らない。桁が欠けると別の額に読めてしまう。 */}
              <Show when={props.size === "compact"}>
                <span class="c-accent-5 -ml-1 flex-1 shrink-0 whitespace-nowrap text-[14px] font-700">
                  {formatSats(current().amountMsat)}
                </span>
              </Show>
              <EventTime class="shrink-0" at={at()} />
            </div>
            <Show when={props.size === "normal"}>
              <p class="c-accent-5 text-h3 font-700">
                {formatSats(current().amountMsat)}
              </p>
            </Show>
            <Show when={current().message}>
              {(message) => (
                <p
                  class="c-primary break-anywhere whitespace-pre-wrap"
                  classList={{
                    "text-body": props.size === "normal",
                    "text-[14px]": props.size === "compact",
                  }}
                >
                  {message()}
                </p>
              )}
            </Show>
            <Show when={current().targetId}>
              {(targetId) => (
                <QuoteBox>
                  <EventRefView
                    target={{ form: "id", id: targetId() }}
                    size="compact"
                    expandMedia={props.expandMedia}
                  />
                </QuoteBox>
              )}
            </Show>
          </div>
        </article>
      )}
    </Show>
  );
};

export default ZapNotice;
