import type { ComposeDraft } from "@streets/core/view/compose-drafts";
import {
  formatEventTime,
  formatEventTimeFull,
} from "@streets/core/view/format-time";
import { type Component, For, Show } from "solid-js";
import { t } from "../i18n/locale";
import { useDispatch } from "../ui-events";
import IconButton from "../ui/IconButton";
import Name from "./Name";

/** 名前の前後に置く語。語順が言語で違うので、前後に分けて辞書に持つ。 */
const targetLabel = (type: "reply" | "quote") =>
  type === "reply"
    ? {
        before: t("note.drafts.replyBefore"),
        after: t("note.drafts.replyAfter"),
      }
    : {
        before: t("note.drafts.quoteBefore"),
        after: t("note.drafts.quoteAfter"),
      };

const DraftRow: Component<{
  draft: ComposeDraft;
  now: Date;
  disabled: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const savedAt = () => new Date(props.draft.savedAt);
  return (
    // 行全体を押せるように、開くボタンを行いっぱいに広げ、消すボタンはその上に重ねる。
    <li class="relative bg-primary">
      <button
        type="button"
        class="flex w-full min-w-0 cursor-pointer flex-col gap-0.5 bg-transparent py-2.5 pr-12 pl-3 text-left outline-none enabled:hover:bg-alpha-hover focus-visible:ring-2 focus-visible:ring-accent-5 focus-visible:ring-inset disabled:cursor-default disabled:opacity-50"
        // 返信・引用はダイアログで開くので、いまの書きかけとは入れ替えない。
        disabled={props.disabled && !props.draft.target}
        onClick={() =>
          dispatch({ type: "compose/draft-open", id: props.draft.id })
        }
      >
        <Show when={props.draft.target}>
          {(target) => (
            <span class="c-secondary flex min-w-0 items-center gap-1 text-caption">
              <span
                class={`${
                  target().type === "reply"
                    ? "i-material-symbols:mode-comment-outline-rounded"
                    : "i-material-symbols:format-quote-rounded"
                } size-3.5 shrink-0`}
                aria-hidden="true"
              />
              {/* 名前が長くても、返信か引用かは切らずに見せる。 */}
              <Show when={targetLabel(target().type).before !== ""}>
                <span class="shrink-0">
                  {targetLabel(target().type).before}
                </span>
              </Show>
              <span class="truncate">
                <Name pubkey={target().event.pubkey} />
              </span>
              <Show when={targetLabel(target().type).after !== ""}>
                <span class="shrink-0">{targetLabel(target().type).after}</span>
              </Show>
            </span>
          )}
        </Show>
        <Show when={props.draft.contentWarning !== undefined}>
          <span class="c-secondary flex min-w-0 items-center gap-1 text-caption">
            <span
              class="i-material-symbols:warning-outline-rounded size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span class="truncate">
              {props.draft.contentWarning?.trim() ||
                t("note.drafts.contentWarning")}
            </span>
          </span>
        </Show>
        <span class="c-primary line-clamp-2 whitespace-pre-wrap break-words text-body">
          {props.draft.content}
        </span>
        <span class="c-secondary flex items-center gap-1 text-caption">
          <time
            datetime={savedAt().toISOString()}
            title={formatEventTimeFull(savedAt())}
          >
            {formatEventTime(savedAt(), props.now)}
          </time>
          <Show when={!props.draft.kept}>
            <span>{t("note.drafts.autoSaved")}</span>
          </Show>
        </span>
      </button>
      <div class="absolute top-2 right-2">
        <IconButton
          size="sm"
          icon="i-material-symbols:delete-outline-rounded"
          label={t("note.drafts.remove")}
          onClick={() =>
            dispatch({ type: "compose/draft-remove", id: props.draft.id })
          }
        />
      </div>
    </li>
  );
};

/**
 * 投稿パネルの下書き。押すと書きかけと入れ替えて開く。自動で残したものは
 * 新しいものから 5 件だけ残るので、そう分かるように添える。
 */
const ComposeDrafts: Component<{
  drafts: readonly ComposeDraft[];
  /** 書きかけを入れ替えられない間（送っている途中・ファイルを添えている）。 */
  disabled: boolean;
  /** ファイルを添えているので開けない。 */
  attached: boolean;
  now?: Date;
}> = (props) => (
  <Show when={props.drafts.length > 0}>
    <section class="flex flex-col gap-1.5">
      <h3 class="c-secondary font-600 text-caption">
        {t("note.drafts.title")}
      </h3>
      <Show when={props.attached}>
        <p class="c-secondary text-caption">
          {t("note.drafts.attachedNotice")}
        </p>
      </Show>
      <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
        <For each={props.drafts}>
          {(draft) => (
            <DraftRow
              draft={draft}
              now={props.now ?? new Date()}
              disabled={props.disabled}
            />
          )}
        </For>
      </ul>
    </section>
  </Show>
);

export default ComposeDrafts;
