import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import type { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";

export type ParsedProfile = {
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  banner?: string;
  nip05?: string;
  website?: string;
  /**
   * kind:0 イベントのタグ。`about` のカスタム絵文字 (NIP-30) を引くために
   * 要る —— `content` だけでは `:shortcode:` を絵文字に変換できない。
   */
  tags?: readonly string[][];
};

/**
 * kind:0 の `content` をパースする。リレー由来で形を保証されないので、
 * JSON が壊れていても型が違っても、例外を投げず `undefined` へ倒す。
 */
export const parseProfileContent = (
  content: string,
): ParsedProfile | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const record = parsed as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name : undefined,
    // NIP-24 のフィールド名は snake_case。JS 側の命名へ寄せて読み替える。
    displayName:
      typeof record.display_name === "string" ? record.display_name : undefined,
    picture: typeof record.picture === "string" ? record.picture : undefined,
    about: typeof record.about === "string" ? record.about : undefined,
    banner: typeof record.banner === "string" ? record.banner : undefined,
    nip05: typeof record.nip05 === "string" ? record.nip05 : undefined,
    website: typeof record.website === "string" ? record.website : undefined,
  };
};

/**
 * `<Profile>`/`<Avatar>`/`<ProfileCard>` が共有する取得ロジック。各々が
 * 独立に `request()` を呼んでも `ProfileRequests` が pubkey をまとめる。
 */
export const useProfileData = (
  pubkey: () => string,
  store: EventStore,
  requests: ProfileRequests,
): Accessor<ParsedProfile | undefined> => {
  const [profile, setProfile] = createSignal<ParsedProfile | undefined>();

  createEffect(() => {
    // 依存として追跡するのは pubkey() だけ —— この中で `profile` 自身を
    // 読んで分岐すると、setProfile がこの effect を再実行させ、そこでまた
    // 同じ値 (だが新しい参照) を set し直して無限ループになる。読むのを
    // pubkey だけに絞ることでその罠を避ける。
    const key = pubkey();
    setProfile(undefined);

    let requestUnsubscribe: (() => void) | undefined;
    let requestSubscriptionActive = false;

    const stopRequestSubscription = () => {
      if (!requestSubscriptionActive) return;
      requestSubscriptionActive = false;
      const unsubscribe = requestUnsubscribe;
      requestUnsubscribe = undefined;
      unsubscribe?.();
    };

    const check = (): boolean => {
      const event = store.latestReplaceable(0, key);
      if (!event) {
        setProfile(undefined);
        return false;
      }
      const parsed = parseProfileContent(event.content);
      // `about` のカスタム絵文字 (NIP-30) を引くのに kind:0 の `emoji`
      // タグが要る。`content` のパース結果には含まれないので、ここで
      // イベント側から載せる。
      setProfile(parsed ? { ...parsed, tags: event.tags } : undefined);
      return true;
    };

    const unsubscribeStore = store.onReplaceableChanged((change) => {
      if (change.kind !== 0 || change.pubkey !== key) return;
      if (check()) stopRequestSubscription();
    });
    onCleanup(() => {
      unsubscribeStore();
      stopRequestSubscription();
    });

    if (check()) return; // 既に EventStore にある — 要求は不要

    requests.request(key);
    requestSubscriptionActive = true;
    requestUnsubscribe = requests.subscribe(() => {
      // 無関係なバッチの完了でも呼ばれる (コアレッサは pubkey 単位で通知
      // しない) —— その場合 check() は false を返すだけで再描画は起きない。
      if (!requestSubscriptionActive) return;
      if (check()) stopRequestSubscription();
    });
    // subscribe() が同期的に呼び返して解決した場合、代入後に購読を外す。
    // ProfileRequests の実装は現在非同期だが、テスト用実装や将来の変更でも
    // Temporal Dead Zone / 二重 unsubscribe を起こさないようにしておく。
    if (!requestSubscriptionActive) {
      const unsubscribe = requestUnsubscribe;
      requestUnsubscribe = undefined;
      unsubscribe?.();
    }
  });

  return profile;
};
