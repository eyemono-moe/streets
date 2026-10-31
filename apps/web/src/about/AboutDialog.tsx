import { KIND_SUPPORT, kindSummary } from "@streets/core/nostr/kind-support";
import { NIP_SUPPORT } from "@streets/core/nostr/nip-support";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import {
  type Component,
  For,
  type JSX,
  Show,
  createEffect,
  createSignal,
  on,
} from "solid-js";
import type { ReleaseNote } from "../../release-notes-plugin";
import { locale, t } from "../i18n/locale";
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
  if (import.meta.env.DEV) return t("about.overview.dev");
  const name: string | undefined = import.meta.env.VITE_APP_VERSION;
  const commit: string =
    import.meta.env.VITE_COMMIT_SHA ?? t("about.overview.unknownCommit");
  if (name?.startsWith("v")) {
    return <Link href={`${REPOSITORY}/releases/tag/${name}`}>{name}</Link>;
  }
  const pr = name ? /^pr-(\d+)$/.exec(name)?.[1] : undefined;
  if (pr) {
    return (
      <>
        <Link href={`${REPOSITORY}/pull/${pr}`}>
          {t("about.overview.prPreview", { number: pr })}
        </Link>
        {t("about.overview.commit", { commit })}
      </>
    );
  }
  return commit;
};

const Overview: Component<{ tour?: boolean }> = (props) => (
  <div class="flex flex-col gap-7">
    <p class="c-primary text-body">{t("about.overview.intro")}</p>
    <dl class="c-secondary grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
      <dt>{t("about.overview.version")}</dt>
      <dd>{version()}</dd>
      <dt>{t("about.overview.source")}</dt>
      <dd>
        <Link href={REPOSITORY}>{REPOSITORY}</Link>
      </dd>
      <dt>{t("about.overview.license")}</dt>
      <dd>
        <Link href={`${REPOSITORY}/blob/main/LICENCE`}>MIT</Link>
      </dd>
      <dt>{t("about.overview.font")}</dt>
      <dd>
        {t("about.overview.fontBefore")}
        <Link href="/emoji-glyphs/v1/NOTICE.txt">
          {t("about.overview.fontLink")}
        </Link>
        {t("about.overview.fontAfter")}
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
    fallback={<p class="c-secondary text-body">{t("about.releases.empty")}</p>}
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
              {t("about.releases.viewOnGithub")}
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

const NipSupport: Component = () => (
  <div class="flex flex-col gap-5">
    <p class="c-secondary text-body">{t("about.nips.intro")}</p>
    <div class="flex flex-col divide-y divide-primary">
      <For each={NIP_SUPPORT}>
        {(entry) => (
          <div class="flex flex-col gap-1 py-3 first:pt-0">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <a
                href={`https://github.com/nostr-protocol/nips/blob/master/${entry.nip}.md`}
                target="_blank"
                rel="noopener noreferrer"
                class="font-600 text-body text-link"
              >
                NIP-{entry.nip}
              </a>
              <span class="c-secondary text-caption">{entry.status}</span>
            </div>
            <p class="c-primary text-body">{entry.summary}</p>
            <Show when={entry.gap}>
              <p class="c-secondary text-caption">{entry.gap}</p>
            </Show>
          </div>
        )}
      </For>
    </div>
  </div>
);

const KindSupport: Component = () => (
  <div class="flex flex-col gap-5">
    <p class="c-secondary text-body">{t("about.kinds.intro")}</p>
    <div class="flex flex-col divide-y divide-primary">
      <For each={KIND_SUPPORT}>
        {(entry) => (
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 first:pt-0">
            <span class="c-primary min-w-16 font-600 text-body">
              {entry.kind}
            </span>
            <span class="c-primary flex-1 text-body">
              {kindSummary(entry, locale())}
            </span>
            <span class="c-secondary text-caption">{entry.status}</span>
          </div>
        )}
      </For>
    </div>
  </div>
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
        {t("about.overview.tour")}
      </Button>
    </div>
  );
};

type Tool = {
  id: "sentry";
  provider: string;
  tool: string;
  terms: string;
  privacy: string;
};

const TOOLS: Tool[] = [
  {
    id: "sentry",
    provider: "Functional Software, Inc.",
    tool: "Sentry",
    terms: "https://sentry.io/terms/",
    privacy: "https://sentry.io/privacy/",
  },
];

