import type { EventDraft, Mutation } from "../nostr/build/draft";
import type { NostrEvent, UnsignedEvent } from "../nostr/event";
import type { EventStore } from "../read/event-store";
import type { RelayUrl } from "../relay/relay-connection";
import type { Signer } from "../signer/signer";
import type { Publisher } from "./publisher";
import { verifyOptimisticInsert } from "./verify-optimistic-insert";

export type WriteResult = {
  event: NostrEvent;
  accepted: RelayUrl[];
  rejected: { relay: RelayUrl; reason: string }[];
  /** `replace` のときだけ入る、再取得した直前の版。 */
  replaced?: NostrEvent;
};

/**
 * 楽観挿入を UI へ映す方法は書き込む側ごとに違う —— compose はカラムへ
 * 重ねる必要があり、リアクションは `ReactionList` が
 * `store.eventsByTag` から自動で拾うので何も要らない。`Writer` が
 * 一般化しようとすると、どちらにも合わない中途半端な形になる。
 *
 * `startedAt` は `store.put()` を呼ぶ直前の `performance.now()`。ADR-0011
 * の 100ms 予算が見たいのは signEvent を除いた楽観挿入の経路全体 ——
 * `store.put()` は毎回 schnorr 検証を走らせる (`event-store.ts` の
 * `verifyEvent`) ので、そこを含めずに計測すると予算の実測にならない。
 * フック自身は `store.put()` の**後**に呼ばれるため、フックの中で
 * `performance.now()` を取っても検証の時間が測定区間から漏れる —— 開始
 * 時刻は `Writer` 側で先に取っておいて渡す必要がある。
 *
 * `putResult` は `store.put()` の verdict (`"rejected"` は
 * `verifyOptimisticInsert` が例外にするのでここには来ない)。同じ本文を
 * 同じ秒に 2 回投稿すると id が衝突し (event id は署名を含まないハッシュ
 * なので、内容が同じなら同じ id になる)、2 回目は `"duplicate"` になる。
 * `Writer` は publish が全滅したとき `"inserted"` の場合だけ
 * `store.remove()` する (下記参照) —— この判断は呼び出し側の表示状態
 * (楽観挿入した一覧など) にもそのまま当てはまるため、同じ verdict を
 * 渡して呼び出し側が同じ判断をできるようにしている。
 */
export type WriteHooks = {
  onOptimisticInsert?: (
    event: NostrEvent,
    startedAt: number,
    putResult: "inserted" | "duplicate",
  ) => void;
};

/** publish が 1 本も通らなかった。挿入は巻き戻し済み。 */
export class WriteFailedError extends Error {
  readonly rejected: { relay: RelayUrl; reason: string }[];
  constructor(rejected: { relay: RelayUrl; reason: string }[]) {
    // Stryker disable next-line StringLiteral: 呼び出し側は instanceof
    // WriteFailedError で分岐しており、メッセージ文言は判定に使わない。
    super(`publish rejected by all ${rejected.length} relay(s)`);
    // Stryker disable next-line StringLiteral: 同上。name も分岐に使わない。
    this.name = "WriteFailedError";
    this.rejected = rejected;
  }
}

export type Writer = {
  publish(draft: EventDraft, hooks?: WriteHooks): Promise<WriteResult>;
  /**
   * `mutate` には store が持つ**生きたイベント**をそのまま渡す
   * (`fetchLatest` が返したものは `store.latestReplaceable` 経由で store の
   * 参照そのもの)。`Mutation` の「`current` を破壊しない」契約 (`draft.ts`)
   * が破られると、store の中身を呼び出し側が知らないうちに書き換えることに
   * なる。
   */
  replace(
    kind: number,
    identifier: string | undefined,
    mutate: Replacement,
    hooks?: WriteHooks,
  ): Promise<WriteResult>;
};

/**
 * 置換可能イベントの最新版を受け取り、次の draft を返す。
 *
 * NIP-51 の非公開リストは、最新版の content を外部署名器で復号してから
 * 差分を適用し、再暗号化する必要がある。取得を Writer の外へ出すと、その
 * 間に届いた最新版を古い内容で上書きできるため、非同期処理もこの seam の
 * 内側で待つ。既存の同期 Mutation もこの型へそのまま代入できる。
 */
export type Replacement = (
  current: NostrEvent | undefined,
) => ReturnType<Mutation> | Promise<ReturnType<Mutation>>;

export type CreateWriterOptions = {
  signer: Signer;
  store: EventStore;
  publisher: Publisher;
  /** 現在の閲覧者。ログアウト・切替で変わるので値ではなく関数で受ける。 */
  pubkey: () => string;
  /** 秒。テストが `created_at` を決めるために注入する。 */
  now?: () => number;
  /**
   * 置換可能イベントの現在の版を **write リレーから** 引く
   * (`src/core/write/fetch-latest.ts`)。関数として注入するのは、
   * `Writer` を `ConnectionPool` から独立させ、テストがネットワークを
   * 組み立てずに済むようにするため。
   */
  fetchLatest: (
    kind: number,
    identifier: string | undefined,
    pubkey: string,
  ) => Promise<NostrEvent | undefined>;
};

