import {
  everydayFollows,
  everydayPosts,
  everydayReactions,
  everydayReposts,
} from "../common/timeline";
import { defineScenario } from "../scenario";

/** 写真やイラストの投稿。画像を並べたカラムを撮る。 */
export default defineScenario({
  description: "画像：写真やイラストの投稿を並べる",
  viewer: "mio",
  follows: everydayFollows,
  posts: [
    ...everydayPosts,
    {
      author: "sora",
      ago: "4h",
      content:
        "観葉植物のスケッチ。葉っぱの重なりを描くのが楽しい。 #illustration",
      images: ["illust-plant.svg"],
    },
    {
      author: "haru",
      ago: "3h30m",
      content: "路地裏の午後。 #photography",
      images: ["photo-street.svg", "photo-river.svg"],
    },
    {
      author: "lina",
      ago: "2h40m",
      content: "今日のラテアート、今までで一番うまくいった。 #coffee",
      images: ["photo-coffee.svg"],
    },
    {
      author: "nana",
      ago: "1h50m",
      content: "作業机を片付けたら、気持ちまで整った。",
      images: ["photo-desk.svg"],
    },
  ],
  reactions: everydayReactions,
  reposts: everydayReposts,
  deck: [
    { kind: "home" },
    { kind: "search", query: "#photography" },
    { kind: "notifications" },
  ],
});
