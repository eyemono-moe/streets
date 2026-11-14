import type { NappletEntry } from "@streets/core/napplet/directory";
import type { InstalledApplet } from "@streets/core/napplet/library";
import type { NappletManifest } from "@streets/core/napplet/manifest";
import { type Component, For, type JSX, Match, Show, Switch } from "solid-js";
import Name from "../note/Name";
import ActionMenu from "../ui/ActionMenu";
import Button from "../ui/Button";
import SearchInput from "../ui/SearchInput";
import UiSwitch from "../ui/Switch";

/** 一度に並べる数。押して増やす。アイコンは並べたものの分だけ取りに行く。 */
export const NAPPLET_LIST_PAGE = 30;

type RowAction = {
  value: string;
  label: string;
  icon: string;
  danger?: boolean;
  run: () => void;
};

const AppletRow: Component<{
  title: string;
  description: JSX.Element;
  pubkey: string;
  followed?: boolean;
  unsupported?: boolean;
  iconUrl?: string;
  onOpen: () => void;
  actions: RowAction[];
}> = (props) => (
  // 行全体を押せるように、開くボタンを行いっぱいに広げ、⋯ はその上に重ねる。
  <li class="relative bg-primary">
    <button
      type="button"
      class="flex w-full min-w-0 cursor-pointer items-start gap-2.5 bg-transparent py-2.5 pr-12 pl-3 text-left outline-none hover:bg-alpha-hover focus-visible:ring-2 focus-visible:ring-accent-5 focus-visible:ring-inset"
      onClick={() => props.onOpen()}
    >
      <Show
        when={props.iconUrl}
        fallback={
          <span
            class="i-material-symbols:widgets-outline-rounded c-secondary size-10 shrink-0"
            aria-hidden="true"
          />
        }
      >
        {(url) => <img src={url()} alt="" class="size-10 shrink-0 rounded-2" />}
      </Show>
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="c-primary truncate font-600 text-body">{props.title}</span>
        <span class="c-secondary line-clamp-2 break-anywhere text-caption">
          {props.description}
        </span>
        <span class="c-secondary flex min-w-0 items-center gap-1 text-caption">
          <span class="min-w-0 truncate">
            <Name pubkey={props.pubkey} />
          </span>
          <Show when={props.followed}>
            <span class="shrink-0">・フォロー中</span>
          </Show>
        </span>
        <Show when={props.unsupported}>
          <span class="c-status-warn text-caption">
            一部が動かないかもしれません
          </span>
        </Show>
      </span>
    </button>
    <div class="absolute top-2 right-2">
      <ActionMenu
        label={`${props.title} の操作`}
        items={props.actions}
        onSelect={(value) =>
          props.actions.find((action) => action.value === value)?.run()
        }
      />
    </div>
  </li>
);

const titleOf = (manifest: NappletManifest) =>
  manifest.title ?? manifest.identifier ?? "名前の無いアップレット";

const Section: Component<{ title: string; children: JSX.Element }> = (
  props,
) => (
  <section class="flex flex-col gap-1.5">
    <h3 class="c-secondary font-600 text-caption">{props.title}</h3>
    {props.children}
  </section>
);

const listClass =
  "flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary";

export type InstalledRow = { applet: InstalledApplet; entry?: NappletEntry };

/**
 * アップレットの一覧。チャンネルのお気に入りと同じく、インストール済みのものと、
 * 公開されているものを探す一覧の 2 つを並べる。
 */
