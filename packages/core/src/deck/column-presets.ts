import { decodeNpub, encodeBech32 } from "../nostr/nip19";
import type { RelayUrl } from "../relay/relay-connection";
import { TIMELINE_KINDS } from "./column-kinds";
import type { ColumnDef } from "./deck";

export type ColumnPresetKind =
  | "home"
  | "notifications"
  | "user"
  | "hashtag"
  | "bookmarks"
  | "search"
  | "channels";

const userTitle = (pubkey: string): string =>
  `@${encodeBech32("npub", pubkey).slice(0, 12)}`;

/**
 * 重ねるカラムの id は中身から決める。同じものを 2 回押しても重ならない
 * （スタックの重複判定は id で行う）。デッキへ足すときは呼び出し側が振り直す。
 */
export const buildUserColumn = (pubkey: string): ColumnDef => ({
  id: `user:${pubkey}`,
  title: userTitle(pubkey),
  source: { kind: "user", pubkey },
});

export const buildFolloweesColumn = (pubkey: string): ColumnDef => ({
  id: `followees:${pubkey}`,
  title: `${userTitle(pubkey)} のフォロー`,
  source: { kind: "followees-list", pubkey },
});

export const buildFollowersColumn = (pubkey: string): ColumnDef => ({
  id: `followers:${pubkey}`,
  title: `${userTitle(pubkey)} のフォロワー`,
  source: { kind: "followers-list", pubkey },
});

/**
 * スレッドのカラム。id を `focus` から決めるので、同じスレッドを 2 回開いても
 * 重ならない（スタックの重複判定は id で行う）。
 */
export const buildThreadColumn = (focus: string): ColumnDef => ({
  id: `thread:${focus}`,
  title: "スレッド",
  source: { kind: "thread", focus },
});

export const buildActivityColumn = (target: string): ColumnDef => ({
  id: `activity:${target}`,
  title: "アクティビティ",
  source: { kind: "activity", target },
});

/**
 * チャンネルのカラム。id をチャンネルから決めるので、同じチャンネルを 2 回開いても
 * 重ならない。`relays` はそのチャンネルがあると分かっているリレー。
 */
export const buildChannelColumn = (
  channelId: string,
  name: string | undefined,
  relays: readonly RelayUrl[] = [],
): ColumnDef => ({
  id: `channel:${channelId}`,
  title: name ?? "チャンネル",
  source: {
    kind: "channel",
    id: channelId,
    ...(relays.length > 0 ? { relays: [...relays] } : {}),
  },
});

/** 選んだリレーだけから公開ノートを読むカラムを作る。 */
export const buildRelayColumn = (
  relays: readonly RelayUrl[],
): ColumnDef | undefined => {
  const unique = [...new Set(relays)];
  if (unique.length === 0) return undefined;
  return {
    id: crypto.randomUUID(),
    title:
      unique.length === 1
        ? unique[0].replace(/\/$/, "")
        : `リレー（${unique.length}）`,
    source: {
      kind: "literal",
      filters: [{ kinds: [1] }],
      relays: unique,
    },
  };
};

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
      // 追加プリセットは従来どおり通常リレーへ直接問い合わせる。
      const tag = input.trim().replace(/^#+/, "").toLowerCase();
      if (tag.length === 0) return undefined;
      return {
        id,
        title: `#${tag}`,
        source: { kind: "literal", filters: [{ kinds: [1], "#t": [tag] }] },
      };
    }

    case "search": {
      const query = input.trim();
      if (query.length === 0) return undefined;
      // 問い合わせ先はデッキに焼き込まない —— 設定（kind:10007）で変えられる。
      return { id, title: query, source: { kind: "search", query } };
    }

    case "bookmarks":
      // どのノートを入れるかは kind:10003 が決めるので、デッキには何も焼き込まない。
      return { id, title: "ブックマーク", source: { kind: "bookmarks" } };

    case "channels":
      return { id, title: "チャンネル", source: { kind: "channel-list" } };

    case "notifications":
      // フィールドを持たない —— pubkey も read リレーもデッキに焼き込まず、
      // `resolveSource` が解決のたびに最新の値で組み立てる。
      return { id, title: "通知", source: { kind: "notifications" } };
  }
};

/** 本文・自己紹介のハッシュタグから、編集可能な通常の検索カラムを開く。 */
export const buildHashtagColumn = (input: string): ColumnDef | undefined => {
  // NIP-24 の `t` は小文字。画面に出す元の綴りはトークン側へ残す。
  const tag = input.trim().replace(/^#+/, "").toLowerCase();
  return tag.length > 0 ? buildColumn("search", `#${tag}`) : undefined;
};
