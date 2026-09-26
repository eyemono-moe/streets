import { buildChannelColumn } from "@streets/core/deck/column-presets";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import {
  type ChannelFormEvent,
  type ChannelFormState,
  channelFormInput,
  channelFormTransition,
  closedChannelForm,
  isChannelFormDirty,
} from "@streets/core/view/channel-form";
import { type ParentComponent, Show, createEffect, onCleanup } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import type { EventActions } from "../actions";
import { lazyPart, onceTrue } from "../lazy-part";
import { notifyError } from "../toast";
import { Mediates, type UiEvent, useDispatch } from "../ui-events";

const ChannelFormDialog = lazyPart(() => import("./ChannelFormDialog"));

/**
 * チャンネルを作る・直すフォームの段。送れたら、作ったチャンネルをデッキの
 * カラムに足し、お気に入りに入れると決めていれば入れる。
 */
export const ChannelFormMediator: ParentComponent<{
  actions: EventActions;
  /** リレーを足す欄の候補（アカウントで使っているリレー）。 */
  account: () => readonly RelayListEntry[];
}> = (props) => {
  const dispatch = useDispatch();
  const [state, setState] = createStore<{ form: ChannelFormState }>({
    form: closedChannelForm(),
  });
  const apply = (event: ChannelFormEvent) => {
    const next = channelFormTransition(unwrap(state).form, event);
    setState("form", reconcile(next));
    return next;
  };

  const submit = async (
    form: Exclude<ChannelFormState, { phase: "closed" }>,
  ) => {
    const input = channelFormInput(form.draft);
    if (form.mode === "edit" && form.channelId) {
      await props.actions.editChannel(form.channelId, input);
      return;
    }
    const id = await props.actions.createChannel(input);
    dispatch({
      type: "deck/add-column",
      column: {
        ...buildChannelColumn(id, input.name, input.relays),
        id: crypto.randomUUID(),
      },
    });
    if (form.favorite) {
      // お気に入りに入れられなくても、チャンネルはできている。知らせるだけにする。
      await props.actions
        .setFavoriteChannel(id, true)
        .catch((cause) =>
          notifyError(cause, "お気に入りに入れられませんでした"),
        );
    }
  };

  const send = () => {
    const form = unwrap(state).form;
    if (form.phase !== "saving") return;
    submit(form).then(
      () => apply({ type: "channel-form/saved" }),
      (cause) => {
        apply({ type: "channel-form/failed" });
        notifyError(
          cause,
          form.mode === "create"
            ? "チャンネルを作れませんでした"
            : "チャンネルの情報を保存できませんでした",
        );
      },
    );
  };

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "channel-form/submit":
        if (apply(event).phase === "saving") send();
        return true;
      case "channel-form/open-create":
      case "channel-form/open-edit":
      case "channel-form/input":
      case "channel-form/relays":
      case "channel-form/favorite":
      case "channel-form/close":
      case "channel-form/discard":
        apply(event);
        return true;
      default:
        return false;
    }
  };

  // タブを閉じる・再読み込みでも、書きかけを黙って捨てない。
  createEffect(() => {
    if (!isChannelFormDirty(state.form)) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    onCleanup(() => window.removeEventListener("beforeunload", warn));
  });

  // 閉じる動きを見せるため、一度開いたら残す。
  const mounted = onceTrue(() => state.form.phase !== "closed");

  return (
    <Mediates handle={handle}>
      {props.children}
      <Show when={mounted()}>
        <ChannelFormDialog form={state.form} account={props.account()} />
      </Show>
    </Mediates>
  );
};
