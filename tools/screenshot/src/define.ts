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

/** `assets/` に置いた画像・動画のファイル名。 */
export type AssetName =
  `${string}.${"svg" | "png" | "jpg" | "jpeg" | "webp" | "mp4"}`;

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
  /** 閲覧注意（NIP-36）の理由。空文字は理由なしの閲覧注意。 */
  contentWarning?: string;
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

/** 公開チャンネルと、その中の発言。返信先は同じチャンネルの発言の id。 */
export type Channel<U extends string> = When & {
  id: string;
  author: U;
  name: string;
  about: string;
  messages: readonly (When & {
    id?: string;
    author: U;
    content: string;
    replyTo?: string;
    /** 閲覧注意（NIP-36）の理由。空文字は理由なしの閲覧注意。 */
    contentWarning?: string;
  })[];
};

/** NIP-51 のユーザーリスト。非公開の人は暗号化して content に入れる。 */
export type FollowSet<U extends string> = {
  owner: U;
  identifier: string;
  title: string;
  description: string;
  publicMembers: readonly U[];
  privateMembers?: readonly U[];
};

/**
 * 画像・動画だけの投稿。kind:20 は画像（NIP-68）、kind:21 は動画、kind:22 は
 * 縦長の短い動画（NIP-71）。本文ではなく imeta にだけ画像・動画を置く。
 */
export type MediaPost<U extends string> = When & {
  id?: string;
  author: U;
  kind: 20 | 21 | 22;
  title?: string;
  content: string;
  media: readonly AssetName[];
};

/** 投票（NIP-88）と、それへの回答。`endsAt` は `{ offset: 秒 }` で先の時刻も書ける。 */
export type Poll<U extends string> = When & {
  id: string;
  author: U;
  question: string;
  options: readonly string[];
  /** いくつでも選べる。省くと 1 つ選ぶ。 */
  multiple?: boolean;
  endsAt?: When;
  /** 回答。`choices` は選んだ選択肢の番号（0 から）。 */
  votes?: readonly (When & { author: U; choices: readonly number[] })[];
};

/**
 * 長文記事（NIP-23）。本文は Markdown で、`{@kai}`・`{naddr:<id>}`・`{nevent:<id>}`
 * が使える。`image` は `assets/` のファイル名。
 */
export type Article<U extends string> = When & {
  id: string;
  author: U;
  identifier: string;
  title?: string;
  summary?: string;
  image?: AssetName;
  /** 最初に出した時刻。省くと記事の時刻と同じ。 */
  publishedAt?: When;
  hashtags?: readonly string[];
  content: string;
};

/** 絵文字セット（kind:30030）。`image` は `assets/` のファイル名。 */
export type EmojiSet<U extends string> = {
  id: string;
  owner: U;
  identifier: string;
  title: string;
  emojis: readonly { shortcode: string; image: AssetName }[];
};

/**
 * ユーザーのステータス（NIP-38）。`type` は `d` にそのまま入る（`general`・
 * `music` のほか、表示されない種類も試せる）。`expiresAt` は先の時刻なら
 * `{ offset: 秒 }`、過ぎたものは `{ ago }` で書く。
 */
export type Status<U extends string> = When & {
  author: U;
  type: string;
  content: string;
  /** `r` に入れる URL。 */
  link?: string;
  expiresAt?: When;
};

/** 見る人のデッキに並べるカラム。 */
export type DeckColumn<U extends string> = (
  | { kind: "home" }
  | { kind: "notifications" }
  | { kind: "user"; user: U }
  | { kind: "channels" }
  | { kind: "channel"; channel: string }
  | { kind: "follow-sets" }
  | { kind: "follow-set"; owner: U; identifier: string; title: string }
  | { kind: "follow-set-info"; owner: U; identifier: string; title: string }
  /** 検索カラム。`"#coffee"` のようにハッシュタグでも、言葉でも書ける。 */
  | { kind: "search"; query: string }
  /** 指定した kind のイベントをそのまま流すカラム（ホームに流れない kind を見る）。 */
  | { kind: "kinds"; title: string; kinds: readonly number[] }
) & { width?: "s" | "m" | "l" };

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
  channels?: readonly Channel<U>[];
  favoriteChannels?: readonly string[];
  followSets?: readonly FollowSet<U>[];
  mediaPosts?: readonly MediaPost<U>[];
  polls?: readonly Poll<U>[];
  articles?: readonly Article<U>[];
  emojiSets?: readonly EmojiSet<U>[];
  /** 自分の絵文字リスト（kind:10030）に入れている絵文字セットの `id`。 */
  emojiLists?: Partial<Record<U, readonly string[]>>;
  statuses?: readonly Status<U>[];
  /** ピン留めした投稿（kind:10001）。投稿の `id` を、ピン留めした順に書く。 */
  pinned?: Partial<Record<U, readonly string[]>>;
  /** 見る人のデッキ（kind:30078）。省くと Streets の既定（ホームと通知）のまま。 */
  deck?: readonly DeckColumn<U>[];
};
