import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayProgress } from "@streets/core/write/write-progress";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import WriteProgressToast, { type WriteToastMeta } from "./WriteProgressToast";

type Args = { meta: WriteToastMeta["write"] };

/** トーストの枠はアプリと同じ見た目にして、中身だけを差し替えて並べる。 */
const Story = (props: Args) => (
  <div class="p-6">
    <div class="w-80 rounded-2 border border-primary bg-primary p-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <WriteProgressToast meta={props.meta} />
    </div>
  </div>
);

const relay = (
  host: string,
  state: RelayProgress["state"],
  reason?: string,
): RelayProgress => ({
  relay: `wss://${host}/` as RelayUrl,
  state,
  ...(reason ? { reason } : {}),
});

const sending = (label: string, ...relays: RelayProgress[]): Args => ({
  meta: { label, progress: { phase: "sending", relays } },
});

const meta = {
  title: "書き込み/進み具合のトースト",
  component: Story,
  args: { meta: { label: "リレーの設定", progress: { phase: "checking" } } },
  argTypes: { meta: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 最新の状態を確認中: S = {};

export const 送信中: S = {
  args: sending(
    "リアクション",
    relay("yabu.me", "pending"),
    relay("nos.lol", "pending"),
    relay("relay.damus.io", "pending"),
  ),
};

/** 1 本受け取った時点で「保存しました」。残りの輪はまだ埋まっていく。 */
export const 一つ届いた: S = {
  args: sending(
    "リアクション",
    relay("yabu.me", "accepted"),
    relay("nos.lol", "pending"),
    relay("relay.damus.io", "pending"),
  ),
};

export const 全部届いた: S = {
  args: {
    meta: {
      ...sending(
        "投稿",
        relay("yabu.me", "accepted"),
        relay("nos.lol", "accepted"),
      ).meta,
      outcome: { kind: "done" },
    },
  },
};

export const 一部届かなかった: S = {
  args: {
    meta: {
      ...sending(
        "フォロー",
        relay("yabu.me", "accepted"),
        relay(
          "nos.lol",
          "rejected",
          "publish timed out for wss://nos.lol/ after 10000ms",
        ),
        relay("relay.damus.io", "accepted"),
        relay(
          "very-long-subdomain.example-nostr-provider.com/some/path",
          "rejected",
          "blocked: rate limited",
        ),
      ).meta,
      outcome: { kind: "done" },
    },
  },
};

export const どこにも届かなかった: S = {
  args: {
    meta: {
      ...sending(
        "投稿",
        relay("yabu.me", "rejected", "blocked"),
        relay("nos.lol", "rejected", "timeout"),
      ).meta,
      outcome: {
        kind: "failed",
        message: "どのリレーにも届きませんでした（2 本が拒否）",
      },
    },
  },
};

export const 署名できなかった: S = {
  args: {
    meta: {
      label: "リレーの設定",
      progress: { phase: "signing" },
      outcome: {
        kind: "failed",
        message: "署名器を利用できません。ログインし直してください",
      },
    },
  },
};

export const たくさんのリレー: S = {
  args: sending(
    "デッキの設定",
    ...Array.from({ length: 10 }, (_, i) =>
      relay(
        `relay-${i + 1}.example.com`,
        i < 4 ? "accepted" : i === 4 ? "rejected" : "pending",
        "blocked",
      ),
    ),
  ),
};
