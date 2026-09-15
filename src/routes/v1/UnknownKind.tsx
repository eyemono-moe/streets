import type { Component } from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";

/**
 * 200 "文字" で切り詰める。`slice()` は UTF-16 単位で切るため絵文字の
 * サロゲートペアを割りうるので、コードポイント単位の `Array.from` を使う。
 */
const truncate = (content: string, max: number): string =>
  Array.from(content).slice(0, max).join("");

/**
 * 未登録 kind の詳細表示。`rendererFor` が何も見つけられなくても
 * `EventView` が描画を続けられることを保証する fallback。
 */
export const UnknownKindFull: Component<{ event: NostrEvent }> = (props) => (
  <div data-testid="unknown-kind" class="space-y-1 p-2 text-body">
    <p class="c-secondary text-caption">kind:{props.event.kind}</p>
    <p>未対応の種類です</p>
    <p
      data-testid="unknown-kind-content"
      class="whitespace-pre-wrap break-words"
    >
      {truncate(props.event.content, 200)}
    </p>
  </div>
);

/** 未登録 kind の小型表示。kind 番号のみ。 */
export const UnknownKindCompact: Component<{ event: NostrEvent }> = (props) => (
  <p data-testid="unknown-kind" class="c-secondary text-caption">
    kind:{props.event.kind}
  </p>
);
