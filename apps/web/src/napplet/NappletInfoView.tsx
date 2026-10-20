import type {
  NappletManifest,
  NappletManifestError,
} from "@streets/core/napplet/manifest";
import { NAPPLET_NAMED_KIND } from "@streets/core/napplet/manifest";
import { encodeNaddr } from "@streets/core/nostr/nip19";
import { formatEventTimeFull } from "@streets/core/view/format-time";
import {
  type Component,
  For,
  Match,
  type ParentComponent,
  Show,
  Switch,
} from "solid-js";
import { useAppWindow } from "../app-window";
import ProfileRow from "../profile/ProfileRow";
import { notifyError } from "../toast";
import Button from "../ui/Button";
import { MANIFEST_ERRORS } from "./NappletView";

/** napplet が使う機能を、仕組みを知らない人にも分かる言葉で。知らない機能は名前のまま出す。 */
const DOMAIN_LABELS: Record<string, string> = {
  shell: "Streets の環境を知る",
  theme: "Streets の色に合わせる",
  identity: "あなたの公開情報を読む",
  storage: "この端末に保存する",
  relay: "投稿を読み書きする",
  outbox: "人ごとのリレーで投稿を読み書きする",
  resource: "画像などを取得する",
  inc: "ほかの napplet とやりとりする",
  intent: "ほかの napplet を開く",
  link: "外部のリンクを開く",
  config: "設定を持つ",
  upload: "ファイルをアップロードする",
  common: "フォロー・リアクションなどをする",
  notify: "通知を出す",
  keys: "キー操作を受け取る",
  media: "音声・動画を再生する",
  value: "Zap を送る",
  mesh: "近くの端末とやりとりする",
  gamepad: "ゲームパッドを使う",
};

const domainLabel = (domain: string) => DOMAIN_LABELS[domain] ?? domain;

const DomainList: Component<{
  domains: readonly string[];
  supported: ReadonlySet<string>;
}> = (props) => (
  <ul class="flex flex-col gap-1">
    <For each={props.domains}>
      {(domain) => (
        <li class="flex items-start gap-1.5 text-body">
          <span
            class="mt-0.5 size-4 shrink-0"
            classList={{
              "i-material-symbols:check-circle-outline-rounded c-status-ok":
                props.supported.has(domain),
              "i-material-symbols:do-not-disturb-on-outline-rounded c-status-warn":
                !props.supported.has(domain),
            }}
            aria-hidden="true"
          />
          <span class="c-primary">
            {domainLabel(domain)}
            <span class="c-secondary text-caption">
              {" "}
              {props.supported.has(domain) ? "" : "（Streets は未対応）"}
            </span>
          </span>
        </li>
      )}
    </For>
  </ul>
);

const Section: ParentComponent<{ title: string }> = (props) => (
  <section class="flex flex-col gap-1.5">
    <h4 class="c-secondary font-600 text-caption">{props.title}</h4>
    {props.children}
  </section>
);

const isWebLink = (url: string) => /^https?:\/\//.test(url);

/** napplet の情報。napplet のカラムの見出しの ⓘ から重ねて開く。 */
const NappletInfoView: Component<{
  lookup:
    | { phase: "loading" }
    | { phase: "missing" }
    | { phase: "invalid"; error: NappletManifestError }
    | { phase: "found"; manifest: NappletManifest };
  /** 照合済みのアイコン（blob の URL）。無ければ汎用の絵。 */
  iconUrl?: string;
  /** Streets が渡せる機能。 */
  supported: ReadonlySet<string>;
}> = (props) => {
  const appWindow = useAppWindow();
  const copyLink = async (manifest: NappletManifest) => {
    const naddr = encodeNaddr({
      identifier: manifest.identifier ?? "",
      pubkey: manifest.pubkey,
      eventKind: NAPPLET_NAMED_KIND,
    });
    try {
      if (!naddr) throw new Error("napplet の住所を作れませんでした");
      await appWindow.navigator.clipboard.writeText(`nostr:${naddr}`);
    } catch (cause) {
      notifyError(cause, "リンクをコピーできませんでした");
    }
  };
  return (
    <Switch>
      <Match when={props.lookup.phase === "loading"}>
        <p class="c-secondary p-4 text-caption">読み込み中…</p>
      </Match>
      <Match when={props.lookup.phase === "missing"}>
        <p class="c-secondary p-4 text-caption">
          napplet の情報が見つかりませんでした。
        </p>
      </Match>
      <Match when={props.lookup.phase === "invalid" ? props.lookup : undefined}>
        {(lookup) => (
          <p class="c-status-warn p-4 text-caption">
            {MANIFEST_ERRORS[lookup().error]}
          </p>
        )}
      </Match>
      <Match
        when={
          props.lookup.phase === "found" ? props.lookup.manifest : undefined
        }
      >
        {(manifest) => (
          <div class="flex flex-col gap-5 p-4">
            <div class="flex flex-col gap-2">
              <Show
                when={props.iconUrl}
                fallback={
                  <span
                    class="i-material-symbols:widgets-outline-rounded c-secondary size-16"
                    aria-hidden="true"
                  />
                }
              >
                {(url) => <img src={url()} alt="" class="size-16 rounded-3" />}
              </Show>
              <h3 class="c-primary break-anywhere font-700 text-h3">
                {manifest().title ??
                  manifest().identifier ??
                  "名前の無い napplet"}
              </h3>
              <p class="c-primary break-anywhere whitespace-pre-wrap text-body">
                {manifest().description}
              </p>
              <p class="c-secondary text-caption">
                {formatEventTimeFull(new Date(manifest().createdAt * 1000))}{" "}
                に公開
              </p>
              <Show when={manifest().legacy}>
                <p class="c-status-warn text-caption">
                  古い形式で公開されています。いまの形式と違い、どの機能が必須かを区別していません。
                </p>
              </Show>
            </div>
            <Section title="作った人">
              <div class="overflow-hidden rounded-2 border border-primary">
                <ProfileRow pubkey={manifest().pubkey} />
              </div>
            </Section>
            <Show when={manifest().requires.length > 0}>
              <Section title="使う機能">
                <DomainList
                  domains={manifest().requires}
                  supported={props.supported}
                />
              </Section>
            </Show>
            <Show when={manifest().optional.length > 0}>
              <Section title="あれば使う機能">
                <DomainList
                  domains={manifest().optional}
                  supported={props.supported}
                />
              </Section>
            </Show>
            <Show when={manifest().source}>
              {(source) => (
                <Section title="ソースコード">
                  <Show
                    when={isWebLink(source())}
                    fallback={
                      <p class="c-primary break-anywhere text-body">
                        {source()}
                      </p>
                    }
                  >
                    <a
                      href={source()}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="c-accent-5 break-anywhere text-body underline"
                    >
                      {source()}
                    </a>
                  </Show>
                </Section>
              )}
            </Show>
            <Section title="本体">
              <p class="c-secondary break-anywhere font-mono text-caption">
                sha256: {manifest().artifactHash}
              </p>
              <ul class="flex flex-col gap-0.5">
                <For each={manifest().servers}>
                  {(server) => (
                    <li class="c-secondary break-anywhere text-caption">
                      {server}
                    </li>
                  )}
                </For>
              </ul>
            </Section>
            <div class="flex flex-wrap gap-2">
              <Button
                icon="i-material-symbols:link-rounded"
                onClick={() => void copyLink(manifest())}
              >
                リンクをコピー
              </Button>
            </div>
          </div>
        )}
      </Match>
    </Switch>
  );
};

export default NappletInfoView;
