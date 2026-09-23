import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SignerWaitOverlay from "./SignerWaitOverlay";

const Story = (props: { message: string; authUrl?: URL }) => (
  <div class="h-dvh bg-secondary p-6">
    <p class="c-secondary text-body">背後にある画面</p>
    <SignerWaitOverlay message={props.message} authUrl={props.authUrl} />
  </div>
);

const meta = {
  title: "署名器/操作待ち",
  component: Story,
  args: { message: "投稿の署名を待っています" },
} satisfies Meta<{ message: string; authUrl?: URL }>;

export default meta;
type S = StoryObj<typeof meta>;

export const 投稿の署名: S = {};
export const ログイン: S = {
  args: { message: "ログインを待っています" },
};
export const リモート署名器の承認: S = {
  args: {
    message: "ログインを待っています",
    authUrl: new URL("https://example.com/approve"),
  },
};
export const 非公開の情報の読み取り: S = {
  args: { message: "非公開の情報の読み取りを待っています" },
};
export const 狭い画面: S = {
  args: { message: "ミュートの署名を待っています" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
