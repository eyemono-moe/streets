import { everydayFollows, everydayPosts } from "../common/timeline";
import { defineScenario } from "../scenario";

/** チャンネルとユーザーリストを、一覧・中身・情報の 5 カラムで撮る。 */
export default defineScenario({
  description:
    "チャンネル一覧・会話と、ユーザーリスト一覧・投稿・公開/非公開メンバー",
  viewer: "mio",
  follows: everydayFollows,
  posts: [
    ...everydayPosts,
    {
      author: "haru",
      ago: "35m",
      content:
        "雨上がりの商店街。濡れた路面に看板の色が映っていた。 #streetphoto",
      images: ["photo-street.svg"],
    },
    {
      author: "nana",
      ago: "1h20m",
      content: "散歩中に見つけた古い案内板、文字の間がとてもいい。 #街歩き",
    },
    {
      author: "sora",
      ago: "2h10m",
      content: "公園の木とベンチを描いてみました。夕方の色が好き。",
      images: ["illust-plant.svg"],
    },
  ],
  channels: [
    {
      id: "街の喫茶室",
      author: "mio",
      ago: "2d",
      name: "街の喫茶室",
      about: "散歩の途中で見つけた景色やお店の話をしよう",
      messages: [
        {
          id: "coffee-open",
          author: "mio",
          ago: "3h",
          content:
            "今週末、駅前を歩く人いますか？ 新しい喫茶店を見つけました ☕",
        },
        {
          author: "haru",
          ago: "2h45m",
          content: "行きたいです。帰りに川沿いも撮れそう。",
          replyTo: "coffee-open",
        },
        {
          author: "nana",
          ago: "1h40m",
          content: "私も！ 看板の文字が気になってました。",
        },
        {
          author: "mio",
          ago: "25m",
          content: "では土曜の午後に。おすすめの場所があれば教えてください。",
        },
      ],
    },
    {
      id: "つくる人の部屋",
      author: "kai",
      ago: "3d",
      name: "つくる人の部屋",
      about: "制作途中の話や小さな発見を共有する場所",
      messages: [
        {
          author: "kai",
          ago: "4h",
          content: "録音の音を少し変えたら、ギターがいい感じになりました。",
        },
        {
          author: "sora",
          ago: "1h",
          content: "新しい絵の下書きができました 🌿",
        },
      ],
    },
  ],
  favoriteChannels: ["街の喫茶室"],
  followSets: [
    {
      owner: "mio",
      identifier: "city-notes",
      title: "街を見つめる人たち",
      description: "写真、デザイン、イラスト。街の景色を集めています。",
      publicMembers: ["haru", "nana", "sora"],
      privateMembers: ["ren"],
    },
    {
      owner: "mio",
      identifier: "music-and-coffee",
      title: "音楽とコーヒー",
      description: "作業の合間に読みたい投稿。",
      publicMembers: ["kai", "lina"],
    },
    {
      owner: "haru",
      identifier: "walking-friends",
      title: "散歩仲間",
      description: "街歩きの話をする人たち。",
      publicMembers: ["mio", "nana"],
    },
  ],
  deck: [
    { kind: "channels", width: "s" },
    { kind: "channel", channel: "街の喫茶室" },
    { kind: "follow-sets", width: "s" },
    {
      kind: "follow-set",
      owner: "mio",
      identifier: "city-notes",
      title: "街を見つめる人たち",
    },
    {
      kind: "follow-set-info",
      owner: "mio",
      identifier: "city-notes",
      title: "街を見つめる人たち",
    },
  ],
});