export const createWriter = ({
  signer,
  store,
  publisher,
  pubkey,
  now = () => Math.floor(Date.now() / 1000),
  fetchLatest,
}: CreateWriterOptions): Writer => {
  // 置換イベントの部分成功で、旧送信先だけが失敗した場合の再試行先。
  // kind:10002 を楽観挿入すると routing は新リストへ切り替わり、旧 URL は
  // 次回の targets() から消えるため、成功するまで Writer が保持する。
  const pendingReplaceTargets = new Map<string, RelayUrl[]>();
  const rememberFailedPreviousTargets = (
    replacementKey: string,
    previousTargets: readonly RelayUrl[],
    rejected: readonly { relay: RelayUrl }[],
  ) => {
    const previousTargetSet = new Set(previousTargets);
    const failedPreviousTargets = rejected
      .map(({ relay }) => relay)
      .filter((relay) => previousTargetSet.has(relay));

    // 先に前回分を消し、今回も失敗した URL だけを積み直す。
    // 配列が空なら for に入らず、このキーは消えたままになる。
    pendingReplaceTargets.delete(replacementKey);
    for (const relay of failedPreviousTargets) {
      pendingReplaceTargets.set(replacementKey, [
        ...(pendingReplaceTargets.get(replacementKey) ?? []),
        relay,
      ]);
    }
  };

  const send = async (
    unsigned: UnsignedEvent,
    hooks: WriteHooks | undefined,
    replaced: NostrEvent | undefined,
    additionalRelays: readonly RelayUrl[] = [],
  ): Promise<WriteResult> => {
    // 署名の例外はそのまま伝播させる。ここで包み直すと、呼び出し側が
    // 「拡張機能が無い」と「リレーが全部落ちている」を別の文言で
    // 出せなくなる。この行より前では何も挿入していない。
    const signed = await signer.signEvent(unsigned);

    // 開始時刻は store.put() (schnorr 検証を含む) より前に取る —— フックへ
    // 渡すのはこの時刻で、フック自身は put() の後にしか呼べないため
    // (WriteHooks のコメント参照)。
    const optimisticStartedAt = performance.now();
    // "local" は実在するリレー URL ではない —— 手元での挿入だという印。
    // 戻り値を捨てない —— 拡張機能が返した id/署名が壊れていれば
    // "rejected" になる。詳細は verify-optimistic-insert.ts のコメント参照。
    const putResult = verifyOptimisticInsert(
      store.put(signed, "local" as RelayUrl),
    );
    hooks?.onOptimisticInsert?.(signed, optimisticStartedAt, putResult);

    const result = await publisher.publish(signed, { additionalRelays });
    if (result.accepted.length === 0) {
      // 1 本も通っていない。**この呼び出しが新規に挿入したときだけ**
      // store (と永続層) から取り除く —— 残すと「送れていないのに送れた
      // ように見えるノート」が次回起動でも復活するのが本来の理由だが、
      // putResult が "duplicate" (= 同じ id のイベントが既にストアに
      // あった) の場合は話が違う。同じ本文を同じ秒に 2 回投稿すると id が
      // 衝突するため (event id は署名を含まないハッシュ)、2 回目の失敗で
      // 無条件に remove すると、1 回目の投稿として既に成功していた
      // イベントまで一緒に消してしまう。戻す先 (本文をフォームへ、押下
      // 状態を元へ) は呼び出し側の責務で、ここでは扱わない。
      if (putResult === "inserted") {
        store.remove(signed.id);
      }
      throw new WriteFailedError(result.rejected);
    }
    return { event: signed, ...result, replaced };
  };

  return {
    publish: (draft, hooks) =>
      send({ ...draft, pubkey: pubkey(), created_at: now() }, hooks, undefined),

    // `identifier` (NIP-33 アドレス可能イベントの `d` タグ) を受け取っては
    // いるが、ここではまだ `draft.tags` へ書き込んでいない —— 今日
    // `fetchLatest` が identifier 有りを常に投げる (`fetch-latest.ts`) ので
    // 実効が無いだけで、無害に見える。**その throw を外して kind:30078 等の
    // アドレス可能イベントを有効化する側は、この `d` タグを足す変更が
    // セットで要る。** 忘れると、同じ著者の複数の下書きが `d` 無しで
    // すべて同じアドレス (`kind:pubkey:` 空文字) に衝突し、後から publish
    // した方が黙って前を上書きする。
    replace: async (kind, identifier, mutate, hooks) => {
      const author = pubkey();
      const replacementKey = JSON.stringify([kind, author, identifier]);
      // 再取得が投げたらここで止まる —— **何も署名していないし挿入もして
      // いない**。「取れなかった」を「無い」と取り違えると、既存のリストを
      // 1 件だけのリストで丸ごと上書きする巻き戻せない破壊になる。
      const current = await fetchLatest(kind, identifier, author);
      // fetchLatest 後・楽観挿入前の送信先を保持する。kind:10002 の更新では
      // store.put() 後に routing が新リストへ切り替わるため、旧 write リレー
      // も追加しないと削除したリレーに旧版だけが残る。
      const previousTargets = [
        ...new Set([
          ...publisher.targets(author),
          ...(pendingReplaceTargets.get(replacementKey) ?? []),
        ]),
      ];
      const draft = await mutate(current);

      // リレーは置換可能イベントの新旧を created_at で決める (NIP-01)。
      // 同一秒内の 2 回目の更新は「古くない」だけで**新しくもない**ので、
      // リレーの実装次第で黙って捨てられる。繰り上げてそれを防ぐ。
      const stamped = now();
      const createdAt =
        current && stamped <= current.created_at
          ? current.created_at + 1
          : stamped;

      try {
        const result = await send(
          { ...draft, pubkey: author, created_at: createdAt },
          hooks,
          current,
          previousTargets,
        );
        rememberFailedPreviousTargets(
          replacementKey,
          previousTargets,
          result.rejected,
        );
        return result;
      } catch (error) {
        if (error instanceof WriteFailedError) {
          rememberFailedPreviousTargets(
            replacementKey,
            previousTargets,
            error.rejected,
          );
        }
        throw error;
      }
    },
  };
};
