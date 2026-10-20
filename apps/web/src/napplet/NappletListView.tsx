import type { NappletEntry } from "@streets/core/napplet/directory";
import type { NappletManifest } from "@streets/core/napplet/manifest";
import { type Component, For, Match, Show, Switch } from "solid-js";
import Name from "../note/Name";
import Button from "../ui/Button";
import SearchInput from "../ui/SearchInput";
import UiSwitch from "../ui/Switch";

/** 一度に並べる数。押して増やす。アイコンは並べたものの分だけ取りに行く。 */
export const NAPPLET_LIST_PAGE = 30;

const NappletRow: Component<{
  entry: NappletEntry;
  iconUrl?: string;
  onOpen: (manifest: NappletManifest) => void;
}> = (props) => (
  <li class="bg-primary">
    <button
      type="button"
      class="flex w-full min-w-0 cursor-pointer items-start gap-2.5 bg-transparent px-3 py-2.5 text-left outline-none hover:bg-alpha-hover focus-visible:ring-2 focus-visible:ring-accent-5 focus-visible:ring-inset"
      onClick={() => props.onOpen(props.entry.manifest)}
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
        <span class="c-primary truncate font-600 text-body">
          {props.entry.manifest.title ??
            props.entry.manifest.identifier ??
            "名前の無い napplet"}
        </span>
        <span class="c-secondary line-clamp-2 break-anywhere text-caption">
          {props.entry.manifest.description}
        </span>
        <span class="c-secondary flex min-w-0 items-center gap-1 text-caption">
          <span class="min-w-0 truncate">
            <Name pubkey={props.entry.manifest.pubkey} />
          </span>
          <Show when={props.entry.followed}>
            <span class="shrink-0">・フォロー中</span>
          </Show>
        </span>
        <Show when={props.entry.unsupported.length > 0}>
          <span class="c-status-warn text-caption">
            一部が動かないかもしれません
          </span>
        </Show>
      </span>
    </button>
  </li>
);

/** 公開されている napplet の一覧。言葉で絞り、押すと開く。 */
const NappletListView: Component<{
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
  onOpen: (manifest: NappletManifest) => void;
}> = (props) => (
  <div class="flex flex-col gap-3 p-3">
    <SearchInput
      label="napplet を探す"
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
        <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
          <For each={props.entries.slice(0, props.shown)}>
            {(entry) => (
              <NappletRow
                entry={entry}
                iconUrl={props.iconFor(entry.manifest)}
                onOpen={props.onOpen}
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
            ? "条件に合う napplet が見つかりませんでした。"
            : "napplet が見つかりませんでした。"}
        </p>
      </Match>
      <Match when={true}>
        <p class="c-secondary text-caption">読み込み中…</p>
      </Match>
    </Switch>
  </div>
);

export default NappletListView;
