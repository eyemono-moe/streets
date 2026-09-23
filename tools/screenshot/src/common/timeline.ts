import type { Post, Reaction, Repost } from "../define";
import type { UserId } from "../users";

/**
 * みんなのふだんのタイムライン。どのシナリオでも土台にする。技術の話ばかりに
 * ならないよう、日常・音楽・写真・コーヒー・散歩・デザインを混ぜる。
 */

/** 誰が誰をフォローしているか。mio は全員を、ほかの人は数人ずつ。 */
export const everydayFollows = {
  mio: ["haru", "kai", "nana", "ren", "sora", "theo", "lina"],
  haru: ["mio", "lina", "sora", "nana"],
  kai: ["mio", "sora", "haru"],
  nana: ["mio", "sora", "haru", "theo"],
  ren: ["mio", "theo", "nana"],
  sora: ["nana", "haru", "kai", "mio"],
  theo: ["mio", "ren"],
  lina: ["haru", "mio", "kai"],
} as const satisfies Partial<Record<UserId, readonly UserId[]>>;

export const everydayPosts = [
  {
    id: "lina-morning",
    author: "lina",
    ago: "3h",
    content:
      "朝いちばんの焙煎が終わりました。今日のエチオピアはベリーっぽさが強め。 #coffee",
  },
  {
    id: "haru-walk",
    author: "haru",
    ago: "2h50m",
    content:
      "川沿いを歩いたら、ちょうど霧が晴れていくところだった。今日はいい日になりそう。",
    images: ["photo-river.svg"],
  },
  {
    author: "theo",
    ago: "2h30m",
    content:
      "Shipped a small release today. Mostly bug fixes, but the new --dry-run flag is something I wanted for years.",
  },
  {
    id: "nana-type",
    author: "nana",
    ago: "2h",
    content:
      "見出しの字間を 2% 詰めただけで、画面全体が落ち着いた。余白の調整は地味だけど効く。 #design",
  },
  {
    id: "kai-demo",
    author: "kai",
    ago: "1h40m",
    content:
      "雨の音をサンプリングして、ゆっくりめのビートを作ってみた。夜に聴くとちょうどいい。 #music",
  },
  {
    author: "ren",
    ago: "1h30m",
    content:
      "図書館の窓際の席、午後になると日が当たって眠くなる問題。結局カフェに移動した。",
  },
  {
    id: "sora-cat",
    author: "sora",
    ago: "1h",
    content: "近所の猫を描きました。しっぽの模様がかわいい。",
    images: ["illust-cat.svg"],
  },
  {
    id: "mio-streets",
    author: "mio",
    ago: "50m",
    content:
      "カラムを並べて、ホームと通知と #coffee を一度に眺めるのが最近の朝の習慣。",
  },
  {
    author: "lina",
    ago: "40m",
    content:
      "お店に来てくれた方が、自分で淹れる用に豆を買っていってくれた。うれしい。",
  },
  {
    id: "haru-light",
    author: "haru",
    ago: "30m",
    content:
      "Golden hour on the way home. 影が長い季節になってきた。 #photography",
    images: ["photo-street.svg"],
  },
  {
    author: "ren",
    ago: "25m",
    content:
      "論文の図を眺めていたら、合意アルゴリズムがちょっとわかった気がする。気がするだけかもしれない。",
  },
  {
    id: "nana-question",
    author: "nana",
    ago: "18m",
    content:
      "ボタンの角の丸み、4px と 8px で迷ったら、並べて遠くから見るのがいちばん早い。",
  },
  {
    author: "kai",
    ago: "12m",
    content: "Coffee first, then guitar practice. That's the plan anyway ☕️🎸",
  },
  {
    id: "theo-oss",
    author: "theo",
    ago: "6m",
    content:
      "Someone sent a PR that fixes the Windows path bug I couldn't reproduce. Open source is lovely sometimes.",
  },
  {
    author: "sora",
    ago: "2m",
    content: "ベランダのバジルが元気すぎる。今日はパスタにしよう。",
  },
] as const satisfies readonly Post<UserId>[];

export const everydayReactions = [
  { author: "mio", to: "lina-morning", ago: "2h" },
  { author: "haru", to: "lina-morning", emoji: "☕️", ago: "2h" },
  { author: "sora", to: "haru-walk", ago: "2h" },
  { author: "mio", to: "haru-walk", emoji: "🌫️", ago: "1h50m" },
  { author: "haru", to: "nana-type", ago: "1h" },
  { author: "mio", to: "kai-demo", emoji: "🎧", ago: "1h" },
  { author: "nana", to: "sora-cat", emoji: "🐈", ago: "45m" },
  { author: "kai", to: "sora-cat", ago: "40m" },
  { author: "lina", to: "haru-light", ago: "20m" },
  { author: "ren", to: "theo-oss", ago: "4m" },
] as const satisfies readonly Reaction<UserId>[];

export const everydayReposts = [
  { author: "mio", of: "nana-type", ago: "1h30m" },
  { author: "lina", of: "kai-demo", ago: "1h" },
] as const satisfies readonly Repost<UserId>[];