const NappletListView: Component<{
  installed: readonly InstalledRow[];
  /** インストール済みのもののマニフェストを取り終えたか。 */
  installedSettled: boolean;
  entries: readonly NappletEntry[];
  /** 取り終えたか。取得中を「見つからない」と出さないため。 */
  settled: boolean;
  query: string;
  onQuery: (query: string) => void;
  compatibleOnly: boolean;
  onCompatibleOnly: (on: boolean) => void;
  shown: number;
  onShowMore: () => void;
  iconFor: (manifest: NappletManifest) => string | undefined;
  onOpen: (applet: InstalledApplet) => void;
  onInfo: (manifest: NappletManifest) => void;
  onInstall: (manifest: NappletManifest, addToDeck: boolean) => void;
  onAddToDeck: (applet: InstalledApplet) => void;
  onUninstall: (applet: InstalledApplet) => void;
}> = (props) => (
  <div class="flex flex-col gap-4 p-3">
    <Section title="インストール済みのアップレット">
      <Show
        when={props.installed.length > 0}
        fallback={
          <p class="c-secondary text-caption">
            インストールしたアップレットがここに並びます。
          </p>
        }
      >
        <ul class={listClass}>
          <For each={props.installed}>
            {(row) => (
              <AppletRow
                title={
                  row.entry
                    ? titleOf(row.entry.manifest)
                    : row.applet.identifier
                }
                description={
                  row.entry?.manifest.description ??
                  (props.installedSettled
                    ? "アップレットの情報が見つかりませんでした。"
                    : "読み込み中…")
                }
                pubkey={row.applet.pubkey}
                followed={row.entry?.followed}
                unsupported={(row.entry?.unsupported.length ?? 0) > 0}
                iconUrl={row.entry && props.iconFor(row.entry.manifest)}
                onOpen={() => props.onOpen(row.applet)}
                actions={[
                  {
                    value: "add",
                    label: "デッキに追加する",
                    icon: "i-material-symbols:add-column-right-outline-rounded",
                    run: () => props.onAddToDeck(row.applet),
                  },
                  ...(row.entry
                    ? [
                        {
                          value: "info",
                          label: "情報を見る",
                          icon: "i-material-symbols:info-outline-rounded",
                          run: () =>
                            row.entry && props.onInfo(row.entry.manifest),
                        },
                      ]
                    : []),
                  {
                    value: "uninstall",
                    label: "アンインストールする",
                    icon: "i-material-symbols:do-not-disturb-on-outline-rounded",
                    danger: true,
                    run: () => props.onUninstall(row.applet),
                  },
                ]}
              />
            )}
          </For>
        </ul>
      </Show>
    </Section>
    <Section title="アップレットを探す">
      <SearchInput
        label="アップレットを探す"
        placeholder="名前や説明で探す"
        value={props.query}
        onValueChange={props.onQuery}
        clearable
      />
      <UiSwitch
        label="Streets で動くものだけ"
        checked={props.compatibleOnly}
        onChange={props.onCompatibleOnly}
      />
      <Switch>
        <Match when={props.entries.length > 0}>
          <ul class={listClass}>
            <For each={props.entries.slice(0, props.shown)}>
              {(entry) => (
                <AppletRow
                  title={titleOf(entry.manifest)}
                  description={entry.manifest.description}
                  pubkey={entry.manifest.pubkey}
                  followed={entry.followed}
                  unsupported={entry.unsupported.length > 0}
                  iconUrl={props.iconFor(entry.manifest)}
                  onOpen={() => props.onInfo(entry.manifest)}
                  actions={[
                    {
                      value: "install",
                      label: "インストールする",
                      icon: "i-material-symbols:download-rounded",
                      run: () => props.onInstall(entry.manifest, false),
                    },
                    {
                      value: "install-add",
                      label: "インストールしてデッキに追加する",
                      icon: "i-material-symbols:add-column-right-outline-rounded",
                      run: () => props.onInstall(entry.manifest, true),
                    },
                    {
                      value: "info",
                      label: "情報を見る",
                      icon: "i-material-symbols:info-outline-rounded",
                      run: () => props.onInfo(entry.manifest),
                    },
                  ]}
                />
              )}
            </For>
          </ul>
          <Show when={props.entries.length > props.shown}>
            <div class="self-start">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => props.onShowMore()}
              >
                さらに表示（残り {props.entries.length - props.shown} 件）
              </Button>
            </div>
          </Show>
        </Match>
        <Match when={props.settled}>
          <p class="c-secondary text-caption">
            {props.query.trim()
              ? "条件に合うアップレットが見つかりませんでした。"
              : "アップレットが見つかりませんでした。"}
          </p>
        </Match>
        <Match when={true}>
          <p class="c-secondary text-caption">読み込み中…</p>
        </Match>
      </Switch>
    </Section>
  </div>
);

export default NappletListView;
