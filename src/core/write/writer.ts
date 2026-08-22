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
};

export type CreateWriterOptions = {
  signer: Signer;
  store: EventStore;
  publisher: Publisher;
  /** 現在の閲覧者。ログアウト・切替で変わるので値ではなく関数で受ける。 */
  pubkey: () => string;
  /** 秒。テストが `created_at` を決めるために注入する。 */
  now?: () => number;
};

export const createWriter = ({
  signer,
  store,
  publisher,
  pubkey,
  now = () => Math.floor(Date.now() / 1000),
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
  };
};
