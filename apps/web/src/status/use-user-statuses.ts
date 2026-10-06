import type { NostrEvent } from "@streets/core/nostr/event";
import {
  USER_STATUS_KIND,
  USER_STATUS_TYPES,
  type UserStatus,
  parseUserStatus,
} from "@streets/core/nostr/user-status";
import { createSection } from "@streets/core/solid/create-section";
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

/**
 * どこまで新しさを求めるか。
 * - `cached`: 手元の値を使い回し、古くなったら取り直す（アイコンの印のように、多くの人を並べるところ）
 * - `refresh`: 出すたびに取り直す（名刺を開いたとき）
 * - `live`: 出している間は購読し、変わったらすぐ出す（ユーザー詳細のカラム）
 */
export type StatusFreshness = "cached" | "refresh" | "live";

/**
 * その人の今のステータス（general・music の順）。無ければ空。`pubkey` が
 * undefined（ログインしていないなど）の間は何も取らない。
 */
export const useUserStatuses = (
  pubkey: Accessor<string | undefined>,
  freshness: StatusFreshness = "cached",
): Accessor<UserStatus[]> => {
  const { lookups, manager } = useReadLayer();
  // 届いた版は store に入り、下の watchAddress が新しい版として知らせ直す。
  // Storybook など購読できないところでは、手元にある分だけを出す。
  if (freshness === "live" && manager) {
    createSection({
      manager,
      source: () => {
        const author = pubkey();
        if (author === undefined) return undefined;
        return {
          type: "nostr",
          filters: [
            {
              kinds: [USER_STATUS_KIND],
              authors: [author],
              "#d": [...USER_STATUS_TYPES],
            },
          ],
        };
      },
    });
  }
  const [events, setEvents] = createSignal<(NostrEvent | undefined)[]>([]);
  createEffect(() => {
    const author = pubkey();
    setEvents([]);
    if (author === undefined) return;
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
          { refresh: freshness === "refresh" },
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
