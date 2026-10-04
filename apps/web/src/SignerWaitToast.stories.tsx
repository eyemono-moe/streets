import { onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { SignerWaitToastMeta } from "./SignerWaitToast";
import { ToastStack, createAppToaster } from "./toast";

type Args = { wide: boolean; wait: SignerWaitToastMeta["signerWait"] };

/** アプリと同じトーストの並びに出す。背後の画面は押せるまま。 */
const Story = (props: Args) => {
  const toaster = createAppToaster(props.wide);
  onMount(() =>
    toaster.create({
      type: "loading",
      duration: Number.POSITIVE_INFINITY,
      meta: { signerWait: props.wait },
    }),
  );
  return (
    <div class="h-dvh bg-secondary p-6">
      <p class="c-secondary text-body">背後にある画面</p>
      <ToastStack toaster={toaster} />
    </div>
  );
};

const meta = {
  title: "トースト/署名器の承認待ち",
  component: Story,
  args: { wide: true, wait: { messages: ["投稿の署名を待っています"] } },
  argTypes: { wait: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 投稿の署名: S = {};

export const ログイン: S = {
  args: { wait: { messages: ["ログインを待っています"] } },
};

/** 裏の依頼が返らないまま、押した操作の署名も待っている。 */
export const いくつも待っている: S = {
  args: {
    wait: {
      messages: [
        "リレーへのログインの署名を待っています",
        "非公開の情報の読み取りを待っています",
        "リアクションの署名を待っています",
      ],
    },
  },
};

export const 承認のページを開く: S = {
  args: {
    wait: {
      messages: ["ミュートの署名を待っています"],
      authUrl: new URL("https://example.com/approve"),
    },
  },
};

export const 狭い画面: S = {
  args: {
    wide: false,
    wait: {
      messages: ["ミュートの署名を待っています"],
      authUrl: new URL("https://example.com/approve"),
    },
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
