import {
  addressOfEvent,
  formatEventAddress,
} from "@streets/core/nostr/address";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { fullArticle } from "../../article/story-articles";
import {
  EventStory,
  bob,
  carol,
  eventStoryMeta,
  plain,
  scene,
} from "./event-story";

const repost = carol.repost(plain);
const missingTarget = bob.note("このイベントはシーンに入れない");
const repostOfMissing = carol.repost(missingTarget);
const loadingTarget = bob.note("このイベントもシーンに入れない");
const repostOfLoading = carol.repost(loadingTarget);
/** 本文を埋め込まないクライアントのリポスト。元投稿は取りにいって描く。 */
const { kind, tags } = carol.repost(plain);
const bareRepost = carol.event({ kind, tags, content: "" });

/** 汎用リポスト（NIP-18 の kind:16）。住所を持つものは `a` タグでも指す。 */
const genericRepost = (target: NostrEvent, embed: boolean) => {
  const address = addressOfEvent(target);
  return carol.event({
    kind: 16,
    tags: [
      ["e", target.id, ""],
      ...(address ? [["a", formatEventAddress(address), ""]] : []),
      ["k", String(target.kind)],
      ["p", target.pubkey],
    ],
    content: embed ? JSON.stringify(target) : "",
  });
};
const articleRepost = genericRepost(fullArticle, false);
const embeddedArticleRepost = genericRepost(fullArticle, true);

const meta = {
  ...eventStoryMeta,
  title: "イベント/リポスト",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const リポスト: Story = {
  args: { event: repost, scene: scene(repost, plain) },
};

export const リポスト元を読み込み中: Story = {
  args: { event: repostOfLoading, scene: scene(repostOfLoading) },
};

export const リポスト元が見つからない: Story = {
  args: {
    event: repostOfMissing,
    scene: { ...scene(repostOfMissing), missingIds: [missingTarget.id] },
  },
};

/** 記事のように kind:1 以外を流したもの。住所で取りにいって描く。 */
export const 汎用リポスト: Story = {
  args: { event: articleRepost, scene: scene(articleRepost, fullArticle) },
};

/** 中身を埋め込んだ汎用リポストは、取りにいかずに描く。 */
export const 汎用リポスト_埋め込み: Story = {
  args: { event: embeddedArticleRepost, scene: scene(embeddedArticleRepost) },
};

export const 高密度: Story = {
  args: { event: repost, scene: scene(repost, plain), size: "compact" },
};

/** 取ってきた元投稿がミュートに当たれば、リポストの行を残して中身だけ畳む。 */
export const リポスト元がミュートに当たる: Story = {
  args: {
    event: bareRepost,
    scene: {
      ...scene(bareRepost, plain),
      mutes: [
        {
          target: { type: "word", value: "マルチカラム" },
          visibility: "private",
        },
      ],
    },
  },
};
