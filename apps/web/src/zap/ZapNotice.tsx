import { buildThreadColumn } from "@streets/core/deck/column-presets";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  formatEventTime,
  formatEventTimeFull,
} from "@streets/core/view/format-time";
import { parseZapReceipt } from "@streets/core/zap/zap-receipt";
import { type Component, Show } from "solid-js";
import Avatar from "../note/Avatar";
import { EventRefView, type EventSize } from "../note/Event";
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
        // biome-ignore lint/a11y/useKeyWithClickEvents: キーボードでスレッドを開く経路はまだ無い（押せるのはポインタだけ）
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
            });
          }}
        >
          <div
            class="offscreen-skip flex"
            classList={{
              "gap-3 p-3": props.size === "normal",
              "gap-2 p-2": props.size === "compact",
            }}
          >
            <span
              class="i-material-symbols:bolt-rounded c-accent-5 shrink-0"
              classList={{
                "mt-1.5 size-5": props.size === "normal",
                "mt-0.5 size-3.5": props.size === "compact",
              }}
              aria-hidden="true"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              {/* 1 行目は誰から（投稿の見出しと同じ形）、2 行目に金額。1 行に詰めると狭い
                  カラムで名前か金額のどちらかが切れる。 */}
              <div class="flex min-w-0 items-center gap-2">
                <Show when={props.size === "normal"}>
                  <Avatar pubkey={current().sender} size="compact" />
                </Show>
                <p
                  class="c-secondary flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap"
                  classList={{
                    "text-body": props.size === "normal",
                    "text-[14px]": props.size === "compact",
                  }}
                >
                  <UserLink
                    pubkey={current().sender}
                    class="c-primary min-w-0 truncate font-600"
                  />
                  <span class="shrink-0">から</span>
                </p>
                <time
                  class="c-secondary shrink-0 text-caption"
                  datetime={at().toISOString()}
                  title={formatEventTimeFull(at())}
                >
                  {formatEventTime(at(), new Date())}
                </time>
              </div>
              <p
                class="c-accent-5 font-700"
                classList={{
                  "text-h3": props.size === "normal",
                  "text-body": props.size === "compact",
                }}
              >
                {formatSats(current().amountMsat)}
              </p>
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
                  <div class="overflow-hidden rounded-2 border border-primary">
                    <EventRefView
                      target={{ id: targetId() }}
                      size="compact"
                      expandMedia={props.expandMedia}
                    />
                  </div>
                )}
              </Show>
            </div>
          </div>
        </article>
      )}
    </Show>
  );
};

export default ZapNotice;
