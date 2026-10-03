import type { NostrEvent } from "@streets/core/nostr/event";
import type { SubscriptionManager } from "@streets/core/read/subscription-manager";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type DecodedBlockedRelayList,
  blockedRelaysStorageKey,
  blockedRelaysToApply,
  loadBlockedRelaysCache,
  saveBlockedRelaysCache,
} from "@streets/core/settings/blocked-relay-list";
import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";

const [blockedRelays, setBlockedRelays] = createSignal<readonly RelayUrl[]>([]);

/** いま当てている繋がないリレー。カラムの警告などが読む。 */
export { blockedRelays };

/**
 * ログインしている間、自分の繋がないリレー（kind:10006）を読み取り層へ当てる。
 * 非公開の項目も止める。呼んだその場で前回の控えを当てる —— カラムが購読を
 * 張るより先に効かせるため。
 */
export const applyBlockedRelays = (
  manager: SubscriptionManager,
  pubkey: string,
  list: Accessor<
    (DecodedBlockedRelayList & { from: NostrEvent | undefined }) | undefined
  >,
) => {
  const key = blockedRelaysStorageKey(pubkey);
  const apply = (relays: readonly RelayUrl[]) => {
    setBlockedRelays(relays);
    manager.setBlockedRelays(relays);
  };

  let cached: readonly RelayUrl[] = [];
  try {
    cached = loadBlockedRelaysCache(localStorage.getItem(key));
  } catch {
    // ストレージが使えなくても、一覧が届けば当たる。
  }
  apply(cached);

  createEffect(() => {
    const decoded = list();
    // まだ届いていない間は控えのまま。空にすると、控えで止めていたリレーへ繋ぐ。
    if (decoded?.from === undefined) return;
    const next = blockedRelaysToApply(decoded, cached);
    apply(next.relays);
    if (next.cache === undefined) return;
    cached = next.cache;
    try {
      localStorage.setItem(key, saveBlockedRelaysCache(next.cache));
    } catch {
      // 控えられなくても、今の画面には当たっている。
    }
  });

  // 別のアカウントやログアウトに、前の人の一覧を残さない。
  onCleanup(() => apply([]));
};
