import { describe, expect, it } from "vitest";
import { buildQuote, buildReply } from "../core/nostr/build/note";
import { buildReaction } from "../core/nostr/build/reaction";
import { buildRepost } from "../core/nostr/build/repost";
import type { NostrEvent } from "../core/nostr/event";
import { EventStore } from "../core/read/event-store";
import { createStoryAuthor } from "./story-events";

const draftOf = ({ kind, tags, content }: NostrEvent) => ({
  kind,
  tags,
  content,
});

describe("createStoryAuthor", () => {
  it("同じ seed と呼び出し順から同じ署名済みイベントを作る", () => {
    const first = createStoryAuthor(91);
    const second = createStoryAuthor(91);

    // 捕まえる変異: 作成時刻や鍵を現在時刻・乱数から作り、Story の表示が
    // リロードごとに変わる。
    expect(first.note("same")).toEqual(second.note("same"));
  });

  it("本番ビルダで組み立てたイベントが EventStore の検証を通る", () => {
    const alice = createStoryAuthor(92, { name: "alice" });
    const bob = createStoryAuthor(93, { name: "bob" });
    const root = alice.note("root");
    const events = [
      alice.profile(),
      root,
      bob.reply("reply", { parent: root }),
      bob.quote("quote", { target: root }),
      bob.repost(root),
      bob.reaction(root, { type: "like" }),
      bob.unknown(31_337, "unknown"),
    ];
    const store = new EventStore();

    // 捕まえる変異: id または sig を仮値にし、Story 専用経路で検証を
    // 迂回する。有効なイベントだけを受け付ける本番 store では rejected に
    // なるため、すべてを通す必要がある。
    expect(
      events.map((event) => store.put(event, "wss://storybook.invalid/")),
    ).toEqual(events.map(() => "inserted"));
  });

  it("返信・引用・リポスト・リアクションを本番のタグ形式で作る", () => {
    const alice = createStoryAuthor(94);
    const bob = createStoryAuthor(95);
    const target = alice.note("target");
    const reply = bob.reply("reply", { parent: target });
    const quote = bob.quote("quote", { target });
    const repost = bob.repost(target);
    const reaction = bob.reaction(target, { type: "like" });

    // 捕まえる変異: Story factory のイベント形を本番ビルダからずらし、
    // 見た目に必要な一部のタグや content だけを独自に組み立てる。
    expect(draftOf(reply)).toEqual(buildReply(target, "reply"));
    expect(draftOf(quote)).toEqual(buildQuote(target, "quote"));
    expect(draftOf(repost)).toEqual(buildRepost(target));
    expect(draftOf(reaction)).toEqual(buildReaction(target, { type: "like" }));
  });
});
