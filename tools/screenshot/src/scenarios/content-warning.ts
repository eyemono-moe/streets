import { everydayFollows, everydayPosts } from "../common/timeline";
import { defineScenario } from "../scenario";

/** 閲覧注意の投稿。隠した中身と、それへの返信・引用・チャンネルでの発言を撮る。 */
export default defineScenario({
  description:
    "閲覧注意：理由あり・なし・画像付きの投稿と、返信・引用・チャンネルでの発言",
  viewer: "mio",
  follows: everydayFollows,
  posts: [
    ...everydayPosts,
    {
      id: "cw-noreason",
      author: "kai",
      ago: "1h20m",
      content: "締め切り前の机の上、正直に載せます。",
      images: ["photo-desk.svg"],
      contentWarning: "",
    },
    {
      id: "cw-photo",
      author: "haru",
      ago: "55m",
      content: "市場で見かけた大きな魚。迫力がすごかった。 #photography",
      images: ["photo-market.svg"],
      contentWarning: "生き物の写真",
    },
    {
      id: "cw-spoiler",
      author: "ren",
      ago: "40m",
      content: "最後の場面、主人公が手紙を燃やさずに残したのがすべてだと思う。",
      contentWarning: "映画のネタバレ",
    },
    {
      author: "nana",
      ago: "25m",
      content: "わかる、あそこで涙が止まらなかった。",
      replyTo: "cw-spoiler",
    },
    {
      author: "lina",
      ago: "15m",
      content: "この写真、朝の空気まで伝わってくる。",
      quote: "cw-photo",
    },
  ],
  channels: [
    {
      id: "映画を語る部屋",
      author: "ren",
      ago: "2d",
      name: "映画を語る部屋",
      about: "観た映画の感想を話そう。ネタバレは閲覧注意で",
      messages: [
        {
          author: "ren",
          ago: "2h",
          content: "今週末に観る映画を探しています。おすすめはありますか？",
        },
        {
          id: "cw-channel-spoiler",
          author: "sora",
          ago: "1h30m",
          content:
            "昨日観た作品、犯人は最初の場面から画面の端に映っていました。",
          contentWarning: "結末のネタバレ",
        },
        {
          author: "mio",
          ago: "1h",
          content: "まだ観ていないので、開かずにおきます！",
          replyTo: "cw-channel-spoiler",
        },
      ],
    },
  ],
  deck: [{ kind: "home" }, { kind: "channel", channel: "映画を語る部屋" }],
});
