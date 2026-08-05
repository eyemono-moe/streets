import type { PutResult } from "../../core/read/event-store";

/**
 * `store.put()` の判定を確かめ、`"rejected"` なら投稿を失敗として扱う
 * (final review, Important 5)。
 *
 * `createNip07Signer().signEvent()` が返す `NostrEvent` は拡張機能の応答を
 * 無検証キャストしただけの、信頼境界を跨ぐ値 (`nip07-signer.ts` 参照)。
 * id/署名が壊れていれば `EventStore.put()` は `"rejected"` を返すが、
 * `v1-preview.tsx` の投稿フォームはその戻り値を捨てて楽観表示を無条件に
 * 出していた。EventStore に入っていない投稿を「見えている」ことにすると
 * リロードで静かに消え、`publisher.publish()` は壊れたイベントをそのまま
 * リレーへ送ってしまう。読み取り層は `collect.ts`/`subscription-manager.ts`/
 * `event-store.ts`/`filter-match.ts` の 4 箇所でこの verdict を必ず確認して
 * いるのに、書き込み経路だけがその規律を欠いていた。
 *
 * `"duplicate"` はエラーではない (既に手元にある = 表示して問題ない) ので
 * `"inserted"` と同じく素通しする。拒否させるのは `"rejected"` だけ。
 */
export const verifyOptimisticInsert = (putResult: PutResult): void => {
  if (putResult === "rejected") {
    throw new Error(
      "投稿の検証に失敗しました (拡張機能の応答が壊れています)。",
    );
  }
};
