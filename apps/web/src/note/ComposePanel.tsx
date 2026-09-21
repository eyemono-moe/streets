import { buildNote } from "@streets/core/nostr/build/note";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { ComposeState } from "@streets/core/view/compose";
import {
  type Component,
  Show,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import { useEventActions } from "../actions";
import { useDispatch } from "../ui-events";
import Avatar from "./Avatar";
import Event from "./Event";
import {
  ComposeTools,
  ComposeUploads,
  countCharacters,
  useDropAndPaste,
} from "./compose-parts";

/** 打つたびに作り直さないよう、少し止まってからプレビューへ渡す。 */
const useDebounced = (value: () => string, ms: number) => {
  const [settled, setSettled] = createSignal(value());
  createEffect(() => {
    const next = value();
    const timer = setTimeout(() => setSettled(next), ms);
    onCleanup(() => clearTimeout(timer));
  });
  return settled;
};

/**
 * 新しいノートを書く。デッキを閉じずに書けるよう、ダイアログではなく
 * サイドバーのパネルに置く。返信は文脈が要るのでダイアログのまま。
 */
const ComposePanel: Component<{ state: ComposeState }> = (props) => {
  const actions = useEventActions();
  const dispatch = useDispatch();
  const preview = useDebounced(() => props.state.content, 400);
  const dropAndPaste = useDropAndPaste();

  // 署名前の姿を見せるだけなので、id と sig は空。`Event` は描くのに使わない。
  const previewEvent = (): NostrEvent | undefined => {
    const text = preview().trim();
    if (!actions || text.length === 0) return undefined;
    return {
      ...buildNote(text),
      id: "",
      sig: "",
      pubkey: actions.viewer,
      created_at: Math.floor(Date.now() / 1000),
    };
  };

  return (
    <form
      class="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        dispatch({ type: "compose/submit" });
      }}
    >
      {/* 上から 本文 → 操作 → プレビュー。操作を一番下に置くと、書いた後に遠くなる。 */}
      <div class="flex shrink-0 items-start gap-2 px-4">
        <Show when={actions}>
          {(actions) => <Avatar pubkey={actions().viewer} size="compact" />}
        </Show>
        {/* 5 行ぶんの高さを確保し、必要なら伸ばす。パネルの高さいっぱいには広げない。 */}
        <textarea
          autofocus
          aria-label="ノートの本文"
          rows={5}
          class="c-primary placeholder:c-secondary max-h-80 min-h-30 flex-1 resize-none rounded-2 border border-primary bg-secondary p-2.5 text-body outline-none [field-sizing:content] focus-visible:border-accent-5"
          disabled={props.state.sending}
          placeholder="いま何してる？"
          value={props.state.content}
          onInput={(event) =>
            dispatch({
              type: "compose/input",
              content: event.currentTarget.value,
            })
          }
          {...dropAndPaste}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              dispatch({ type: "compose/submit" });
            }
          }}
        />
      </div>

      <ComposeUploads uploads={props.state.uploads} />

      <ComposeTools
        count={`${countCharacters(props.state.content)} 文字`}
        label="投稿"
        sending={props.state.sending}
        disabled={props.state.content.trim().length === 0}
      />

      <div class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 pb-4">
        <Show when={previewEvent()}>
          {(event) => (
            <>
              <span class="c-secondary font-600 text-caption">プレビュー</span>
              <div class="overflow-hidden rounded-2 border border-primary">
                {/* compact で描く —— 操作列やリアクションは、まだ存在しないノートには出せない。 */}
                <Event event={event()} size="compact" />
              </div>
            </>
          )}
        </Show>
      </div>
    </form>
  );
};

export default ComposePanel;
