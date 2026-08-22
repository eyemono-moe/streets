import type { EventDraft } from "../nostr/build/draft";
import type { NostrEvent, UnsignedEvent } from "../nostr/event";
import type { EventStore } from "../read/event-store";
import type { RelayUrl } from "../relay/relay-connection";
import type { Signer } from "../signer/signer";
import type { Publisher } from "./publisher";

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
 */
export type WriteHooks = {
  onOptimisticInsert?: (event: NostrEvent) => void;
};

/** publish が 1 本も通らなかった。挿入は巻き戻し済み。 */
export class WriteFailedError extends Error {
  readonly rejected: { relay: RelayUrl; reason: string }[];
  constructor(rejected: { relay: RelayUrl; reason: string }[]) {
    super(`publish rejected by all ${rejected.length} relay(s)`);
    this.name = "WriteFailedError";
    this.rejected = rejected;
  }
}

export type Writer = {
  publish(draft: EventDraft, hooks?: WriteHooks): Promise<WriteResult>;
  replace(
    kind: number,
    identifier: string | undefined,
    mutate: (current: NostrEvent | undefined) => EventDraft,
    hooks?: WriteHooks,
  ): Promise<WriteResult>;
};

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
  const send = async (
    unsigned: UnsignedEvent,
    hooks: WriteHooks | undefined,
    replaced: NostrEvent | undefined,
  ): Promise<WriteResult> => {
    // 署名の例外はそのまま伝播させる。ここで包み直すと、呼び出し側が
    // 「拡張機能が無い」と「リレーが全部落ちている」を別の文言で
    // 出せなくなる。この行より前では何も挿入していない。
    const signed = await signer.signEvent(unsigned);

    // "local" は実在するリレー URL ではない —— 手元での挿入だという印。
    store.put(signed, "local" as RelayUrl);
    hooks?.onOptimisticInsert?.(signed);

    const result = await publisher.publish(signed);
    if (result.accepted.length === 0) {
      // 1 本も通っていない。store にも永続層にも残さない —— 残すと
      // 「送れていないのに送れたように見えるノート」が次回起動でも
      // 復活する。戻す先 (本文をフォームへ、押下状態を元へ) は
      // 呼び出し側の責務で、ここでは扱わない。
      store.remove(signed.id);
      throw new WriteFailedError(result.rejected);
    }
    return { event: signed, ...result, replaced };
  };

  return {
    publish: (draft, hooks) =>
      send({ ...draft, pubkey: pubkey(), created_at: now() }, hooks, undefined),

    replace: async (kind, identifier, mutate, hooks) => {
      const author = pubkey();
      // 再取得が投げたらここで止まる —— **何も署名していないし挿入もして
      // いない**。「取れなかった」を「無い」と取り違えると、既存のリストを
      // 1 件だけのリストで丸ごと上書きする巻き戻せない破壊になる。
      const current = await fetchLatest(kind, identifier, author);
      const draft = mutate(current);

      // リレーは置換可能イベントの新旧を created_at で決める (NIP-01)。
      // 同一秒内の 2 回目の更新は「古くない」だけで**新しくもない**ので、
      // リレーの実装次第で黙って捨てられる。繰り上げてそれを防ぐ。
      const stamped = now();
      const createdAt =
        current && stamped <= current.created_at
          ? current.created_at + 1
          : stamped;

      return send(
        { ...draft, pubkey: author, created_at: createdAt },
        hooks,
        current,
      );
    },
  };
};
