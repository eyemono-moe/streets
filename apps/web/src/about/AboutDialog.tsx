import { encodeBech32 } from "@streets/core/nostr/nip19";
import { type Component, For, type JSX, Show, createSignal } from "solid-js";
import type { ReleaseNote } from "../../release-notes-plugin";
import SettingsSection from "../settings/SettingsSection";
import { Mediates, useDispatch } from "../ui-events";
import Button from "../ui/Button";
import PagedDialog, { type DialogPage } from "../ui/PagedDialog";
import NoteBody from "./NoteBody";
import { bundledReleaseNotes } from "./release-notes";

const REPOSITORY = "https://github.com/eyemono-moe/streets";

const Link: Component<{ href: string; children: string }> = (props) => (
  <a
    href={props.href}
    target="_blank"
    rel="noopener noreferrer"
    class="break-all text-link"
  >
    {props.children}
  </a>
);

/**
 * いま動いているもの。リリースならタグ名（GitHub の Release へのリンク）、PR の
 * プレビューなら PR へのリンクとコミット、それ以外はコミット。
 */
const version = (): JSX.Element => {
  if (import.meta.env.DEV) return "開発中";
  const name: string | undefined = import.meta.env.VITE_APP_VERSION;
  const commit: string = import.meta.env.VITE_COMMIT_SHA ?? "不明";
  if (name?.startsWith("v")) {
    return <Link href={`${REPOSITORY}/releases/tag/${name}`}>{name}</Link>;
  }
  const pr = name ? /^pr-(\d+)$/.exec(name)?.[1] : undefined;
  if (pr) {
    return (
      <>
        <Link
          href={`${REPOSITORY}/pull/${pr}`}
        >{`PR #${pr} のプレビュー`}</Link>
        {`（${commit}）`}
      </>
    );
  }
  return commit;
};

const Overview: Component<{ tour?: boolean }> = (props) => (
  <div class="flex flex-col gap-7">
    <p class="c-primary text-body">
      Streets はブラウザで使える Nostr
      のクライアントです。タイムライン、通知、検索結果などのカラムを組み合わせて、自分だけの画面を組み立てられます。
    </p>
    <dl class="c-secondary grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
      <dt>バージョン</dt>
      <dd>{version()}</dd>
      <dt>ソースコード</dt>
      <dd>
        <Link href={REPOSITORY}>{REPOSITORY}</Link>
      </dd>
      <dt>ライセンス</dt>
      <dd>
        <Link href={`${REPOSITORY}/blob/main/LICENCE`}>MIT</Link>
      </dd>
    </dl>
    <Show when={props.tour}>
      <TourButton />
    </Show>
  </div>
);

/** 歴代のリリースノート。新しい版から並べる。本文はビルドのときに HTML にしてある。 */
const ReleaseNotes: Component<{ notes: readonly ReleaseNote[] }> = (props) => (
  <Show
    when={props.notes.length > 0}
    fallback={
      <p class="c-secondary text-body">まだリリースノートはありません。</p>
    }
  >
    <div class="flex flex-col gap-8">
      <For each={props.notes}>
        {(note) => (
          <section class="flex flex-col gap-2">
            <h3 class="flex items-baseline gap-2">
              <span class="c-primary font-700 text-h3">{note.version}</span>
              <Show when={note.date}>
                {(date) => (
                  <time class="c-secondary text-caption" datetime={date()}>
                    {date()}
                  </time>
                )}
              </Show>
            </h3>
            <NoteBody
              html={note.html}
              class="c-primary break-anywhere text-body [&_a]:text-link [&_code]:rounded-1 [&_code]:bg-secondary [&_code]:px-1 [&_h2]:mt-3 [&_h2]:font-600 [&_h2]:text-body [&_h3]:mt-2 [&_h3]:font-600 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5"
            />
            {/* GitHub の Release には、この本文に加えて入った PR の一覧と前の版との比較がある。 */}
            <a
              href={`${REPOSITORY}/releases/tag/${note.version}`}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex w-fit items-center gap-0.5 text-caption text-link"
            >
              GitHub で見る
              <span
                class="i-material-symbols:open-in-new-rounded size-3.5"
                aria-hidden="true"
              />
            </a>
          </section>
        )}
      </For>
    </div>
  </Show>
);

