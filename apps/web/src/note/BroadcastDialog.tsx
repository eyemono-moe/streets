import type { NostrEvent } from "@streets/core/nostr/event";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { normalizeRelayUrl } from "@streets/core/relay/relay-url";
import { relayLabel } from "@streets/core/settings/relay-edit";
import { type Component, For, Match, Switch, createSignal } from "solid-js";
import { useEventActions } from "../actions";
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
import TextField from "../ui/TextField";

export type BroadcastTarget = "mine" | "inbox" | "custom";

const TARGETS: { value: BroadcastTarget; label: string }[] = [
  { value: "mine", label: "自分" },
  { value: "inbox", label: "投稿した人" },
  { value: "custom", label: "URL を指定" },
];

const DESCRIPTIONS: Record<BroadcastTarget, string> = {
  mine: "自分が書き込みに使っているリレーへ送ります。",
  inbox:
    "投稿した人が読み込みに使っているリレーへ送ります。その人の画面に届きやすくなります。",
  custom: "URL を入れたリレーへ送ります。",
};

/** 送り先を選んで、見かけたイベントを送り直す。 */
export const BroadcastDialogView: Component<{
  candidates: Record<"mine" | "inbox", readonly RelayUrl[]>;
  initialTarget?: BroadcastTarget;
  initialCustom?: string;
  onSend: (relays: readonly RelayUrl[]) => void;
  onClose: () => void;
}> = (props) => {
  const [target, setTarget] = createSignal<BroadcastTarget>(
    props.initialTarget ?? "mine",
  );
  const [custom, setCustom] = createSignal(props.initialCustom ?? "");
  const customRelay = () => normalizeRelayUrl(custom().trim());
  const relays = (): readonly RelayUrl[] => {
    const current = target();
    if (current !== "custom") return props.candidates[current];
    const relay = customRelay();
    return relay ? [relay] : [];
  };
  const customError = () =>
    custom().trim() && !customRelay()
      ? "wss:// で始まる URL を入れてください"
      : undefined;

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
                <TextField
                  label="リレーの URL"
                  type="url"
                  placeholder="wss://"
                  value={custom()}
                  onInput={setCustom}
                  error={customError()}
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
  const candidates = () =>
    actions?.broadcastTargets(props.event) ?? { mine: [], inbox: [] };
  return (
    <BroadcastDialogView
      candidates={candidates()}
      onSend={(relays) =>
        dispatch({ type: "note/broadcast", target: props.event, relays })
      }
      onClose={props.onClose}
    />
  );
};

export default BroadcastDialog;
