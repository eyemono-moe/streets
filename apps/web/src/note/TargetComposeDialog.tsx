import {
  type ComposeDraft,
  type ComposeTarget,
  draftFor,
} from "@streets/core/view/compose-drafts";
import { type Component, Match, Show, Switch } from "solid-js";
import { useEventActions } from "../actions";
import { composeDrafts } from "./compose-drafts";
import { ComposeMediator } from "./ComposeMediator";
import QuoteDialog from "./QuoteDialog";
import ReplyDialog from "./ReplyDialog";

/**
 * 返信・引用のダイアログ。閉じたら書きかけを宛先つきの下書きに残す。`initial` が無ければ、
 * 同じ投稿へ書きかけていた下書きから続ける。
 */
const TargetComposeDialog: Component<{
  target: ComposeTarget;
  initial?: ComposeDraft;
  onClose: () => void;
}> = (props) => {
  const actions = useEventActions();
  return (
    <Show when={actions}>
      {(actions) => (
        <ComposeMediator
          send={(text, media, emoji, contentWarning) =>
            actions()[props.target.type](
              props.target.event,
              text,
              media,
              emoji,
              contentWarning,
            )
          }
          failure={
            props.target.type === "reply"
              ? "返信できませんでした"
              : "引用できませんでした"
          }
          onSent={props.onClose}
          onClose={props.onClose}
          drafts
          target={props.target}
          initial={props.initial ?? draftFor(composeDrafts(), props.target)}
        >
          {(state) => (
            <Switch>
              <Match when={props.target.type === "reply"}>
                <ReplyDialog target={props.target.event} state={state} />
              </Match>
              <Match when={props.target.type === "quote"}>
                <QuoteDialog target={props.target.event} state={state} />
              </Match>
            </Switch>
          )}
        </ComposeMediator>
      )}
    </Show>
  );
};

export default TargetComposeDialog;
