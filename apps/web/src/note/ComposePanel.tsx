import { buildNote } from "@streets/core/nostr/build/note";
import { withReferences } from "@streets/core/nostr/build/references";
import type { NostrEvent } from "@streets/core/nostr/event";
import { type ComposeState, canSend } from "@streets/core/view/compose";
import {
  type Component,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { useEventActions } from "../actions";
import { useNoteSources } from "../completion/sources";
import { useEmojiLookup } from "../emoji/custom-emojis";
import { useDispatch } from "../ui-events";
import Completion from "../ui/Completion";
import Avatar from "./Avatar";
import {
  ComposeAttachments,
  ComposePreviewMedia,
  ComposeTools,
  countCharacters,
  useDropAndPaste,
} from "./compose-parts";
import Event from "./Event";
import { useComposeEmojiInsertion } from "./use-compose-emoji-insertion";

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
  const emoji = useEmojiLookup();
  const emojiInsertion = useComposeEmojiInsertion();

  // 署名前の姿を見せるだけなので、id と sig は空。`Event` は描くのに使わない。
  const previewEvent = (): NostrEvent | undefined => {
    const text = preview().trim();
    // 画像だけの投稿もあるので、本文が空でも添えたものがあれば見せる。
    const empty = text.length === 0 && props.state.attachments.length === 0;
    if (!actions || empty) return undefined;
    return {
      // 送るときと同じく、自分の絵文字の :shortcode: を絵文字で見せる。
      ...withReferences(buildNote(text), { emoji }),
      id: "",
      sig: "",
      pubkey: actions.viewer,
      created_at: Math.floor(Date.now() / 1000),
    };
  };

  /**
   * 開いたらすぐ打ち始められるようにする。`autofocus` 属性は、後から差し込んだ
   * 要素には当たらないことがあるので、自分で当てる。パネルは開く動きの途中で
   * まだ画面の外にずれているので、スクロールさせない（させると、外側の箱ごと動く）。
   */
  let body: HTMLTextAreaElement | undefined;
  onMount(() => body?.focus({ preventScroll: true }));
  const sources = useNoteSources();

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
        <Completion sources={sources} label="入れる候補">
          {(attach) => (
            <textarea
              ref={(el) => {
                body = el;
                attach(el);
                emojiInsertion.ref(el);
              }}
              aria-label="ノートの本文"
              rows={5}
              class="c-primary placeholder:c-secondary max-h-80 min-h-30 flex-1 resize-none rounded-2 border border-primary bg-secondary p-2.5 text-body outline-none [field-sizing:content] focus-visible:ring-2 focus-visible:ring-accent-5"
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
          )}
        </Completion>
      </div>

      <ComposeAttachments
        attachments={props.state.attachments}
        disabled={props.state.sending}
      />

      <ComposeTools
        count={`${countCharacters(props.state.content)} 文字`}
        label="投稿"
        sending={props.state.sending}
        disabled={!canSend(props.state)}
        onEmojiSelect={emojiInsertion.insert}
        emojiField={emojiInsertion.field}
      />

      <div class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 pb-4">
        <Show when={previewEvent()}>
          {(event) => (
            <>
              <span class="c-secondary font-600 text-caption">プレビュー</span>
              <div class="overflow-hidden rounded-2 border border-primary">
                {/* compact で描く —— 操作列やリアクションは、まだ存在しないノートには出せない。 */}
                <Event
                  event={event()}
                  size="compact"
                  // 添えた画像は、まだアップロードしていないので URL が無い。手元の見本を渡す。
                  media={
                    <ComposePreviewMedia
                      attachments={props.state.attachments}
                    />
                  }
                />
              </div>
            </>
          )}
        </Show>
      </div>
    </form>
  );
};

export default ComposePanel;
