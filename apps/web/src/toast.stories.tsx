import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ToastStack, createAppToaster } from "./toast";
import type { WriteToastMeta } from "./WriteProgressToast";

type Item = {
  type: "success" | "error" | "loading" | "info";
  title: string;
  description?: string;
  meta?: WriteToastMeta;
};

type Args = { wide: boolean; items: Item[] };

/**
 * 消えないように出したまま並べる。配列の最後が手前に来る。
 * Ark UI は最後に測ったトーストを手前の高さとみなすので、アプリと同じく 1 枚ずつ出す。
 */
const Story = (props: Args) => {
  const toaster = createAppToaster(props.wide);
  onMount(() => {
    props.items.forEach((item, i) =>
      setTimeout(
        () => toaster.create({ ...item, duration: Number.POSITIVE_INFINITY }),
        i * 100,
      ),
    );
  });
  return (
    <div class="h-dvh bg-secondary p-6">
      <p class="c-secondary text-body">背後にある画面</p>
      <ToastStack toaster={toaster} />
    </div>
  );
};

const failed: Item = {
  type: "error",
  title: "リアクションに失敗しました",
  description: "どのリレーにも届きませんでした（2 本が拒否）",
};

const saved: Item = { type: "success", title: "コピーしました" };

const loginNeeded: Item = {
  type: "info",
  title: "ログインすると、リアクションができます",
};

const writing: Item = {
  type: "loading",
  title: "投稿",
  meta: {
    write: {
      label: "投稿",
      progress: {
        phase: "sending",
        relays: [
          { relay: "wss://yabu.me/" as RelayUrl, state: "accepted" },
          { relay: "wss://nos.lol/" as RelayUrl, state: "pending" },
        ],
      },
    },
  },
};

const meta = {
  title: "トースト/知らせ",
  component: Story,
  args: { wide: true, items: [failed] },
  argTypes: { items: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 失敗: S = {};

export const 成功: S = { args: { items: [saved] } };

/** ログインしていない人が、ログインの要る操作を押した。 */
export const 案内: S = { args: { items: [loginNeeded] } };

/** 奥の 2 枚は枠だけが覗く。ポインタを乗せると広がって全部読める。 */
export const 重なり: S = { args: { items: [failed, writing, saved] } };

export const 長い理由: S = {
  args: {
    items: [
      {
        type: "error",
        title: "プロフィールの保存に失敗しました",
        description:
          "publish timed out for wss://very-long-subdomain.example-nostr-provider.com/some/path/that/keeps/going after 10000ms",
      },
    ],
  },
};

/** 狭い画面では上の中央に出る。下には主な操作のバーがある。 */
export const 狭い画面: S = {
  args: { wide: false, items: [failed, saved] },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
