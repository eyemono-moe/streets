import type { NostrEvent } from "@streets/core/nostr/event";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { relayLabel } from "@streets/core/settings/relay-edit";
import { type Component, For, Match, Switch, createSignal } from "solid-js";
import { useEventActions } from "../actions";
import RelayColumnEditor from "../deck/RelayColumnEditor";
import { useRelayEdit } from "../settings/RelayMediator";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import SegmentedControl from "../ui/SegmentedControl";

export type BroadcastTarget = "mine" | "author" | "custom";

const TARGETS: { value: BroadcastTarget; label: string }[] = [
  { value: "mine", label: "自分" },
  { value: "author", label: "投稿した人" },
  { value: "custom", label: "選ぶ" },
];

const DESCRIPTIONS: Record<BroadcastTarget, string> = {
  mine: "自分が書き込みに使っているリレーへ送ります。",
  author:
    "投稿した人が書き込みに使っているリレーと、返信先など投稿の中で名前を挙げた人に届くリレーへ送ります。ほかの人がこの投稿を探しに行くところです。",
  custom: "候補から選ぶか、URL を入れたリレーへ送ります。",
};

/** 送り先を選んで、見かけたイベントを送り直す。 */
export const BroadcastDialogView: Component<{
  candidates: Record<"mine" | "author", readonly RelayUrl[]>;
  initialTarget?: BroadcastTarget;
  /** 「選ぶ」の候補にする、自分のアカウントで使っているリレー。 */
  account: readonly RelayListEntry[];
  /** 「選ぶ」の候補にする、フォローしている人の書き込みリレー。渡さなければ読み取り層から引く。 */
  followeeWriteRelays?: readonly (readonly RelayUrl[])[];
  initialCustom?: readonly RelayUrl[];
  onSend: (relays: readonly RelayUrl[]) => void;
  onClose: () => void;
}> = (props) => {
  const [target, setTarget] = createSignal<BroadcastTarget>(
    props.initialTarget ?? "mine",
  );
  const [custom, setCustom] = createSignal<readonly RelayUrl[]>(
    props.initialCustom ?? [],
  );
  const relays = (): readonly RelayUrl[] => {
    const current = target();
    return current === "custom" ? custom() : props.candidates[current];
  };

  return (
    <DialogRoot open onClose={props.onClose}>
      <DialogPortal>
        <DialogContent class="w-full max-w-110 rounded-3 border border-primary">
          <div class="flex min-h-12 shrink-0 items-start gap-2 py-3 pr-3 pl-4">
            <DialogTitle class="break-anywhere min-w-0 flex-1 font-600 text-body">
              ほかのリレーにも送る
            </DialogTitle>
            <DialogClose />
          </div>
          <DialogBody class="flex flex-col gap-4 px-4">
            <p class="c-secondary text-caption">
              この投稿を、中身を変えずにほかのリレーへ送ります。一部のリレーにしか無く、ほかの人から見えないときに使います。
            </p>
            <SegmentedControl
              label="送り先"
              options={TARGETS}
              value={target()}
              onChange={setTarget}
              block
            />
            <p class="c-secondary text-caption">{DESCRIPTIONS[target()]}</p>
            <Switch>
              <Match when={target() === "custom"}>
                <RelayColumnEditor
                  candidates={props.account}
                  followeeWriteRelays={props.followeeWriteRelays}
                  selected={custom()}
                  onChange={setCustom}
                  listLabel="送り先"
                />
              </Match>
              <Match when={relays().length === 0}>
                <p class="c-secondary text-caption">
                  送り先のリレーが分かりません。
                </p>
              </Match>
              <Match when={relays().length > 0}>
                <ul class="flex flex-col overflow-hidden rounded-2 border border-primary text-caption [&>*+*]:border-t [&>*]:border-primary">
                  <For each={relays()}>
                    {(relay) => (
                      <li class="break-all bg-primary px-3 py-2">
                        {relayLabel(relay)}
                      </li>
                    )}
                  </For>
                </ul>
              </Match>
            </Switch>
          </DialogBody>
          <div class="flex shrink-0 justify-end gap-2 p-4">
            <Button variant="secondary" onClick={props.onClose}>
              キャンセル
            </Button>
            <Button
              variant="primary"
              disabled={relays().length === 0}
              onClick={() => {
                props.onSend(relays());
                props.onClose();
              }}
            >
              {relays().length > 1 ? `${relays().length} 本に送る` : "送る"}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

const BroadcastDialog: Component<{ event: NostrEvent; onClose: () => void }> = (
  props,
) => {
  const actions = useEventActions();
  const dispatch = useDispatch();
  const relayEdit = useRelayEdit();
  const candidates = () =>
    actions?.broadcastTargets(props.event) ?? { mine: [], author: [] };
  return (
    <BroadcastDialogView
      candidates={candidates()}
      account={relayEdit?.entries() ?? []}
      onSend={(relays) =>
        dispatch({ type: "note/broadcast", target: props.event, relays })
      }
      onClose={props.onClose}
    />
  );
};

export default BroadcastDialog;