const Privacy: Component = () => (
  <div class="flex flex-col gap-7">
    <SettingsSection
      title={t("about.privacy.monitoring.title")}
      description={t("about.privacy.monitoring.description")}
    >
      <dl class="c-primary flex flex-col gap-2 text-body">
        <div class="flex flex-col gap-0.5">
          <dt class="font-600">{t("about.privacy.monitoring.sent")}</dt>
          <dd>{t("about.privacy.monitoring.sentBody")}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="font-600">{t("about.privacy.monitoring.notSent")}</dt>
          <dd>{t("about.privacy.monitoring.notSentBody")}</dd>
        </div>
      </dl>
      <p class="c-secondary text-caption">
        {t("about.privacy.monitoring.noAnalytics")}
      </p>
      <div class="overflow-x-auto">
        <table class="w-full min-w-140 border-collapse text-caption">
          <thead>
            <tr class="c-secondary text-left">
              <th class="border border-primary px-2 py-1 font-600">
                {t("about.privacy.monitoring.columns.provider")}
              </th>
              <th class="border border-primary px-2 py-1 font-600">
                {t("about.privacy.monitoring.columns.tool")}
              </th>
              <th class="border border-primary px-2 py-1 font-600">
                {t("about.privacy.monitoring.columns.sends")}
              </th>
              <th class="border border-primary px-2 py-1 font-600">
                {t("about.privacy.monitoring.columns.purpose")}
              </th>
              <th class="border border-primary px-2 py-1 font-600">
                {t("about.privacy.monitoring.columns.terms")}
              </th>
              <th class="border border-primary px-2 py-1 font-600">
                {t("about.privacy.monitoring.columns.privacy")}
              </th>
              <th class="border border-primary px-2 py-1 font-600">
                {t("about.privacy.monitoring.columns.optOut")}
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
                  <td class="border border-primary px-2 py-1">
                    {t(`about.privacy.monitoring.tools.${tool.id}.sends`)}
                  </td>
                  <td class="border border-primary px-2 py-1">
                    {t(`about.privacy.monitoring.tools.${tool.id}.purpose`)}
                  </td>
                  <td class="border border-primary px-2 py-1">
                    <Link href={tool.terms}>{tool.terms}</Link>
                  </td>
                  <td class="border border-primary px-2 py-1">
                    <Link href={tool.privacy}>{tool.privacy}</Link>
                  </td>
                  <td class="border border-primary px-2 py-1">
                    {t(`about.privacy.monitoring.tools.${tool.id}.optOut`)}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </SettingsSection>

    <SettingsSection
      title={t("about.privacy.fetching.title")}
      description={t("about.privacy.fetching.description")}
    >
      <dl class="c-primary flex flex-col gap-2 text-body">
        <div class="flex flex-col gap-0.5">
          <dt class="font-600">{t("about.privacy.fetching.icon")}</dt>
          <dd>{t("about.privacy.fetching.iconBody")}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="font-600">{t("about.privacy.fetching.linkPreview")}</dt>
          <dd>{t("about.privacy.fetching.linkPreviewBody")}</dd>
        </div>
      </dl>
      <p class="c-secondary text-caption">{t("about.privacy.fetching.note")}</p>
    </SettingsSection>

    <SettingsSection
      title={t("about.privacy.customEmoji.title")}
      description={t("about.privacy.customEmoji.description")}
    >
      <p class="c-primary text-body">{t("about.privacy.customEmoji.body")}</p>
    </SettingsSection>

    <SettingsSection
      title={t("about.privacy.storage.title")}
      description={t("about.privacy.storage.description")}
    >
      <p class="c-primary text-body">{t("about.privacy.storage.body")}</p>
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
  /** 開くたびに見せるページ（紹介のカラムのリンクなど）。省くと前に見ていたページのまま。 */
  requestedPage?: string;
  /**
   * リリースノートの中の人を押した。デッキはダイアログを閉じてその人のカラムを
   * 開く。省くと（入口の画面など、カラムが無いとき）njump.me でその人を開く。
   */
  onOpenUser?: (pubkey: string) => void;
}> = (props) => {
  const dispatch = useDispatch();
  const [page, setPage] = createSignal(props.initialPage ?? "overview");
  createEffect(
    on(
      () => [props.open, props.requestedPage] as const,
      ([open, requested]) => {
        if (open && requested) setPage(requested);
      },
    ),
  );
  const pages = (): DialogPage[] => [
    {
      value: "overview",
      label: t("about.pages.overview"),
      icon: "i-material-symbols:info-outline-rounded",
      title: t("about.pages.overview"),
      content: () => <Overview tour={props.tour} />,
    },
    {
      value: "releases",
      label: t("about.pages.releases"),
      icon: "i-material-symbols:campaign-outline-rounded",
      title: t("about.pages.releases"),
      content: () => (
        <ReleaseNotes notes={props.releaseNotes ?? bundledReleaseNotes} />
      ),
    },
    {
      value: "nips",
      label: t("about.pages.nips"),
      icon: "i-material-symbols:fact-check-outline-rounded",
      title: t("about.pages.nips"),
      content: () => <NipSupport />,
    },
    {
      value: "kinds",
      label: t("about.pages.kinds"),
      icon: "i-material-symbols:deployed-code-outline-rounded",
      title: t("about.pages.kinds"),
      content: () => <KindSupport />,
    },
    {
      value: "privacy",
      label: t("about.pages.privacy"),
      icon: "i-material-symbols:shield-outline",
      title: t("about.pages.privacy"),
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
        title={t("about.dialog.title")}
        description={t("about.dialog.description")}
        pages={pages()}
        page={page()}
        onPageChange={setPage}
        onClose={() => dispatch({ type: "deck/close-about" })}
      />
    </Mediates>
  );
};

export default AboutDialog;
