import type { PutResult } from "../read/event-store";

/**
 * `store.put()` の判定を確かめ、`"rejected"`/`"hidden"` なら失敗として扱う。
 * `Writer` の唯一の書き込み経路に置き、呼び出し側の直書きによる見落としを防ぐ。
 *
 * `signEvent()` が返す `NostrEvent` は拡張機能応答の無検証キャストなので、
 * id/署名が壊れていれば `"rejected"` になる (`"duplicate"` は素通し、
 * `"hidden"` は NIP-09 の削除依頼中なので再送を拒否)。
 *
 * verdict をそのまま返すのは、呼び出し側が `remove()` するかどうかを
 * 再判定すると `store` の状態と食い違いうるため —— 特に `"duplicate"`
 * を無条件 remove すると、先に成功していた既存イベントまで消える。
 */
export const verifyOptimisticInsert = (
  putResult: PutResult,
): Exclude<PutResult, "rejected" | "hidden"> => {
  if (putResult === "hidden") {
    throw new Error(
      "この投稿は削除済みです。内容か投稿時刻を変えて投稿し直してください。",
    );
  }
  if (putResult === "rejected") {
    throw new Error(
      // Stryker disable next-line StringLiteral: 呼び出し側は例外の有無
      // (throw されたかどうか) だけを見ており、rejected のメッセージ文言は
      // 判定に使わない。hidden は行動可能な文面を別の分岐で固定する。
      "投稿の検証に失敗しました (拡張機能の応答が壊れています)。",
    );
  }
  return putResult;
};
