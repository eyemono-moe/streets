import { encodeBech32 } from "@streets/core/nostr/nip19";
import { alice, bob } from "../note/event-stories/event-story";
import emojiUrl from "../storybook/emoji-fixture.svg";
import landscapeUrl from "../storybook/media-landscape.svg?no-inline";

const absolute = (url: string) => new URL(url, location.href).href;
const note = bob.note("記事の中から参照された投稿。");

const BODY = `タイムラインに流れてきた記事を、その場で読めるようにするまでに考えたことをまとめる。:party:

## 住所で最新版を引く

記事は書き直されるたびに **id が変わる**。引用やリンクは id ではなく *住所* で指されるので、住所から最新版を引く。~~古い版は出さない。~~

- 本文中の nostr:${encodeBech32("npub", bob.pubkey)} は、投稿と同じく名前にする
- カスタム絵文字 :party: も、投稿と同じ描き方にする
  - 入れ子のリストも崩れない
- [外へのリンク](https://example.com/) と [投稿へのリンク](nostr:${encodeBech32("note", note.id)})

1. 番号つき
2. リスト

- [x] 済んだこと
- [ ] まだのこと

\`\`\`ts
const address = parseEventAddress(tag[1]);
lookups.watchAddress(address, onChange);
\`\`\`

> 置換可能イベントは、版ではなく住所で引用される。

| kind | 表示 |
| :--- | ---: |
| 30023 | 記事 |
| 30000 | リスト |

![図](${absolute(landscapeUrl)})

<script>alert("HTML は文字のまま出る")</script>

---

インラインの \`code\` と、#nostr のハッシュタグ。`;

export const fullArticle = alice.event({
  kind: 30_023,
  content: BODY,
  tags: [
    ["d", "streets-long-form"],
    ["title", "Streets で長文を読めるようにした話"],
    [
      "summary",
      "タイムラインに流れてきた記事を、その場で読めるようにするまでに考えたこと。",
    ],
    ["image", absolute(landscapeUrl)],
    ["published_at", "1719000000"],
    ["t", "nostr"],
    ["t", "streets"],
    ["emoji", "party", emojiUrl],
  ],
});

export const bareArticle = alice.event({
  kind: 30_023,
  content: `# 題名も要約も無い記事\n\n本文の頭が要約の代わりに出る。${"長い本文が続く。".repeat(30)}`,
  tags: [["d", "bare"]],
});

export const longTitleArticle = alice.event({
  kind: 30_023,
  content: "本文",
  tags: [
    ["d", "long"],
    [
      "title",
      "とても長い題名がついた記事で、狭いカラムでは何行にも折り返して読める".repeat(
        2,
      ),
    ],
    ["summary", "要約もとても長く書いてある。".repeat(10)],
    ["image", "https://example.invalid/broken.png"],
  ],
});

export const referencedNote = note;
