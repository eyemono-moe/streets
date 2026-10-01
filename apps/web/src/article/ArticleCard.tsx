import type { NostrEvent } from "@streets/core/nostr/event";
import { articleExcerpt, parseArticle } from "@streets/core/nostr/long-form";
import { type Component, Show, createSignal } from "solid-js";
import type { EventSize } from "../note/Event";

/**
 * タイムラインに流れてきた長文記事。本文は出さず、題名・要約・画像で記事だと
 * 分かるようにする。押すと読むカラムを開く（開き先は columnForEvent）。
 */
const ArticleCard: Component<{ event: NostrEvent; size: EventSize }> = (
  props,
) => {
  const article = () => parseArticle(props.event);
  const [broken, setBroken] = createSignal(false);
  return (
    <Show when={article()}>
      {(article) => (
        <div
          class="flex items-start gap-3"
          classList={{
            "rounded-2 border border-primary px-3 py-2.5":
              props.size === "normal",
          }}
        >
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="c-secondary flex items-center gap-1 text-caption">
              <span
                class="i-material-symbols:article-outline-rounded size-3.5 shrink-0"
                aria-hidden="true"
              />
              記事
            </span>
            <span class="c-primary break-words font-700 text-body">
              {article().title ?? "題名の無い記事"}
            </span>
            <Show when={articleExcerpt(article())}>
              {(excerpt) => (
                <span class="c-secondary line-clamp-3 break-words text-caption">
                  {excerpt()}
                </span>
              )}
            </Show>
          </div>
          <Show when={article().image && !broken() && article().image}>
            {(image) => (
              <img
                src={image()}
                alt=""
                loading="lazy"
                decoding="async"
                class="shrink-0 rounded-1.5 bg-secondary object-cover"
                classList={{
                  "size-22": props.size === "normal",
                  "size-16": props.size === "compact",
                }}
                onError={() => setBroken(true)}
              />
            )}
          </Show>
        </div>
      )}
    </Show>
  );
};

export default ArticleCard;
