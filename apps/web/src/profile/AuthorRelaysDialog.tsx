import { Dialog } from "@ark-ui/solid/dialog";
import { BOOTSTRAP_INDEXERS } from "@streets/core/read/default-relays";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import { parseRelayList } from "@streets/core/read/relay-list";
import type { SectionStatus } from "@streets/core/read/source";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayInfo } from "@streets/core/relay/relay-info";
import type { RelayUsage } from "@streets/core/settings/relay-edit";
import {
  relayLabel,
  usageOf,
  usageOp,
} from "@streets/core/settings/relay-edit";
import { createSection } from "@streets/core/solid/create-section";
import {
  type Component,
  For,
  type JSX,
  Match,
  Show,
  Switch,
  createSignal,
} from "solid-js";
import { Portal } from "solid-js/web";
import { ProfileName } from "../note/Name";
import { useProfileDetails } from "../note/use-profile";
import { useReadLayer } from "../read-layer";
import { useRelayEdit } from "../settings/RelayMediator";
import RelaySummary from "../settings/RelaySummary";
import { relayInfo } from "../settings/relay-info-cache";
import { notifyError, notifySuccess } from "../toast";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import SegmentedControl from "../ui/SegmentedControl";

export type AuthorRelaysState =
  | { phase: "loading" }
  | { phase: "empty"; incomplete: boolean }
  | { phase: "failed" }
  | { phase: "ready"; entries: readonly RelayListEntry[]; incomplete: boolean };

const USAGES: { value: RelayUsage; label: string; icon: string }[] = [
  {
    value: "both",
    label: "両方",
    icon: "i-material-symbols:swap-vert-rounded",
  },
  {
    value: "read",
    label: "読み込み",
    icon: "i-material-symbols:download-rounded",
  },
  {
    value: "write",
    label: "書き込み",
    icon: "i-material-symbols:upload-rounded",
  },
];

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

const AddRelayDialog: Component<{
  entry: RelayListEntry;
  onClose: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  const [usage, setUsage] = createSignal<RelayUsage>(usageOf(props.entry));
  const submit = () => {
    dispatch({
      type: "relays/edit",
      op: { type: "add", url: props.entry.url },
    });
    if (usage() !== "both") {
      dispatch({ type: "relays/edit", op: usageOp(props.entry.url, usage()) });
    }
    props.onClose();
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(change) => !change.open && props.onClose()}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop class="motion-fade fixed inset-0 bg-ui-950/40" />
        <Dialog.Positioner class="fixed inset-0 grid place-items-center p-4">
          <Dialog.Content class="motion-pop c-primary flex w-full max-w-105 flex-col gap-4 rounded-3 border border-primary bg-primary p-4 outline-none">
            <Dialog.Title class="font-600 text-body">
              このリレーを自分も使いますか？
            </Dialog.Title>
            <p class="break-all text-caption">{relayLabel(props.entry.url)}</p>
            <SegmentedControl
              label="このリレーの使い方"
              value={usage()}
              options={USAGES}
              onChange={setUsage}
            />
            <div class="flex justify-end gap-2">
              <Button variant="secondary" onClick={props.onClose}>
                キャンセル
              </Button>
              <Button variant="primary" onClick={submit}>
                追加
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

export const AuthorRelaysDialogView: Component<{
  state: AuthorRelaysState;
  title?: JSX.Element;
  infoOf?: (url: RelayUrl) => RelayInfo | undefined;
  onClose: () => void;
}> = (props) => {
  const relayEdit = useRelayEdit();
  const [adding, setAdding] = createSignal<RelayListEntry>();
  const ownEntry = (entry: RelayListEntry) =>
    relayEdit?.entries().find((own) => own.url === entry.url);
  const copy = (entry: RelayListEntry) => {
    void navigator.clipboard.writeText(entry.url).then(
      () => notifySuccess("URL をコピーしました"),
      (cause) => notifyError(cause, "URL をコピーできませんでした"),
    );
  };

  return (
    <>
      <Dialog.Root
        open
        onOpenChange={(change) => !change.open && props.onClose()}
        lazyMount
        unmountOnExit
      >
        <Portal>
          <Dialog.Backdrop class="motion-fade fixed inset-0 bg-ui-950/40" />
          <Dialog.Positioner class="fixed inset-0 grid place-items-center p-4">
            <Dialog.Content class="motion-pop c-primary flex max-h-[80vh] w-full max-w-130 flex-col overflow-hidden rounded-3 border border-primary bg-primary outline-none">
              <div class="flex min-h-12 items-start gap-2 py-3 pr-3 pl-4">
                <Dialog.Title class="break-anywhere min-w-0 flex-1 font-600 text-body">
                  {props.title ?? "このユーザーが使っているリレー"}
                </Dialog.Title>
                <Dialog.CloseTrigger
                  aria-label="閉じる"
                  class="grid size-7 shrink-0 cursor-pointer place-items-center rounded-2 bg-secondary"
                >
                  <span
                    class="i-material-symbols:close-rounded size-4.5"
                    aria-hidden="true"
                  />
                </Dialog.CloseTrigger>
              </div>
              <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
                                const own = () => ownEntry(entry);
                                return (
                                  <li class="bg-primary">
                                    <RelaySummary
                                      url={entry.url}
                                      info={props.infoOf?.(entry.url)}
                                      subtitle={
                                        <span class="c-secondary text-caption">
                                          {usageLabel(entry)}
                                        </span>
                                      }
                                      actions={
                                        <div class="ml-auto flex items-center gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            icon="i-material-symbols:content-copy-outline-rounded"
                                            aria-label={`${entry.url} をコピー`}
                                            onClick={() => copy(entry)}
                                          />
                                          <Show when={relayEdit}>
                                            <Show
                                              when={own()}
                                              fallback={
                                                <Button
                                                  variant="secondary"
                                                  size="sm"
                                                  onClick={() =>
                                                    setAdding(entry)
                                                  }
                                                >
                                                  自分も使う
                                                </Button>
                                              }
                                            >
                                              {(current) => (
                                                <span class="c-secondary text-caption">
                                                  使用中（
                                                  {usageLabel(current())}）
                                                </span>
                                              )}
                                            </Show>
                                          </Show>
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
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
      <Show when={adding()}>
        {(entry) => (
          <AddRelayDialog
            entry={entry()}
            onClose={() => setAdding(undefined)}
          />
        )}
      </Show>
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
        infoOf={relayInfo}
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
      infoOf={relayInfo}
      onClose={props.onClose}
    />
  );
};

export default AuthorRelaysDialog;
