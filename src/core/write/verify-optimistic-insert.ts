import type { PutResult } from "../read/event-store";

/**
 * `store.put()` の判定を確かめ、`"rejected"` なら投稿を失敗として扱う。
 * `Writer` (`writer.ts`) の `send` が `store.put()` の戻り値をここへ渡す ——
 * `Writer` は全ての書き込みが通る唯一の経路なので、ここに置けば以後どの
 * 呼び出し側 (compose に限らず) も自動でこの規律に従う —— 呼び出し側
 * (`v1.tsx` など) に直書きすると、次に増える書き込み経路がこの確認を
 * 持たないまま素通りしてしまう。
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
 *
 * **検証済みの verdict をそのまま返す** (`"inserted" | "duplicate"`)。
 * `Writer` は publish が全滅したとき `store.remove()` で巻き戻すが、
 * この呼び出しが `"duplicate"` (= 同じ id のイベントが既にストアにあった)
 * だった場合に無条件で `remove()` すると、この呼び出しより前に成功して
 * いた既存のイベントまで一緒に消してしまう。呼び出し側がその判断をする
 * には、ここでもう一度 `store` を見に行くのではなく、この関数が確かめた
 * 結果をそのまま受け取れるほうが確実 (二重に判定すると両者が食い違う
 * 余地が生まれる)。
 */
export const verifyOptimisticInsert = (
  putResult: PutResult,
): Exclude<PutResult, "rejected"> => {
  if (putResult === "rejected") {
    throw new Error(
      // Stryker disable next-line StringLiteral: 呼び出し側は例外の有無
      // (throw されたかどうか) だけを見ており、メッセージ文言は判定に
      // 使わない。ユーザー向けの文面は v1.tsx 側で別途包んでいる。
      "投稿の検証に失敗しました (拡張機能の応答が壊れています)。",
    );
  }
  return putResult;
};
