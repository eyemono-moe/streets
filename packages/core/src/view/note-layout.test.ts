import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { encodeBech32 } from "../nostr/nip19";
import { layoutNote } from "./note-layout";

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
    expect(layout.images).toEqual(["https://example.com/a.png"]);
  });

  it("画像でない URL は本文に残す", () => {
    const layout = layoutNote(note("https://example.com/page"), {
      quotes: true,
    });
    expect(layout.text).toEqual([
      { type: "url", url: "https://example.com/page" },
    ]);
    expect(layout.images).toEqual([]);
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
});
