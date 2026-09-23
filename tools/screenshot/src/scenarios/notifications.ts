import {
  everydayFollows,
  everydayPosts,
  everydayReactions,
  everydayReposts,
} from "../common/timeline";
import { defineScenario } from "../scenario";

/**
 * 通知。mio の投稿に、返信・リアクション・リポスト・引用・メンション・Zap が
 * ほどよく混ざって届いている。Streets の通知にフォローは出ないので、フォローは
 * フォロワーの一覧で見える形（kind:3）だけにしている。
 */
export default defineScenario({
  description: "通知：返信・リアクション・リポスト・引用・メンション・Zap",
  viewer: "mio",
  follows: everydayFollows,
  posts: [
    ...everydayPosts,
    {
      id: "mio-release",
      author: "mio",
      ago: "2h20m",
      content:
        "個人サイトのフォントを変えました。日本語の本文がだいぶ読みやすくなった気がする。",
    },
    {
      id: "mio-lunch",
      author: "mio",
      ago: "1h10m",
      content: "お昼は近所の定食屋さん。焼き魚の日だった 🐟",
    },
    {
      author: "nana",
      ago: "2h5m",
      replyTo: "mio-release",
      content: "行間も少し広げました？ 見出しとのバランスがすごくいいです。",
    },
    {
      author: "mio",
      ago: "2h",
      replyTo: "mio-release",
      content:
        "{@nana} そうなんです、1.7 から 1.8 にしました。気づいてもらえてうれしい。",
    },
    {
      author: "ren",
      ago: "55m",
      replyTo: "mio-lunch",
      content: "焼き魚の日、いいですね。自分も明日行ってみます。",
    },
    {
      author: "haru",
      ago: "35m",
      quote: "mio-release",
      content: "このフォントの組み方、写真のキャプションにも使いたい。",
    },
    {
      author: "kai",
      ago: "15m",
      content:
        "{@mio} この前教えてもらったタイマーアプリ、作曲のときにも使えて便利だった。ありがとう。",
    },
  ],
  reactions: [
    ...everydayReactions,
    { author: "nana", to: "mio-release", ago: "2h10m" },
    { author: "theo", to: "mio-release", ago: "1h45m" },
    { author: "sora", to: "mio-release", emoji: "✨", ago: "1h20m" },
    { author: "lina", to: "mio-lunch", emoji: "🐟", ago: "1h" },
    { author: "kai", to: "mio-lunch", ago: "58m" },
    { author: "haru", to: "mio-streets", ago: "45m" },
    { author: "ren", to: "mio-streets", emoji: "🙌", ago: "10m" },
  ],
  reposts: [
    ...everydayReposts,
    { author: "theo", of: "mio-release", ago: "1h40m" },
    { author: "sora", of: "mio-streets", ago: "28m" },
  ],
  zaps: [
    {
      from: "lina",
      to: "mio-release",
      sats: 210,
      message: "読みやすくなってました！",
      ago: "1h30m",
    },
    { from: "theo", to: "mio-streets", sats: 1000, ago: "20m" },
  ],
});
