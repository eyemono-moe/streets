import { type Component, For, createSignal } from "solid-js";
import SettingsSection from "../settings/SettingsSection";
import { useDispatch } from "../ui-events";
import PagedDialog, { type DialogPage } from "../ui/PagedDialog";

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

/** いま動いているものが、どのコミットから作られたか。 */
const version = () =>
  import.meta.env.DEV ? "開発中" : (import.meta.env.VITE_COMMIT_SHA ?? "不明");

const Overview: Component = () => (
  <div class="flex flex-col gap-7">
    <p class="c-primary text-body">
      Streets は Nostr
      のクライアントです。カラムを並べて、フォロー中の投稿や通知を同時に見られます。
      現在はベータ版のため、不具合や仕様の変更が発生する可能性があります。
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
  </div>
);

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
const AboutDialog: Component<{ open: boolean; wide: boolean }> = (props) => {
  const dispatch = useDispatch();
  const [page, setPage] = createSignal("overview");
  const pages: DialogPage[] = [
    {
      value: "overview",
      label: "このアプリについて",
      icon: "i-material-symbols:info-outline-rounded",
      title: "このアプリについて",
      content: () => <Overview />,
    },
    {
      value: "privacy",
      label: "プライバシーポリシー",
      icon: "i-material-symbols:shield-outline",
      title: "プライバシーポリシー",
      content: () => <Privacy />,
    },
  ];
  return (
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
  );
};

export default AboutDialog;
