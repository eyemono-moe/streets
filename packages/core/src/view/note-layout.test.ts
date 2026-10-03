import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { encodeBech32, encodeNaddr } from "../nostr/nip19";
import { MAX_LINK_CARDS, layoutNote } from "./note-layout";

const ID_A = "a".repeat(64);
const ID_B = "b".repeat(64);

const note = (content: string, tags: string[][] = []): NostrEvent => ({
  id: "0".repeat(64),
  pubkey: "c".repeat(64),
  created_at: 0,
  kind: 1,
  tags,
  content,
  sig: "0".repeat(128),
});

describe("layoutNote", () => {
  it("画像 URL を本文から抜き、前後の空白を落とす", () => {
    const layout = layoutNote(note("見て\nhttps://example.com/a.png\n"), {
      quotes: true,
    });
    expect(layout.text).toEqual([{ type: "text", text: "見て" }]);
    expect(layout.media).toEqual([
      { type: "image", url: "https://example.com/a.png" },
    ]);
  });

  it("画像でない URL は本文に残す", () => {
    const layout = layoutNote(note("https://example.com/page"), {
      quotes: true,
    });
    expect(layout.text).toEqual([
      { type: "url", url: "https://example.com/page" },
    ]);
    expect(layout.media).toEqual([]);
  });

  it("画像と動画を本文の順に抜き、拡張子が無い動画も imeta から判定する", () => {
    const layout = layoutNote(
      note(
        "https://example.com/a.png https://example.com/clip https://example.com/b.webm",
        [["imeta", "url https://example.com/clip", "m video/mp4"]],
      ),
      { quotes: true },
    );
    expect(layout.media).toEqual([
      { type: "image", url: "https://example.com/a.png" },
      { type: "video", url: "https://example.com/clip" },
      { type: "video", url: "https://example.com/b.webm" },
    ]);
    expect(layout.text).toEqual([]);
  });

  it("nostr.build の /mp4/ にある GIF URL は動画にする", () => {
    const url =
      "https://gifs.nostr.build/mp4/orig/82cc31b3042503850deee14d4c5459d6804b794a6a653b6b55b59659e73f4442.gif";
    const layout = layoutNote(note(`おはよう ${url}`), { quotes: true });
    expect(layout.media).toEqual([{ type: "video", url }]);
    expect(layout.text).toEqual([{ type: "text", text: "おはよう" }]);
    expect(
      layoutNote(note("https://gifs.nostr.build/orig/clip.gif"), {
        quotes: true,
      }).media,
    ).toEqual([
      { type: "image", url: "https://gifs.nostr.build/orig/clip.gif" },
    ]);
  });

  it("音声は画像・動画と分けて抜き、拡張子が無いものも imeta から判定する", () => {
    const layout = layoutNote(
      note(
        "聞いて https://example.com/a.mp3 https://example.com/b.png https://example.com/voice",
        [["imeta", "url https://example.com/voice", "m audio/ogg"]],
      ),
      { quotes: true },
    );
    expect(layout.audio).toEqual([
      "https://example.com/a.mp3",
      "https://example.com/voice",
    ]);
    expect(layout.media).toEqual([
      { type: "image", url: "https://example.com/b.png" },
    ]);
    expect(layout.links).toEqual([]);
    expect(layout.text).toEqual([{ type: "text", text: "聞いて" }]);
  });

  it("本文にある URL と一致した imeta の寸法・Blurhash だけを添える", () => {
    const layout = layoutNote(
      note("https://example.com/a.png", [
        [
          "imeta",
          "url https://example.com/a.png",
          "dim 640x480",
          "blurhash LEHV6nWB2yk8pyo0adR*.7kCMdnj",
        ],
        ["imeta", "url https://example.com/other.png", "dim 1x1"],
      ]),
      { quotes: true },
    );
    expect(layout.media).toEqual([
      {
        type: "image",
        url: "https://example.com/a.png",
        dimensions: { width: 640, height: 480 },
        blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
      },
    ]);
  });

  it("imeta の MIME は拡張子より優先し、対応しない種類はリンクに残す", () => {
    const layout = layoutNote(
      note("https://example.com/a.mp4 https://example.com/b.jpg", [
        ["imeta", "url https://example.com/a.mp4", "m image/jpeg"],
        ["imeta", "url https://example.com/b.jpg", "m application/pdf"],
      ]),
      { quotes: true },
    );
    expect(layout.media).toEqual([
      { type: "image", url: "https://example.com/a.mp4" },
    ]);
    expect(layout.text).toEqual([
      { type: "url", url: "https://example.com/b.jpg" },
    ]);
  });

  it("MIME の形でない m は無視して拡張子で判定する", () => {
    const layout = layoutNote(
      note("https://blossom.primal.net/a.jpg", [
        [
          "imeta",
          "url https://blossom.primal.net/a.jpg",
          "m jpeg",
          "dim 4284.0x5712.0",
        ],
      ]),
      { quotes: true },
    );
    expect(layout.media).toEqual([
      {
        type: "image",
        url: "https://blossom.primal.net/a.jpg",
        dimensions: { width: 4284, height: 5712 },
      },
    ]);
    expect(layout.text).toEqual([]);
  });

  it("nostr:note を引用として抜き、同じ id は 1 回だけにする", () => {
    const ref = `nostr:${encodeBech32("note", ID_A)}`;
    const layout = layoutNote(note(`これ ${ref} と ${ref}`), {
      quotes: true,
    });
    expect(layout.quotes).toEqual([{ form: "id", id: ID_A }]);
    expect(layout.text).toEqual([{ type: "text", text: "これ  と" }]);
  });

  it("本文に無い q タグの引用を後ろに足す", () => {
    const ref = `nostr:${encodeBech32("note", ID_A)}`;
    const layout = layoutNote(
      note(ref, [
        ["q", ID_A],
        ["q", ID_B],
      ]),
      { quotes: true },
    );
    expect(
      layout.quotes.map((quote) => quote.form === "id" && quote.id),
    ).toEqual([ID_A, ID_B]);
    expect(layout.text).toEqual([]);
  });

  it("quotes: false なら参照を本文に残し、q タグも拾わない", () => {
    const ref = `nostr:${encodeBech32("note", ID_A)}`;
    const layout = layoutNote(note(`これ ${ref}`, [["q", ID_B]]), {
      quotes: false,
    });
    expect(layout.quotes).toEqual([]);
    expect(layout.text.map((token) => token.type)).toEqual(["text", "mention"]);
  });

  describe("links", () => {
    it("画像・動画でない URL をカードにし、本文にもリンクとして残す", () => {
      const layout = layoutNote(
        note("読んだ https://example.com/article と https://example.com/a.png"),
        { quotes: true },
      );
      expect(layout.links).toEqual(["https://example.com/article"]);
      expect(layout.text).toContainEqual({
        type: "url",
        url: "https://example.com/article",
      });
      expect(layout.media.map((item) => item.url)).toEqual([
        "https://example.com/a.png",
      ]);
    });

    it("同じ URL は 1 回、上限まで", () => {
      const urls = Array.from(
        { length: MAX_LINK_CARDS + 2 },
        (_, i) => `https://example.com/${i}`,
      );
      const layout = layoutNote(note([urls[0], ...urls].join(" ")), {
        quotes: true,
      });
      // 捕まえる変異: 上限を見ない（URL を並べただけの投稿が縦に伸び続ける）
      expect(layout.links).toEqual(urls.slice(0, MAX_LINK_CARDS));
    });

    it("nostr: の参照はカードにしない", () => {
      const layout = layoutNote(note(`nostr:${encodeBech32("note", ID_A)}`), {
        quotes: true,
      });
      expect(layout.links).toEqual([]);
    });
  });

  it("本文の naddr を住所の引用として抜き、同じ住所は 1 つにする", () => {
    // 捕まえる変異: naddr を本文の文字に残し、引用カードにならない
    const naddr = encodeNaddr({
      identifier: "post",
      pubkey: ID_A,
      eventKind: 30_023,
      relays: ["wss://relay.example/"],
    });
    const layout = layoutNote(note(`nostr:${naddr} nostr:${naddr}`), {
      quotes: true,
    });
    expect(layout.text).toEqual([]);
    expect(layout.quotes).toEqual([
      {
        form: "address",
        address: `30023:${ID_A}:post`,
        relay: "wss://relay.example/",
      },
    ]);
  });

  it("画像の投稿（kind:20）は imeta の画像を並べる", () => {
    // 捕まえる変異: 本文の URL だけを見て、imeta にしか無い画像を落とす
    const layout = layoutNote(
      {
        ...note("海に行った", [
          ["imeta", "url https://example.com/a", "m image/jpeg", "dim 800x600"],
          ["imeta", "url https://example.com/b", "blurhash LKO2?U%2Tw=w"],
        ]),
        kind: 20,
      },
      { quotes: true },
    );
    expect(layout.text).toEqual([{ type: "text", text: "海に行った" }]);
    expect(layout.media).toEqual([
      {
        type: "image",
        url: "https://example.com/a",
        dimensions: { width: 800, height: 600 },
      },
      {
        type: "image",
        url: "https://example.com/b",
        blurhash: "LKO2?U%2Tw=w",
      },
    ]);
  });

  it("動画の投稿（kind:21）は、種類の分からない imeta も動画にし、本文と同じ URL は 1 回にする", () => {
    const layout = layoutNote(
      {
        ...note("https://example.com/clip.mp4", [
          ["imeta", "url https://example.com/clip.mp4", "m video/mp4"],
          ["imeta", "url https://example.com/clip"],
        ]),
        kind: 21,
      },
      { quotes: true },
    );
    expect(layout.media.map((item) => [item.type, item.url])).toEqual([
      ["video", "https://example.com/clip.mp4"],
      ["video", "https://example.com/clip"],
    ]);
  });

  it("ふつうの投稿では、本文に無い imeta を並べない", () => {
    const layout = layoutNote(
      note("本文", [["imeta", "url https://example.com/a.png"]]),
      { quotes: true },
    );
    expect(layout.media).toEqual([]);
  });
});