/** 使い方の案内をもう一度見る。押すとダイアログを閉じて、案内を始める。 */
const TourButton: Component = () => {
  const dispatch = useDispatch();
  return (
    <div>
      <Button
        variant="secondary"
        icon="i-material-symbols:tour-outline-rounded"
        onClick={() => dispatch({ type: "deck/start-tour" })}
      >
        使い方を確認する
      </Button>
    </div>
  );
};

type Tool = {
  provider: string;
  tool: string;
  terms: string;
  privacy: string;
  optOut: string;
  sends: string;
  purpose: string;
};

const TOOLS: Tool[] = [
  {
    provider: "Functional Software, Inc.",
    tool: "Sentry",
    terms: "https://sentry.io/terms/",
    privacy: "https://sentry.io/privacy/",
    optOut: "設定 →「表示」→「エラーの報告」から停止できます",
    sends: "エラーの内容と発生箇所、端末とブラウザの情報、アプリのバージョン",
    purpose: "不具合の把握と修正のため",
  },
];

const Privacy: Component = () => (
  <div class="flex flex-col gap-7">
    <SettingsSection
      title="エラー収集ツールの利用について"
      description="本アプリでは、不具合の把握と修正を目的として、エラーの発生時にその記録を第三者が提供するツールへ送信しています。"
    >
      <dl class="c-primary flex flex-col gap-2 text-body">
        <div class="flex flex-col gap-0.5">
          <dt class="font-600">送信する情報</dt>
          <dd>
            エラーの内容と発生箇所、端末とブラウザの情報、アプリのバージョン。
          </dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="font-600">送信しない情報</dt>
          <dd>
            秘密鍵、公開鍵、イベント ID、投稿の本文、入力中の文字列、IP
            アドレス、Cookie。公開鍵とイベント ID は、送信前に取り除いています。
          </dd>
        </div>
      </dl>
      <p class="c-secondary text-caption">
        アクセス解析ツール（ページの閲覧数などを計測するもの）は利用していません。
      </p>
      <div class="overflow-x-auto">
        <table class="w-full min-w-140 border-collapse text-caption">
          <thead>
            <tr class="c-secondary text-left">
              <th class="border border-primary px-2 py-1 font-600">
                提供事業者
              </th>
              <th class="border border-primary px-2 py-1 font-600">ツール</th>
              <th class="border border-primary px-2 py-1 font-600">
                取得する情報
              </th>
              <th class="border border-primary px-2 py-1 font-600">利用目的</th>
              <th class="border border-primary px-2 py-1 font-600">利用規約</th>
              <th class="border border-primary px-2 py-1 font-600">
                プライバシーポリシー
              </th>
              <th class="border border-primary px-2 py-1 font-600">
                オプトアウト
              </th>
            </tr>
          </thead>
          <tbody class="c-primary">
            <For each={TOOLS}>
              {(tool) => (
                <tr>
                  <td class="border border-primary px-2 py-1">
                    {tool.provider}
                  </td>
                  <td class="border border-primary px-2 py-1">{tool.tool}</td>
                  <td class="border border-primary px-2 py-1">{tool.sends}</td>
                  <td class="border border-primary px-2 py-1">
                    {tool.purpose}
                  </td>
                  <td class="border border-primary px-2 py-1">
                    <Link href={tool.terms}>{tool.terms}</Link>
                  </td>
                  <td class="border border-primary px-2 py-1">
                    <Link href={tool.privacy}>{tool.privacy}</Link>
                  </td>
                  <td class="border border-primary px-2 py-1">{tool.optOut}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </SettingsSection>

    <SettingsSection
      title="画像とリンクの取得"
      description="一部の画像とリンク先のページは、Streets のサーバー（Cloudflare Workers）が代わりに取得しています。"
    >
      <dl class="c-primary flex flex-col gap-2 text-body">
        <div class="flex flex-col gap-0.5">
          <dt class="font-600">アイコン</dt>
          <dd>
            表示に合う大きさへ縮めてから届けるため、Streets
            のサーバーを通して読み込みます（Cloudflare
            の画像変換を利用しています）。縮められなかったアイコンは、画像の置き場所から直接読み込みます。
          </dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="font-600">リンクのプレビュー</dt>
          <dd>
            投稿の中のリンクの題名や説明は、Streets
            のサーバーがリンク先のページを取得して作ります。
          </dd>
        </div>
      </dl>
      <p class="c-secondary text-caption">
        サーバーを通したものは、取得先に Streets
        のサーバーからのアクセスとして届き、利用者の IP
        アドレスは伝わりません。Streets
        のサーバーは、どの画像やリンクを取得したかを記録していません。
      </p>
    </SettingsSection>

    <SettingsSection
      title="情報の保存と公開範囲"
      description="設定とログイン状態は、この端末のブラウザ内にのみ保存します。"
    >
      <p class="c-primary text-body">
        秘密鍵はアプリでは保持せず、ブラウザの拡張機能（NIP-07）または接続した
        署名器（NIP-46）に委ねています。投稿・プロフィール・フォローリストなどは
        Nostr のリレーへ送信され、リレーを通じて誰でも閲覧できます。
      </p>
    </SettingsSection>
  </div>
);

/** アイコンのメニューから開く「Streets について」。 */
const AboutDialog: Component<{
  open: boolean;
  wide: boolean;
  /** 使い方の案内を始められる（ログインしてデッキを開いているとき）。 */
  tour?: boolean;
  /** 並べるリリースノート。省くとアプリに同梱したもの。ストーリーで差し替える。 */
  releaseNotes?: readonly ReleaseNote[];
  /** 最初に開くページ。ストーリーで各ページを見せるため。 */
  initialPage?: string;
  /**
   * リリースノートの中の人を押した。デッキはダイアログを閉じてその人のカラムを
   * 開く。省くと（入口の画面など、カラムが無いとき）njump.me でその人を開く。
   */
  onOpenUser?: (pubkey: string) => void;
}> = (props) => {
  const dispatch = useDispatch();
  const [page, setPage] = createSignal(props.initialPage ?? "overview");
  const pages: DialogPage[] = [
    {
      value: "overview",
      label: "このアプリについて",
      icon: "i-material-symbols:info-outline-rounded",
      title: "このアプリについて",
      content: () => <Overview tour={props.tour} />,
    },
    {
      value: "releases",
      label: "リリースノート",
      icon: "i-material-symbols:campaign-outline-rounded",
      title: "リリースノート",
      content: () => (
        <ReleaseNotes notes={props.releaseNotes ?? bundledReleaseNotes} />
      ),
    },
    {
      value: "privacy",
      label: "プライバシーポリシー",
      icon: "i-material-symbols:shield-outline",
      title: "プライバシーポリシー",
      content: () => <Privacy />,
    },
  ];
  // ダイアログはカラムの外にあり、「重ねる」を受ける段が無い。人を開く操作に読み替える。
  const openUser = (pubkey: string) => {
    if (props.onOpenUser) {
      props.onOpenUser(pubkey);
      return;
    }
    window.open(
      `https://njump.me/${encodeBech32("npub", pubkey)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  return (
    <Mediates
      handle={(event) => {
        switch (event.type) {
          case "stack/open":
            if (event.column.source.kind === "user") {
              openUser(event.column.source.pubkey);
            }
            return true;
          default:
            return false;
        }
      }}
    >
      <PagedDialog
        open={props.open}
        wide={props.wide}
        title="Streets について"
        description="アプリの情報と、プライバシーポリシーを表示します。"
        pages={pages}
        page={page()}
        onPageChange={setPage}
        onClose={() => dispatch({ type: "deck/close-about" })}
      />
    </Mediates>
  );
};

export default AboutDialog;
