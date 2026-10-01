import type { NostrEvent } from "@streets/core/nostr/event";
import {
  USER_STATUS_KIND,
  USER_STATUS_TYPES,
  type UserStatus,
  parseUserStatus,
} from "@streets/core/nostr/user-status";
import {
  type Accessor,
  createEffect,
  createRoot,
  createSignal,
  onCleanup,
} from "solid-js";
import { useReadLayer } from "../read-layer";

/**
 * 期限の判定に使う時計。投稿の数だけタイマーを持たないよう、1 つを共有する。
 * 聴いている曲は数分で終わるので、1 分ごとに進める。
 */
const nowSeconds = createRoot(() => {
  const [now, setNow] = createSignal(Math.floor(Date.now() / 1000));
  setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
  return now;
});

/** その人の今のステータス（general・music の順）。無ければ空。 */
export const useUserStatuses = (
  pubkey: Accessor<string>,
): Accessor<UserStatus[]> => {
  const { lookups } = useReadLayer();
  const [events, setEvents] = createSignal<(NostrEvent | undefined)[]>([]);
  createEffect(() => {
    const author = pubkey();
    setEvents([]);
    USER_STATUS_TYPES.forEach((type, index) => {
      onCleanup(
        lookups.watchAddress(
          { kind: USER_STATUS_KIND, pubkey: author, identifier: type },
          (lookup) =>
            setEvents((current) => {
              const next = [...current];
              next[index] = lookup.phase === "found" ? lookup.event : undefined;
              return next;
            }),
        ),
      );
    });
  });
  return () =>
    events().flatMap((event) => {
      const status = parseUserStatus(event, nowSeconds());
      return status ? [status] : [];
    });
};
