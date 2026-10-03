import {
  articleCommentsSource,
  articleSource,
} from "@streets/core/deck/column-sources";
import { commentTree } from "@streets/core/view/comment-tree";
import { type Component, Match, Switch } from "solid-js";
import ArticleCommentsView from "../../article/ArticleCommentsView";
import ArticleView from "../../article/ArticleView";
import { useMutes } from "../../settings/MuteMediator";
import { createBlockSection, useColumnScope } from "../column-scope";

/** 住所で指した長文記事へのコメント。 */
const ArticleComments: Component<{
  pubkey: string;
  identifier: string;
  relays?: readonly string[];
}> = (props) => {
  const scope = useColumnScope();
  const mutes = useMutes();
  const section = createBlockSection({
    source: () =>
      articleCommentsSource(props.pubkey, props.identifier, props.relays),
    name: "comments",
  });
  const rows = () =>
    commentTree(
      mutes
        ? section.items().filter((event) => !mutes.hides(event))
        : section.items(),
    );
  return (
    <ArticleCommentsView
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
