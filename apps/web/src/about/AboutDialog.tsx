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
      Streets は Nostr のクライアントです。カラムを並べて、読みたいものを並べて
      見られます。まだ作っている途中なので、思わぬ不具合や、大きな作り替えが
      起きることがあります。
    </p>
    <dl class="c-secondary grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
      <dt>ビルド</dt>
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
    optOut: "—",
    sends: "端末の情報、エラーの記録",
    purpose: "不具合に気付いて直すため",
  },
];

const Privacy: Component = () => (
  <div class="flex flex-col gap-7">
    <SettingsSection
      title="外部へ送っているもの"
      description="不具合に気付くために、エラーが起きたときだけ、その記録を外部のサービスへ送っています。"
    >
      <ul class="c-primary flex list-disc flex-col gap-1.5 pl-5 text-body">
        <li>
          送るのは、どこで何が起きたかだけです。秘密鍵・公開鍵・イベントの id
          は、送る前に取り除いています。
        </li>
        <li>投稿の本文や、入力中の文字は送っていません。</li>
        <li>IP アドレスと Cookie は送っていません。</li>
        <li>
          アクセス解析（どのページが何回見られたかを数えるもの）は使っていません。
        </li>
      </ul>
      <div class="overflow-x-auto">
        <table class="w-full min-w-140 border-collapse text-caption">
          <thead>
            <tr class="c-secondary text-left">
              <th class="border border-primary px-2 py-1 font-600">
                提供している会社
              </th>
              <th class="border border-primary px-2 py-1 font-600">
                使っているもの
              </th>
              <th class="border border-primary px-2 py-1 font-600">送る情報</th>
              <th class="border border-primary px-2 py-1 font-600">使いみち</th>
              <th class="border border-primary px-2 py-1 font-600">利用規約</th>
              <th class="border border-primary px-2 py-1 font-600">
                プライバシーポリシー
              </th>
              <th class="border border-primary px-2 py-1 font-600">
                送らないようにする方法
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
      title="この端末に置いているもの"
      description="設定やログインの状態は、この端末の中だけに保存しています。"
    >
      <p class="c-primary text-body">
        鍵はアプリでは持たず、ブラウザの拡張機能（NIP-07）や、つないだ署名器
        （NIP-46）に任せています。投稿やプロフィールは Nostr
        のリレーへ送られ、そこから誰でも読めます。
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
      description: "Streets が何で、どこで作られているか。",
      content: () => <Overview />,
    },
    {
      value: "privacy",
      label: "プライバシー",
      icon: "i-material-symbols:shield-outline",
      title: "プライバシー",
      description: "何を外へ送っていて、何を送っていないか。",
      content: () => <Privacy />,
    },
  ];
  return (
    <PagedDialog
      open={props.open}
      wide={props.wide}
      title="Streets について"
      description="このアプリの情報と、プライバシーについての説明です。"
      pages={pages}
      page={page()}
      onPageChange={setPage}
      onClose={() => dispatch({ type: "deck/close-about" })}
    />
  );
};

export default AboutDialog;
