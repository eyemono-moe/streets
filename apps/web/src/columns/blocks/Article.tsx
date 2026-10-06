import {
  articleCommentsSource,
  articleSource,
} from "@streets/core/deck/column-sources";
import type { NostrEvent } from "@streets/core/nostr/event";
import { commentTree } from "@streets/core/view/comment-tree";
import { type Component, Match, Switch } from "solid-js";
import ArticleCommentsView from "../../article/ArticleCommentsView";
import ArticleView from "../../article/ArticleView";
import { createEventDialogs } from "../../note/event-ops";
import Button from "../../ui/Button";
import { createBlockSection, useColumnScope } from "../column-scope";

/** 住所で指した長文記事へのコメント。 */
const ArticleComments: Component<{
  /** いま読んでいる版。コメントを書くときの親にする。 */
  article: NostrEvent;
  pubkey: string;
  identifier: string;
  relays?: readonly string[];
}> = (props) => {
  const scope = useColumnScope();
  const section = createBlockSection({
    source: () =>
      articleCommentsSource(props.pubkey, props.identifier, props.relays),
    name: "comments",
  });
  const rows = () => commentTree(section.items());
  const dialogs = createEventDialogs(() => props.article);
  return (
    <ArticleCommentsView
      trailing={
        <>
          <Button
            size="sm"
            variant="secondary"
            icon="i-material-symbols:add-comment-outline-rounded"
            onClick={() => dialogs.open("reply")}
          >
            コメントする
          </Button>
          {dialogs.view}
        </>
      }
      rows={rows()}
      settled={section.status().phase === "settled"}
      size={scope.column().density === "compact" ? "compact" : "normal"}
      expandMedia={scope.column().expandMedia !== false}
    />
  );
};

/** 住所で指した長文記事の、いちばん新しい版を読む。下にコメントを並べる。 */
const Article: Component<{
  pubkey: string;
  identifier: string;
  relays?: readonly string[];
}> = (props) => {
  const section = createBlockSection({
    source: () => articleSource(props.pubkey, props.identifier, props.relays),
    name: "article",
    // 開いた記事そのものは、書いた人をミュートしていても出す。
    ignoresMutes: true,
  });
  const latest = () =>
    [...section.items()].sort((a, b) => b.created_at - a.created_at)[0];
  return (
    <Switch>
      <Match when={latest()}>
        {(event) => (
          <>
            <ArticleView event={event()} />
            <ArticleComments
              article={event()}
              pubkey={props.pubkey}
              identifier={props.identifier}
              relays={props.relays}
            />
          </>
        )}
      </Match>
      <Match when={section.status().phase === "settled"}>
        <p class="c-secondary p-4 text-caption">記事を読み込めませんでした。</p>
      </Match>
      <Match when={true}>
        <p class="c-secondary p-4 text-caption">読み込み中…</p>
      </Match>
    </Switch>
  );
};

export default Article;
