import type { UserProfile } from "./define";

/**
 * スクリーンショットに出てくる架空の人たち。アイコンは付けない（Streets が pubkey から
 * 作る標識で見分けられる）。キーがシナリオから指すときの ID で、
 * 鍵もこの ID から決まる（`keys.ts`）。実在の人や、知られている Nostr のユーザーに
 * 似せない。投稿の内容がその人らしくなるよう、人物像をここに書いておく。
 */
export const users = {
  // Web のフロントエンドを書いている。Streets を使う側として、多くのシナリオで「見る人」。
  mio: {
    name: "mio",
    displayName: "Mio",
    about: "Web フロントエンドを書いています。TypeScript とコーヒーが好き。",
    banner: "banner-mio.svg",
    website: "https://mio.example",
  },
  // 街と光を撮る。散歩が長い。
  haru: {
    name: "haru",
    displayName: "Haru",
    about: "街の写真を撮っています。フィルムとデジタル半々。朝の散歩が日課。",
  },
  // 夜にギターを弾いて曲を作る。
  kai: {
    name: "kai",
    displayName: "Kai 🎸",
    about: "Guitar / lo-fi beats. 夜に少しずつ曲を作ってます。",
  },
  // UI デザインと文字組み。
  nana: {
    name: "nana",
    displayName: "七海",
    about: "UI デザイナー。文字組みと余白の話が好きです。",
  },
  // 情報系の学生。図書館とカフェを行き来している。
  ren: {
    name: "ren",
    displayName: "Ren",
    about: "情報系の学生。最近は分散システムの本を読んでいます。",
  },
  // 動物と植物を描く。
  sora: {
    name: "sora",
    displayName: "そら",
    about: "イラストを描いています。猫と植物が多め。",
  },
  // 英語圏の OSS メンテナー。
  theo: {
    name: "theo",
    displayName: "Theo",
    about: "Open source maintainer. Mostly Rust and tiny CLI tools.",
  },
  // 小さな焙煎所で働いている。
  lina: {
    name: "lina",
    displayName: "Lina",
    about: "小さな焙煎所で働いています。今日の一杯を記録中。",
  },
} as const satisfies Record<string, UserProfile>;

/** シナリオから人を指す ID。無い ID を書くと型で分かる。 */
export type UserId = keyof typeof users;
