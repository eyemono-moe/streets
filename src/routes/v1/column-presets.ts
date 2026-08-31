import { type ColumnDef, TIMELINE_KINDS } from "../../core/deck/deck";
import { decodeNpub, encodeBech32 } from "../../core/nostr/nip19";
import { FALLBACK_RELAYS } from "../../core/read/default-relays";

export type ColumnPresetKind =
  | "home"
  | "notifications"
  | "user"
  | "hashtag"
  | "global";

const userTitle = (pubkey: string): string =>
  `@${encodeBech32("npub", pubkey).slice(0, 12)}`;

export const buildUserColumn = (pubkey: string): ColumnDef => ({
  id: crypto.randomUUID(),
  title: userTitle(pubkey),
  source: { kind: "user", pubkey },
});

export const buildFolloweesColumn = (pubkey: string): ColumnDef => ({
  id: crypto.randomUUID(),
  title: `${userTitle(pubkey)} のフォロー`,
  source: { kind: "followees-list", pubkey },
});

export const buildFollowersColumn = (pubkey: string): ColumnDef => ({
  id: crypto.randomUUID(),
  title: `${userTitle(pubkey)} のフォロワー`,
  source: { kind: "followers-list", pubkey },
});

/**
 * 追加フォームの入力から `ColumnDef` を作る。入力が不正なら `undefined` を
 * 返し、呼び出し側はフォームを閉じずにエラーを出す —— 黙って作らない。
 */
export const buildColumn = (
  kind: ColumnPresetKind,
  input: string,
): ColumnDef | undefined => {
  // id は種別ではなく呼び出しごとに振る。種別から作ると、同じ種別を
  // 2 本足した瞬間に id が衝突し、<For> のキーと削除の対象指定が壊れる。
  const id = crypto.randomUUID();

  switch (kind) {
    case "home":
      return {
        id,
        title: "ホーム",
        source: { kind: "followees", kinds: [...TIMELINE_KINDS] },
      };

    case "user": {
      const pubkey = decodeNpub(input);
      if (!pubkey) return undefined;
      return { ...buildUserColumn(pubkey), id };
    }

    case "hashtag": {
      // NIP-12 のタグ値に `#` は含まれない。先頭の `#` は複数あっても
      // すべて落とす —— 1 個だけ落とすと `##nostr` が `#nostr` というタグ値
      // になり、本物のイベントには存在せず永久に一致しない。NIP-24 は
      // 小文字を SHOULD とし主要クライアントも従うので、小文字化もする。
      const tag = input.trim().replace(/^#+/, "").toLowerCase();
      if (tag.length === 0) return undefined;
      return {
        id,
        title: `#${tag}`,
        source: { kind: "literal", filters: [{ kinds: [1], "#t": [tag] }] },
      };
    }

    case "global":
      return {
        id,
        title: "グローバル",
        source: {
          kind: "literal",
          filters: [{ kinds: [1] }],
          relays: [...FALLBACK_RELAYS],
        },
      };

    case "notifications":
      // フィールドを持たない —— pubkey も read リレーもデッキに焼き込まず、
      // `resolveSource` が解決のたびに最新の値で組み立てる。
      return { id, title: "通知", source: { kind: "notifications" } };
  }
};
