import type { NappletEntry } from "@streets/core/napplet/directory";
import type { NappletManifest } from "@streets/core/napplet/manifest";
import { type Component, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import NappletListView from "./NappletListView";

const alice = createStoryAuthor(530, { name: "フォロー中の作者" });
const bob = createStoryAuthor(531, { name: "知らない作者" });

const manifest = (
  overrides: Partial<NappletManifest> & { identifier: string },
): NappletManifest => ({
  eventId: overrides.identifier.padEnd(64, "0"),
  kind: 35129,
  pubkey: bob.pubkey,
  createdAt: 1_760_000_000,
  artifactHash: "e".repeat(64),
  description: "napplet の説明。",
  servers: [],
  requires: [],
  optional: [],
  archetypes: [],
  legacy: false,
  icon: { hash: "f".repeat(64), mime: "image/png" },
  ...overrides,
});

const entries: NappletEntry[] = [
  {
    manifest: manifest({
      identifier: "chronofeed",
      pubkey: alice.pubkey,
      title: "Chronofeed",
      description: "フォロー中の人の投稿とリポストを、新しい順に並べます。",
    }),
    unsupported: [],
    followed: true,
  },
  {
    manifest: manifest({
      identifier: "bitchat",
      title: "bitchat",
      description: "近くの端末とやりとりするチャット。",
      requires: ["mesh"],
      icon: undefined,
    }),
    unsupported: ["mesh"],
    followed: false,
  },
  {
    manifest: manifest({
      identifier: "long",
      title: "とても長い名前の napplet で、カラムの幅に収まらないもの",
      description: "説明がとても長い napplet。".repeat(10),
    }),
    unsupported: [],
    followed: false,
  },
];

type Props = {
  entries: NappletEntry[];
  settled: boolean;
  query: string;
  shown: number;
  /** カラムの幅（px）。 */
  width: number;
};

const ListStory: Component<Props> = (props) => {
  const [query, setQuery] = createSignal(props.query);
  const [compatibleOnly, setCompatibleOnly] = createSignal(false);
  return (
    <EventSceneProvider scene={{ events: [alice.profile(), bob.profile()] }}>
      <div
        class="border border-primary bg-primary"
        style={{ width: `${props.width}px` }}
      >
        <NappletListView
          entries={props.entries}
          settled={props.settled}
          query={query()}
          onQuery={setQuery}
          compatibleOnly={compatibleOnly()}
          onCompatibleOnly={setCompatibleOnly}
          shown={props.shown}
          onShowMore={() => {}}
          iconFor={(item) => (item.icon ? avatarUrl : undefined)}
          onOpen={() => {}}
        />
      </div>
    </EventSceneProvider>
  );
};

const meta = {
  title: "カラム/napplet を探す",
  component: ListStory,
  args: { entries, settled: true, query: "", shown: 30, width: 360 },
  argTypes: { entries: { control: false } },
} satisfies Meta<typeof ListStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ふつう: Story = {};

/** 並べる数を超えたら、続きを出すボタンを置く。 */
export const 続きがある: Story = { args: { shown: 2 } };

export const 読み込み中: Story = { args: { entries: [], settled: false } };

export const 見つからない: Story = {
  args: { entries: [], settled: true, query: "存在しない napplet" },
};

export const 狭いカラム: Story = { args: { width: 240 } };
