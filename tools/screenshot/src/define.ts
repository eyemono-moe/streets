/**
 * スクリーンショット用 fixture の書き方。Nostr の生のイベントではなく、人が
 * 読み書きしやすい形で書き、`generate.ts` がイベントに組み立てる。
 */

type TimeUnit = "s" | "m" | "h" | "d";

/** 基準時刻からどれだけ前か。`"45s"` `"2m"` `"3h"` `"1d"`、続けて `"1h30m"` とも書ける。 */
export type Ago =
  | `${number}${TimeUnit}`
  | `${number}${TimeUnit}${number}${TimeUnit}`;

/** いつの出来事か。`ago`（どれだけ前）か、`offset`（基準時刻からの秒。過去は負）で書く。 */
export type When = { ago: Ago } | { offset: number };

/** 架空のユーザー。`picture` と `banner` は `assets/` のファイル名。 */
export type UserProfile = {
  name: string;
  displayName: string;
  about: string;
  picture?: AssetName;
  banner?: AssetName;
  website?: string;
};

/** `assets/` に置いた画像のファイル名。 */
export type AssetName = `${string}.${"svg" | "png" | "jpg" | "jpeg" | "webp"}`;

/** 投稿（kind:1）。`id` を付けると、返信・引用・リポスト・リアクションから指せる。 */
export type Post<U extends string> = When & {
  id?: string;
  author: U;
  content: string;
  /** 添える画像（`assets/` のファイル名）。本文の末尾に URL が付く。 */
  images?: readonly AssetName[];
  /** 返信先の投稿の `id`。 */
  replyTo?: string;
  /** 引用する投稿の `id`。 */
  quote?: string;
};

/** リアクション（kind:7）。`emoji` を省くといいね（`+`）。 */
export type Reaction<U extends string> = When & {
  author: U;
  to: string;
  emoji?: string;
};

/** リポスト（kind:6）。 */
export type Repost<U extends string> = When & {
  author: U;
  of: string;
};

/** Zap（kind:9735 の受領）。受け取るのは `to` の投稿の作者。 */
export type Zap<U extends string> = When & {
  from: U;
  to: string;
  sats: number;
  message?: string;
};

/** 見る人のデッキに並べるカラム。 */
export type DeckColumn<U extends string> =
  | { kind: "home" }
  | { kind: "notifications" }
  | { kind: "user"; user: U }
  /** 検索カラム。`"#coffee"` のようにハッシュタグでも、言葉でも書ける。 */
  | { kind: "search"; query: string };

/** 1 枚のスクリーンショットのための状態。 */
export type Scenario<U extends string> = {
  /** 何を撮るためのものか。一覧に出す。 */
  description: string;
  /** ログインして見る人。通知はこの人に向けて作る。 */
  viewer: U;
  /** 誰が誰をフォローしているか（kind:3）。 */
  follows: Partial<Record<U, readonly U[]>>;
  posts: readonly Post<U>[];
  reactions?: readonly Reaction<U>[];
  reposts?: readonly Repost<U>[];
  zaps?: readonly Zap<U>[];
  /** 見る人のデッキ（kind:30078）。省くと Streets の既定（ホームと通知）のまま。 */
  deck?: readonly DeckColumn<U>[];
};
