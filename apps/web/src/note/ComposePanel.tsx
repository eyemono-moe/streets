import { type Component, Show, createSignal } from "solid-js";
import { actionErrorMessage, useEventActions } from "../actions";
import Avatar from "./Avatar";
import { ComposeTools, countCharacters } from "./compose-parts";

/**
 * 新しいノートを書く。デッキを閉じずに書けるよう、ダイアログではなく
 * サイドバーのパネルに置く。返信は文脈が要るのでダイアログのまま。
 */
const ComposePanel: Component<{ onPosted: () => void }> = (props) => {
  const actions = useEventActions();
  const [content, setContent] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string>();

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
      <div class="flex min-h-0 flex-1 items-start gap-3 overflow-y-auto px-4">
        <Show when={actions}>
          {(actions) => <Avatar pubkey={actions().viewer} size="normal" />}
        </Show>
        <textarea
          autofocus
          aria-label="ノートの本文"
          class="c-primary placeholder:c-secondary min-h-24 flex-1 resize-none bg-transparent text-h3 outline-none [field-sizing:content]"
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
