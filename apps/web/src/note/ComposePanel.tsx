import { buildNote } from "@streets/core/nostr/build/note";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type Component,
  Show,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import { actionErrorMessage, useEventActions } from "../actions";
import Avatar from "./Avatar";
import Event from "./Event";
import { ComposeTools, countCharacters } from "./compose-parts";

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
const ComposePanel: Component<{ onPosted: () => void }> = (props) => {
  const actions = useEventActions();
  const [content, setContent] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const preview = useDebounced(content, 400);

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

  const submit = async () => {
    const text = content().trim();
    if (!actions || text.length === 0 || sending()) return;
    setSending(true);
    setError(undefined);
    try {
      await actions.post(text);
      setContent("");
      props.onPosted();
    } catch (cause) {
      // 本文は残し、そのまま再試行できるようにする。
      setError(actionErrorMessage(cause));
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      class="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2">
        <div class="flex items-start gap-3">
          <Show when={actions}>
            {(actions) => <Avatar pubkey={actions().viewer} size="normal" />}
          </Show>
          {/* 5 行ぶんの高さを確保し、必要なら伸ばす。パネルの高さいっぱいには広げない。 */}
          <textarea
            autofocus
            aria-label="ノートの本文"
            rows={5}
            class="c-primary placeholder:c-secondary max-h-80 min-h-30 flex-1 resize-none rounded-2 border border-primary bg-secondary p-2.5 text-body outline-none [field-sizing:content] focus-visible:border-accent-5"
            disabled={sending()}
            placeholder="いま何してる？"
            value={content()}
            onInput={(event) => setContent(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
          />
        </div>

        <Show when={previewEvent()}>
          {(event) => (
            <div class="flex flex-col gap-1.5">
              <span class="c-secondary font-600 text-caption">プレビュー</span>
              <div class="overflow-hidden rounded-2 border border-primary">
                {/* compact で描く —— 操作列やリアクションは、まだ存在しないノートには出せない。 */}
                <Event event={event()} size="compact" />
              </div>
            </div>
          )}
        </Show>
      </div>

      <Show when={error()}>
        {(message) => (
          <p class="c-danger shrink-0 px-4 pt-2 text-caption">{message()}</p>
        )}
      </Show>
      <ComposeTools
        count={`${countCharacters(content())} 文字`}
        label="投稿"
        sending={sending()}
        disabled={content().trim().length === 0}
      />
    </form>
  );
};

export default ComposePanel;
