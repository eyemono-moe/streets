import {
  everydayFollows,
  everydayPosts,
  everydayReactions,
} from "../common/timeline";
import { defineScenario } from "../scenario";

/** 会話。nana の問いかけに何人かが答え、返信にさらに返信が付いている。 */
export default defineScenario({
  description: "スレッド：ひとつの問いかけに、何人かが答えている",
  viewer: "mio",
  follows: everydayFollows,
  posts: [
    ...everydayPosts,
    {
      id: "thread-root",
      author: "nana",
      ago: "1h25m",
      content:
        "みなさんは、作業に集中したいときに何を聴いていますか？ 最近いつものプレイリストに飽きてきた。",
    },
    {
      id: "thread-kai",
      author: "kai",
      ago: "1h20m",
      replyTo: "thread-root",
      content:
        "歌の入っていない lo-fi をよく聴いてます。よかったら自分の作ったのも置いておきます 🎧",
    },
    {
      author: "nana",
      ago: "1h15m",
      replyTo: "thread-kai",
      content:
        "ありがとうございます！ 雨の音のやつ、さっき聴きました。すごくよかったです。",
    },
    {
      id: "thread-haru",
      author: "haru",
      ago: "1h10m",
      replyTo: "thread-root",
      content:
        "写真の現像をするときは、ラジオをつけっぱなしにしてることが多いです。",
    },
    {
      author: "lina",
      ago: "1h5m",
      replyTo: "thread-haru",
      content:
        "わかります。お店でもラジオを流してると、話しかけてもらいやすい気がする。",
    },
    {
      author: "theo",
      ago: "55m",
      replyTo: "thread-root",
      content: "Brown noise, almost always. It's boring in the best way.",
    },
    {
      author: "mio",
      ago: "40m",
      replyTo: "thread-root",
      content:
        "ゲームのサウンドトラックがおすすめです。集中を邪魔しないように作られてるので。",
    },
  ],
  reactions: [
    ...everydayReactions,
    { author: "mio", to: "thread-root", ago: "1h20m" },
    { author: "sora", to: "thread-root", emoji: "🎶", ago: "1h" },
    { author: "nana", to: "thread-haru", ago: "1h" },
    { author: "ren", to: "thread-kai", ago: "50m" },
  ],
});
