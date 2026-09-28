import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";

const HEX64 = /^[0-9a-f]{64}$/;

/** 宛先 1 人につき送る read リレーの数。 */
export const RELAYS_PER_RECIPIENT = 2;
/**
 * 宛先のために自分の送信先へ足すリレーの数。同時に開く接続は 30 本までで、
 * 読み取りの購読と同じ枠を使うため、宛先の多い投稿で枠を食い尽くさない。
 */
export const MAX_RECIPIENT_RELAYS = 6;

// フォローリストやミュートリストの `p` は宛先ではない。置換可能・アドレス指定・
// 一時的なイベントを数百人の read リレーへ撒くと、枠も相手の通知も溢れる。
const addressesRecipients = (kind: number): boolean =>
  kind !== 0 && kind !== 3 && kind < 10_000;

/**
 * `p` タグの相手が通知を待つ read リレーのうち、`alreadyTargeted` に無いもの。
 * 相手のリレーリストを持っていなければ、その相手の分は足さない（取得を待つと
 * 投稿が止まる）。宛先は `p` タグの順に扱い、上限に達した後の宛先は落とす。
 */
export const recipientRelays = (
  event: Pick<NostrEvent, "kind" | "pubkey" | "tags">,
  readRelaysFor: (pubkey: string) => readonly RelayUrl[],
  alreadyTargeted: readonly RelayUrl[],
): RelayUrl[] => {
  if (!addressesRecipients(event.kind)) return [];
  const targeted = new Set(alreadyTargeted);
  const added: RelayUrl[] = [];
  const recipients = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] !== "p" || !HEX64.test(tag[1] ?? "")) continue;
    const recipient = tag[1];
    if (recipient === event.pubkey || recipients.has(recipient)) continue;
    recipients.add(recipient);
    // 自分の送信先と重なるリレーも 1 本と数える。そこへはもう届く。
    for (const relay of readRelaysFor(recipient).slice(
      0,
      RELAYS_PER_RECIPIENT,
    )) {
      if (targeted.has(relay)) continue;
      if (added.length >= MAX_RECIPIENT_RELAYS) return added;
      targeted.add(relay);
      added.push(relay);
    }
  }
  return added;
};
