import { encodeBech32 } from "@streets/core/nostr/nip19";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { ReleaseNote } from "../../release-notes-plugin";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import AboutDialog from "./AboutDialog";

const alice = createStoryAuthor(11, { name: "alice", displayName: "ありす" });
const bob = createStoryAuthor(22, { name: "bob", displayName: "ぼぶ" });
const npubOf = (pubkey: string) => encodeBech32("npub", pubkey);
// プラグインが nostr:npub1… から作るのと同じ目印の要素。
const mention = (pubkey: string) =>
  `<span data-nostr-user="${npubOf(pubkey)}">${npubOf(pubkey).slice(0, 12)}…</span>`;

type Props = {
  wide: boolean;
  tour?: boolean;
  releaseNotes?: ReleaseNote[];
  initialPage?: string;
};

const notes: ReleaseNote[] = [
  {
    version: "v1.1.0",
    date: "2026-11-01",
    html: '<h2>新しくできること</h2><ul><li>投稿に <a href="https://example.com">Zap</a> を送れるようになりました。</li><li>リンクがカードで表示されます。</li></ul><h2>直したこと</h2><ul><li>狭い画面で名前が切れることがあったのを直しました。</li></ul>',
  },
  {
    version: "v1.0.0",
    date: "2026-10-01",
    html: "<p>Streets v1 を公開しました。カラムを並べて、フォロー中の投稿・通知・検索結果を同時に見られます。</p>",
  },
];

const meta = {
  title: "設定/Streets について",
  component: (props: Props) => (
    // 閉じる操作はデッキが裁定する。ここでは受け取って捨てる。
    // リリースノートの中の人の名前は、ストーリーに並べたプロフィールから読む。
    <EventSceneProvider scene={{ events: [alice.profile(), bob.profile()] }}>
      <Mediates
        handle={(event) =>
          event.type === "deck/close-about" || event.type === "deck/start-tour"
        }
      >
        <AboutDialog
          open
          wide={props.wide}
          tour={props.tour}
          releaseNotes={props.releaseNotes}
          initialPage={props.initialPage}
        />
      </Mediates>
    </EventSceneProvider>
  ),
  args: { wide: true },
  parameters: { viewport: { defaultViewport: "responsive" } },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

export const 広い画面: S = {};

export const 狭い画面: S = { args: { wide: false } };

/** ログインしてデッキから開いたとき。使い方の案内をもう一度始められる。 */
export const デッキから開いたとき: S = { args: { tour: true } };

export const リリースノート: S = {
  args: { releaseNotes: notes, initialPage: "releases" },
};

export const リリースノート_まだ無い: S = {
  args: { releaseNotes: [], initialPage: "releases" },
};

export const リリースノート_狭い画面: S = {
  args: { wide: false, releaseNotes: notes, initialPage: "releases" },
};

export const リリースノート_人の参照: S = {
  args: {
    initialPage: "releases",
    releaseNotes: [
      {
        version: "v1.0.0",
        date: "2026-10-01",
        html: `<p>Streets を一から作り直しました。</p><h2>ありがとう</h2><ul><li>${mention(alice.pubkey)} さん（デザイン）</li><li>${mention(bob.pubkey)} さん（テスト）</li></ul>`,
      },
    ],
  },
};
