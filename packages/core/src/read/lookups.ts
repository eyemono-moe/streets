import type { NostrEvent } from "../nostr/event";
import { type Profile, parseProfile } from "../nostr/profile";
import type { RelayUrl } from "../relay/relay-connection";
import type { EngagementRequests } from "./engagement-requests";
import type { EventRequests } from "./event-requests";
import type { EventStore } from "./event-store";
import type { ProfileRequests } from "./profile-requests";

export type EventLookup =
  | { phase: "loading" }
  | { phase: "found"; event: NostrEvent }
  | { phase: "missing" };

export type ProfileDetails = {
  profile: Profile | undefined;
  tags: readonly string[][];
  /** kind:0 の content そのもの。読む側が扱う項目（Zap の送り先など）を取り出すため。 */
  content: string;
};

/**
 * 画面が 1 件ずつ読むものの口。どれも「今の値をすぐ 1 回知らせ、変わるたびに知らせる」で、
 * 返した関数で止める。要求・通知の購読・解決の判定・解除は中で済ませる。
 */
export type ReadLookups = {
  /**
   * 投稿を 1 件探す。store にあればリレーへ要求しない。取得中と見つからなかったを分けて知らせる。
   * 見つからなかった後も、後のバッチで届けば found を知らせる。
   */
  watchEvent(
    id: string,
    relayHint: RelayUrl | undefined,
    onChange: (lookup: EventLookup) => void,
  ): () => void;
  /**
   * プロフィール（kind:0）を読む。store にあればリレーへ要求しない。取得中と無いを分けず、
   * どちらも undefined を知らせる（名前の代わりに鍵を出すので描き分けが要らない）。
   * 新しい版が入るたびに知らせる。
   */
  watchProfile(
    pubkey: string,
    onChange: (details: ProfileDetails | undefined) => void,
  ): () => void;
  /**
   * プロフィールを取りにいくだけで、知らせない。候補の一覧のように、多くの人を
   * まとめて並べ、届いたかを store の変化から引き直す側が使う。
   */
  requestProfile(pubkey: string): void;
  /**
   * その投稿への返信・リポスト・リアクションを要求し、store に関係するものが入るたびに知らせる。
   * 数え方は読む側が store から引き直す。
   */
  watchEngagements(targetId: string, onChange: () => void): () => void;
};

export type CreateReadLookupsOptions = {
  store: EventStore;
  events: EventRequests;
  profiles: ProfileRequests;
  engagements: EngagementRequests;
};

export const createReadLookups = ({
  store,
  events,
  profiles,
  engagements,
}: CreateReadLookupsOptions): ReadLookups => ({
  watchEvent(id, relayHint, onChange) {
    // 指す先が無い（タグが壊れている）ものは取りにいかない。空の id を要求しない。
    if (id === "") {
      onChange({ phase: "missing" });
      return () => {};
    }
    const found = () => {
      const event = store.get(id);
      if (event) onChange({ phase: "found", event });
      return event !== undefined;
    };
    if (found()) return () => {};

    onChange({ phase: "loading" });
    events.request(id, relayHint);
    const unsubscribe = events.subscribe(() => {
      if (found()) {
        unsubscribe();
        return;
      }
      // 通知は無関係なバッチの完了でも来る。自分の id のバッチが片付いたときだけ missing にする。
      if (events.isUnresolved(id)) onChange({ phase: "missing" });
    });
    return unsubscribe;
  },

  watchProfile(pubkey, onChange) {
    const load = () => {
      const latest = store.latestReplaceable(0, pubkey);
      onChange(
        latest
          ? {
              profile: parseProfile(latest.content),
              tags: latest.tags,
              content: latest.content,
            }
          : undefined,
      );
      return latest !== undefined;
    };

    const offChanged = store.onReplaceableChanged((change) => {
      if (change.kind === 0 && change.pubkey === pubkey) load();
    });
    if (load()) return offChanged;

    profiles.request(pubkey);
    const offBatch = profiles.subscribe(() => {
      if (load()) offBatch();
    });
    return () => {
      offChanged();
      offBatch();
    };
  },

  requestProfile(pubkey) {
    profiles.request(pubkey);
  },

  watchEngagements(targetId, onChange) {
    engagements.request(targetId);
    const offBatch = engagements.subscribe(onChange);
    const offStore = store.subscribe((change) => {
      if (
        change.event.tags.some((tag) => tag[0] === "e" && tag[1] === targetId)
      ) {
        onChange();
      }
    });
    return () => {
      offBatch();
      offStore();
    };
  },
});
