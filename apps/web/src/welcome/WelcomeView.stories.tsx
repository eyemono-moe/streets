import { For, type JSX } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import Event from "../note/Event";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import WelcomeView from "./WelcomeView";

const alice = createStoryAuthor(11, { name: "alice", displayName: "ありす" });
const bob = createStoryAuthor(22, { name: "bob" });
const notes = [
  alice.note("おはようございます。今日は晴れていて気持ちがいいですね。"),
  bob.note(
    "Nostr ではじめて投稿してみました。どこに何が流れているのか、まだよく分かっていません。".repeat(
      3,
    ),
  ),
  alice.note("#nostr のタグを付けると、同じ話題の投稿と並びます。"),
];

const Feed = (): JSX.Element => (
  <div class="[&>*]:border-primary [&>*]:border-b">
    <For each={notes}>{(note) => <Event event={note} size="normal" />}</For>
  </div>
);

type Props = Parameters<typeof WelcomeView>[0];

const meta = {
  title: "入口/入口の画面",
  component: (props: Props) => (
    <EventSceneProvider
      scene={{ events: [alice.profile(), bob.profile(), ...notes] }}
    >
      <WelcomeView {...props} />
    </EventSceneProvider>
  ),
  globals: { viewport: { value: "responsive", isRotated: false } },
  args: {
    login: { pending: false },
    onExtension: () => {},
    onBunker: () => {},
    onNostrConnect: () => ({
      uri: `nostrconnect://${"a".repeat(64)}?relay=wss%3A%2F%2Fnos.lol%2F&secret=0123456789abcdef&name=Streets`,
      // ストーリーでは承認されないまま待ち続ける。
      done: new Promise<void>(() => {}),
      cancel: () => {},
    }),
    feedTitle: "wss://yabu.me",
    feed: <Feed />,
  },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 最初の二択: Story = {};

export const はじめての方: Story = {
  args: { initialStep: "new" },
};

export const アカウントを持っている方: Story = {
  args: { initialStep: "existing" },
};

export const QRコードで繋ぐ: Story = {
  args: { initialStep: "existing", initialRemoteOpen: true },
};

export const ログインしている途中: Story = {
  args: { initialStep: "existing", login: { pending: true } },
};

export const 署名器の承認待ち: Story = {
  args: {
    initialStep: "existing",
    login: {
      pending: true,
      authUrl: new URL("https://signer.example/approve?token=abc"),
    },
  },
};

export const ログインできなかった: Story = {
  args: {
    login: {
      pending: false,
      error: "NIP-07 対応の拡張機能が見つかりません。",
    },
  },
};

export const 秘密鍵を貼り付けた: Story = {
  args: {
    initialStep: "existing",
    initialBunkerUri: `nsec1${"q".repeat(58)}`,
  },
};

export const 署名器と繋がらなかった: Story = {
  args: {
    initialStep: "existing",
    initialRemoteOpen: true,
    onNostrConnect: () => ({
      uri: `nostrconnect://${"a".repeat(64)}`,
      done: Promise.reject(new Error("remote signer did not connect in time")),
      cancel: () => {},
    }),
  },
};

export const 投稿の取得中: Story = {
  args: {
    feed: <p class="c-secondary p-4 text-caption">読み込み中…</p>,
  },
};

export const 幅の狭い画面: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
