import type { RelayFilter, RelayUrl } from "../relay/relay-connection";

export type NostrSource = {
  type: "nostr";
  filters: RelayFilter[];
  /** 指定した場合は Outbox ルーティングをバイパスする */
  relays?: RelayUrl[];
};

/** NIP-11。Nostr イベントですらない供給元 */
export type RelayInfoSource = {
  type: "relay-info";
  url: RelayUrl;
};

export type Source = NostrSource | RelayInfoSource;

export type Order = "created-at-desc" | "created-at-asc";

/**
 * セクション自身のリストについてのみ語る。
 * レンダラの遅延取得は含めない。
 */
export type SectionStatus = {
  phase: "initial" | "streaming" | "settled";
  incomplete?: {
    unreachableRelays: number;
    unroutableAuthors: number;
    uncoveredAuthors: number;
  };
};

/** 性能予算 */
export const MAX_ITEMS_PER_SECTION = 200;

/**
 * 流れてくるカラムの 1 ページ。1 画面に見えるのは 7〜10 件なので、5 画面ぶん
 * ほど送ったら次を取れば足りる。最初もこの件数だけ取る。
 */
export const PAGE_SIZE = 50;

/**
 * 古い投稿を取り足していったときの上限。これ以上は持たない（メモリと描く要素の
 * 数を抑える）。
 */
export const MAX_PAGED_ITEMS = 500;

/**
 * 古い投稿の取り足し：`waiting` は最初のページを待っている、`idle` は取れる、`loading` は
 * 取っている、`exhausted` はもう無い（上限に着いたときも）。
 */
export type Paging = "waiting" | "idle" | "loading" | "exhausted";

/**
 * 同じものを読む source か。カラムの題名や幅を変えただけで source を作り直すと、
 * 中身が同じでも購読を張り直して取り直しになる。値で比べ、同じなら張り直さない。
 * フィルタのキーの順は作り手ごとに揃っているので、JSON の文字列で比べて足りる。
 */
export const sameSource = (left: NostrSource, right: NostrSource): boolean =>
  left === right || JSON.stringify(left) === JSON.stringify(right);
