import {
  everydayFollows,
  everydayPosts,
  everydayReactions,
  everydayReposts,
} from "../common/timeline";
import { defineScenario } from "../scenario";

/**
 * プロフィール。写真を撮る haru のカラムを開くと、写真付きの投稿・返信・
 * もらったリアクションが十分に並んでいる。
 */
export default defineScenario({
  description: "プロフィール：haru のカラム（写真・返信・リアクション）",
  viewer: "mio",
  follows: everydayFollows,
  posts: [
    ...everydayPosts,
    {
      id: "haru-market",
      author: "haru",
      ago: "1d",
      content:
        "日曜の朝市。野菜の色がきれいで、つい何枚も撮ってしまう。 #photography",
      images: ["photo-market.svg"],
    },
    {
      author: "haru",
      ago: "20h",
      content:
        "フィルムを 3 本現像に出した。戻ってくるまでの一週間がいちばん楽しい。",
    },
    {
      id: "haru-sea",
      author: "haru",
      ago: "8h",
      content: "海沿いの道。風が強かったけど、雲の形がよかった。",
      images: ["photo-sea.svg"],
    },
    {
      author: "haru",
      ago: "15m",
      replyTo: "nana-question",
      content: "遠くから見るの、写真のトリミングでも同じことしてます。",
    },
  ],
  reactions: [
    ...everydayReactions,
    { author: "mio", to: "haru-market", ago: "23h" },
    { author: "lina", to: "haru-market", emoji: "🥕", ago: "22h" },
    { author: "sora", to: "haru-sea", emoji: "🌊", ago: "7h" },
    { author: "nana", to: "haru-sea", ago: "6h" },
    { author: "kai", to: "haru-light", ago: "25m" },
  ],
  reposts: [...everydayReposts, { author: "lina", of: "haru-sea", ago: "5h" }],
  deck: [{ kind: "user", user: "haru" }, { kind: "home" }],
});
