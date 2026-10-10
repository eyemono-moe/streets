import type { Meta, StoryObj } from "storybook-solidjs-vite";
import NostrConnectView, { type NostrConnectStatus } from "./NostrConnectView";

const URI =
  "nostrconnect://3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d?relay=wss%3A%2F%2Fnos.lol%2F&relay=wss%3A%2F%2Frelay.primal.net%2F&secret=0123456789abcdef0123456789abcdef&name=Streets&url=https%3A%2F%2Fstreets.eyemono.moe";

const meta = {
  title: "カラム/紹介とログイン/nostrconnect",
  component: (props: { status: NostrConnectStatus }) => (
    <div class="w-80 p-4">
      <NostrConnectView status={props.status} onRetry={() => {}} />
    </div>
  ),
  args: { status: { phase: "waiting", uri: URI } },
} satisfies Meta<{ status: NostrConnectStatus }>;

export default meta;
type S = StoryObj<typeof meta>;

export const 承認を待っている: S = {};
export const 読み込み直した後も待っている: S = {
  args: { status: { phase: "waiting", uri: URI, resumed: true } },
};
export const 繋がらなかった: S = { args: { status: { phase: "failed" } } };
