import { FALLBACK_RELAYS } from "../read/default-relays";
import type { NostrSource } from "../read/source";
import type { RelayUrl } from "../relay/relay-connection";
import { type ColumnSource, NOTIFICATION_KINDS } from "./deck";

/**
 * `followees` を遅延アクセサにしているのは、呼び出し側 (`DeckColumn.tsx`)
 * が `createMemo` の中でこれを呼ぶため —— 引数として即時評価される値
 * (`{ followees: props.followees() }`) だと、それを組み立てるためだけに
 * `props.followees()` を呼ぶ必要があり、`literal` 列であっても
 * `warmUpRouting` の結果 (フォローリストのリソース) を毎回読むことになる。
 * Solid の `createMemo` は「実行中に読んだシグナル」を機械的に依存として
 * 記録するので、これ 1 つで `literal` 列まで warmUp の解決に巻き込まれ、
 * ウォームアップが settle するたびに全カラムの `source` memo が再計算 →
 * `createSection` の `createEffect` が古い `SectionReader` を破棄して
 * 新しいものを張り直す、という再購読が起きる (最終レビュー Important 1)。
 * `followees` を呼び出すのを `kind === "followees"` の分岐の中だけに
 * 限定すれば、その分岐を実際に評価したときだけ依存が生まれる。
 */
export type ResolveContext = {
  followees: () => readonly string[];
  /**
   * 現在の閲覧者。`notifications` の `#p` の値になる。
   *
   * 遅延アクセサにしないのは `followees` / `readRelays` と違ってこれが
   * 「変わる値」ではないため —— ログイン中は固定で、同期的に読めるので、
   * どの分岐で読んでも再購読を招かない。
   */
  viewer: string;
  /**
   * 閲覧者の NIP-65 read リレー。`followees` と同じ理由で遅延アクセサに
   * している —— これを `kind: "notifications"` の分岐の外で呼ぶと、
   * `literal` 列の解決でも warmUp のリソースを読んだことになり、
   * ウォームアップが settle するたびに全カラムが再購読される。
   */
  readRelays: () => readonly RelayUrl[];
};

/**
 * デッキが保存している「意図」(`ColumnSource`) を、読み取り層が理解する
 * 「クエリ」(`NostrSource`) へ変える唯一の場所。
 *
 * 分けている理由は、フォローリストのような**変わる値をデッキに焼き込まない**
 * ため。焼き込むと、誰かをフォローしてもホーム列はデッキを作り直すまで
 * 永久に反映されない (2026-08-06 時点の実装がまさにそうだった)。
 */
export const resolveSource = (
  source: ColumnSource,
  context: ResolveContext,
): NostrSource => {
  if (source.kind === "followees") {
    // フォロー 0 人でも `authors` を落とさない —— `{ kinds: [1] }` は
    // NIP-01 では「誰の投稿でもよい」であり、本物のリレーへの無制限購読に
    // なる。空配列は「該当者なし」であって「無制限」ではない。
    return {
      type: "nostr",
      filters: [{ kinds: source.kinds, authors: [...context.followees()] }],
    };
  }

  if (source.kind === "notifications") {
    // `#p` フィルタには `authors` が無いので Outbox でルーティングできない
    // (`query-plan.ts`: 著者を指定していないフィルタは fallback へ同報)。
    // NIP-65 は publish 側に「`#p` で指した相手の read リレーへも送る」を
    // SHOULD で求めているので、待ち受けるべきはそこ ——
    // `docs/design/notification-relay-selection.md` に原文と各クライアントの
    // 実態を残してある。
    const relays = context.readRelays();
    return {
      type: "nostr",
      filters: [{ kinds: [...NOTIFICATION_KINDS], "#p": [context.viewer] }],
      // 空を素通しにしない。`authors: []` と同じ罠で、空配列は「該当なし」
      // であって「未指定」ではない —— `relays: []` は「リレー 0 本の明示
      // 指定」として扱われ、通知が永久に来ない。
      relays: relays.length > 0 ? [...relays] : [...FALLBACK_RELAYS],
    };
  }

  // `relays` は指定があるときだけ載せる。`relays: undefined` というキーを
  // 生やすと、明示リレーかどうかを `!== undefined` で見ている側から
  // 「リレー 0 本の明示指定」に見える。
  return source.relays
    ? { type: "nostr", filters: source.filters, relays: source.relays }
    : { type: "nostr", filters: source.filters };
};
