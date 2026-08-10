import type { Component } from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";

/**
 * `content` を 200 "文字" で切り詰める。`content.slice(0, 200)` は UTF-16
 * コードユニット単位で切るため、絵文字などのサロゲートペアを割って
 * 片割れの不正な文字を残しうる (表示が壊れるだけでなく、`data-testid` で
 * 拾った文字列の比較が入力によって不安定になる)。`Array.from` はコード
 * ポイント単位で分割するのでペアを割らない。
 */
const truncate = (content: string, max: number): string =>
  Array.from(content).slice(0, max).join("");

/**
 * 未登録 kind の詳細表示。ADR-0003/ADR-0004 が要求する fallback ——
 * `rendererFor` が何も見つけられなくても `EventView` は描画を続けられる
 * ことを保証する (spec 9 節)。
 */
export const UnknownKindFull: Component<{ event: NostrEvent }> = (props) => (
  <div data-testid="unknown-kind" class="space-y-1 text-sm">
    <p class="text-alpha-600 text-xs">kind:{props.event.kind}</p>
    <p>未対応の種類です</p>
    <p
      data-testid="unknown-kind-content"
      class="whitespace-pre-wrap break-words"
    >
      {truncate(props.event.content, 200)}
    </p>
  </div>
);

/** 未登録 kind の小型表示。kind 番号のみ (spec 6 節の表)。 */
export const UnknownKindCompact: Component<{ event: NostrEvent }> = (props) => (
  <p data-testid="unknown-kind" class="text-alpha-600 text-xs">
    kind:{props.event.kind}
  </p>
);
