import { articleSource } from "@streets/core/deck/column-sources";
import { type Component, Match, Switch } from "solid-js";
import ArticleView from "../../article/ArticleView";
import { createBlockSection } from "../column-scope";

/** 住所で指した長文記事の、いちばん新しい版を読む。 */
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
        {(event) => <ArticleView event={event()} />}
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
