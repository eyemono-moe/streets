import { QrCode } from "@ark-ui/solid/qr-code";
import {
  ZAP_AMOUNTS,
  type ZapFlowState,
  zapAmountSats,
} from "@streets/core/zap/zap-flow";
import type { ZapTarget } from "@streets/core/zap/zap-request";
import { type Component, Match, Show, Switch } from "solid-js";
import { useAppWindow } from "../app-window";
import { locale, t } from "../i18n/locale";
import Avatar from "../note/Avatar";
import Event from "../note/Event";
import { ProfileName, ProfileText } from "../note/Name";
import { useProfileDetails } from "../note/use-profile";
import { notifyError, notifySuccess } from "../toast";
import { Mediates, useDispatch } from "../ui-events";
import Button, { ButtonLink } from "../ui/Button";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import SegmentedControl from "../ui/SegmentedControl";
import { textInputClass } from "../ui/TextField";

const formatSats = (sats: number) =>
  t("zap.dialog.sats", { amount: sats.toLocaleString(locale()) });

type OpenZap = Exclude<ZapFlowState, { phase: "closed" }>;
type PayingZap = Extract<ZapFlowState, { phase: "paying" }>;

const payingOf = (state: OpenZap): PayingZap | undefined =>
  state.phase === "paying" ? state : undefined;

const Recipient: Component<{ pubkey: string }> = (props) => {
  const details = useProfileDetails(() => props.pubkey);
  const profile = () => details()?.profile;
  return (
    <div class="flex items-center gap-3 px-3 py-2.5">
      <Avatar pubkey={props.pubkey} size="normal" />
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="c-primary truncate font-600 text-body">
          <ProfileName
            pubkey={props.pubkey}
            profile={profile()}
            tags={details()?.tags}
          />
        </span>
        <Show when={profile()?.displayName && profile()?.name}>
          {(name) => (
            <span class="c-secondary truncate text-caption">
              @
              <ProfileText text={name()} tags={details()?.tags} />
            </span>
          )}
        </Show>
      </div>
    </div>
  );
};

const Target: Component<{ target: ZapTarget }> = (props) => (
  <Switch>
    <Match when={props.target.type === "event" && props.target.event}>
      {(event) => (
        // 送る先の確認用。ここから重ねたり操作したりはさせない。
        <Mediates handle={() => true}>
          <Event event={event()} size="compact" />
        </Mediates>
      )}
    </Match>
    <Match when={props.target.type === "profile" && props.target.pubkey}>
      {(pubkey) => <Recipient pubkey={pubkey()} />}
    </Match>
  </Switch>
);

const AmountForm: Component<{ state: OpenZap }> = (props) => {
  const dispatch = useDispatch();
  const busy = () => props.state.phase === "preparing";
  const sats = () => zapAmountSats(props.state.draft);
  return (
    <form
      class="flex flex-col gap-4 px-4 pb-4"
      onSubmit={(event) => {
        event.preventDefault();
        dispatch({ type: "zap/submit" });
      }}
    >
      <div class="flex flex-col gap-2">
        <span class="font-600 text-caption">
          {t("zap.dialog.amount.title")}
        </span>
        <SegmentedControl
          label={t("zap.dialog.amount.title")}
          block
          options={[
            ...ZAP_AMOUNTS.map((amount) => ({
              value: String(amount),
              label: amount.toLocaleString(locale()),
            })),
            { value: "custom", label: t("zap.dialog.amount.custom") },
          ]}
          value={String(props.state.draft.amount)}
          onChange={(value) =>
            dispatch({
              type: "zap/amount",
              amount: value === "custom" ? "custom" : Number(value),
            })
          }
        />
        <Show when={props.state.draft.amount === "custom"}>
          <label class="flex items-center gap-2">
            <input
              class={`${textInputClass} min-w-0 flex-1`}
              inputmode="numeric"
              autofocus
              aria-label={t("zap.dialog.amount.customLabel")}
              placeholder={t("zap.dialog.amount.placeholder")}
              disabled={busy()}
              value={props.state.draft.customAmount}
              onInput={(event) =>
                dispatch({
                  type: "zap/custom-amount",
                  value: event.currentTarget.value,
                })
              }
            />
            <span class="c-secondary text-caption">sats</span>
          </label>
        </Show>
      </div>
      <label class="flex flex-col gap-1">
        <span class="font-600 text-caption">
          {t("zap.dialog.message.label")}
          <span class="c-secondary font-400">
            {t("zap.dialog.message.optional")}
          </span>
        </span>
        <input
          class={`${textInputClass} w-full`}
          placeholder={t("zap.dialog.message.placeholder")}
          maxLength={200}
          disabled={busy()}
          value={props.state.draft.message}
          onInput={(event) =>
            dispatch({ type: "zap/message", value: event.currentTarget.value })
          }
        />
      </label>
      <Button
        type="submit"
        variant="primary"
        shape="rounded"
        block
        icon="i-material-symbols:bolt-rounded"
        disabled={busy() || sats() === undefined}
      >
        {busy()
          ? t("zap.dialog.submit.fetching")
          : sats() !== undefined
            ? t("zap.dialog.submit.send", { amount: formatSats(sats() ?? 0) })
            : t("zap.dialog.submit.needAmount")}
      </Button>
    </form>
  );
};

