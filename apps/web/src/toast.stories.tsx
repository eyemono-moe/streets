import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { disconnectedToast } from "./SignerDisconnectedNotice";
import { ToastStack, createAppToaster } from "./toast";
import type { WriteToastMeta } from "./WriteProgressToast";

type Item = {
  type: "success" | "error" | "loading" | "info" | "warning";
  title: string;
  description?: string;
  meta?: WriteToastMeta;
  action?: { label: string; onClick: () => void };
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

/** できたが、うまく働かないかもしれない。 */
export const 注意: S = {
  args: {
    items: [
      {
        type: "warning",
        title: "アップロード先に追加しました",
        description:
          "media.example から応答を読み取れませんでした。画像のアップロードに失敗する可能性があります",
      },
    ],
  },
};

/** 画像を受け取らないサーバーを、アップロード先に足そうとした。 */
export const アップロード先ではない: S = {
  args: {
    items: [
      {
        type: "error",
        title: "アップロード先に足しませんでした",
        description:
          "example.com は画像のアップロード先として応答しませんでした。URL を確かめてください",
      },
    ],
  },
};

/** 古い方式（NIP-96）のアップロード先を足した。 */
export const 古い方式のアップロード先: S = {
  args: {
    items: [
      {
        type: "warning",
        title: "アップロード先に追加しました",
        description:
          "nostr.build は古い方式（NIP-96）のアップロード先です。将来的にこのアップロード先は使用できなくなる可能性があります",
      },
    ],
  },
};

/** 押すと直せる失敗には、トーストの中にボタンを置く。 */
export const 操作付き: S = {
  args: {
    items: [
      {
        type: "error",
        title: "画面の一部を読み込めませんでした",
        description:
          "新しい版が公開された直後や、通信が切れているときに起きます。再読み込みすると直ります。",
        action: { label: "再読み込み", onClick: () => {} },
      },
    ],
  },
};

/** 再読み込みの後、保存したログインの署名器が応えなかった。画面は読み取りだけで出ている。 */
export const 署名器と繋がっていない: S = {
  args: {
    wide: false,
    items: [
      {
        ...disconnectedToast(
          "署名器と繋がりませんでした。署名器のアプリが動いているか確かめて、もう一度試してください。",
        ),
        action: { label: "繋ぎ直す", onClick: () => {} },
      },
    ],
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

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
