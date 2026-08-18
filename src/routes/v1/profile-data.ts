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
 * kind:0 の `content` (JSON 文字列) をパースする。リレーから来た値であり
 * `EventStore` は形を保証しない (task-5-brief の注意 1) —— JSON として壊れて
 * いても、`name`/`picture` の型が期待と違っても (数値・オブジェクトなど)、
 * 例外を投げずに安全側の `undefined` へ倒す。
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
 * `<Profile>`（名前）と `<Avatar>`（アイコン）が共有するプロフィール取得
 * ロジック。どちらも独立に `requests.request()` を呼びうるが、
 * `ProfileRequests` は pubkey を `Set` でまとめる (`profile-requests.ts`)
 * ので同じ pubkey への重複要求は実害が無い —— 2 つのコンポーネントが
 * それぞれ「自分は他の購読者の存在を知らない」という単純さを保てる。
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
    let resolved = false;

    const check = (): boolean => {
      const event = store.latestReplaceable(0, key);
      if (!event) return false;
      const parsed = parseProfileContent(event.content);
      // `about` のカスタム絵文字 (NIP-30) を引くのに kind:0 の `emoji`
      // タグが要る。`content` のパース結果には含まれないので、ここで
      // イベント側から載せる。
      setProfile(parsed ? { ...parsed, tags: event.tags } : undefined);
      return true;
    };

    if (check()) return; // 既に EventStore にある — 要求もリスンも不要

    requests.request(key);
    const unsubscribe = requests.subscribe(() => {
      // 無関係なバッチの完了でも呼ばれる (コアレッサは pubkey 単位で通知
      // しない) —— その場合 check() は false を返すだけで再描画は起きない。
      if (resolved) return;
      if (check()) {
        resolved = true;
        unsubscribe();
      }
    });
    onCleanup(unsubscribe);
  });

  return profile;
};
