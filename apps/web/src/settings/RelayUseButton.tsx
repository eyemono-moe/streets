import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type RelayUsage,
  relayLabel,
  usageOf,
  usageOp,
} from "@streets/core/settings/relay-edit";
import { type Component, Show, createSignal } from "solid-js";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import {
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import SegmentedControl from "../ui/SegmentedControl";
import { useRelayEdit } from "./RelayMediator";

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

/**
 * 足すときも使い方を変えるときも同じダイアログで選ばせる。外す操作は置かない ——
 * 外すのは設定のリレーの一覧だけにして、ほかの画面から自分の設定を減らさせない。
 */
const RelayUseDialog: Component<{
  url: RelayUrl;
  current: RelayUsage | undefined;
  suggested: RelayUsage;
  onClose: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  const [usage, setUsage] = createSignal<RelayUsage>(
    props.current ?? props.suggested,
  );
  const submit = () => {
    if (props.current === undefined) {
      dispatch({
        type: "relays/edit",
        op: { type: "add", url: props.url, usage: usage() },
      });
    } else {
      dispatch({ type: "relays/edit", op: usageOp(props.url, usage()) });
    }
    props.onClose();
  };
  return (
    <DialogRoot open onClose={props.onClose}>
      <DialogPortal>
        <DialogContent class="w-full max-w-105 gap-4 rounded-3 border border-primary p-4">
          <DialogTitle class="font-600 text-body">
            {props.current === undefined
              ? "このリレーを自分も使いますか？"
              : "このリレーの使い方を変えますか？"}
          </DialogTitle>
          <p class="break-all text-caption">{relayLabel(props.url)}</p>
          <SegmentedControl
            label="このリレーの使い方"
            value={usage()}
            options={USAGES}
            onChange={setUsage}
          />
          <Show when={props.current !== undefined}>
            <p class="c-secondary text-caption">
              使うのをやめるときは、設定の「リレー」から外してください。
            </p>
          </Show>
          <div class="flex justify-end gap-2">
            <Button variant="secondary" onClick={props.onClose}>
              キャンセル
            </Button>
            <Button
              variant="primary"
              disabled={props.current === usage()}
              onClick={submit}
            >
              {props.current === undefined ? "追加" : "変更"}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

/**
 * ほかの人のリレーやおすすめを、自分のリレーに足す・使い方を変える入口。
 * 使っているかは自分のリレーの設定から決めるので、置く側は URL だけ渡す。
 * ログインしていない（リレーの設定の段が無い）ときは出さない。
 */
const RelayUseButton: Component<{
  url: RelayUrl;
  /** まだ使っていないときに、はじめに選んでおく使い方。 */
  suggested?: RelayUsage;
}> = (props) => {
  const relayEdit = useRelayEdit();
  const [open, setOpen] = createSignal(false);
  const current = () => {
    const entry = relayEdit?.entries().find((own) => own.url === props.url);
    return entry ? usageOf(entry) : undefined;
  };
  return (
    <Show when={relayEdit}>
      <Show
        when={current() !== undefined}
        fallback={
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            自分も使う
          </Button>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          icon="i-material-symbols:check-rounded"
          aria-label={`${relayLabel(props.url)} の使い方を変える`}
          onClick={() => setOpen(true)}
        >
          使用中
        </Button>
      </Show>
      <Show when={open()}>
        <RelayUseDialog
          url={props.url}
          current={current()}
          suggested={props.suggested ?? "both"}
          onClose={() => setOpen(false)}
        />
      </Show>
    </Show>
  );
};

export default RelayUseButton;
