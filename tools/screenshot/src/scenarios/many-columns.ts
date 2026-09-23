import {
  everydayFollows,
  everydayReactions,
  everydayReposts,
} from "../common/timeline";
import { defineScenario } from "../scenario";
import notifications from "./notifications";

/**
 * 複数カラム。ホーム・通知・#coffee・#music・kai のカラムを並べ、どのカラムにも
 * 違う中身が出るよう、ハッシュタグの投稿を足している。
 */
export default defineScenario({
  description: "複数カラム：ホーム・通知・#coffee・#music・kai を並べる",
  viewer: "mio",
  follows: everydayFollows,
  posts: [
    ...notifications.posts,
    {
      author: "lina",
      ago: "5h",
      content:
        "浅煎りは 90℃、深煎りは 85℃ くらいで淹れるのが好きです。 #coffee",
    },
    {
      author: "ren",
      ago: "2h15m",
      content:
        "試験勉強のお供に、はじめてハンドドリップしてみた。思ったより簡単。 #coffee",
    },
    {
      author: "haru",
      ago: "45m",
      content: "駅前の新しいお店、カップの色がきれいだった。 #coffee",
      images: ["photo-coffee.svg"],
    },
    {
      author: "sora",
      ago: "3h",
      content: "絵を描くときは、昔のシティポップを流してます。 #music",
    },
    {
      author: "kai",
      ago: "4h",
      content:
        "新しい曲、サビのコード進行がやっと決まった。今夜は録音する。 #music",
    },
    {
      author: "kai",
      ago: "35m",
      content:
        "Tuned my old guitar and it sounds warmer than I remembered. #music",
    },
  ],
  reactions: notifications.reactions ?? everydayReactions,
  reposts: notifications.reposts ?? everydayReposts,
  zaps: notifications.zaps,
  deck: [
    { kind: "home" },
    { kind: "notifications" },
    { kind: "hashtag", tag: "coffee" },
    { kind: "hashtag", tag: "music" },
    { kind: "user", user: "kai" },
  ],
});
