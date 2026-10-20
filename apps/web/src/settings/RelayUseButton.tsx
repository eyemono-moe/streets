import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type RelayUsage,
  relayLabel,
  usageOf,
  usageOp,
} from "@streets/core/settings/relay-edit";
import { type Component, Show, createSignal } from "solid-js";
import { t } from "../i18n/locale";
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

const USAGES: { value: RelayUsage; icon: string }[] = [
  { value: "both", icon: "i-material-symbols:swap-vert-rounded" },
  { value: "read", icon: "i-material-symbols:download-rounded" },
  { value: "write", icon: "i-material-symbols:upload-rounded" },
];

const usageLabel = (usage: RelayUsage): string =>
  t(`settings.relays.usage.${usage}`);

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
        <DialogContent class="w-full max-w-105 gap-4 rounded-3 border border-control p-4">
          <DialogTitle class="font-600 text-body">
            {props.current === undefined
              ? t("settings.relayUse.addTitle")
              : t("settings.relayUse.changeTitle")}
          </DialogTitle>
          <p class="break-all text-caption">{relayLabel(props.url)}</p>
          <SegmentedControl
            label={t("settings.relayUse.usageLabel")}
            value={usage()}
            options={USAGES.map((item) => ({
              ...item,
              label: usageLabel(item.value),
            }))}
            onChange={setUsage}
          />
          <Show when={props.current !== undefined}>
            <p class="c-secondary text-caption">
              {t("settings.relayUse.stopHint")}
            </p>
          </Show>
          <div class="flex justify-end gap-2">
            <Button variant="secondary" onClick={props.onClose}>
              {t("settings.relayUse.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={props.current === usage()}
              onClick={submit}
            >
              {props.current === undefined
                ? t("settings.relayUse.add")
                : t("settings.relayUse.change")}
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
            {t("settings.relayUse.use")}
          </Button>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          icon="i-material-symbols:check-rounded"
          aria-label={t("settings.relayUse.changeLabel", {
            relay: relayLabel(props.url),
          })}
          onClick={() => setOpen(true)}
        >
          {t("settings.relayUse.inUse")}
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
