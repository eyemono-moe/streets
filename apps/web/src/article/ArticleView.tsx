import type { NostrEvent } from "@streets/core/nostr/event";
import { parseArticle } from "@streets/core/nostr/long-form";
import { formatEventTimeFull } from "@streets/core/view/format-time";
import { type Component, For, Show, createSignal } from "solid-js";
import { lazyPart } from "../lazy-part";
import AuthorNames from "../note/AuthorNames";
import Avatar from "../note/Avatar";
import EventMenu from "../note/EventMenu";
import ReactionList from "../note/ReactionList";

const Markdown = lazyPart(() => import("./Markdown"));

const dateOf = (seconds: number) =>
  formatEventTimeFull(new Date(seconds * 1000));

/** 長文記事を 1 本、カラムの幅で読む。 */
const ArticleView: Component<{ event: NostrEvent }> = (props) => {
  const article = () => parseArticle(props.event);
  const [broken, setBroken] = createSignal(false);
  return (
    <Show when={article()}>
      {(article) => (
        <article class="flex flex-col gap-4 bg-primary px-4 pt-5 pb-6">
          <Show when={article().image && !broken() && article().image}>
            {(image) => (
              <img
                src={image()}
                alt=""
                decoding="async"
                class="max-h-80 w-full rounded-2 bg-secondary object-cover"
                onError={() => setBroken(true)}
              />
            )}
          </Show>
          <h1 class="c-primary m-0 break-words font-700 text-[24px] leading-snug">
            {article().title ?? "題名の無い記事"}
          </h1>
          <div class="flex items-center gap-2">
            <Avatar pubkey={props.event.pubkey} size="compact" />
            <div class="flex min-w-0 flex-1 flex-col">
              <AuthorNames pubkey={props.event.pubkey} size="compact" />
              <span class="c-secondary text-caption">
                {article().publishedAt !== undefined &&
                article().publishedAt !== article().updatedAt
                  ? `${dateOf(article().publishedAt as number)} 公開 · ${dateOf(article().updatedAt)} 更新`
                  : dateOf(article().updatedAt)}
              </span>
            </div>
            <EventMenu event={props.event} />
          </div>
          <Show when={article().hashtags.length > 0}>
            <div class="c-secondary flex flex-wrap gap-x-2 text-caption">
              <For each={article().hashtags}>
                {(tag) => <span>#{tag}</span>}
              </For>
            </div>
          </Show>
          <Markdown content={article().content} tags={props.event.tags} />
          <hr class="w-full border-primary border-t" />
          <ReactionList event={props.event} />
        </article>
      )}
    </Show>
  );
};

export default ArticleView;
