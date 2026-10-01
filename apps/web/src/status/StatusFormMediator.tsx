import {
  type StatusFormEvent,
  type StatusFormState,
  closedStatusForm,
  isStatusFormDirty,
  statusFormInput,
  statusFormTransition,
} from "@streets/core/view/status-form";
import { type ParentComponent, Show, createEffect, onCleanup } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import type { EventActions } from "../actions";
import { useEmojiLookup } from "../emoji/custom-emojis";
import { lazyPart, onceTrue } from "../lazy-part";
import { notifyError } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";
import { useUserStatuses } from "./use-user-statuses";

const StatusFormDialog = lazyPart(() => import("./StatusFormDialog"));

/**
 * 自分のステータスを設定するフォームの段。開くときは、自分の今のいまの状態
 * （general）を入れる。聴いている曲（music）は再生するアプリが書くので扱わない。
 */
export const StatusFormMediator: ParentComponent<{ actions: EventActions }> = (
  props,
) => {
  const own = useUserStatuses(() => props.actions.viewer);
  const emoji = useEmojiLookup();
  const [state, setState] = createStore<{ form: StatusFormState }>({
    form: closedStatusForm(),
  });
  const apply = (event: StatusFormEvent) => {
    const next = statusFormTransition(unwrap(state).form, event);
    setState("form", reconcile(next));
    return next;
  };

  const send = (form: Exclude<StatusFormState, { phase: "closed" }>) => {
    props.actions
      .setStatus({ ...statusFormInput(form, new Date()), emoji })
      .then(
        () => apply({ type: "status-form/saved" }),
        (cause) => {
          apply({ type: "status-form/failed" });
          notifyError(
            cause,
            form.clearing
              ? "ステータスを消せませんでした"
              : "ステータスを保存できませんでした",
          );
        },
      );
  };

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "status/edit":
        apply({
          type: "status-form/open",
          current: own().find((status) => status.type === "general"),
        });
        return true;
      case "status-form/submit":
      case "status-form/clear": {
        const next = apply(event);
        if (next.phase === "saving") send(next);
        return true;
      }
      case "status-form/input":
      case "status-form/expiry":
      case "status-form/saved":
      case "status-form/failed":
      case "status-form/close":
      case "status-form/discard":
        apply(event);
        return true;
      default:
        return false;
    }
  };

  // タブを閉じる・再読み込みでも、書きかけを黙って捨てない。
  createEffect(() => {
    if (!isStatusFormDirty(state.form)) return;
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
        <StatusFormDialog form={state.form} />
      </Show>
    </Mediates>
  );
};
