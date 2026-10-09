import { BOOTSTRAP_INDEXERS } from "@streets/core/read/default-relays";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import { parseRelayList } from "@streets/core/read/relay-list";
import type { SectionStatus } from "@streets/core/read/source";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayInfo } from "@streets/core/relay/relay-info";
import { usageOf } from "@streets/core/settings/relay-edit";
import { createSection } from "@streets/core/solid/create-section";
import { type Component, For, type JSX, Match, Show, Switch } from "solid-js";
import { ProfileName } from "../note/Name";
import { useProfileDetails } from "../note/use-profile";
import { useReadLayer } from "../read-layer";
import RelaySummary from "../settings/RelaySummary";
import RelayUseButton from "../settings/RelayUseButton";
import { notifyError, notifySuccess } from "../toast";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import IconButton from "../ui/IconButton";

export type AuthorRelaysState =
  | { phase: "loading" }
  | { phase: "empty"; incomplete: boolean }
  | { phase: "failed" }
  | { phase: "ready"; entries: readonly RelayListEntry[]; incomplete: boolean };

const usageLabel = (entry: RelayListEntry) =>
  entry.read && entry.write
    ? "読み込み・書き込み"
    : entry.read
      ? "読み込み"
      : "書き込み";

const stateFrom = (
  hasEvent: boolean,
  entries: readonly RelayListEntry[],
  status: SectionStatus,
): AuthorRelaysState => {
  if (hasEvent && entries.length > 0) {
    return {
      phase: "ready",
      entries,
      incomplete: status.incomplete !== undefined,
    };
  }
  if (hasEvent) {
    return { phase: "empty", incomplete: status.incomplete !== undefined };
  }
  if (status.phase !== "settled") return { phase: "loading" };
  return status.incomplete
    ? { phase: "failed" }
    : { phase: "empty", incomplete: false };
};

export const AuthorRelaysDialogView: Component<{
  state: AuthorRelaysState;
  title?: JSX.Element;
  infoOf?: (url: RelayUrl) => RelayInfo | undefined;
  onClose: () => void;
}> = (props) => {
  const copy = (entry: RelayListEntry) => {
    void navigator.clipboard.writeText(entry.url).then(
      () => notifySuccess("URL をコピーしました"),
      (cause) => notifyError(cause, "URL をコピーできませんでした"),
    );
  };

  return (
    <>
      <DialogRoot open onClose={props.onClose}>
        <DialogPortal>
          <DialogContent class="w-full max-w-130 rounded-3 border border-primary">
            <div class="flex min-h-12 shrink-0 items-start gap-2 py-3 pr-3 pl-4">
              <DialogTitle class="break-anywhere min-w-0 flex-1 font-600 text-body">
                {props.title ?? "このユーザーが使っているリレー"}
              </DialogTitle>
              <DialogClose />
            </div>
            <DialogBody class="px-4 pb-4">
              <Switch>
                <Match when={props.state.phase === "loading"}>
                  <p class="c-secondary text-caption">読み込み中…</p>
                </Match>
                <Match when={props.state.phase === "empty" && props.state}>
                  {(state) => (
                    <div class="flex flex-col gap-1 text-caption">
                      <p class="c-secondary">
                        リレー設定は公開されていません。
                      </p>
                      <Show
                        when={
                          (
                            state() as Extract<
                              AuthorRelaysState,
                              { phase: "empty" }
                            >
                          ).incomplete
                        }
                      >
                        <p class="c-secondary">
                          一部のリレーからは取得できませんでした。
                        </p>
                      </Show>
                    </div>
                  )}
                </Match>
                <Match when={props.state.phase === "failed"}>
                  <p class="c-secondary text-caption">
                    リレー設定を取得できませんでした。
                  </p>
                </Match>
                <Match when={props.state.phase === "ready" && props.state}>
                  {(state) => {
                    const ready = state() as Extract<
                      AuthorRelaysState,
                      { phase: "ready" }
                    >;
                    return (
                      <>
                        <Show when={ready.incomplete}>
                          <p class="c-secondary mb-2 text-caption">
                            一部のリレーからは取得できませんでした。
                          </p>
                        </Show>
                        <ul class="flex flex-col overflow-hidden rounded-2 border border-primary [&>*+*]:border-t [&>*]:border-primary">
                          <For each={ready.entries}>
                            {(entry) => {
                              return (
                                <li class="bg-primary">
                                  <RelaySummary
                                    url={entry.url}
                                    info={props.infoOf?.(entry.url)}
                                    loadInfo={props.infoOf === undefined}
                                    subtitle={
                                      <span class="c-secondary text-caption">
                                        {usageLabel(entry)}
                                      </span>
                                    }
                                    actions={
                                      <div class="ml-auto flex items-center gap-1">
                                        <IconButton
                                          icon="i-material-symbols:content-copy-outline-rounded"
                                          label={`${entry.url} をコピー`}
                                          onClick={() => copy(entry)}
                                        />
                                        <RelayUseButton
                                          url={entry.url}
                                          suggested={usageOf(entry)}
                                        />
                                      </div>
                                    }
                                  />
                                </li>
                              );
                            }}
                          </For>
                        </ul>
                      </>
                    );
                  }}
                </Match>
              </Switch>
            </DialogBody>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </>
  );
};

const AuthorRelaysDialog: Component<{ pubkey: string; onClose: () => void }> = (
  props,
) => {
  const { manager } = useReadLayer();
  const profile = useProfileDetails(() => props.pubkey);
  const title = () => (
    <>
      <ProfileName
        pubkey={props.pubkey}
        profile={profile()?.profile}
        tags={profile()?.tags}
      />
      さんが使っているリレー
    </>
  );
  // EventScene はネットワークを持たない。ダイアログ自体の各状態は View の
  // ストーリーで固定して確認する。
  if (!manager) {
    return (
      <AuthorRelaysDialogView
        state={{ phase: "failed" }}
        title={title()}
        onClose={props.onClose}
      />
    );
  }
  const section = createSection({
    manager,
    source: () => ({
      type: "nostr",
      filters: [{ kinds: [10002], authors: [props.pubkey], limit: 1 }],
      // リレー設定そのものを、未取得のリレー設定に従って探す循環を避ける。
      relays: [...BOOTSTRAP_INDEXERS],
    }),
  });
  const event = () => section.items()[0];
  const entries = () => {
    const current = event();
    return current ? parseRelayList(current) : [];
  };
  return (
    <AuthorRelaysDialogView
      state={stateFrom(event() !== undefined, entries(), section.status())}
      title={title()}
      onClose={props.onClose}
    />
  );
};

export default AuthorRelaysDialog;
