import { type NostrEvent, verifyEvent } from "../nostr/event";
import type { ConnectionPool } from "../read/connection-pool";
import type { RelayUrl } from "../relay/relay-connection";
import type { PublishResult } from "./publisher";
import {
  type RelayProgress,
  pendingRelays,
  settleRelay,
} from "./write-progress";
import { WriteFailedError } from "./writer";

/** 暗号化して特定の相手に送るもの（DM など）。送り直すと、宛先でない所に残る。 */
const PRIVATE_KINDS = new Set([4, 13, 14, 15, 1059]);

/** 画面で見かけたイベントを、別のリレーへ送り直してよいか。 */
export const canBroadcast = (event: NostrEvent): boolean =>
  !PRIVATE_KINDS.has(event.kind);

/**
 * 一度に開く接続の数。同時に開ける WebSocket は 30 本までで、読み込みにも使って
 * いるので、送り先が多くても枠を使い切らないよう少しずつ送る。
 */
const CONCURRENCY = 4;

/**
 * 署名済みのイベントを、そのまま `relays` へ送る。誰が送っても同じものが届くので
 * 署名し直さない。自分の書き込みリレーへは送らない —— 送り先は呼ぶ側が決める。
 *
 * 1 本も受け取らなければ `WriteFailedError` を投げる。
 */
export const broadcast = async (
  pool: Pick<ConnectionPool, "publish">,
  event: NostrEvent,
  relays: readonly RelayUrl[],
  onProgress?: (relays: RelayProgress[]) => void,
): Promise<PublishResult> => {
  // 壊れたイベントを広めない。リレーが断るとしても、こちらの名前で送ったことになる。
  if (!verifyEvent(event)) {
    throw new Error("署名を確かめられないイベントは送れません");
  }
  if (!canBroadcast(event)) {
    throw new Error("暗号化されたイベントは送り直せません");
  }
  const targets = [...new Set(relays)];
  let progress = pendingRelays(targets);
  onProgress?.(progress);

  const accepted: RelayUrl[] = [];
  const rejected: { relay: RelayUrl; reason: string }[] = [];
  const queue = [...targets];
  const worker = async () => {
    for (let relay = queue.shift(); relay; relay = queue.shift()) {
      try {
        await pool.publish(relay, event);
        accepted.push(relay);
        progress = settleRelay(progress, relay, { accepted: true });
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        rejected.push({ relay, reason });
        progress = settleRelay(progress, relay, { accepted: false, reason });
      }
      onProgress?.(progress);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker),
  );

  if (accepted.length === 0) throw new WriteFailedError(rejected);
  return { accepted, rejected };
};
