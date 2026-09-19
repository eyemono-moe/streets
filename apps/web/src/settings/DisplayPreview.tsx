import { buildReaction } from "@streets/core/nostr/build/reaction";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import type { Component } from "solid-js";
import Event from "../note/Event";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";

/**
 * 色の当たり方を見るための投稿。リンク・メンション・ハッシュタグ・自分のいいねは
 * アクセントカラーで描かれるので、全部入りの 1 件を手元で作って並べる（リレーには出さない）。
 */
const DisplayPreview: Component = () => {
  const author = createStoryAuthor(201, {
    name: "streets",
    displayName: "Streets",
  });
  const friend = createStoryAuthor(202, {
    name: "friend",
    displayName: "ともだち",
  });
  const other = createStoryAuthor(203, {
    name: "other",
    displayName: "ほかのひと",
  });
  const viewer = createStoryAuthor(204, { name: "you", displayName: "あなた" });

  const note = author.note(
    `色を確かめるためのノート。https://example.com/ へのリンク、#streets のハッシュタグ、nostr:${encodeBech32("npub", friend.pubkey)} へのメンションが入っています。`,
    [["t", "streets"]],
  );
  const reactions = [
    viewer.event(buildReaction(note, { type: "like" })),
    friend.event(buildReaction(note, { type: "text", content: "🥰" })),
    other.event(buildReaction(note, { type: "text", content: "🥰" })),
  ];

  return (
    <EventSceneProvider
      scene={{
        events: [
          author.profile(),
          friend.profile(),
          other.profile(),
          viewer.profile(),
          note,
          ...reactions,
        ],
        viewer,
      }}
    >
      {/* 見本なので、押しても何も起こさない（名刺は出る）。 */}
      <Mediates handle={() => true}>
        <div class="overflow-hidden rounded-2 border border-primary">
          <Event event={note} size="normal" />
        </div>
      </Mediates>
    </EventSceneProvider>
  );
};

export default DisplayPreview;
