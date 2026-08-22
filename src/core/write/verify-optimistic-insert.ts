import type { PutResult } from "../read/event-store";

/**
 * `store.put()` の判定を確かめ、`"rejected"` なら投稿を失敗として扱う
 * (final review, Important 5)。`Writer` (`writer.ts`) の `send` が
 * `store.put()` の戻り値をここへ渡す —— `Writer` は全ての書き込みが通る
 * 唯一の経路なので、ここに置けば以後どの呼び出し側 (compose に限らず)
 * も自動でこの規律に従う —— 呼び出し側 (`v1.tsx` など) に直書きすると、
 * 次に増える書き込み経路がこの確認を持たないまま素通りしてしまう。
 *
 * `createNip07Signer().signEvent()` が返す `NostrEvent` は拡張機能の応答を
 * 無検証キャストしただけの、信頼境界を跨ぐ値 (`nip07-signer.ts` 参照)。
 * id/署名が壊れていれば `EventStore.put()` は `"rejected"` を返す。
 * EventStore に入っていない投稿を「見えている」ことにするとリロードで
 * 静かに消え、`publisher.publish()` は壊れたイベントをそのままリレーへ
 * 送ってしまう。読み取り層は `collect.ts`/`subscription-manager.ts`/
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
