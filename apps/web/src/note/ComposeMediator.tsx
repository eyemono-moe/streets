import {
  type ComposeEvent,
  type ComposeState,
  composeTransition,
  emptyCompose,
  sendableText,
} from "@streets/core/view/compose";
import type { Component, JSX } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { notifyError } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";

/**
 * 投稿・返信の書きかけを持ち、送る段。何を送るか（投稿か返信か）と、送れたあと
 * どうするか（パネルを閉じる・ダイアログを閉じる）は置き場所ごとに違うので受け取る。
 */
export const ComposeMediator: Component<{
  send: (text: string) => Promise<void>;
  /** 失敗したときのトーストの見出し。 */
  failure: string;
  onSent: () => void;
  /** 閉じる操作。送っている途中は閉じない。 */
  onClose?: () => void;
  children: (state: ComposeState) => JSX.Element;
}> = (props) => {
  const [state, setState] = createStore<ComposeState>(emptyCompose());
  const apply = (event: ComposeEvent) =>
    setState(reconcile(composeTransition(unwrap(state), event)));

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "compose/input":
        apply(event);
        return true;
      case "compose/submit": {
        const text = sendableText(unwrap(state));
        if (text === undefined) return true;
        apply(event);
        props.send(text).then(
          () => {
            apply({ type: "compose/sent" });
            props.onSent();
          },
          (cause) => {
            // 本文は残し、そのまま送り直せるようにする。理由はトーストで出す。
            apply({ type: "compose/failed" });
            notifyError(cause, props.failure);
          },
        );
        return true;
      }
      case "compose/close":
        if (!state.sending) props.onClose?.();
        return true;
      default:
        return false;
    }
  };

  return <Mediates handle={handle}>{props.children(state)}</Mediates>;
};
