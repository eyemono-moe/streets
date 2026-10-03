import type { EventRef } from "@streets/core/nostr/event-refs";
import { createThreadSource } from "@streets/core/solid/create-thread-source";
import { threadSpine } from "@streets/core/view/thread-spine";
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
} from "solid-js";
import { createBlockSection, useColumnScope } from "../column-scope";
import ThreadSpineView from "../ThreadSpineView";

/** 焦点のイベントを起点に、根までの祖先とその返信を集めて木にする。 */
const Thread: Component<{ focus: string }> = (props) => {
  const scope = useColumnScope();
  const store = scope.readLayer.store;
  // 上へたどって欠けていた返信先と、たどり着いた一番上。`root` の印が無い返信では、
  // 根の購読だけでは祖先が届かないので、ここから取りに行く。
  const [ancestors, setAncestors] = createSignal<
    Extract<EventRef, { form: "id" }>[]
  >([]);
  const [reachedTop, setReachedTop] = createSignal<string>();
  const thread = createThreadSource({
    focusId: () => props.focus,
    store,
    ancestors,
    reachedTop,
  });
  const section = createBlockSection({ source: thread.source });

  // 焦点と、タイムラインなどで取れている祖先は store から引く。購読の応答を待つと、
  // 押しても何も出ない間ができ、購読から届かない返信先は出ないままになる。
  const spine = createMemo(() =>
    threadSpine(section.items(), props.focus, (id) => store.get(id)),
  );

  createEffect(() => {
    const current = spine();
    const missing = current.missingParent;
    if (missing && !ancestors().some((ref) => ref.id === missing.id)) {
      setAncestors((refs) => [...refs, missing]);
    }
    if (current.reachedRoot) {
      setReachedTop(current.ancestors[0]?.id ?? current.focus?.id);
    }
  });

  // 欠けた返信先を取りに行く前の「取り終えた」は、その返信先については何も言っていない。
  const settled = () => {
    if (section.status().phase !== "settled") return false;
    const missing = spine().missingParent;
    return !missing || ancestors().some((ref) => ref.id === missing.id);
  };

  return (
    <ThreadSpineView
      spine={spine()}
      settled={settled()}
      expandMedia={scope.column().expandMedia !== false}
    />
  );
};

export default Thread;
