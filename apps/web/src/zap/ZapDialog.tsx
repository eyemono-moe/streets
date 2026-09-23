import { QrCode } from "@ark-ui/solid/qr-code";
import {
  ZAP_AMOUNTS,
  type ZapFlowState,
  zapAmountSats,
} from "@streets/core/zap/zap-flow";
import { type Component, Match, Show, Switch } from "solid-js";
import Event from "../note/Event";
import { notifyError, notifySuccess } from "../toast";
import { Mediates, useDispatch } from "../ui-events";
import Button, { ButtonLink } from "../ui/Button";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import SegmentedControl from "../ui/SegmentedControl";
import { textInputClass } from "../ui/TextField";

const formatSats = (sats: number) => `${sats.toLocaleString("ja-JP")} sats`;

type OpenZap = Exclude<ZapFlowState, { phase: "closed" }>;
type PayingZap = Extract<ZapFlowState, { phase: "paying" }>;

const payingOf = (state: OpenZap): PayingZap | undefined =>
  state.phase === "paying" ? state : undefined;

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
        <span class="font-600 text-caption">金額</span>
        <SegmentedControl
          label="金額"
          block
          options={[
            ...ZAP_AMOUNTS.map((amount) => ({
              value: String(amount),
              label: amount.toLocaleString("ja-JP"),
            })),
            { value: "custom", label: "ほか" },
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
              aria-label="金額（sats）"
              placeholder="金額"
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
          一言<span class="c-secondary font-400">（任意）</span>
        </span>
        <input
          class={`${textInputClass} w-full`}
          placeholder="ありがとう！"
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
          ? "請求書をもらっています…"
          : sats() !== undefined
            ? `${formatSats(sats() ?? 0)} を Zap する`
            : "金額を入れてください"}
      </Button>
    </form>
  );
};

const Payment: Component<{ state: PayingZap }> = (props) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.state.invoice);
      notifySuccess("請求書をコピーしました");
    } catch (error) {
      notifyError(error, "コピーできませんでした");
    }
  };
  return (
    <Switch>
      <Match when={props.state.wallet === "webln"}>
        <p
          class="c-secondary px-4 pb-6 text-center text-caption"
          aria-live="polite"
        >
          ブラウザのウォレットで支払いを確かめてください…
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
            ライトニングのウォレットで読み取って支払ってください。支払いが届いたら閉じます。
          </p>
          <div class="flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              icon="i-material-symbols:content-copy-outline-rounded"
              onClick={() => void copy()}
            >
              コピー
            </Button>
            <ButtonLink
              size="sm"
              icon="i-material-symbols:open-in-new-rounded"
              href={`lightning:${props.state.invoice}`}
            >
              ウォレットで開く
            </ButtonLink>
          </div>
        </div>
      </Match>
    </Switch>
  );
};

/** 投稿に Zap を送る。状態は裁定する段（ZapMediator）が持つ。 */
const ZapDialog: Component<{ state: ZapFlowState }> = (props) => {
  const dispatch = useDispatch();
  return (
    <DialogRoot
      open={props.state.phase !== "closed"}
      onClose={() => dispatch({ type: "zap/close" })}
    >
      <DialogPortal>
        <DialogContent class="flex max-h-[85vh] w-full max-w-110 flex-col rounded-3 border border-primary">
          <Show when={props.state.phase !== "closed" && props.state}>
            {(state) => (
              <>
                <div class="flex h-12 shrink-0 items-center gap-2 pr-3 pl-4">
                  <DialogTitle class="flex-1 font-600 text-body">
                    Zap する
                  </DialogTitle>
                  <DialogClose />
                </div>
                <div class="min-h-0 overflow-y-auto">
                  <div class="mx-4 mb-4 max-h-32 overflow-y-auto rounded-2 border border-primary">
                    {/* 送る先の確認用。ここから重ねたり操作したりはさせない。 */}
                    <Mediates handle={() => true}>
                      <Event event={state().draft.target} size="compact" />
                    </Mediates>
                  </div>
                  <Show
                    when={payingOf(state())}
                    fallback={<AmountForm state={state()} />}
                  >
                    {(paying) => <Payment state={paying()} />}
                  </Show>
                </div>
              </>
            )}
          </Show>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

export default ZapDialog;
