import { everydayFollows, everydayPosts } from "../common/timeline";
import { defineScenario } from "../scenario";

const ARTICLE_BODY = `雨上がりの朝、川沿いを歩きながら撮った写真をまとめました。

## 朝の光

霧が晴れる前の 10 分だけ、川面が **白く光る**。{@kai} さんに教えてもらった場所です。

- 橋の上から、上流を向いて撮る
- 露出は *少し暗め* にする
  - 白飛びすると霧の形が消える
- [地図](https://example.com/map) と、前に書いた投稿 {nevent:haru-walk}

1. 三脚は要らない
2. 手ぶれ補正を入れる

- [x] 朝 6 時に着く
- [ ] 夕方も撮る

\`\`\`
ISO 200 / f8 / 1/250
\`\`\`

> 光は待っていると来る。

| 場所 | 時刻 |
| :--- | ---: |
| 橋の上 | 6:10 |
| 河原 | 6:40 |

![川の写真]({asset:photo-river.svg})

![帰り道]({asset:photo-street.svg})

前に書いた投稿（参照だけの段落は、引用のカードになる）

{nevent:haru-walk}

一緒に歩いている人たちのリスト（文の途中の参照はリンクのまま） {naddr:haru/walk-club}

{naddr:kai-notes}

<b>HTML は文字のまま出る</b>`;

/**
 * 追加した kind（投票・長文・画像/動画・リスト・絵文字セット・ステータス・ピン留め）を
 * 1 か所で確かめる。ホームには kind:1 と 6 しか流れないので、kind を指定したカラムで
 * そのまま流し、ホームには引用・naddr のリンクとして流す。
 */