const Payment: Component<{ state: PayingZap }> = (props) => {
  const appWindow = useAppWindow();
  const copy = async () => {
    try {
      await appWindow.navigator.clipboard.writeText(props.state.invoice);
      notifySuccess(t("zap.dialog.payment.copied"));
    } catch (error) {
      notifyError(error, t("zap.dialog.payment.copyFailed"));
    }
  };
  return (
    <Switch>
      <Match when={props.state.wallet === "webln"}>
        <p
          class="c-secondary px-4 pb-6 text-center text-caption"
          aria-live="polite"
        >
          {t("zap.dialog.payment.webln")}
        </p>
      </Match>
      <Match when={props.state.wallet === "manual"}>
        <div class="flex flex-col items-center gap-3 px-4 pb-4">
          <QrCode.Root
            value={`lightning:${props.state.invoice}`}
            encoding={{ ecc: "L" }}
            class="rounded-2 bg-white p-3"
          >
            <QrCode.Frame class="size-52 fill-black">
              <QrCode.Pattern />
            </QrCode.Frame>
          </QrCode.Root>
          <p class="c-secondary text-center text-caption" aria-live="polite">
            {t("zap.dialog.payment.manual")}
          </p>
          <div class="flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              icon="i-material-symbols:content-copy-outline-rounded"
              onClick={() => void copy()}
            >
              {t("zap.dialog.payment.copy")}
            </Button>
            <ButtonLink
              size="sm"
              icon="i-material-symbols:open-in-new-rounded"
              href={`lightning:${props.state.invoice}`}
            >
              {t("zap.dialog.payment.openWallet")}
            </ButtonLink>
          </div>
        </div>
      </Match>
    </Switch>
  );
};

/** 投稿か人に Zap を送る。状態は裁定する段（ZapMediator）が持つ。 */
const ZapDialog: Component<{ state: ZapFlowState }> = (props) => {
  const dispatch = useDispatch();
  return (
    <DialogRoot
      open={props.state.phase !== "closed"}
      onClose={() => dispatch({ type: "zap/close" })}
    >
      <DialogPortal>
        <DialogContent class="w-full max-w-110 rounded-3 border border-control">
          <Show when={props.state.phase !== "closed" && props.state}>
            {(state) => (
              <>
                <div class="flex h-12 shrink-0 items-center gap-2 pr-3 pl-4">
                  <DialogTitle class="flex-1 font-600 text-body">
                    {t("zap.dialog.title")}
                  </DialogTitle>
                  <DialogClose />
                </div>
                <DialogBody>
                  <div class="mx-4 mb-4 max-h-32 overflow-y-auto rounded-2 border border-primary">
                    <Target target={state().draft.target} />
                  </div>
                  <Show
                    when={payingOf(state())}
                    fallback={<AmountForm state={state()} />}
                  >
                    {(paying) => <Payment state={paying()} />}
                  </Show>
                </DialogBody>
              </>
            )}
          </Show>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

export default ZapDialog;