export default defineScenario({
  description:
    "投票・長文・画像/動画・リスト・絵文字セット・ステータス・ピン留めの動作確認",
  viewer: "mio",
  follows: everydayFollows,
  posts: [
    ...everydayPosts,
    {
      id: "haru-intro",
      author: "haru",
      ago: "3d",
      content:
        "写真を撮っています。川と街の朝が好き。このアカウントのピン留めです。",
    },
    {
      author: "nana",
      ago: "50m",
      content: "お昼の投票、みんな入れてね！",
      quote: "nana-lunch",
    },
    {
      author: "kai",
      ago: "40m",
      content: `haru さんの記事、写真の撮り方が参考になる。\n{naddr:haru-river}`,
    },
    {
      author: "sora",
      ago: "30m",
      content: `散歩が好きな人はこのリストおすすめ。\n{naddr:haru/walk-club}`,
    },
    {
      author: "lina",
      ago: "25m",
      content: `絵文字セットを作りました。使ってね。\n{naddr:lina-emoji}`,
    },
    {
      author: "theo",
      ago: "20m",
      content: "この写真いいな。",
      quote: "haru-picture",
    },
    {
      author: "ren",
      ago: "15m",
      content: `題名の無い記事も読めるか確かめる。\n{naddr:kai-notes}`,
    },
    // 新しい kind は、それ自体より引用（nevent）で流れてくることが多い。kind ごとに 1 つずつ。
    {
      author: "nana",
      ago: "48m",
      content: `音が出るので注意。\n{nevent:kai-video}`,
    },
    {
      author: "kai",
      ago: "38m",
      content: `縦の動画もいいね。\n{nevent:lina-short}`,
    },
    {
      author: "lina",
      ago: "36m",
      content: "海と街に入れました。みんなはどこ？",
      quote: "kai-places",
    },
    {
      author: "ren",
      ago: "34m",
      content: "締め切った投票の結果、半々だった。",
      quote: "theo-tabs",
    },
    {
      author: "sora",
      ago: "28m",
      content: `記事は nevent でも引用できる。\n{nevent:haru-river}`,
    },
    {
      author: "theo",
      ago: "27m",
      content: `このリスト、nevent で貼ってみる。\n{nevent:haru/walk-club}`,
    },
    {
      author: "haru",
      ago: "26m",
      content: `sora さんの絵文字セット、かわいい。\n{nevent:sora-emoji}`,
    },
    {
      author: "nana",
      ago: "24m",
      content: "猫の絵、好き。",
      quote: "sora-picture",
    },
    {
      author: "mio",
      ago: "22m",
      content: `自分のリスト。非公開の人数も出るか確かめる。\n{nevent:mio/close-friends}`,
    },
  ],
  mediaPosts: [
    {
      id: "haru-picture",
      author: "haru",
      kind: 20,
      ago: "1h10m",
      title: "雨上がりの川",
      content: "霧が晴れる直前。",
      media: ["photo-river.svg", "photo-street.svg"],
    },
    {
      id: "sora-picture",
      author: "sora",
      kind: 20,
      ago: "1h5m",
      content: "",
      media: ["illust-cat.svg"],
    },
    {
      id: "kai-video",
      author: "kai",
      kind: 21,
      ago: "55m",
      title: "テスト用の動画",
      content: "音の確認用。",
      media: ["clip-testcard.mp4"],
    },
    {
      id: "lina-short",
      author: "lina",
      kind: 22,
      ago: "45m",
      content: "縦長の短い動画。",
      media: ["clip-vertical.mp4"],
    },
  ],
  polls: [
    {
      id: "nana-lunch",
      author: "nana",
      ago: "1h",
      question: "今日のお昼、何にする？",
      options: ["ラーメン", "カレー", "そば", "パン"],
      endsAt: { offset: 2 * 86_400 },
      votes: [
        { author: "haru", ago: "58m", choices: [0] },
        { author: "kai", ago: "57m", choices: [1] },
        { author: "sora", ago: "56m", choices: [0] },
        // 同じ人の後からの回答だけを数える（kai はカレーからそばへ変えた）
        { author: "kai", ago: "30m", choices: [2] },
      ],
    },
    {
      id: "kai-places",
      author: "kai",
      ago: "2h",
      question: "行ってみたい場所は？（いくつでも）",
      options: ["海", "山", "街"],
      multiple: true,
      endsAt: { offset: 5 * 3600 },
      votes: [
        { author: "haru", ago: "1h50m", choices: [0, 2] },
        { author: "lina", ago: "1h40m", choices: [1] },
      ],
    },
    {
      id: "theo-tabs",
      author: "theo",
      ago: "3d",
      question: "締め切った投票：タブとスペース、どっち？",
      options: ["タブ", "スペース"],
      endsAt: { ago: "1d" },
      votes: [
        { author: "ren", ago: "2d", choices: [0] },
        { author: "kai", ago: "2d", choices: [1] },
        // 締め切りの後の回答は数えない
        { author: "nana", ago: "1h", choices: [0] },
      ],
    },
    {
      id: "ren-empty",
      author: "ren",
      ago: "10m",
      question: "まだ誰も答えていない投票",
      options: ["はい", "いいえ"],
    },
  ],
  articles: [
    {
      id: "haru-river",
      author: "haru",
      identifier: "river-morning",
      ago: "1h30m",
      publishedAt: { ago: "5d" },
      title: "雨上がりの川を撮る",
      summary: "霧が晴れる前の 10 分を撮るために、気をつけていること。",
      image: "photo-river.svg",
      hashtags: ["写真", "散歩"],
      content: ARTICLE_BODY,
    },
    {
      id: "kai-notes",
      author: "kai",
      identifier: "notes",
      ago: "1h20m",
      content: `# 録音のメモ\n\n題名も要約も画像も無い記事。本文の頭が、カードの要約の代わりに出る。${"ギターの音を少し変えた。".repeat(20)}`,
    },
  ],
  followSets: [
    // 見る人（mio）のリスト。非公開のメンバーは mio にだけ読めるので、引用のカードにも人数が出る。
    {
      owner: "mio",
      identifier: "close-friends",
      title: "近しい人たち",
      description: "非公開のメンバーもいるリスト。",
      publicMembers: ["haru", "nana"],
      privateMembers: ["ren", "theo"],
    },
    {
      owner: "haru",
      identifier: "walk-club",
      title: "散歩クラブ",
      description: "街歩きの話をする人たち。",
      publicMembers: ["mio", "nana", "sora", "lina", "kai", "ren", "theo"],
    },
  ],
  emojiSets: [
    {
      id: "sora-emoji",
      owner: "sora",
      identifier: "sora-animals",
      title: "sora のいきもの",
      emojis: [
        { shortcode: "cat", image: "illust-cat.svg" },
        { shortcode: "plant", image: "illust-plant.svg" },
      ],
    },
    {
      id: "lina-emoji",
      owner: "lina",
      identifier: "lina-cafe",
      title: "lina のカフェ",
      // 多いときは先頭だけ出し、「ほか N 個」で広がる
      emojis: Array.from({ length: 30 }, (_, index) => ({
        shortcode: `cafe${index + 1}`,
        image: index % 2 === 0 ? "photo-coffee.svg" : "photo-desk.svg",
      })),
    },
  ],
  // mio は sora のセットだけを使っている（lina のセットは「加える」を押せる）
  emojiLists: { mio: ["sora-emoji"] },
  statuses: [
    {
      author: "haru",
      type: "general",
      ago: "2h",
      content: "川沿いを散歩中 📷",
    },
    {
      author: "kai",
      type: "music",
      ago: "5m",
      content: "夜のギター / kai",
      link: "https://example.com/kai-song",
      expiresAt: { offset: 3600 },
    },
    { author: "kai", type: "general", ago: "3h", content: "作業中" },
    {
      author: "lina",
      type: "general",
      ago: "1h",
      content:
        "とても長いステータスで、プロフィールでは折り返し、投稿の下では 1 行で切れることを確かめる。",
    },
    // 出ないもの：期限が過ぎた曲・消したステータス・機械向けの種類
    {
      author: "nana",
      type: "music",
      ago: "30m",
      content: "終わった曲",
      expiresAt: { ago: "10m" },
    },
    { author: "sora", type: "general", ago: "1h", content: "" },
    {
      author: "ren",
      type: "presence",
      ago: "1m",
      content: '{"lastSeen":1790790386192}',
    },
  ],
  pinned: { haru: ["haru-light", "haru-intro"] },
  deck: [
    { kind: "home" },
    {
      kind: "kinds",
      title: "追加した kind",
      kinds: [20, 21, 22, 1068, 30023, 30000, 30030],
    },
    { kind: "user", user: "haru" },
  ],
});
